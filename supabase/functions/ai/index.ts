// Hudhud AI relay: the Claude and Azure keys never leave the server.
// POST /ai/claude  {t, body}  -> streams the Anthropic Messages API response (key read from the family's "apiKey" row)
// POST /ai/aztoken {t}        -> {token, region}: a 10-minute Azure Speech token (key read from the family's "azure" row)
// Deploy with "Verify JWT" OFF (the app authenticates with its own session token "t").
// Daily caps (schema_9): per child and per family, requests/day and a rough token budget (sum of max_tokens).
// Defaults below; a family can override them with the row "limits/@all" = {kidDay, famDay, kidTok, famTok}.
// Over a cap -> 429 {error:{type:"daily_limit", scope:"kid"|"family"}}. Counters: tk_ai_usage, failures: tk_ai_err.
// POST /ai/health (header x-hh-health = env HH_HEALTH_SECRET; 404 when that env is not set) -> {ok, checks:{sessions, rows, key, usage}, ms}:
// the same service-role reads a real lesson request needs, spending nothing. Called by the notify watchdog (DEPLOY_10).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ORIGINS = ["https://hudhud-kids.github.io", "http://localhost:8765"];
const MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"]);
const cors = (req: Request) => {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
const json = (req: Request, b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors(req), "content-type": "application/json" } });

// small in-memory caches (one function instance)
const sessC = new Map<string, { fam: string; role: string; kid: string | null; at: number }>();
const keyC = new Map<string, { v: any; at: number }>();
const azC = new Map<string, { token: string; region: string; at: number }>();
const rate = new Map<string, number[]>();

async function session(t: string) {
  if (!/^[0-9a-f-]{36}$/i.test(t || "")) return null;
  const c = sessC.get(t); if (c && Date.now() - c.at < 60e3) return c;
  const { data } = await sb.from("tk_sessions").select("family_id,role,kid_id,seen_at").eq("token", t).maybeSingle();
  if (!data || Date.now() - Date.parse(data.seen_at) > 30 * 864e5) { sessC.delete(t); return null; } // idle 30 days = expired (schema_9)
  const s = { fam: data.family_id, role: data.role, kid: data.kid_id, at: Date.now() }; sessC.set(t, s); return s;
}
async function famRow(fam: string, path: string) {
  const k = fam + "|" + path, c = keyC.get(k); if (c && Date.now() - c.at < 60e3) return c.v;
  const { data } = await sb.from("tk_rows").select("value").eq("family_id", fam).eq("path", path).maybeSingle();
  const v = data ? data.value : null; keyC.set(k, { v, at: Date.now() }); return v;
}
function limited(t: string, perMin: number) {
  const now = Date.now(), a = (rate.get(t) || []).filter((x) => now - x < 60e3); a.push(now); rate.set(t, a); return a.length > perMin;
}

// ---------- daily caps: counted in memory, flushed to tk_ai_usage in batches (every ~20 requests or 30 s) ----------
const DEF = { kidDay: 1500, famDay: 6000, kidTok: 2_000_000, famTok: 8_000_000 };
type Ctr = { n: number; tok: number; dn: number; dtok: number; at: number }; // n/tok = known total (DB + unflushed), dn/dtok = unflushed
const kidC = new Map<string, Ctr>(), famC = new Map<string, Ctr>(), errC = new Map<string, number>();
let pending = 0, lastFlush = Date.now(), flushing: Promise<void> | null = null;
const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // Riyadh day
const who = (s: { role: string; kid: string | null }) => s.role === "kid" ? (s.kid || "") : s.role === "guardian" ? "@g:" + (s.kid || "") : "@parent";
async function limitsOf(fam: string) {
  const v = await famRow(fam, "limits/@all"); const o: any = v && typeof v === "object" ? v : {};
  const num = (x: any, d: number) => (Number(x) > 0 ? Number(x) : d);
  return { kidDay: num(o.kidDay, DEF.kidDay), famDay: num(o.famDay, DEF.famDay), kidTok: num(o.kidTok, DEF.kidTok), famTok: num(o.famTok, DEF.famTok) };
}
async function ctr(map: Map<string, Ctr>, key: string, load: () => Promise<{ n: number; tok: number }>) {
  let c = map.get(key);
  if (!c || Date.now() - c.at > 5 * 60e3) { // (re)read the shared total every 5 minutes; other instances add to it too
    let base = { n: 0, tok: 0 }; try { base = await load(); } catch (e) { console.error("usage load", e); }
    c = { n: base.n + (c ? c.dn : 0), tok: base.tok + (c ? c.dtok : 0), dn: c ? c.dn : 0, dtok: c ? c.dtok : 0, at: Date.now() }; map.set(key, c);
  }
  return c;
}
async function usage(fam: string, kid: string, day: string) {
  const k = await ctr(kidC, fam + "|" + kid + "|" + day, async () => {
    const { data } = await sb.from("tk_ai_usage").select("n,tok").eq("family_id", fam).eq("kid_id", kid).eq("day", day).maybeSingle();
    return { n: data ? Number(data.n) : 0, tok: data ? Number(data.tok) : 0 };
  });
  const f = await ctr(famC, fam + "|" + day, async () => {
    const { data } = await sb.from("tk_ai_usage").select("n,tok").eq("family_id", fam).eq("day", day);
    return (data || []).reduce((a: any, r: any) => ({ n: a.n + Number(r.n), tok: a.tok + Number(r.tok) }), { n: 0, tok: 0 });
  });
  return { k, f };
}
function flush() {
  if (flushing) return flushing;
  const u: any[] = [], e: any[] = [];
  for (const [key, c] of kidC) if (c.dn || c.dtok) { const [f, k, d] = key.split("|"); u.push({ f, k, d, n: c.dn, tok: c.dtok }); }
  for (const [key, n] of errC) if (n) { const [d, r, st] = key.split("|"); e.push({ d, r, s: Number(st), n }); }
  pending = 0; lastFlush = Date.now();
  if (!u.length && !e.length) return Promise.resolve();
  // take the deltas now; put them back if the write fails
  const snapK = new Map([...kidC].map(([k, c]) => [k, { dn: c.dn, dtok: c.dtok }])), snapE = new Map(errC);
  for (const c of kidC.values()) { c.dn = 0; c.dtok = 0; }
  for (const c of famC.values()) { c.dn = 0; c.dtok = 0; }
  errC.clear();
  flushing = (async () => {
    const { error } = await sb.rpc("tk_ai_bump", { u, e });
    if (error) {
      console.error("usage flush", error.message);
      for (const [k, d] of snapK) { const c = kidC.get(k); if (c) { c.dn += d.dn; c.dtok += d.dtok; } }
      for (const [k, n] of snapE) errC.set(k, (errC.get(k) || 0) + n);
    }
  })().catch((x) => console.error("usage flush", x)).finally(() => { flushing = null; });
  return flushing;
}
function later(p: Promise<unknown>) { try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* not on the edge runtime */ } }
function tick() { pending++; if (pending >= 20 || Date.now() - lastFlush > 30e3) later(flush()); }
function noteErr(route: string, status: number) {
  const key = today() + "|" + route + "|" + status; errC.set(key, (errC.get(key) || 0) + 1);
  console.error(`ai relay ${route} -> ${status}`); later(flush());
}
setInterval(() => { if (pending || errC.size) flush(); }, 30e3);

// ---------- health: the real request path's reads (no caches), booleans only: never keys, tokens or row values ----------
type Checks = { sessions: boolean; rows: boolean; key: boolean | null; usage: boolean };
export async function healthCheck(db: any): Promise<{ ok: boolean; checks: Checks; ms: number }> {
  const t0 = Date.now(), checks: Checks = { sessions: false, rows: false, key: false, usage: false };
  const fine = async (f: () => Promise<any>) => { try { const r = await f(); return !!r && !r.error; } catch { return false; } };
  let fam: string | null = null;
  checks.sessions = await fine(async () => {
    const r = await db.from("tk_sessions").select("family_id,role,kid_id,seen_at").order("seen_at", { ascending: false }).limit(1);
    if (r && !r.error && Array.isArray(r.data) && r.data.length) fam = r.data[0].family_id || null;
    return r;
  });
  if (fam) {
    let has = false;
    checks.rows = await fine(async () => {
      const r = await db.from("tk_rows").select("value").eq("family_id", fam).eq("path", "apiKey").maybeSingle();
      has = !!r && !r.error && !!r.data && typeof r.data.value === "string" && r.data.value.length > 0;
      return r;
    });
    checks.key = checks.rows && has;
  } else {
    // no session to take a family from (or the sessions read failed): still prove tk_rows is readable; the key is unknown
    checks.rows = await fine(() => db.from("tk_rows").select("path").limit(1));
    checks.key = checks.sessions ? null : false;
  }
  // tk_ai_usage: the select the caps use, plus the bump RPC with nothing to add (it writes no rows)
  checks.usage = (await fine(() => db.from("tk_ai_usage").select("n,tok").limit(1))) && (await fine(() => db.rpc("tk_ai_bump", { u: [], e: [] })));
  return { ok: checks.sessions && checks.rows && checks.key !== false && checks.usage, checks, ms: Date.now() - t0 };
}
function sameSecret(a: string, b: string) { // constant-time compare
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
export async function healthRoute(req: Request, db: any, secret: string | undefined): Promise<Response> {
  const h = { "content-type": "application/json", "cache-control": "no-store" };
  if (!secret) return new Response(JSON.stringify({ error: "route" }), { status: 404, headers: h });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method" }), { status: 405, headers: h });
  if (!sameSecret(req.headers.get("x-hh-health") || "", secret)) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: h });
  return new Response(JSON.stringify(await healthCheck(db)), { status: 200, headers: h });
}

Deno.serve(async (req) => {
  try { return await handle(req); }
  catch (e) { noteErr("crash", 500); console.error(e); return json(req, { error: { type: "server", message: "relay error" } }, 500); }
});
async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const route = new URL(req.url).pathname.split("/").pop();
  if (route === "health") return await healthRoute(req, sb, Deno.env.get("HH_HEALTH_SECRET") || undefined);
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  let b: any; try { b = await req.json(); } catch { return json(req, { error: "bad_json" }, 400); }
  const s = await session(b && b.t); if (!s) return json(req, { error: "bad_session" }, 401);

  if (route === "claude") {
    if (limited(b.t, 40)) return json(req, { error: { type: "rate_limit", message: "too many requests" } }, 429);
    const key = await famRow(s.fam, "apiKey"); if (!key || typeof key !== "string") return json(req, { error: { type: "no_key", message: "no api key" } }, 412);
    const body = b.body || {};
    if (!MODELS.has(body.model)) return json(req, { error: { type: "bad_model", message: "model not allowed" } }, 400);
    body.max_tokens = Math.min(Number(body.max_tokens) || 400, 4000);
    const day = today(), kid = who(s), lim = await limitsOf(s.fam), { k, f } = await usage(s.fam, kid, day);
    const over = s.role === "kid" && (k.n >= lim.kidDay || k.tok + body.max_tokens > lim.kidTok) ? "kid"
      : (f.n >= lim.famDay || f.tok + body.max_tokens > lim.famTok) ? "family" : "";
    if (over) return json(req, { error: { type: "daily_limit", scope: over, message: over === "kid" ? "daily limit reached for this child" : "daily limit reached for this family" } }, 429);
    k.n++; k.dn++; k.tok += body.max_tokens; k.dtok += body.max_tokens; f.n++; f.tok += body.max_tokens; tick();
    let r: Response;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
      });
    } catch (e) { noteErr("claude", 502); return json(req, { error: { type: "upstream", message: "could not reach the AI service" } }, 502); }
    if (r.status >= 500) noteErr("claude", r.status);
    return new Response(r.body, { status: r.status, headers: { ...cors(req), "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
  }

  if (route === "aztoken") {
    const c = azC.get(s.fam); if (c && Date.now() - c.at < 8 * 60e3) return json(req, { token: c.token, region: c.region });
    const az = await famRow(s.fam, "azure"); if (!az || !az.key || !az.region) return json(req, { error: "no_azure" }, 412);
    if (limited("az|" + b.t, 30)) return json(req, { error: { type: "rate_limit", message: "too many requests" } }, 429);
    let r: Response;
    try { r = await fetch(`https://${az.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": az.key, "content-length": "0" } }); }
    catch (e) { noteErr("aztoken", 502); return json(req, { error: "azure unreachable" }, 502); }
    if (!r.ok) { if (r.status >= 500) noteErr("aztoken", r.status); return json(req, { error: "azure " + r.status }, 502); }
    const token = await r.text(); azC.set(s.fam, { token, region: az.region, at: Date.now() });
    return json(req, { token, region: az.region });
  }
  return json(req, { error: "route" }, 404);
}

// Hudhud AI relay: the Claude and Azure keys never leave the server.
// POST /ai/claude  {t, body}  -> streams the Anthropic Messages API response (key read from the family's "apiKey" row)
// POST /ai/aztoken {t}        -> {token, region}: a 10-minute Azure Speech token (key read from the family's "azure" row)
// Deploy with "Verify JWT" OFF (the app authenticates with its own session token "t").
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
  const { data } = await sb.from("tk_sessions").select("family_id,role,kid_id").eq("token", t).maybeSingle();
  if (!data) { sessC.delete(t); return null; }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  const route = new URL(req.url).pathname.split("/").pop();
  let b: any; try { b = await req.json(); } catch { return json(req, { error: "bad_json" }, 400); }
  const s = await session(b && b.t); if (!s) return json(req, { error: "bad_session" }, 401);

  if (route === "claude") {
    if (limited(b.t, 40)) return json(req, { error: { type: "rate_limit", message: "too many requests" } }, 429);
    const key = await famRow(s.fam, "apiKey"); if (!key || typeof key !== "string") return json(req, { error: { type: "no_key", message: "no api key" } }, 412);
    const body = b.body || {};
    if (!MODELS.has(body.model)) return json(req, { error: { type: "bad_model", message: "model not allowed" } }, 400);
    body.max_tokens = Math.min(Number(body.max_tokens) || 400, 4000);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    return new Response(r.body, { status: r.status, headers: { ...cors(req), "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
  }

  if (route === "aztoken") {
    const c = azC.get(s.fam); if (c && Date.now() - c.at < 8 * 60e3) return json(req, { token: c.token, region: c.region });
    const az = await famRow(s.fam, "azure"); if (!az || !az.key || !az.region) return json(req, { error: "no_azure" }, 412);
    const r = await fetch(`https://${az.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": az.key, "content-length": "0" } });
    if (!r.ok) return json(req, { error: "azure " + r.status }, 502);
    const token = await r.text(); azC.set(s.fam, { token, region: az.region, at: Date.now() });
    return json(req, { token, region: az.region });
  }
  return json(req, { error: "route" }, 404);
});

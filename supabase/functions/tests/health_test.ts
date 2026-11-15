// Unit tests for the relay health route (ai) and the watchdog (notify), with a mock Supabase client. No network.
// Run: deno test --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/tests/health_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";

Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
const handlers: ((r: Request) => Promise<Response>)[] = [];
(Deno as any).serve = (h: any) => { handlers.push(h); return { finished: Promise.resolve(), shutdown() {} }; }; // the modules call Deno.serve at import
const ai = await import("../ai/index.ts");
const aiHandler = handlers[0];
const notify = await import("../notify/index.ts");
const opts = { sanitizeOps: false, sanitizeResources: false }; // ai/index.ts keeps a flush interval

const KEY = "sk-ant-SECRET-never-leak", TOKEN = "11111111-2222-3333-4444-555555555555";
type Deny = { sessions?: boolean; rows?: boolean; usage?: boolean; bump?: boolean; noSession?: boolean; noKey?: boolean; throwRows?: boolean };
function mockDb(deny: Deny = {}) {
  const calls: string[] = [];
  const perm = { message: "permission denied for table", code: "42501" };
  const q = (table: string) => {
    const st: any = { table, filters: {} as Record<string, unknown> };
    const result = () => {
      if (table === "tk_sessions") return deny.sessions ? { data: null, error: perm } : { data: deny.noSession ? [] : [{ family_id: "fam-1", role: "kid", kid_id: "k1", seen_at: new Date().toISOString(), token: TOKEN }], error: null };
      if (table === "tk_rows") {
        if (deny.throwRows) throw new Error("network down");
        if (deny.rows) return { data: null, error: perm };
        if (st.filters.path === "apiKey") return { data: deny.noKey ? null : { value: KEY }, error: null };
        return { data: [{ path: "kids/k1" }], error: null };
      }
      if (table === "tk_ai_usage") return deny.usage ? { data: null, error: perm } : { data: [], error: null };
      return { data: null, error: { message: "unknown table" } };
    };
    const b: any = {
      select(c: string) { calls.push(`${table}.select(${c})`); return b; },
      eq(k: string, v: unknown) { st.filters[k] = v; return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() { return Promise.resolve().then(() => { const r = result(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; }); },
      then(res: any, rej: any) { return Promise.resolve().then(result).then(res, rej); },
    };
    return b;
  };
  return {
    calls,
    from: (t: string) => q(t),
    rpc: (name: string, args: any) => { calls.push(`rpc.${name}(${JSON.stringify(args)})`); return Promise.resolve(deny.bump ? { data: null, error: { message: "permission denied for function" } } : { data: null, error: null }); },
  };
}
const post = (h: Record<string, string> = {}) => new Request("http://x/functions/v1/ai/health", { method: "POST", headers: h, body: "{}" });

Deno.test("health: all reads succeed -> ok:true, booleans only, nothing leaked", opts, async () => {
  const db = mockDb();
  const r = await ai.healthRoute(post({ "x-hh-health": "s3cret" }), db, "s3cret");
  assertEquals(r.status, 200);
  const txt = await r.text(), j = JSON.parse(txt);
  assertEquals(j.ok, true);
  assertEquals(j.checks, { sessions: true, rows: true, key: true, usage: true });
  assert(typeof j.ms === "number");
  assert(!txt.includes(KEY) && !txt.includes(TOKEN) && !txt.includes("fam-1") && !txt.includes("k1"), "no values in the answer");
  assert(db.calls.some((c) => c.startsWith("tk_sessions.select")));
  assert(db.calls.includes("tk_rows.select(value)"));
  assert(db.calls.includes('rpc.tk_ai_bump({"u":[],"e":[]})'), "bump called with nothing to write");
});

Deno.test("health: env missing -> 404; wrong / missing secret -> 403 without touching the db", opts, async () => {
  const db = mockDb();
  assertEquals((await ai.healthRoute(post({ "x-hh-health": "x" }), db, undefined)).status, 404);
  assertEquals((await ai.healthRoute(post({ "x-hh-health": "wrong" }), db, "s3cret")).status, 403);
  assertEquals((await ai.healthRoute(post(), db, "s3cret")).status, 403);
  assertEquals((await ai.healthRoute(post({ "x-hh-health": "s3cret!" }), db, "s3cret")).status, 403);
  assertEquals(db.calls.length, 0);
});

Deno.test("health: the 2026-11-15 incident (no SELECT on tk_sessions) -> ok:false, sessions:false", opts, async () => {
  const j = JSON.parse(await (await ai.healthRoute(post({ "x-hh-health": "s" }), mockDb({ sessions: true }), "s")).text());
  assertEquals(j.ok, false);
  assertEquals(j.checks.sessions, false);
  assertEquals(j.checks.key, false);
});

Deno.test("health: each failing read is reported", opts, async () => {
  const run = async (d: Deny) => await ai.healthCheck(mockDb(d));
  let h = await run({ rows: true }); assertEquals([h.ok, h.checks.rows, h.checks.key], [false, false, false]);
  h = await run({ throwRows: true }); assertEquals([h.ok, h.checks.rows], [false, false]);
  h = await run({ noKey: true }); assertEquals([h.ok, h.checks.rows, h.checks.key], [false, true, false]);
  h = await run({ usage: true }); assertEquals([h.ok, h.checks.usage], [false, false]);
  h = await run({ bump: true }); assertEquals([h.ok, h.checks.usage], [false, false]);
  h = await run({ noSession: true }); assertEquals(h, { ...h, ok: true, checks: { sessions: true, rows: true, key: null, usage: true } });
});

Deno.test("ai handler: /health is routed before the session check; /claude unchanged", opts, async () => {
  Deno.env.delete("HH_HEALTH_SECRET");
  assertEquals((await aiHandler(post({ "x-hh-health": "x" }))).status, 404);
  Deno.env.set("HH_HEALTH_SECRET", "s3cret");
  assertEquals((await aiHandler(post({ "x-hh-health": "nope" }))).status, 403);
  assertEquals((await aiHandler(new Request("http://x/functions/v1/ai/health"))).status, 405);
  Deno.env.delete("HH_HEALTH_SECRET");
  const r = await aiHandler(new Request("http://x/functions/v1/ai/claude", { method: "POST", body: JSON.stringify({ t: "00000000-0000-0000-0000-00000000000", body: {} }) }));
  assertEquals([r.status, (await r.json()).error], [401, "bad_session"]);
});

// ---------- notify watchdog ----------
function healthDb(row: any) {
  const st = { row: row ? { ...row } : null as any };
  const b: any = {
    select() { return b; }, eq() { return b; },
    maybeSingle: () => Promise.resolve({ data: st.row ? { ...st.row } : null, error: null }),
    upsert: (r: any) => { st.row = { ...(st.row || {}), ...r }; return Promise.resolve({ error: null }); },
    update: (r: any) => { st.row = { ...(st.row || {}), ...r }; return { eq: () => Promise.resolve({ error: null }) }; },
  };
  return { st, from: () => b };
}
function fakeFetch(health: { status: number; body: any } | "throw", seen: { url: string; h: Record<string, string> }[] = []) {
  return (async (url: string, init: any) => {
    seen.push({ url, h: init.headers });
    if (url.endsWith("/ai/claude")) return new Response(JSON.stringify({ error: "bad_session" }), { status: 401 });
    if (health === "throw") throw new Error("timeout");
    return new Response(JSON.stringify(health.body), { status: health.status });
  }) as unknown as typeof fetch;
}
const T0 = Date.parse("2026-11-15T10:00:00Z");

Deno.test("watchdog: without the secret only the bad-session check runs (old behaviour)", opts, async () => {
  const db = healthDb({ id: "ai", fails: 0 }), seen: any[] = [];
  const r = await notify.relayDown(T0, db, fakeFetch({ status: 200, body: { ok: false, checks: { sessions: false } } }, seen), "http://sb", "");
  assertEquals(r.alert, false);
  assertEquals(seen.map((s) => s.url), ["http://sb/functions/v1/ai/claude"]);
  assertEquals(db.st.row.fails, 0);
});

Deno.test("watchdog: health ok -> healthy, secret sent in x-hh-health", opts, async () => {
  const db = healthDb({ id: "ai", fails: 2, detail: "x" }), seen: any[] = [];
  const r = await notify.relayDown(T0, db, fakeFetch({ status: 200, body: { ok: true, checks: { sessions: true, rows: true, key: true, usage: true } } }, seen), "http://sb", "s3cret");
  assertEquals(r.alert, false);
  assertEquals(seen[1].url, "http://sb/functions/v1/ai/health");
  assertEquals(seen[1].h["x-hh-health"], "s3cret");
  assertEquals([db.st.row.fails, db.st.row.detail], [0, ""]);
});

Deno.test("watchdog: ok:false 3 times -> one alert, failing checks in detail; then at most once per hour", opts, async () => {
  const db = healthDb({ id: "ai", fails: 0 });
  const f = fakeFetch({ status: 200, body: { ok: false, checks: { sessions: false, rows: true, key: false, usage: true } } });
  const a1 = await notify.relayDown(T0, db, f, "http://sb", "s");
  const a2 = await notify.relayDown(T0 + 60e3, db, f, "http://sb", "s");
  const a3 = await notify.relayDown(T0 + 120e3, db, f, "http://sb", "s");
  assertEquals([a1.alert, a2.alert, a3.alert], [false, false, true]);
  assertEquals(db.st.row.fails, 3);
  assertEquals(db.st.row.detail, "health failed: sessions,key");
  assertEquals((await notify.relayDown(T0 + 30 * 60e3, db, f, "http://sb", "s")).alert, false); // same hour
  assertEquals((await notify.relayDown(T0 + 121e3 + 3600e3, db, f, "http://sb", "s")).alert, true); // an hour later
});

Deno.test("watchdog: non-200 and network errors from /ai/health are failures", opts, async () => {
  let db = healthDb({ id: "ai", fails: 0 });
  await notify.relayDown(T0, db, fakeFetch({ status: 404, body: { error: "route" } }), "http://sb", "s");
  assertEquals([db.st.row.fails, db.st.row.detail], [1, "health status 404"]);
  db = healthDb({ id: "ai", fails: 0 });
  await notify.relayDown(T0, db, fakeFetch("throw"), "http://sb", "s");
  assertEquals([db.st.row.fails, db.st.row.detail], [1, "health: timeout"]);
});

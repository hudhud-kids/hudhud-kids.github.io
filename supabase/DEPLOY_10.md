# Deploy 10 — the watchdog tests the real lesson path (`/ai/health`)

Why: on 2026-11-15 every lesson was rejected with `401 bad_session` for a day because the service role had no SELECT on
`tk_sessions`. The watchdog only sent an unknown session and expected 401, so it saw nothing wrong.
Now `notify` also calls `POST /ai/health`, which runs the same service-role reads a real request needs and answers
`{"ok":true|false,"checks":{"sessions","rows","key","usage"},"ms"}` (booleans only — never keys, tokens or values).

Files: `supabase/functions/ai/index.ts`, `supabase/functions/notify/index.ts` (tests: `supabase/functions/tests/health_test.ts`).
No SQL. Needs schema_8 (`tk_health`) and schema_9 (with its grants at the end) already applied.

| check | what it does (service role) | false means |
|---|---|---|
| `sessions` | `select family_id,role,kid_id,seen_at from tk_sessions order by seen_at desc limit 1` | no SELECT on `tk_sessions` (the 2026-11-15 incident) |
| `rows` | `select value from tk_rows where family_id = <that session's family> and path = 'apiKey'` | no SELECT on `tk_rows` |
| `key` | that row holds a non-empty string (`null` = no session exists yet, not counted as a failure) | the family has no Claude key: lessons answer 412 |
| `usage` | `select n,tok from tk_ai_usage limit 1` + `rpc tk_ai_bump(u:[], e:[])` (writes nothing) | caps table or bump RPC not reachable |

## 1. Set the secret (once — Edge Function secrets are shared by all functions of the project)

1. Make a random value (any 32+ characters), e.g. in the SQL editor:
   ```sql
   select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
   ```
2. Open https://supabase.com/dashboard/project/muhfgviqdjysjzkbwlph/functions/secrets → **Add new secret**:
   - Name:
     ```
     HH_HEALTH_SECRET
     ```
   - Value: the value from step 1 → **Save**.
   Both `ai` and `notify` read this one secret; nothing else to set. Do not put it in the app or in git.

## 2. Deploy order: `ai` first, then `notify`

1. **`ai`** — deploy `supabase/functions/ai/index.ts` (Verify JWT stays **OFF**). From now on `/ai/health` answers
   (403 with a wrong header, 404 if the secret is missing). `/ai/claude` and `/ai/aztoken` are unchanged.
2. **`notify`** — deploy `supabase/functions/notify/index.ts` (settings unchanged; it still needs `x-cron-secret`).

If `notify` went first by mistake, its health call would get 404 from the old `ai` and count failures; after 3 minutes
the admins would get «⚠️ خدمة المعلمة متوقفة». Deploying `ai` right after fixes it. To roll back the watchdog alone,
delete the `HH_HEALTH_SECRET` secret: `notify` goes back to the old bad-session check only and `/ai/health` answers 404.

CLI alternative (same order):
```
supabase functions deploy ai --no-verify-jwt --project-ref muhfgviqdjysjzkbwlph
supabase functions deploy notify --project-ref muhfgviqdjysjzkbwlph
```

## 3. Verify (2–3 minutes after deploying `notify`; it runs every minute)

```sql
select fails, detail, last_ok, last_fail, last_alert, now() - last_ok as since_ok from public.tk_health where id = 'ai';
```
Expected when healthy: `fails = 0`, `detail = ''`, `since_ok` under ~10 minutes (last_ok is refreshed every 10 min while healthy).

When something is wrong: `fails` counts up every minute and `detail` names it, e.g.
- `health failed: sessions,key` — service role lost SELECT on `tk_sessions` (re-run the grants at the end of `schema_9_security.sql`);
- `health failed: rows,key` — no SELECT on `tk_rows`; `health failed: key` — the newest session's family has no `apiKey` row;
- `health failed: usage` — `tk_ai_usage` / `tk_ai_bump` grants missing;
- `health status 404` — `ai` not redeployed yet, or the secret is not set for it; `health status 403` — secrets differ (re-save it);
- `status 401: ...` / `status 5xx` — the old bad-session check failed (function down).
At `fails = 3` the admins get one push, then at most one per hour while it stays down.

Optional manual test of the route (replace `<secret>`; answer must be `"ok":true`):
```
curl -s -X POST https://muhfgviqdjysjzkbwlph.supabase.co/functions/v1/ai/health -H "x-hh-health: <secret>" -d "{}"
```

## Tests (local, no network)
```
deno test --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/tests/health_test.ts
```

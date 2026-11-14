# Deploy 9 — passwords as hashes only, session expiry, login lockout, AI relay caps, privacy

Files: `supabase/schema_9_security.sql`, `supabase/functions/ai/index.ts`, `index.html`, `join/`, `welcome/`, `privacy/`.

The SQL is backward compatible: apply it **before** the new app is published. Old cached apps keep working:
- `tk_login(u, p)` still exists (now a wrapper of `tk_login2(u, p, device)`).
- `tk_accounts_set` still exists but is safe: it never deletes an account because it is missing from the list, never changes
  a password it was not sent, and removes only accounts whose `kids/<id>` / `guardians/<id>` row is gone.
- A trigger strips `pass` from `parent`, `kids/*`, `guardians/*` on every insert/update of `tk_rows`, so an old app that
  still pushes a password stores nothing. Its own local copy still has it until the app updates (nothing to do about that).
- Until the server has schema_9, the new app falls back to the old flow (`tk_accounts_set`, `tk_login`) and keeps passwords
  in the data, so the order below is safe even if the app is published first by mistake.

## Order

1. **Backup** (Supabase → Database → Backups, or):
   ```sql
   create table public.tk_rows_bak9 as select * from public.tk_rows;
   create table public.tk_accounts_bak9 as select * from public.tk_accounts;
   ```
2. **SQL**: run `supabase/schema_9_security.sql` in the SQL editor (safe to run twice). It:
   - adds `device` to `tk_login_fail`, creates `tk_login_dev`, `tk_ai_usage`, `tk_ai_err`;
   - makes sure every account in `tk_rows` has its bcrypt hash in `tk_accounts` (same as the old client sync: hash made
     from the password in `tk_rows` when missing or different; old usernames of a renamed child/guardian removed);
     usernames used by another family are skipped (see the NOTICE lines in the output);
   - adds a unique index (one account per child/guardian), the strip trigger, and strips existing `pass` fields (bumping
     `ver` so every device receives the clean copy);
   - `tk_sess`: sessions idle 30 days are rejected (`bad_session`); `tk_cleanup()` deletes them and old rows; schedules
     `hudhud-cleanup` daily with pg_cron (00:17 UTC) when pg_cron is installed;
   - new RPCs: `tk_login2`, `tk_accounts_apply`, `tk_account_set_pass`; service-role only `tk_ai_bump`.
   Check: `select count(*) from tk_rows where value ? 'pass';` → 0.
3. **Edge function**: deploy `supabase/functions/ai` (Verify JWT stays OFF). Needs `tk_ai_bump`/`tk_ai_usage` from step 2.
   The `bad_session` 401 answer the notify health check expects is unchanged.
4. **App**: publish `index.html`, `join/`, `welcome/`, `privacy/` (GitHub Pages). Bump the service-worker cache if the
   project does that on each release.
5. **Tell the admin**: passwords are no longer visible. The dashboard shows «إعادة تعيين» to set a new one (shown once, with
   the WhatsApp message). Changing a password signs that account out on its other devices.

## Optional: per-family AI limits
Defaults: 1,500 requests/child/day, 6,000/family/day, token budget (sum of `max_tokens`) 2,000,000/child and
8,000,000/family per Riyadh day. Override for one family (only the admin role can write this row; children cannot):
```sql
insert into public.tk_rows(family_id, path, value) values ('<family uuid>', 'limits/@all', '{"kidDay":2000,"famDay":8000,"kidTok":3000000,"famTok":10000000}')
on conflict (family_id, path) do update set value = excluded.value, ver = tk_rows.ver + 1, updated_at = clock_timestamp();
```
Over a cap the relay answers 429 `{"error":{"type":"daily_limit","scope":"kid"|"family"}}`. Usage: `select * from tk_ai_usage order by day desc;`
Relay failures (5xx, unreachable upstream, crashes) per day: `select * from tk_ai_err order by day desc;` (for the health check).

## Rollback
- App: republish the previous `index.html` (it works with the schema_9 server: `tk_login` and the safe `tk_accounts_set`
  remain; only offline login of devices that no longer hold passwords stops working).
- Edge function: redeploy the previous `ai/index.ts` (the new tables are simply unused).
- SQL (only if really needed):
  ```sql
  drop trigger if exists tk_rows_nopass on public.tk_rows;
  drop index if exists public.tk_accounts_who;
  -- restore tk_sess/tk_login/tk_accounts_set by re-running schema_1 (functions part) then schema_6 + schema_7 + schema_8
  ```
  Stripped passwords cannot be put back from the hashes. If the old plain-password flow must return, restore `pass` from
  the backup: `update tk_rows r set value = r.value || jsonb_build_object('pass', b.value->'pass'), ver = r.ver + 1, updated_at = clock_timestamp() from tk_rows_bak9 b where b.family_id = r.family_id and b.path = r.path and b.value ? 'pass';`
  (passwords changed after the deploy are not in the backup; reset those).
- After a successful week: `drop table public.tk_rows_bak9, public.tk_accounts_bak9;` (they contain plain passwords).

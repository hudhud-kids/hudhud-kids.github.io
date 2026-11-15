-- schema_9: passwords live ONLY as bcrypt hashes in tk_accounts; sessions expire after 30 idle days;
-- login lockout per (username + device) with a global per-username soft limit; AI relay usage counters.
-- Safe to run more than once. Deploy notes and rollback: supabase/DEPLOY_9.md

------------------------------------------------------------------------------------------------
-- 0) tables
------------------------------------------------------------------------------------------------
alter table public.tk_login_fail add column if not exists device text not null default '-';
create index if not exists tk_login_fail_ud on public.tk_login_fail (username, device, at desc);

-- devices that logged in successfully: they are not blocked by the global per-username limit
create table if not exists public.tk_login_dev (username text not null, device text not null, at timestamptz not null default now(), primary key (username, device));
alter table public.tk_login_dev enable row level security;
revoke all on public.tk_login_dev from anon, authenticated;

-- AI relay usage per family / per child / per day (written by the "ai" Edge Function with the service role)
create table if not exists public.tk_ai_usage (
  family_id uuid not null references public.tk_family(id) on delete cascade,
  kid_id text not null default '',          -- child id, '@parent' or '@g:<guardian id>'
  day date not null,
  n int not null default 0,                 -- requests
  tok bigint not null default 0,            -- rough token budget used: sum of max_tokens
  primary key (family_id, kid_id, day));
create index if not exists tk_ai_usage_day on public.tk_ai_usage (family_id, day);
-- relay 5xx / failures per day (for the health check)
create table if not exists public.tk_ai_err (
  day date not null, route text not null, status int not null, n int not null default 0, last_at timestamptz not null default now(),
  primary key (day, route, status));
alter table public.tk_ai_usage enable row level security;
alter table public.tk_ai_err enable row level security;
revoke all on public.tk_ai_usage, public.tk_ai_err from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.tk_ai_usage, public.tk_ai_err to service_role;
  end if;
end $$;

------------------------------------------------------------------------------------------------
-- 1) migration step A: every account that tk_rows knows about gets its hash in tk_accounts
--    (exactly what the old client-side sync "tk_accounts_set" did)
------------------------------------------------------------------------------------------------
do $$
declare r record; un text; pw text; rl text; kd text; ex public.tk_accounts; gone text[];
begin
  perform set_config('search_path', 'public, extensions', true);   -- crypt() / gen_salt() live in "extensions" on Supabase
  for r in select family_id, path, value from public.tk_rows
           where (path = 'parent' or path like 'kids/_%' or path like 'guardians/_%')
             and jsonb_typeof(value) = 'object' and coalesce(value->>'pass', '') <> '' and coalesce(btrim(value->>'user'), '') <> ''
           order by family_id, path loop
    un := lower(btrim(r.value->>'user')); pw := r.value->>'pass';
    rl := case when r.path = 'parent' then 'parent' when r.path like 'kids/%' then 'kid' else 'guardian' end;
    kd := case when rl = 'parent' then null else split_part(r.path, '/', 2) end;
    select * into ex from public.tk_accounts where username = un;
    if ex.username is null then
      insert into public.tk_accounts(username, pass_hash, family_id, role, kid_id) values (un, crypt(pw, gen_salt('bf')), r.family_id, rl, kd);
    elsif ex.family_id = r.family_id then
      update public.tk_accounts set role = rl, kid_id = kd,
        pass_hash = case when pass_hash = crypt(pw, pass_hash) then pass_hash else crypt(pw, gen_salt('bf')) end
        where username = un;
    else
      raise notice 'schema_9: username % is used by another family, skipped (%/%)', un, r.family_id, r.path;
      continue;
    end if;
    -- an older username of the same child/guardian (renamed) is removed, like the old sync did
    if rl <> 'parent' then
      select array_agg(username) into gone from public.tk_accounts where family_id = r.family_id and role = rl and kid_id = kd and username <> un;
      if gone is not null then
        delete from public.tk_sessions where username = any(gone);
        delete from public.tk_accounts where username = any(gone);
      end if;
    end if;
  end loop;
end $$;

-- one account per child / guardian from now on
create unique index if not exists tk_accounts_who on public.tk_accounts (family_id, role, kid_id) where role <> 'parent';

------------------------------------------------------------------------------------------------
-- 2) migration step B: no plain password is ever stored in tk_rows again
------------------------------------------------------------------------------------------------
create or replace function public.tk_rows_nopass() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.path = 'parent' or new.path like 'kids/_%' or new.path like 'guardians/_%')
     and jsonb_typeof(new.value) = 'object' and new.value ? 'pass' then
    new.value := new.value - 'pass';
  end if;
  return new;
end $$;
drop trigger if exists tk_rows_nopass on public.tk_rows;
create trigger tk_rows_nopass before insert or update on public.tk_rows for each row execute function public.tk_rows_nopass();

-- strip what is already there and bump the versions so every device receives the clean copy
update public.tk_rows set value = value - 'pass', ver = ver + 1, updated_at = clock_timestamp()
  where (path = 'parent' or path like 'kids/_%' or path like 'guardians/_%') and jsonb_typeof(value) = 'object' and value ? 'pass';

------------------------------------------------------------------------------------------------
-- 3) sessions: 30 idle days -> gone
------------------------------------------------------------------------------------------------
create or replace function public.tk_sess(t uuid) returns public.tk_sessions
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions;
begin
  select * into s from public.tk_sessions where token = t;
  if s.token is null or s.seen_at < now() - interval '30 days' then
    raise exception 'bad_session' using errcode = '28000';   -- the row itself is deleted by tk_cleanup()
  end if;
  if s.seen_at < now() - interval '1 hour' then update public.tk_sessions set seen_at = now() where token = t; end if;
  return s;
end $$;
revoke all on function public.tk_sess(uuid) from public, anon, authenticated;

create or replace function public.tk_cleanup() returns json
language plpgsql security definer set search_path = public as $$
declare a int; b int;
begin
  delete from public.tk_sessions where seen_at < now() - interval '30 days'; get diagnostics a = row_count;
  delete from public.tk_login_fail where at < now() - interval '1 day';
  delete from public.tk_login_dev where at < now() - interval '180 days';
  delete from public.tk_ai_usage where day < current_date - 90;
  delete from public.tk_ai_err where day < current_date - 90; get diagnostics b = row_count;
  return json_build_object('sessions', a);
end $$;
revoke all on function public.tk_cleanup() from public, anon, authenticated;
select public.tk_cleanup();

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'hudhud-cleanup') then perform cron.unschedule('hudhud-cleanup'); end if;
    perform cron.schedule('hudhud-cleanup', '17 0 * * *', 'select public.tk_cleanup()');
  end if;
end $$;

------------------------------------------------------------------------------------------------
-- 4) login: lock per (username + device), plus a global soft limit per username that devices
--    which logged in before are not blocked by. tk_login(u,p) stays for cached old apps.
------------------------------------------------------------------------------------------------
create or replace function public.tk_login2(u text, p text, d text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare a public.tk_accounts; t uuid; n int; un text := lower(btrim(coalesce(u, ''))); dv text := left(coalesce(nullif(btrim(d), ''), '-'), 64); known boolean;
begin
  if un = '' then perform pg_sleep(0.8); return null; end if;
  select count(*) into n from public.tk_login_fail where username = un and device = dv and at > now() - interval '15 minutes';
  if n >= 10 then perform pg_sleep(1); raise exception 'locked'; end if;
  known := dv <> '-' and exists (select 1 from public.tk_login_dev where username = un and device = dv);
  if not known then
    select count(*) into n from public.tk_login_fail where username = un and at > now() - interval '15 minutes';
    if n >= 30 then perform pg_sleep(1); raise exception 'locked'; end if;
  end if;
  select * into a from public.tk_accounts where username = un;
  if a.username is null or a.pass_hash <> crypt(coalesce(p, ''), a.pass_hash) then
    insert into public.tk_login_fail(username, device) values (un, dv);
    perform pg_sleep(0.8); return null;
  end if;
  delete from public.tk_login_fail where username = un and device = dv;
  if dv <> '-' then insert into public.tk_login_dev(username, device) values (un, dv) on conflict (username, device) do update set at = now(); end if;
  insert into public.tk_sessions(username, family_id, role, kid_id) values (a.username, a.family_id, a.role, a.kid_id) returning token into t;
  return json_build_object('token', t, 'role', a.role, 'kid', a.kid_id, 'family', a.family_id);
end $$;

create or replace function public.tk_login(u text, p text) returns json
language sql security definer set search_path = public, extensions as $$ select public.tk_login2(u, p, null); $$;

------------------------------------------------------------------------------------------------
-- 5) accounts: one helper, the new RPCs, and a safe replacement of the old bulk sync
------------------------------------------------------------------------------------------------
-- returns: ok | created | pass | taken | need_pass | bad_user | bad_pass | bad
create or replace function public.tk_acct_save(fam uuid, caller text, keep uuid, rl text, kd text, un text, pw text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare cur public.tk_accounts; ex public.tk_accounts; st text := 'ok';
begin
  un := lower(btrim(coalesce(un, ''))); kd := nullif(btrim(coalesce(kd, '')), ''); pw := nullif(pw, '');
  if rl not in ('parent', 'kid', 'guardian') or (rl <> 'parent' and kd is null) then return 'bad'; end if;
  if (rl = 'parent' and (length(un) < 1 or length(un) > 64)) or (rl <> 'parent' and un !~ '^[a-z0-9_.-]{3,24}$') then return 'bad_user'; end if;
  if pw is not null and (length(pw) < 4 or length(pw) > 64) then return 'bad_pass'; end if;
  if rl = 'parent' then select * into cur from public.tk_accounts where username = caller and family_id = fam;
  else select * into cur from public.tk_accounts where family_id = fam and role = rl and kid_id = kd; end if;
  select * into ex from public.tk_accounts where username = un;
  if ex.username is not null and (cur.username is null or ex.username <> cur.username) then return 'taken'; end if;
  if cur.username is null then
    if pw is null then return 'need_pass'; end if;
    insert into public.tk_accounts(username, pass_hash, family_id, role, kid_id) values (un, crypt(pw, gen_salt('bf')), fam, rl, kd);
    return 'created';
  end if;
  if cur.username <> un then
    update public.tk_accounts set username = un where username = cur.username;
    update public.tk_sessions set username = un where username = cur.username;
    update public.tk_push_subs set username = un where username = cur.username;
  end if;
  if pw is not null and cur.pass_hash <> crypt(pw, cur.pass_hash) then
    update public.tk_accounts set pass_hash = crypt(pw, gen_salt('bf')) where username = un;
    delete from public.tk_sessions where username = un and token is distinct from keep;   -- other devices sign in again
    st := 'pass';
  end if;
  return st;
end $$;
revoke all on function public.tk_acct_save(uuid, text, uuid, text, text, text, text) from public, anon, authenticated;

-- the family admin (parent role) creates / renames / deletes accounts in one call.
-- ops: [{op:'save', kind:'kid'|'guardian'|'parent', id, u, p?}, {op:'del', kind, id}]  (p only when it is new)
create or replace function public.tk_accounts_apply(t uuid, ops jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; o jsonb; res jsonb := '[]'; st text; names text[];
begin
  s := public.tk_sess(t);
  if s.role <> 'parent' then raise exception 'parent_only'; end if;
  if jsonb_typeof(ops) <> 'array' or jsonb_array_length(ops) > 500 then raise exception 'bad_data'; end if;
  for o in select * from jsonb_array_elements(ops) loop
    if o->>'op' = 'del' then
      if o->>'kind' in ('kid', 'guardian') and coalesce(o->>'id', '') <> '' then
        select array_agg(username) into names from public.tk_accounts where family_id = s.family_id and role = o->>'kind' and kid_id = o->>'id';
        if names is not null then
          delete from public.tk_sessions where username = any(names);
          delete from public.tk_push_subs where username = any(names) and family_id = s.family_id;
          delete from public.tk_accounts where username = any(names);
        end if;
        st := 'ok';
      else st := 'bad'; end if;
    else
      st := public.tk_acct_save(s.family_id, s.username, s.token, o->>'kind', o->>'id', o->>'u', o->>'p');
    end if;
    res := res || jsonb_build_array(jsonb_build_object('kind', o->>'kind', 'id', o->>'id', 'st', st));
  end loop;
  return json_build_object('ok', true, 'results', res);
end $$;

-- set a new password. parent: any account of the family; guardian: only their own.
-- kind: 'kid' | 'guardian' | 'parent' (id is ignored for 'parent': the caller's own account)
create or replace function public.tk_account_set_pass(t uuid, kind text, id text, new_pass text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; cur public.tk_accounts; un text; st text;
begin
  s := public.tk_sess(t);
  if coalesce(new_pass, '') = '' or length(new_pass) < 4 or length(new_pass) > 64 then raise exception 'bad_pass'; end if;
  if s.role = 'guardian' then
    if kind <> 'guardian' or id is distinct from s.kid_id then raise exception 'not_allowed'; end if;
  elsif s.role <> 'parent' then raise exception 'not_allowed';
  end if;
  if kind = 'parent' then
    if s.role <> 'parent' then raise exception 'not_allowed'; end if;
    select * into cur from public.tk_accounts where username = s.username;
  elsif kind in ('kid', 'guardian') then
    select * into cur from public.tk_accounts where family_id = s.family_id and role = kind and kid_id = id;
  else raise exception 'bad_kind'; end if;
  if cur.username is not null then un := cur.username;
  else
    -- no account yet (e.g. never synced): the parent creates it from the username in the family data
    if s.role <> 'parent' or kind = 'parent' then raise exception 'no_account'; end if;
    select lower(btrim(value->>'user')) into un from public.tk_rows where family_id = s.family_id and path = (case when kind = 'kid' then 'kids/' else 'guardians/' end) || id;
    if coalesce(un, '') = '' then raise exception 'no_account'; end if;
  end if;
  st := public.tk_acct_save(s.family_id, s.username, s.token, kind, id, un, new_pass);
  if st not in ('ok', 'created', 'pass') then raise exception '%', st; end if;
  return json_build_object('ok', true, 'user', un);
end $$;

-- old cached apps still call this. It can no longer delete accounts by omission, change a password
-- it does not send, or store anything in plain text. Accounts of deleted children/guardians are removed.
create or replace function public.tk_accounts_set(t uuid, accts jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; a jsonb; st text; skipped jsonb := '[]'; names text[];
begin
  s := public.tk_sess(t);
  if s.role <> 'parent' then raise exception 'parent_only'; end if;
  for a in select * from jsonb_array_elements(case when jsonb_typeof(accts) = 'array' then accts else '[]'::jsonb end) loop
    if coalesce(btrim(a->>'u'), '') = '' or a->>'role' not in ('parent', 'kid', 'guardian') then continue; end if;
    st := public.tk_acct_save(s.family_id, s.username, s.token, a->>'role', a->>'kid', a->>'u', a->>'p');
    if st = 'taken' then skipped := skipped || to_jsonb(lower(btrim(a->>'u'))); end if;
  end loop;
  select array_agg(x.username) into names from public.tk_accounts x
    where x.family_id = s.family_id and x.role in ('kid', 'guardian')
      and not exists (select 1 from public.tk_rows r where r.family_id = s.family_id
                        and r.path = (case when x.role = 'kid' then 'kids/' else 'guardians/' end) || x.kid_id
                        and jsonb_typeof(r.value) = 'object');
  if names is not null then
    delete from public.tk_sessions where username = any(names);
    delete from public.tk_accounts where username = any(names);
  end if;
  return json_build_object('ok', true, 'skipped', skipped);
end $$;

------------------------------------------------------------------------------------------------
-- 6) AI relay counters (service role only): batched increments from the Edge Function
--    u: [{f, k, d, n, tok}]   e: [{d, r, s, n}]
------------------------------------------------------------------------------------------------
create or replace function public.tk_ai_bump(u jsonb, e jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(u, '[]'::jsonb)) loop
    insert into public.tk_ai_usage(family_id, kid_id, day, n, tok) values ((x->>'f')::uuid, coalesce(x->>'k', ''), (x->>'d')::date, coalesce((x->>'n')::int, 0), coalesce((x->>'tok')::bigint, 0))
      on conflict (family_id, kid_id, day) do update set n = public.tk_ai_usage.n + excluded.n, tok = public.tk_ai_usage.tok + excluded.tok;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(e, '[]'::jsonb)) loop
    insert into public.tk_ai_err(day, route, status, n) values ((x->>'d')::date, coalesce(x->>'r', '?'), coalesce((x->>'s')::int, 0), coalesce((x->>'n')::int, 0))
      on conflict (day, route, status) do update set n = public.tk_ai_err.n + excluded.n, last_at = now();
  end loop;
end $$;
revoke all on function public.tk_ai_bump(jsonb, jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.tk_ai_bump(jsonb, jsonb) to service_role; end if;
end $$;

------------------------------------------------------------------------------------------------
revoke all on function public.tk_login(text, text), public.tk_login2(text, text, text), public.tk_accounts_apply(uuid, jsonb),
  public.tk_account_set_pass(uuid, text, text, text), public.tk_accounts_set(uuid, jsonb) from public;
grant execute on function public.tk_login(text, text), public.tk_login2(text, text, text), public.tk_accounts_apply(uuid, jsonb),
  public.tk_account_set_pass(uuid, text, text, text), public.tk_accounts_set(uuid, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';

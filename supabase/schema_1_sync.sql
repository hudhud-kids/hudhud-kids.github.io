create extension if not exists pgcrypto with schema extensions;

create table if not exists public.tk_family (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now());
create table if not exists public.tk_rows (
  family_id uuid not null references public.tk_family(id) on delete cascade,
  path text not null, value jsonb, ver bigint not null default 1,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (family_id, path));
create index if not exists tk_rows_upd on public.tk_rows(family_id, updated_at);
create table if not exists public.tk_accounts (
  username text primary key, pass_hash text not null,
  family_id uuid not null references public.tk_family(id) on delete cascade,
  role text not null, kid_id text);
create table if not exists public.tk_sessions (
  token uuid primary key default gen_random_uuid(), username text not null,
  family_id uuid not null references public.tk_family(id) on delete cascade,
  role text not null, kid_id text, created_at timestamptz not null default now(), seen_at timestamptz not null default now());

alter table public.tk_family enable row level security;
alter table public.tk_rows enable row level security;
alter table public.tk_accounts enable row level security;
alter table public.tk_sessions enable row level security;
revoke all on public.tk_family, public.tk_rows, public.tk_accounts, public.tk_sessions from anon, authenticated;

create or replace function public.tk_sess(t uuid) returns public.tk_sessions
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions;
begin
  select * into s from public.tk_sessions where token = t;
  if s.token is null then raise exception 'bad_session' using errcode = '28000'; end if;
  if s.seen_at < now() - interval '1 hour' then update public.tk_sessions set seen_at = now() where token = t; end if;
  return s;
end $$;
revoke all on function public.tk_sess(uuid) from public, anon, authenticated;

create or replace function public.tk_login(u text, p text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare a public.tk_accounts; t uuid;
begin
  select * into a from public.tk_accounts where username = lower(trim(u));
  if a.username is null or a.pass_hash <> crypt(p, a.pass_hash) then perform pg_sleep(0.6); return null; end if;
  insert into public.tk_sessions(username, family_id, role, kid_id) values (a.username, a.family_id, a.role, a.kid_id) returning token into t;
  return json_build_object('token', t, 'role', a.role, 'kid', a.kid_id, 'family', a.family_id);
end $$;

create or replace function public.tk_register(u text, p text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare a public.tk_accounts; f uuid; t uuid;
begin
  select * into a from public.tk_accounts where username = lower(trim(u));
  if a.username is not null then
    if a.role = 'parent' and a.pass_hash = crypt(p, a.pass_hash) then
      insert into public.tk_sessions(username, family_id, role) values (a.username, a.family_id, 'parent') returning token into t;
      return json_build_object('token', t, 'role', 'parent', 'family', a.family_id, 'created', false);
    end if;
    perform pg_sleep(0.6); raise exception 'username_taken';
  end if;
  insert into public.tk_family default values returning id into f;
  insert into public.tk_accounts(username, pass_hash, family_id, role) values (lower(trim(u)), crypt(p, gen_salt('bf')), f, 'parent');
  insert into public.tk_sessions(username, family_id, role) values (lower(trim(u)), f, 'parent') returning token into t;
  return json_build_object('token', t, 'role', 'parent', 'family', f, 'created', true);
end $$;

create or replace function public.tk_pull(t uuid, since timestamptz) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; r json;
begin
  s := public.tk_sess(t);
  select coalesce(json_agg(json_build_object('path', path, 'value', value, 'ver', ver)), '[]'::json) into r
    from public.tk_rows where family_id = s.family_id and (since is null or updated_at > since - interval '5 seconds');
  return json_build_object('rows', r, 'now', clock_timestamp(), 'role', s.role, 'kid', s.kid_id);
end $$;

create or replace function public.tk_push(t uuid, changes jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; c jsonb; cur public.tk_rows; okl jsonb := '[]'; conf jsonb := '[]'; nv bigint;
begin
  s := public.tk_sess(t);
  for c in select * from jsonb_array_elements(changes) loop
    select * into cur from public.tk_rows where family_id = s.family_id and path = c->>'path' for update;
    if cur.path is not null and (c->'base' is null or jsonb_typeof(c->'base') = 'null' or cur.ver <> (c->>'base')::bigint) then
      conf := conf || jsonb_build_array(jsonb_build_object('path', cur.path, 'value', cur.value, 'ver', cur.ver));
    else
      insert into public.tk_rows(family_id, path, value, ver, updated_at) values (s.family_id, c->>'path', c->'value', 1, clock_timestamp())
        on conflict (family_id, path) do update set value = excluded.value, ver = public.tk_rows.ver + 1, updated_at = clock_timestamp()
        returning ver into nv;
      okl := okl || jsonb_build_array(jsonb_build_object('path', c->>'path', 'ver', nv));
    end if;
  end loop;
  return json_build_object('ok', okl, 'conflicts', conf);
end $$;

create or replace function public.tk_accounts_set(t uuid, accts jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; a jsonb; ex public.tk_accounts; names text[] := '{}'; skipped jsonb := '[]'; un text;
begin
  s := public.tk_sess(t);
  if s.role <> 'parent' then raise exception 'parent_only'; end if;
  for a in select * from jsonb_array_elements(accts) loop
    un := lower(trim(a->>'u'));
    if un is null or un = '' or coalesce(a->>'p','') = '' then continue; end if;
    select * into ex from public.tk_accounts where username = un;
    if ex.username is not null and ex.family_id <> s.family_id then skipped := skipped || to_jsonb(un); continue; end if;
    names := names || un;
    if ex.username is null then
      insert into public.tk_accounts(username, pass_hash, family_id, role, kid_id) values (un, crypt(a->>'p', gen_salt('bf')), s.family_id, a->>'role', a->>'kid');
    else
      update public.tk_accounts set role = a->>'role', kid_id = a->>'kid',
        pass_hash = case when pass_hash = crypt(a->>'p', pass_hash) then pass_hash else crypt(a->>'p', gen_salt('bf')) end
        where username = un;
    end if;
  end loop;
  delete from public.tk_sessions where family_id = s.family_id and username not in (select unnest(names)) and token <> t;
  delete from public.tk_accounts where family_id = s.family_id and username <> all(names) and username <> s.username;
  return json_build_object('ok', true, 'skipped', skipped);
end $$;

create or replace function public.tk_logout(t uuid) returns void
language sql security definer set search_path = public as $$ delete from public.tk_sessions where token = t; $$;

revoke all on function public.tk_login(text,text), public.tk_register(text,text), public.tk_pull(uuid,timestamptz), public.tk_push(uuid,jsonb), public.tk_accounts_set(uuid,jsonb), public.tk_logout(uuid) from public;
grant execute on function public.tk_login(text,text), public.tk_register(text,text), public.tk_pull(uuid,timestamptz), public.tk_push(uuid,jsonb), public.tk_accounts_set(uuid,jsonb), public.tk_logout(uuid) to anon, authenticated;
notify pgrst, 'reload schema';

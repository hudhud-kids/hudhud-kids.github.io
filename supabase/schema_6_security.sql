-- Hardening: kids can only change their own data, kids never receive other people's passwords,
-- login is rate-limited, and public sign-ups must have the right shape.

-- 1) login rate limit (10 wrong passwords per username per 15 minutes)
create table if not exists public.tk_login_fail (username text not null, at timestamptz not null default now());
create index if not exists tk_login_fail_u on public.tk_login_fail (username, at desc);
alter table public.tk_login_fail enable row level security;
revoke all on public.tk_login_fail from anon, authenticated;

create or replace function public.tk_login(u text, p text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare a public.tk_accounts; t uuid; n int; un text := lower(trim(u));
begin
  select count(*) into n from public.tk_login_fail where username = un and at > now() - interval '15 minutes';
  if n >= 10 then perform pg_sleep(1); raise exception 'locked'; end if;
  select * into a from public.tk_accounts where username = un;
  if a.username is null or a.pass_hash <> crypt(p, a.pass_hash) then
    insert into public.tk_login_fail(username) values (un);
    delete from public.tk_login_fail where at < now() - interval '1 day';
    perform pg_sleep(0.8); return null;
  end if;
  delete from public.tk_login_fail where username = un;
  insert into public.tk_sessions(username, family_id, role, kid_id) values (a.username, a.family_id, a.role, a.kid_id) returning token into t;
  return json_build_object('token', t, 'role', a.role, 'kid', a.kid_id, 'family', a.family_id);
end $$;

-- 2) pull: kids get the family data but without anyone else's password
create or replace function public.tk_pull(t uuid, since timestamptz) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; r json; kids text[];
begin
  s := public.tk_sess(t);
  if s.role = 'guardian' then
    kids := public.tk_gkids(s);
    select coalesce(json_agg(json_build_object('path', q.path, 'value', q.v, 'ver', q.ver)), '[]'::json) into r from (
      select path, ver,
        case when path in ('attendance','reports','certs','redeems','topups','reviews') and jsonb_typeof(value) = 'array'
             then coalesce((select jsonb_agg(e) from jsonb_array_elements(value) e where e->>'kid' = any(kids)), '[]'::jsonb)
             when split_part(path,'/',1) = 'kids' and jsonb_typeof(value) = 'object' then value - 'pass'
             else value end as v
      from public.tk_rows
      where family_id = s.family_id and (since is null or updated_at > since - interval '5 seconds') and (
        path in ('perLesson','rewards','migr','v','guardians/','gseen/','attendance','reports','certs','redeems','topups','reviews')
        or path = 'guardians/' || s.kid_id or path = 'gseen/' || s.kid_id
        or (split_part(path,'/',1) = any(array['kids','balance','profiles','progress','live','sched','books','prices','placements','monthly','voices','renewReq','cheers','livefeed'])
            and (split_part(path,'/',2) = '' or split_part(path,'/',2) = any(kids)))
      )) q;
  elsif s.role = 'kid' then
    select coalesce(json_agg(json_build_object('path', q.path, 'value', q.v, 'ver', q.ver)), '[]'::json) into r from (
      select path, ver,
        case when path = 'parent' and jsonb_typeof(value) = 'object' then value - 'pass'
             when split_part(path,'/',1) = 'guardians' and jsonb_typeof(value) = 'object' then value - 'pass'
             when split_part(path,'/',1) = 'kids' and split_part(path,'/',2) <> s.kid_id and jsonb_typeof(value) = 'object' then value - 'pass'
             else value end as v
      from public.tk_rows where family_id = s.family_id and (since is null or updated_at > since - interval '5 seconds')) q;
  else
    select coalesce(json_agg(json_build_object('path', path, 'value', value, 'ver', ver)), '[]'::json) into r
      from public.tk_rows where family_id = s.family_id and (since is null or updated_at > since - interval '5 seconds');
  end if;
  return json_build_object('rows', r, 'now', clock_timestamp(), 'role', s.role, 'kid', s.kid_id);
end $$;

-- 3) push: guardians only cheers/seen; kids only their own per-child rows and shared activity arrays
create or replace function public.tk_push(t uuid, changes jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; c jsonb; cur public.tk_rows; okl jsonb := '[]'; conf jsonb := '[]'; den jsonb := '[]'; nv bigint; kids text[]; p text; top text; sub text; allowed boolean;
begin
  s := public.tk_sess(t);
  if s.role = 'guardian' then kids := public.tk_gkids(s); end if;
  for c in select * from jsonb_array_elements(changes) loop
    p := c->>'path'; top := split_part(p,'/',1); sub := split_part(p,'/',2);
    allowed := true;
    if s.role = 'guardian' then
      allowed := p in ('cheers/','gseen/','gseen/' || s.kid_id) or (top = 'cheers' and sub = any(kids));
    elsif s.role = 'kid' then
      if p in ('parent','apiKey','azure','perLesson','topups','rewards','readVoice','v','migr') or top in ('guardians','balance','prices','gseen','migr','voices') then
        allowed := false;
      elsif top in ('kids','sched','progress','profiles','books','live','livefeed','placements','renewReq','cheers','monthly') and position('/' in p) > 0 then
        allowed := (sub = '' or sub = s.kid_id);
      end if;
    end if;
    if not allowed then den := den || to_jsonb(p); continue; end if;
    select * into cur from public.tk_rows where family_id = s.family_id and path = p for update;
    if cur.path is not null and (c->'base' is null or jsonb_typeof(c->'base') = 'null' or cur.ver <> (c->>'base')::bigint) then
      conf := conf || jsonb_build_array(jsonb_build_object('path', cur.path, 'value', cur.value, 'ver', cur.ver));
    else
      insert into public.tk_rows(family_id, path, value, ver, updated_at) values (s.family_id, p, c->'value', 1, clock_timestamp())
        on conflict (family_id, path) do update set value = excluded.value, ver = public.tk_rows.ver + 1, updated_at = clock_timestamp()
        returning ver into nv;
      okl := okl || jsonb_build_array(jsonb_build_object('path', p, 'ver', nv));
    end if;
  end loop;
  return json_build_object('ok', okl, 'conflicts', conf, 'denied', den);
end $$;

-- 4) sign-ups must have the right shape
create or replace function public.tk_signup_submit(fam uuid, d jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare n int; k jsonb;
begin
  if not exists (select 1 from public.tk_family where id = fam) then raise exception 'bad_family'; end if;
  if jsonb_typeof(d) <> 'object' or length(d::text) > 4000 then raise exception 'bad_data'; end if;
  if coalesce(d->>'hp', '') <> '' then return json_build_object('ok', true); end if;
  if jsonb_typeof(d->'kids') <> 'array' or jsonb_array_length(d->'kids') < 1 or jsonb_array_length(d->'kids') > 6 then raise exception 'bad_data'; end if;
  for k in select * from jsonb_array_elements(d->'kids') loop
    if jsonb_typeof(k) <> 'object' or coalesce(btrim(k->>'ar'), '') = '' then raise exception 'bad_data'; end if;
  end loop;
  if d ? 'days' and jsonb_typeof(d->'days') <> 'array' then raise exception 'bad_data'; end if;
  if coalesce(btrim(d->>'phone'), '') = '' or coalesce(btrim(d->>'g_name'), '') = '' then raise exception 'missing'; end if;
  select count(*) into n from public.tk_signups where family_id = fam and created_at > now() - interval '1 hour';
  if n >= 30 then raise exception 'rate_limited'; end if;
  select count(*) into n from public.tk_signups where family_id = fam and data->>'phone' = d->>'phone' and created_at > now() - interval '10 minutes';
  if n >= 3 then raise exception 'rate_limited'; end if;
  insert into public.tk_signups (family_id, data) values (fam, (d - 'hp') || jsonb_build_object('at', now()));
  return json_build_object('ok', true);
end $$;

grant execute on function public.tk_login(text,text), public.tk_pull(uuid,timestamptz), public.tk_push(uuid,jsonb), public.tk_signup_submit(uuid,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';

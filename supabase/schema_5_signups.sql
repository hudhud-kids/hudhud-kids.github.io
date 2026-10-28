-- Public sign-up requests: anyone with the join link can submit; only the family's parent (admin) can list and decide.
create table if not exists public.tk_signups (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.tk_family(id) on delete cascade,
  data jsonb not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  kid_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tk_signups_fam on public.tk_signups (family_id, created_at desc);
alter table public.tk_signups enable row level security;
revoke all on public.tk_signups from anon, authenticated;
grant select, insert, update on public.tk_signups to service_role;

create or replace function public.tk_signup_submit(fam uuid, d jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from public.tk_family where id = fam) then raise exception 'bad_family'; end if;
  if jsonb_typeof(d) <> 'object' or length(d::text) > 4000 then raise exception 'bad_data'; end if;
  if coalesce(d->>'hp', '') <> '' then return json_build_object('ok', true); end if; -- bots fill the hidden field
  if coalesce(btrim(d->>'kid_ar'), '') = '' or coalesce(btrim(d->>'phone'), '') = '' or coalesce(btrim(d->>'g_name'), '') = '' then raise exception 'missing'; end if;
  select count(*) into n from public.tk_signups where family_id = fam and created_at > now() - interval '1 hour';
  if n >= 30 then raise exception 'rate_limited'; end if;
  select count(*) into n from public.tk_signups where family_id = fam and data->>'phone' = d->>'phone' and created_at > now() - interval '10 minutes';
  if n >= 3 then raise exception 'rate_limited'; end if;
  insert into public.tk_signups (family_id, data) values (fam, (d - 'hp') || jsonb_build_object('at', now()));
  return json_build_object('ok', true);
end $$;

create or replace function public.tk_signups_list(t uuid) returns json
language plpgsql security definer set search_path = public as $$
declare s public.tk_sessions; r json;
begin
  s := public.tk_sess(t);
  if s.role <> 'parent' then raise exception 'not_allowed'; end if;
  select coalesce(json_agg(json_build_object('id', id, 'data', data, 'status', status, 'kid', kid_id, 'at', created_at) order by created_at desc), '[]'::json) into r
    from (select * from public.tk_signups where family_id = s.family_id order by created_at desc limit 300) q;
  return r;
end $$;

create or replace function public.tk_signup_set(t uuid, sid uuid, st text, kid text) returns json
language plpgsql security definer set search_path = public as $$
declare s public.tk_sessions;
begin
  s := public.tk_sess(t);
  if s.role <> 'parent' then raise exception 'not_allowed'; end if;
  if st not in ('pending','accepted','rejected') then raise exception 'bad_status'; end if;
  update public.tk_signups set status = st, kid_id = kid, updated_at = now() where id = sid and family_id = s.family_id;
  return json_build_object('ok', found);
end $$;

revoke all on function public.tk_signup_submit(uuid, jsonb), public.tk_signups_list(uuid), public.tk_signup_set(uuid, uuid, text, text) from public;
grant execute on function public.tk_signup_submit(uuid, jsonb), public.tk_signups_list(uuid), public.tk_signup_set(uuid, uuid, text, text) to anon, authenticated;

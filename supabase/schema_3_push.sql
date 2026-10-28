create table if not exists public.tk_push_subs (endpoint text primary key, family_id uuid not null references public.tk_family(id) on delete cascade, username text, role text, kid_id text, sub jsonb not null, created_at timestamptz not null default now());
create table if not exists public.tk_push_log (key text primary key, created_at timestamptz not null default now());
alter table public.tk_push_subs enable row level security;
alter table public.tk_push_log enable row level security;
revoke all on public.tk_push_subs, public.tk_push_log from anon, authenticated;

create or replace function public.tk_push_sub(t uuid, sub jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare s public.tk_sessions;
begin
  s := public.tk_sess(t);
  if coalesce(sub->>'endpoint','') = '' then raise exception 'bad_sub'; end if;
  insert into public.tk_push_subs(endpoint, family_id, username, role, kid_id, sub) values (sub->>'endpoint', s.family_id, s.username, s.role, s.kid_id, sub)
    on conflict (endpoint) do update set family_id = excluded.family_id, username = excluded.username, role = excluded.role, kid_id = excluded.kid_id, sub = excluded.sub, created_at = now();
  return json_build_object('ok', true);
end $$;
create or replace function public.tk_push_unsub(t uuid, endpoint text) returns json
language plpgsql security definer set search_path = public as $$
declare s public.tk_sessions;
begin s := public.tk_sess(t); delete from public.tk_push_subs where tk_push_subs.endpoint = tk_push_unsub.endpoint and family_id = s.family_id; return json_build_object('ok', true); end $$;
revoke all on function public.tk_push_sub(uuid,jsonb), public.tk_push_unsub(uuid,text) from public;
grant execute on function public.tk_push_sub(uuid,jsonb), public.tk_push_unsub(uuid,text) to anon, authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('hudhud-notify') where exists (select 1 from cron.job where jobname = 'hudhud-notify');
select cron.schedule('hudhud-notify', '* * * * *', $cron$ select net.http_post(url := 'https://muhfgviqdjysjzkbwlph.supabase.co/functions/v1/notify', headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 20000); $cron$);
notify pgrst, 'reload schema';

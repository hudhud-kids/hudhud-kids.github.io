-- Hudhud schema 8: state for the AI relay watchdog (supabase/functions/notify checks the "ai" function every minute).
-- One row per watched service (id = 'ai'). Only the service role (the notify function) reads or writes it.
-- Apply once in the SQL editor, then redeploy the notify function.
create table if not exists public.tk_health (
  id text primary key,
  fails int not null default 0,          -- failed checks in a row (0 = healthy)
  last_ok timestamptz,
  last_fail timestamptz,
  last_alert timestamptz,                -- last «⚠️ خدمة المعلمة متوقفة» push (at most one per hour)
  detail text not null default ''        -- what the last failed check returned
);
alter table public.tk_health enable row level security;
revoke all on public.tk_health from anon, authenticated;
grant select, insert, update on public.tk_health to service_role;
insert into public.tk_health(id) values ('ai') on conflict (id) do nothing;
notify pgrst, 'reload schema';

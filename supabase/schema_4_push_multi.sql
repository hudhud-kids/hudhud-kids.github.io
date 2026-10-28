alter table public.tk_push_subs drop constraint if exists tk_push_subs_pkey;
alter table public.tk_push_subs add primary key (endpoint, username);
create or replace function public.tk_push_sub(t uuid, sub jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare s public.tk_sessions;
begin
  s := public.tk_sess(t);
  if coalesce(sub->>'endpoint','') = '' then raise exception 'bad_sub'; end if;
  insert into public.tk_push_subs(endpoint, family_id, username, role, kid_id, sub) values (sub->>'endpoint', s.family_id, s.username, s.role, s.kid_id, sub)
    on conflict (endpoint, username) do update set family_id = excluded.family_id, role = excluded.role, kid_id = excluded.kid_id, sub = excluded.sub, created_at = now();
  return json_build_object('ok', true);
end $$;

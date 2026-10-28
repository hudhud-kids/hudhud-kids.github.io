-- guardian role: sees only their linked children, can write only cheers / read-marks / push subscription
create or replace function public.tk_gkids(s public.tk_sessions) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select array(select jsonb_array_elements_text(value->'kids')) from public.tk_rows where family_id = s.family_id and path = 'guardians/' || s.kid_id), '{}'::text[]);
$$;
revoke all on function public.tk_gkids(public.tk_sessions) from public, anon, authenticated;

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
             else value end as v
      from public.tk_rows
      where family_id = s.family_id and (since is null or updated_at > since - interval '5 seconds') and (
        path in ('perLesson','rewards','migr','v','guardians/','gseen/','attendance','reports','certs','redeems','topups','reviews')
        or path = 'guardians/' || s.kid_id or path = 'gseen/' || s.kid_id
        or (split_part(path,'/',1) = any(array['kids','balance','profiles','progress','live','sched','books','prices','placements','monthly','voices','renewReq','cheers','livefeed'])
            and (split_part(path,'/',2) = '' or split_part(path,'/',2) = any(kids)))
      )) q;
  else
    select coalesce(json_agg(json_build_object('path', path, 'value', value, 'ver', ver)), '[]'::json) into r
      from public.tk_rows where family_id = s.family_id and (since is null or updated_at > since - interval '5 seconds');
  end if;
  return json_build_object('rows', r, 'now', clock_timestamp(), 'role', s.role, 'kid', s.kid_id);
end $$;

create or replace function public.tk_push(t uuid, changes jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; c jsonb; cur public.tk_rows; okl jsonb := '[]'; conf jsonb := '[]'; den jsonb := '[]'; nv bigint; kids text[]; p text;
begin
  s := public.tk_sess(t);
  if s.role = 'guardian' then kids := public.tk_gkids(s); end if;
  for c in select * from jsonb_array_elements(changes) loop
    p := c->>'path';
    if s.role = 'guardian' and not (
         p in ('cheers/','gseen/','gseen/' || s.kid_id)
         or (split_part(p,'/',1) = 'cheers' and split_part(p,'/',2) = any(kids))) then
      den := den || to_jsonb(p); continue;
    end if;
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
grant execute on function public.tk_pull(uuid,timestamptz), public.tk_push(uuid,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';

-- Privacy: a child's device receives ONLY that child's data and never the Claude/Azure keys.
-- The keys stay in tk_rows (written by the parent) and are used server-side by the "ai" Edge Function.
-- Shared report arrays are filtered per child on pull and merged per child on push.

create or replace function public.tk_kid_row(s public.tk_sessions, p text, v jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare top text := split_part(p,'/',1); sub text := split_part(p,'/',2);
begin
  if p in ('apiKey','azure','topups') then return null; end if;                       -- never sent to a child
  if p = 'parent' then return case when jsonb_typeof(v) = 'object' then jsonb_build_object('name', v->'name') else null end; end if;
  if p in ('attendance','reports','certs','redeems','reviews') then
    return case when jsonb_typeof(v) = 'array'
      then coalesce((select jsonb_agg(e) from jsonb_array_elements(v) e where e->>'kid' = s.kid_id), '[]'::jsonb) else v end; end if;
  if position('/' in p) > 0 then
    if top in ('family','curr') then return v; end if;                                 -- keyed by week / level, not by child
    if sub = '' then return v; end if;                                                 -- the folder marker row
    if sub <> s.kid_id then return null; end if;
    return v;                                                                          -- the child's own rows (own password kept for offline login)
  end if;
  return v;
end $$;
revoke all on function public.tk_kid_row(public.tk_sessions, text, jsonb) from public, anon, authenticated;

create or replace function public.tk_pull(t uuid, since timestamptz) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; r json; kids text[]; cfg json;
begin
  s := public.tk_sess(t);
  select json_build_object(
    'ai', exists(select 1 from public.tk_rows where family_id = s.family_id and path = 'apiKey' and coalesce(value #>> '{}', '') <> ''),
    'az', exists(select 1 from public.tk_rows where family_id = s.family_id and path = 'azure' and jsonb_typeof(value) = 'object' and coalesce(value->>'key','') <> '')) into cfg;
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
      select path, ver, public.tk_kid_row(s, path, value) as v
      from public.tk_rows where family_id = s.family_id and (since is null or updated_at > since - interval '5 seconds')) q
      where q.v is not null;
  else
    select coalesce(json_agg(json_build_object('path', path, 'value', value, 'ver', ver)), '[]'::json) into r
      from public.tk_rows where family_id = s.family_id and (since is null or updated_at > since - interval '5 seconds');
  end if;
  return json_build_object('rows', r, 'now', clock_timestamp(), 'role', s.role, 'kid', s.kid_id, 'cfg', cfg, 'pv', 2);
end $$;

-- push: kids only their own rows; their own entries of the shared arrays are merged into the full array on the server
create or replace function public.tk_push(t uuid, changes jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare s public.tk_sessions; c jsonb; cur public.tk_rows; okl jsonb := '[]'; conf jsonb := '[]'; den jsonb := '[]'; nv bigint; kids text[]; p text; top text; sub text; allowed boolean; merged jsonb;
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
      elsif p in ('attendance','reports','certs','redeems','reviews') then
        -- merge: everyone else's entries from the server + this child's entries from the device
        if jsonb_typeof(c->'value') <> 'array' then den := den || to_jsonb(p); continue; end if;
        select * into cur from public.tk_rows where family_id = s.family_id and path = p for update;
        merged := coalesce((select jsonb_agg(e) from jsonb_array_elements(case when jsonb_typeof(cur.value) = 'array' then cur.value else '[]'::jsonb end) e where coalesce(e->>'kid','') <> s.kid_id), '[]'::jsonb)
               || coalesce((select jsonb_agg(e) from jsonb_array_elements(c->'value') e where e->>'kid' = s.kid_id), '[]'::jsonb);
        insert into public.tk_rows(family_id, path, value, ver, updated_at) values (s.family_id, p, merged, 1, clock_timestamp())
          on conflict (family_id, path) do update set value = excluded.value, ver = public.tk_rows.ver + 1, updated_at = clock_timestamp()
          returning ver into nv;
        okl := okl || jsonb_build_array(jsonb_build_object('path', p, 'ver', nv));
        continue;
      elsif top in ('kids','sched','progress','profiles','books','live','livefeed','placements','renewReq','cheers','monthly') and position('/' in p) > 0 then
        allowed := (sub = '' or sub = s.kid_id);
      elsif position('/' in p) > 0 and top not in ('family','curr') then
        allowed := (sub = '' or sub = s.kid_id);
      end if;
    end if;
    if not allowed then den := den || to_jsonb(p); continue; end if;
    select * into cur from public.tk_rows where family_id = s.family_id and path = p for update;
    if cur.path is not null and (c->'base' is null or jsonb_typeof(c->'base') = 'null' or cur.ver <> (c->>'base')::bigint) then
      conf := conf || jsonb_build_array(jsonb_build_object('path', cur.path, 'value', case when s.role = 'kid' then public.tk_kid_row(s, cur.path, cur.value) else cur.value end, 'ver', cur.ver));
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

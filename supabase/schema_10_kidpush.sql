-- schema 10: kid sessions may no longer write whole top-level rows (only their own '<top>/<kid id>' rows, the merged arrays and 'health')
-- apply once in the Supabase SQL editor; safe to re-run

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
      elsif position('/' in p) = 0 and p <> 'health' then
        allowed := false; -- a whole top-level row (e.g. 'kids' or 'sched') would replace every child's data
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

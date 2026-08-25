-- DB-managed, immutable makeup recipe catalog. Client roles receive no table or RPC access.
create table public.makeup_recipe_catalog_cycles (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  status text not null default 'draft' check (status in ('draft','validated','active','retired')),
  schema_version text not null default 'makeup-recipe-catalog-cycle-v1' check (schema_version = 'makeup-recipe-catalog-cycle-v1'),
  fingerprint text,
  validation jsonb not null default '{"valid":false,"errors":["NOT_VALIDATED"],"entryCount":0}'::jsonb,
  created_by text,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fingerprint is null or fingerprint ~ '^[a-f0-9]{64}$')
);

create table public.makeup_recipe_catalog_entries (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.makeup_recipe_catalog_cycles(id) on delete restrict,
  recipe_key text not null,
  presentation_family text not null check (presentation_family in ('masculine','feminine','neutral')),
  makeup_mode text not null check (makeup_mode in ('transparent_correction','daily_natural','soft_blend','full_definition','glam_event','fashion_editorial')),
  module_policies jsonb not null check (jsonb_typeof(module_policies) = 'array'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (cycle_id, recipe_key),
  unique (cycle_id, presentation_family, makeup_mode)
);

create table public.makeup_recipe_catalog_active_cycle (
  singleton boolean primary key default true check (singleton),
  active_cycle_id uuid not null references public.makeup_recipe_catalog_cycles(id) on delete restrict,
  previous_cycle_id uuid references public.makeup_recipe_catalog_cycles(id) on delete restrict,
  activated_by text,
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_makeup_recipe_entries_cycle on public.makeup_recipe_catalog_entries(cycle_id, presentation_family, makeup_mode);

alter table public.makeup_direction_snapshots
  add column if not exists recipe_catalog_cycle_id uuid references public.makeup_recipe_catalog_cycles(id) on delete restrict,
  add column if not exists recipe_id uuid references public.makeup_recipe_catalog_entries(id) on delete restrict,
  add column if not exists recipe_fingerprint text,
  add column if not exists presentation_family text;
alter table public.makeup_direction_snapshots
  add constraint makeup_direction_recipe_fingerprint_check check (recipe_fingerprint is null or recipe_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint makeup_direction_presentation_family_check check (presentation_family is null or presentation_family in ('masculine','feminine','neutral'));

create or replace function public.protect_makeup_recipe_catalog_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'MAKEUP_RECIPE_CATALOG_IMMUTABLE';
  end if;
  if new.id <> old.id or new.version <> old.version or new.schema_version <> old.schema_version
    or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'MAKEUP_RECIPE_CATALOG_IDENTITY_IMMUTABLE';
  end if;
  if old.status <> 'draft' and (new.fingerprint is distinct from old.fingerprint or new.validation is distinct from old.validation) then
    raise exception 'MAKEUP_RECIPE_CATALOG_IMMUTABLE';
  end if;
  if old.status <> new.status and not (
    (old.status = 'draft' and new.status = 'validated' and coalesce((new.validation->>'valid')::boolean,false))
    or (old.status in ('validated','retired') and new.status = 'active' and coalesce((old.validation->>'valid')::boolean,false))
    or (old.status = 'active' and new.status = 'retired')
  ) then raise exception 'MAKEUP_RECIPE_CATALOG_STATUS_INVALID'; end if;
  return new;
end;
$$;

create trigger protect_makeup_recipe_catalog_cycle
before update or delete on public.makeup_recipe_catalog_cycles
for each row execute function public.protect_makeup_recipe_catalog_snapshot();

create or replace function public.protect_makeup_recipe_entry_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_status text;
begin
  select status into v_status from public.makeup_recipe_catalog_cycles where id = case when tg_op = 'DELETE' then old.cycle_id else new.cycle_id end;
  if v_status is distinct from 'draft' then raise exception 'MAKEUP_RECIPE_CATALOG_IMMUTABLE'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger protect_makeup_recipe_entry
before insert or update or delete on public.makeup_recipe_catalog_entries
for each row execute function public.protect_makeup_recipe_entry_snapshot();

create or replace function public.validate_makeup_recipe_catalog_cycle_v1(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_count integer;
  v_bad integer;
  v_errors jsonb := '[]'::jsonb;
  v_fingerprint text;
begin
  select status into v_status from public.makeup_recipe_catalog_cycles where id = p_cycle_id for update;
  if not found then raise exception 'MAKEUP_RECIPE_CATALOG_NOT_FOUND'; end if;
  if v_status <> 'draft' then raise exception 'MAKEUP_RECIPE_CATALOG_NOT_DRAFT'; end if;

  select count(*) into v_count from public.makeup_recipe_catalog_entries where cycle_id = p_cycle_id;
  if v_count <> 18 then v_errors := v_errors || jsonb_build_array('ENTRY_COUNT_INVALID'); end if;

  select count(*) into v_bad
  from (values ('masculine'),('feminine'),('neutral')) f(name)
  cross join (values ('transparent_correction'),('daily_natural'),('soft_blend'),('full_definition'),('glam_event'),('fashion_editorial')) m(name)
  left join public.makeup_recipe_catalog_entries e
    on e.cycle_id = p_cycle_id and e.presentation_family = f.name and e.makeup_mode = m.name
  where e.id is null;
  if v_bad > 0 then v_errors := v_errors || jsonb_build_array('COMBINATION_MISSING'); end if;

  select count(*) into v_bad
  from public.makeup_recipe_catalog_entries e
  where e.cycle_id = p_cycle_id and (
    jsonb_typeof(e.module_policies) <> 'array'
    or jsonb_array_length(e.module_policies) <> 7
    or (select count(distinct p->>'module') from jsonb_array_elements(e.module_policies) p) <> 7
    or exists (
      select 1 from jsonb_array_elements(e.module_policies) p
      where p->>'module' not in ('base','brow','eyeshadow','eyeliner','blush','lip','lashes')
        or jsonb_typeof(p->'defaultEnabled') <> 'boolean'
        or case when jsonb_typeof(p->'intensityMultiplier') = 'number'
             then (p->>'intensityMultiplier')::numeric < 0 or (p->>'intensityMultiplier')::numeric > 1.25
             else true end
        or p->>'paletteRole' not in ('skin_base','brow_neutral','eye_harmony','eye_definition','cheek_accent','lip_accent','lash_neutral')
        or p->>'finishPolicy' not in ('customer','natural','satin','soft_matte','defined')
        or case when jsonb_typeof(p->'techniqueTokens') = 'array' then exists (
             select 1 from jsonb_array_elements_text(p->'techniqueTokens') token
             where token not in ('straight_grain_brow','close_lash_shadow','diffused_lip','soft_arch_brow','cheek_gradient','source_structure_brow','structural_eye_wash','clean_lash_separation','skin_texture_preservation','lash_gap_definition','natural_contour_lip','balanced_complexion')
           ) else true end
    )
  );
  if v_bad > 0 then v_errors := v_errors || jsonb_build_array('MODULE_POLICY_INVALID'); end if;

  if jsonb_array_length(v_errors) > 0 then
    update public.makeup_recipe_catalog_cycles
      set validation = jsonb_build_object('valid',false,'errors',v_errors,'entryCount',v_count), updated_at = now()
      where id = p_cycle_id;
    return jsonb_build_object('valid',false,'errors',v_errors,'entryCount',v_count);
  end if;

  select encode(extensions.digest(string_agg(e.fingerprint, '' order by e.presentation_family, e.makeup_mode), 'sha256'), 'hex')
    into v_fingerprint from public.makeup_recipe_catalog_entries e where e.cycle_id = p_cycle_id;
  update public.makeup_recipe_catalog_cycles
    set status = 'validated', fingerprint = v_fingerprint,
        validation = jsonb_build_object('valid',true,'errors','[]'::jsonb,'entryCount',v_count), updated_at = now()
    where id = p_cycle_id;
  return jsonb_build_object('valid',true,'errors','[]'::jsonb,'entryCount',v_count,'fingerprint',v_fingerprint);
end;
$$;

create or replace function public.create_makeup_recipe_catalog_cycle_v1(p_version integer, p_actor text, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cycle_id uuid := gen_random_uuid(); v_entry jsonb; v_modules jsonb; v_family text; v_mode text; v_fingerprint text;
begin
  if p_version < 1 or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) <> 18 then
    raise exception 'MAKEUP_RECIPE_CATALOG_INPUT_INVALID';
  end if;
  insert into public.makeup_recipe_catalog_cycles(id,version,status,created_by) values(v_cycle_id,p_version,'draft',p_actor);
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_family := v_entry->>'presentationFamily'; v_mode := v_entry->>'mode'; v_modules := v_entry->'modules';
    v_fingerprint := encode(extensions.digest(jsonb_build_object('family',v_family,'mode',v_mode,'modules',v_modules)::text,'sha256'),'hex');
    insert into public.makeup_recipe_catalog_entries(cycle_id,recipe_key,presentation_family,makeup_mode,module_policies,fingerprint)
    values(v_cycle_id,v_family||':'||v_mode,v_family,v_mode,v_modules,v_fingerprint);
  end loop;
  return jsonb_build_object('cycleId',v_cycle_id,'version',p_version,'entryCount',18);
end;
$$;

create or replace function public.activate_makeup_recipe_catalog_cycle_v1(p_cycle_id uuid, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_target public.makeup_recipe_catalog_cycles%rowtype; v_previous uuid;
begin
  perform pg_advisory_xact_lock(hashtext('makeup_recipe_catalog_active_cycle_v1'));
  select * into v_target from public.makeup_recipe_catalog_cycles where id = p_cycle_id for update;
  if not found or v_target.status not in ('validated','retired','active') or coalesce((v_target.validation->>'valid')::boolean,false) is not true then
    raise exception 'MAKEUP_RECIPE_CATALOG_NOT_VALIDATED';
  end if;
  select active_cycle_id into v_previous from public.makeup_recipe_catalog_active_cycle where singleton = true for update;
  if v_previous = p_cycle_id then return jsonb_build_object('activeCycleId',p_cycle_id,'previousCycleId',v_previous,'idempotentReplay',true); end if;
  if v_previous is not null then update public.makeup_recipe_catalog_cycles set status='retired', updated_at=now() where id=v_previous; end if;
  update public.makeup_recipe_catalog_cycles set status='active', activated_at=coalesce(activated_at,now()), updated_at=now() where id=p_cycle_id;
  insert into public.makeup_recipe_catalog_active_cycle(singleton,active_cycle_id,previous_cycle_id,activated_by,activated_at,updated_at)
  values(true,p_cycle_id,v_previous,p_actor,now(),now())
  on conflict(singleton) do update set active_cycle_id=excluded.active_cycle_id,previous_cycle_id=excluded.previous_cycle_id,activated_by=excluded.activated_by,activated_at=excluded.activated_at,updated_at=excluded.updated_at;
  return jsonb_build_object('activeCycleId',p_cycle_id,'previousCycleId',v_previous,'idempotentReplay',false);
end;
$$;

alter table public.makeup_recipe_catalog_cycles enable row level security;
alter table public.makeup_recipe_catalog_cycles force row level security;
alter table public.makeup_recipe_catalog_entries enable row level security;
alter table public.makeup_recipe_catalog_entries force row level security;
alter table public.makeup_recipe_catalog_active_cycle enable row level security;
alter table public.makeup_recipe_catalog_active_cycle force row level security;

revoke all on table public.makeup_recipe_catalog_cycles, public.makeup_recipe_catalog_entries, public.makeup_recipe_catalog_active_cycle from public, anon, authenticated;
grant select, insert, update on table public.makeup_recipe_catalog_cycles, public.makeup_recipe_catalog_entries, public.makeup_recipe_catalog_active_cycle to service_role;
revoke all on function public.validate_makeup_recipe_catalog_cycle_v1(uuid) from public, anon, authenticated;
revoke all on function public.create_makeup_recipe_catalog_cycle_v1(integer,text,jsonb) from public, anon, authenticated;
revoke all on function public.activate_makeup_recipe_catalog_cycle_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.validate_makeup_recipe_catalog_cycle_v1(uuid) to service_role;
grant execute on function public.create_makeup_recipe_catalog_cycle_v1(integer,text,jsonb) to service_role;
grant execute on function public.activate_makeup_recipe_catalog_cycle_v1(uuid,text) to service_role;

do $$
declare
  v_cycle uuid := gen_random_uuid();
  v_family text;
  v_mode text;
  v_module text;
  v_enabled text[];
  v_multiplier numeric;
  v_policies jsonb;
  v_family_modules jsonb;
  v_recipe_fingerprint text;
begin
  insert into public.makeup_recipe_catalog_cycles(id,version,status,created_by) values(v_cycle,1,'draft','migration:20260824120000');
  foreach v_family in array array['masculine','feminine','neutral'] loop
    foreach v_mode in array array['transparent_correction','daily_natural','soft_blend','full_definition','glam_event','fashion_editorial'] loop
      if v_mode in ('soft_blend','full_definition','glam_event','fashion_editorial') then v_enabled := array['base','brow','eyeshadow','eyeliner','blush','lip','lashes'];
      elsif v_mode = 'daily_natural' and v_family = 'masculine' then v_enabled := array['base','brow','eyeshadow','blush','lip'];
      elsif v_mode = 'daily_natural' and v_family = 'feminine' then v_enabled := array['base','brow','eyeshadow','eyeliner','blush','lip','lashes'];
      elsif v_mode = 'daily_natural' then v_enabled := array['base','brow','eyeshadow','eyeliner','blush','lip'];
      elsif v_family = 'feminine' then v_enabled := array['base','brow','blush','lip'];
      else v_enabled := array['base','brow','lip']; end if;
      v_policies := '[]'::jsonb;
      foreach v_module in array array['base','brow','eyeshadow','eyeliner','blush','lip','lashes'] loop
        v_multiplier := case
          when v_family='feminine' then 1
          when v_family='masculine' and v_module='base' then 1 when v_family='masculine' and v_module='brow' then 1.05
          when v_family='masculine' and v_module='eyeshadow' then .55 when v_family='masculine' and v_module='eyeliner' then .65
          when v_family='masculine' and v_module='blush' then .55 when v_family='masculine' and v_module='lip' then .65 when v_family='masculine' then .55
          when v_module in ('base','brow') then 1 when v_module in ('eyeshadow','blush','lashes') then .75 else .8 end;
        if v_mode in ('soft_blend','full_definition','glam_event','fashion_editorial') then v_multiplier := greatest(.9,v_multiplier); end if;
        v_family_modules := jsonb_build_object(
          'module',v_module,'defaultEnabled',v_module=any(v_enabled),'intensityMultiplier',v_multiplier,
          'paletteRole',case v_module when 'base' then 'skin_base' when 'brow' then 'brow_neutral' when 'eyeshadow' then 'eye_harmony' when 'eyeliner' then 'eye_definition' when 'blush' then 'cheek_accent' when 'lip' then 'lip_accent' else 'lash_neutral' end,
          'finishPolicy','customer',
          'techniqueTokens',case v_module when 'base' then '["skin_texture_preservation","balanced_complexion"]'::jsonb when 'brow' then (case when v_family='masculine' then '["straight_grain_brow","source_structure_brow"]'::jsonb when v_family='feminine' then '["soft_arch_brow","source_structure_brow"]'::jsonb else '["source_structure_brow"]'::jsonb end) when 'eyeshadow' then (case when v_family='masculine' then '["close_lash_shadow"]'::jsonb else '["structural_eye_wash"]'::jsonb end) when 'eyeliner' then '["lash_gap_definition"]'::jsonb when 'blush' then '["cheek_gradient"]'::jsonb when 'lip' then '["diffused_lip","natural_contour_lip"]'::jsonb else '["clean_lash_separation"]'::jsonb end
        );
        v_policies := v_policies || jsonb_build_array(v_family_modules);
      end loop;
      v_recipe_fingerprint := encode(extensions.digest(jsonb_build_object('family',v_family,'mode',v_mode,'modules',v_policies)::text,'sha256'),'hex');
      insert into public.makeup_recipe_catalog_entries(cycle_id,recipe_key,presentation_family,makeup_mode,module_policies,fingerprint)
      values(v_cycle,v_family||':'||v_mode,v_family,v_mode,v_policies,v_recipe_fingerprint);
    end loop;
  end loop;
  perform public.validate_makeup_recipe_catalog_cycle_v1(v_cycle);
  perform public.activate_makeup_recipe_catalog_cycle_v1(v_cycle,'migration:20260824120000');
end;
$$;

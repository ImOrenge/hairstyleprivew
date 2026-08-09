-- Preserve model geometry while recording user-adjusted evidence coordinates as an audit trail.

alter table if exists public.analysis_evidence_v2
  add column if not exists correction_revision integer not null default 0,
  add column if not exists manual_corrections jsonb not null default '[]'::jsonb;

do $$
begin
  alter table public.analysis_evidence_v2
    add constraint analysis_evidence_v2_correction_revision_check
    check (correction_revision >= 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.analysis_evidence_v2
    add constraint analysis_evidence_v2_manual_corrections_array_check
    check (jsonb_typeof(manual_corrections) = 'array');
exception when duplicate_object then null;
end $$;

comment on column public.analysis_evidence_v2.manual_corrections is
  'Append-only user coordinate adjustments. Model landmarks, contours, and measurements remain unchanged.';

create or replace function public.apply_analysis_evidence_correction_v2(
  p_user_id text,
  p_consultation_id uuid,
  p_expected_revision integer,
  p_target_type text,
  p_target_id text,
  p_point_index integer,
  p_adjusted_point jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_evidence public.analysis_evidence_v2%rowtype;
  v_collection jsonb;
  v_target jsonb;
  v_original jsonb;
  v_correction jsonb;
  v_now timestamptz := timezone('utc', now());
begin
  if p_expected_revision is null
     or p_expected_revision < 0
     or p_target_type is null
     or p_target_type not in ('landmark', 'contour', 'hairline', 'measurement', 'skin', 'excluded')
     or btrim(coalesce(p_target_id, '')) = ''
     or length(p_target_id) > 128
     or p_point_index is null
     or p_point_index < 0
     or p_adjusted_point is null
     or coalesce(jsonb_typeof(p_adjusted_point), 'null') <> 'object'
     or coalesce(jsonb_typeof(p_adjusted_point -> 'x'), 'null') <> 'number'
     or coalesce(jsonb_typeof(p_adjusted_point -> 'y'), 'null') <> 'number'
     or (p_adjusted_point ->> 'x')::numeric not between 0 and 1
     or (p_adjusted_point ->> 'y')::numeric not between 0 and 1 then
    raise exception 'ANALYSIS_CORRECTION_INVALID' using errcode = '22023';
  end if;

  select * into v_evidence
    from public.analysis_evidence_v2
   where consultation_id = p_consultation_id
     and user_id = p_user_id
   for update;
  if not found then
    raise exception 'ANALYSIS_EVIDENCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_evidence.correction_revision <> p_expected_revision then
    return jsonb_build_object('state', 'conflict', 'revision', v_evidence.correction_revision);
  end if;
  if jsonb_array_length(v_evidence.manual_corrections) >= 1000 then
    raise exception 'ANALYSIS_CORRECTION_LIMIT_REACHED' using errcode = '54000';
  end if;

  if p_target_type = 'landmark' then
    if p_point_index <> 0 then
      raise exception 'ANALYSIS_CORRECTION_TARGET_INVALID' using errcode = '22023';
    end if;
    select item.value -> 'point' into v_original
      from jsonb_array_elements(v_evidence.landmarks) as item(value)
     where item.value ->> 'id' = p_target_id
     limit 1;
  else
    v_collection := case p_target_type
      when 'contour' then v_evidence.contours
      when 'hairline' then coalesce(v_evidence.hairline -> 'lines', '[]'::jsonb)
      when 'measurement' then v_evidence.measurements
      when 'skin' then v_evidence.skin_sample_regions
      when 'excluded' then v_evidence.excluded_regions
      else '[]'::jsonb
    end;
    select item.value into v_target
      from jsonb_array_elements(v_collection) as item(value)
     where item.value ->> 'id' = p_target_id
     limit 1;
    v_original := case when p_target_type = 'measurement'
      then v_target -> 'geometry' -> p_point_index
      else v_target -> 'points' -> p_point_index
    end;
  end if;
  if v_original is null or jsonb_typeof(v_original) <> 'object' then
    raise exception 'ANALYSIS_CORRECTION_TARGET_INVALID' using errcode = '22023';
  end if;

  v_correction := jsonb_build_object(
    'id', gen_random_uuid(),
    'targetType', p_target_type,
    'targetId', p_target_id,
    'pointIndex', p_point_index,
    'originalPoint', v_original,
    'adjustedPoint', p_adjusted_point,
    'correctedAt', v_now
  );
  update public.analysis_evidence_v2
     set manual_corrections = manual_corrections || jsonb_build_array(v_correction),
         correction_revision = correction_revision + 1,
         corrected_at = v_now,
         updated_at = v_now
   where id = v_evidence.id;

  return jsonb_build_object(
    'state', 'applied',
    'revision', v_evidence.correction_revision + 1,
    'correction', v_correction
  );
end;
$$;

revoke all on function public.apply_analysis_evidence_correction_v2(text, uuid, integer, text, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_analysis_evidence_correction_v2(text, uuid, integer, text, text, integer, jsonb)
  to service_role;

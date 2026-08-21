begin;
set transaction read only;

do $$
declare
  table_name text;
  function_signature text;
  index_name text;
  expected_versions constant text[] := array['20260809111554','20260811052530','20260811154500','20260814125326','20260815021548','20260815023212','20260815024219','20260815031542','20260815040117','20260815044500'];
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 95 then
    raise exception 'unexpected remote migration count';
  end if;
  if exists (
    select 1 from unnest(expected_versions) expected(version)
     where not exists (
       select 1 from supabase_migrations.schema_migrations applied
        where applied.version = expected.version
     )
  ) then
    raise exception 'approved HairFit V2 migration history is incomplete';
  end if;

  foreach table_name in array array[
    'consultation_analysis_runs_v2',
    'fashion_preview_batches_v2',
    'hairfit_v2_engine_source_manifests',
    'consultation_capability_tasks_v2',
    'consultation_capability_attempts_v2',
    'consultation_capability_results_v2',
    'consultation_interview_drafts_v2',
    'personal_color_capture_assets',
    'personal_color_capture_cleanup_outbox',
    'personal_color_capture_deletion_receipts',
    'face_observation_bundles',
    'face_observation_region_samples',
    'face_observation_jobs',
    'face_observation_outbox',
    'face_observation_corrections',
    'personal_color_profiles_v2',
    'personal_color_projection_reconciliations',
    'personal_color_drape_sessions',
    'personal_color_drape_responses',
    'makeup_direction_snapshots',
    'makeup_direction_patches',
    'makeup_routines',
    'makeup_artist_briefs',
    'makeup_brief_shares',
    'personal_color_training_consent_events'
  ] loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'required table is missing: %', table_name;
    end if;
    if not coalesce((
      select relation.relrowsecurity and relation.relforcerowsecurity
        from pg_class relation
       where relation.oid = to_regclass(format('public.%I', table_name))
    ), false) then
      raise exception 'forced RLS is missing: %', table_name;
    end if;
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', table_name), 'DELETE')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') then
      raise exception 'browser role privilege is present: %', table_name;
    end if;
    if not has_table_privilege('service_role', format('public.%I', table_name), 'SELECT')
       or not has_table_privilege('service_role', format('public.%I', table_name), 'INSERT')
       or (table_name <> 'personal_color_training_consent_events' and not has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE'))
       or (table_name <> 'personal_color_training_consent_events' and not has_table_privilege('service_role', format('public.%I', table_name), 'DELETE')) then
      raise exception 'service role table privilege is incomplete: %', table_name;
    end if;
  end loop;

  foreach function_signature in array array[
    'public.claim_consultation_capability_tasks_v2(integer,uuid,integer)',
    'public.claim_consultation_capability_task_v2(uuid,uuid,integer)',
    'public.complete_consultation_capability_task_v2(uuid,bigint,jsonb,text,jsonb)',
    'public.consultation_operations_snapshot_v2(interval)',
    'public.prune_consultation_observability_v2(integer,integer)'
  ] loop
    if to_regprocedure(function_signature) is null then
      raise exception 'required function is missing: %', function_signature;
    end if;
    if has_function_privilege('anon', function_signature, 'EXECUTE')
       or has_function_privilege('authenticated', function_signature, 'EXECUTE')
       or not has_function_privilege('service_role', function_signature, 'EXECUTE') then
      raise exception 'function role privilege mismatch: %', function_signature;
    end if;
    if coalesce((select procedure.prosecdef from pg_proc procedure where procedure.oid = to_regprocedure(function_signature)), true) then
      raise exception 'exposed function must remain security invoker: %', function_signature;
    end if;
  end loop;

  foreach index_name in array array[
    'uq_consultation_analysis_runs_v2_active',
    'idx_consultation_analysis_runs_v2_owner',
    'idx_consultation_analysis_runs_v2_state',
    'uq_fashion_preview_batches_v2_active',
    'idx_fashion_preview_batches_v2_owner',
    'idx_fashion_preview_batches_v2_state',
    'idx_consultation_capability_tasks_v2_owner',
    'idx_consultation_capability_tasks_v2_claim',
    'idx_consultation_capability_attempts_v2_task',
    'idx_consultation_capability_results_v2_owner',
    'idx_consultation_interview_drafts_v2_owner',
    'idx_hairfit_v2_events_type_created',
    'idx_consultation_capability_tasks_v2_stale_lease',
    'idx_consultation_analysis_runs_v2_capability_task',
    'idx_consultation_analysis_runs_v2_source_photo',
    'idx_consultation_capability_results_v2_consultation',
    'idx_consultation_capability_tasks_v2_consultation',
    'idx_fashion_preview_batches_v2_capability_task',
    'idx_fashion_preview_batches_v2_selection'
  ] loop
    if to_regclass(format('public.%I', index_name)) is null then
      raise exception 'required index is missing: %', index_name;
    end if;
  end loop;
end
$$;

select 'hairfit_v2_remote_post_apply_contract_passed' as status;
rollback;

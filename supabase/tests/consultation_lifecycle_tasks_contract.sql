begin;

select plan(27);

select has_table('public', 'consultation_analysis_runs_v2', 'analysis run table exists');
select has_table('public', 'fashion_preview_batches_v2', 'fashion batch table exists');
select has_table('public', 'hairfit_v2_engine_source_manifests', 'engine source manifest table exists');
select has_table('public', 'consultation_capability_tasks_v2', 'capability task table exists');
select has_table('public', 'consultation_capability_attempts_v2', 'capability attempt table exists');
select has_table('public', 'consultation_capability_results_v2', 'capability result table exists');
select has_table('public', 'consultation_interview_drafts_v2', 'interview draft table exists');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.consultation_analysis_runs_v2'::regclass), 'analysis runs force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.fashion_preview_batches_v2'::regclass), 'fashion batches force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.hairfit_v2_engine_source_manifests'::regclass), 'source manifests force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.consultation_capability_tasks_v2'::regclass), 'capability tasks force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.consultation_capability_attempts_v2'::regclass), 'capability attempts force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.consultation_capability_results_v2'::regclass), 'capability results force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.consultation_interview_drafts_v2'::regclass), 'interview drafts force RLS');

select ok(not has_table_privilege('authenticated', 'public.consultation_capability_tasks_v2', 'SELECT'), 'authenticated cannot read capability tasks');
select ok(not has_table_privilege('authenticated', 'public.fashion_preview_batches_v2', 'SELECT'), 'authenticated cannot read internal fashion batches');
select ok(has_function_privilege('service_role', 'public.claim_consultation_capability_tasks_v2(integer,uuid,integer)', 'EXECUTE'), 'service role can claim capability work');
select ok(has_function_privilege('service_role', 'public.claim_consultation_capability_task_v2(uuid,uuid,integer)', 'EXECUTE'), 'service role can reclaim a specific capability task');
select ok(has_function_privilege('service_role', 'public.complete_consultation_capability_task_v2(uuid,bigint,jsonb,text,jsonb)', 'EXECUTE'), 'service role can complete capability work');
select ok(not has_function_privilege('anon', 'public.claim_consultation_capability_tasks_v2(integer,uuid,integer)', 'EXECUTE'), 'anon cannot claim capability work');
select ok(not has_function_privilege('anon', 'public.claim_consultation_capability_task_v2(uuid,uuid,integer)', 'EXECUTE'), 'anon cannot reclaim a specific capability task');
select ok(not has_function_privilege('anon', 'public.complete_consultation_capability_task_v2(uuid,bigint,jsonb,text,jsonb)', 'EXECUTE'), 'anon cannot complete capability work');

select ok(
  pg_get_functiondef('public.claim_consultation_capability_tasks_v2(integer,uuid,integer)'::regprocedure) ~* 'for update skip locked',
  'claim uses non-overlapping row locks'
);
select ok(
  pg_get_functiondef('public.claim_consultation_capability_task_v2(uuid,uuid,integer)'::regprocedure) ~* 'failed.*retryable.*lease_expires_at',
  'specific claim recovers retryable failures and expired leases'
);
select ok(
  pg_get_functiondef('public.complete_consultation_capability_task_v2(uuid,bigint,jsonb,text,jsonb)'::regprocedure) ~* 'fencing_token = p_fencing_token',
  'completion rejects stale fencing tokens'
);
select ok(
  (select indexdef ~* 'unique.*consultation_id.*where.*queued' from pg_indexes where schemaname = 'public' and indexname = 'uq_consultation_analysis_runs_v2_active'),
  'only one active analysis run is allowed per consultation'
);
select ok(
  (select indexdef ~* 'unique.*consultation_id, selection_snapshot_id.*where.*draft' from pg_indexes where schemaname = 'public' and indexname = 'uq_fashion_preview_batches_v2_active'),
  'only one active fashion batch is allowed per confirmed selection'
);

select * from finish();
rollback;

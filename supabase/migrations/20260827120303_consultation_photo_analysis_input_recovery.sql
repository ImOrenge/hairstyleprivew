-- Repair legacy empty photo-analysis inputs and atomically rearm recoverable jobs.

update public.consultation_analysis_runs_v2 as run
   set state = 'failed',
       retryable = false,
       lease_owner = null,
       lease_expires_at = null,
       fencing_token = run.fencing_token + 1,
       error_code = 'PHOTO_ANALYSIS_INPUT_INVALID',
       error_message = 'Stored photo analysis input was incomplete. Start the analysis again.',
       completed_at = timezone('utc', now()),
       updated_at = timezone('utc', now())
 where run.state in ('queued', 'retry_required', 'preflight', 'landmarks', 'analyzing')
   and not (
     coalesce(jsonb_typeof(run.input_snapshot), '') = 'object'
     and coalesce(jsonb_typeof(run.input_snapshot -> 'expectedVersion'), '') = 'number'
     and (run.input_snapshot ->> 'expectedVersion') ~ '^[0-9]+$'
     and coalesce(jsonb_typeof(run.input_snapshot -> 'faceEvidence'), '') = 'object'
     and coalesce(jsonb_typeof(run.input_snapshot -> 'photo'), '') = 'object'
     and run.input_snapshot -> 'photo' ->> 'draftId' = run.source_photo_id::text
   );

create or replace function public.queue_consultation_photo_analysis_v2(
  p_consultation_id uuid,
  p_user_id text,
  p_source_photo_id uuid,
  p_idempotency_key text,
  p_input_snapshot jsonb
)
returns public.consultation_analysis_runs_v2
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_existing public.consultation_analysis_runs_v2%rowtype;
  v_run public.consultation_analysis_runs_v2%rowtype;
  v_existing_input_valid boolean := false;
begin
  if length(coalesce(p_idempotency_key, '')) < 8
     or coalesce(jsonb_typeof(p_input_snapshot), '') <> 'object'
     or coalesce(jsonb_typeof(p_input_snapshot -> 'expectedVersion'), '') <> 'number'
     or coalesce(p_input_snapshot ->> 'expectedVersion', '') !~ '^[0-9]+$'
     or coalesce(jsonb_typeof(p_input_snapshot -> 'faceEvidence'), '') <> 'object'
     or coalesce(jsonb_typeof(p_input_snapshot -> 'photo'), '') <> 'object'
     or coalesce(p_input_snapshot -> 'photo' ->> 'draftId', '') <> p_source_photo_id::text then
    raise exception 'PHOTO_ANALYSIS_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_consultation_id::text, 0));

  select * into v_existing
    from public.consultation_analysis_runs_v2
   where user_id = p_user_id and idempotency_key = p_idempotency_key
   for update;

  if v_existing.id is not null then
    v_existing_input_valid :=
      coalesce(jsonb_typeof(v_existing.input_snapshot), '') = 'object'
      and coalesce(jsonb_typeof(v_existing.input_snapshot -> 'expectedVersion'), '') = 'number'
      and coalesce(v_existing.input_snapshot ->> 'expectedVersion', '') ~ '^[0-9]+$'
      and coalesce(jsonb_typeof(v_existing.input_snapshot -> 'faceEvidence'), '') = 'object'
      and coalesce(jsonb_typeof(v_existing.input_snapshot -> 'photo'), '') = 'object'
      and v_existing.input_snapshot -> 'photo' ->> 'draftId' = v_existing.source_photo_id::text;

    if v_existing.state = 'completed' then
      return v_existing;
    end if;

    if v_existing.source_photo_id <> p_source_photo_id then
      raise exception 'PHOTO_ANALYSIS_SOURCE_CONFLICT';
    end if;

    if v_existing_input_valid and (
      v_existing.state in ('queued', 'preflight', 'landmarks', 'analyzing')
      or (v_existing.state = 'retry_required' and v_existing.retryable)
    ) then
      return v_existing;
    end if;
  end if;

  update public.consultation_analysis_runs_v2 as run
     set state = 'cancelled',
         error_code = 'PHOTO_ANALYSIS_SUPERSEDED',
         error_message = 'A newer photo analysis replaced this run.',
         retryable = false,
         lease_owner = null,
         lease_expires_at = null,
         fencing_token = run.fencing_token + 1,
         superseded_at = v_now,
         completed_at = v_now,
         updated_at = v_now
   where run.consultation_id = p_consultation_id
     and run.user_id = p_user_id
     and (v_existing.id is null or run.id <> v_existing.id)
     and run.state in ('queued', 'retry_required', 'preflight', 'landmarks', 'analyzing');

  if v_existing.id is not null then
    update public.consultation_analysis_runs_v2 as run
       set source_photo_id = p_source_photo_id,
           state = 'queued',
           pipeline = jsonb_build_object(
             'upload', 'complete', 'preflight', 'pending', 'landmarks', 'pending',
             'analysis', 'pending', 'persistence', 'pending'
           ),
           input_snapshot = p_input_snapshot,
           attempt_count = 0,
           retryable = true,
           next_attempt_at = v_now,
           lease_owner = null,
           lease_expires_at = null,
           fencing_token = run.fencing_token + 1,
           error_code = null,
           error_message = null,
           started_at = null,
           completed_at = null,
           superseded_at = null,
           updated_at = v_now
     where run.id = v_existing.id
     returning run.* into v_run;
    return v_run;
  end if;

  insert into public.consultation_analysis_runs_v2 (
    consultation_id, user_id, source_photo_id, idempotency_key, state,
    pipeline, input_snapshot, attempt_count, retryable, next_attempt_at,
    started_at, updated_at
  ) values (
    p_consultation_id, p_user_id, p_source_photo_id, p_idempotency_key, 'queued',
    jsonb_build_object(
      'upload', 'complete', 'preflight', 'pending', 'landmarks', 'pending',
      'analysis', 'pending', 'persistence', 'pending'
    ),
    p_input_snapshot, 0, true, v_now, null, v_now
  ) returning * into v_run;
  return v_run;
end;
$$;

revoke all on function public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb) to service_role;

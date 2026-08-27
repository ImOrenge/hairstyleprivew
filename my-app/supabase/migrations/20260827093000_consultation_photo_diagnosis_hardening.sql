-- Durable photo diagnosis recovery, source fencing, and retention cleanup.

alter table public.consultation_analysis_runs_v2
  add column if not exists input_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists retryable boolean not null default true,
  add column if not exists next_attempt_at timestamptz not null default timezone('utc', now()),
  add column if not exists lease_owner uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists fencing_token bigint not null default 0,
  add column if not exists superseded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'consultation_analysis_runs_v2_input_snapshot_check'
      and conrelid = 'public.consultation_analysis_runs_v2'::regclass
  ) then
    alter table public.consultation_analysis_runs_v2
      add constraint consultation_analysis_runs_v2_input_snapshot_check
      check (jsonb_typeof(input_snapshot) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'consultation_analysis_runs_v2_lease_check'
      and conrelid = 'public.consultation_analysis_runs_v2'::regclass
  ) then
    alter table public.consultation_analysis_runs_v2
      add constraint consultation_analysis_runs_v2_lease_check check (
        (lease_owner is null and lease_expires_at is null)
        or (lease_owner is not null and lease_expires_at is not null)
      );
  end if;
end $$;

create index if not exists idx_consultation_analysis_runs_v2_claim
  on public.consultation_analysis_runs_v2 (next_attempt_at, created_at, id)
  where state in ('queued', 'retry_required', 'preflight', 'landmarks', 'analyzing');

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
begin
  if jsonb_typeof(p_input_snapshot) <> 'object' or length(coalesce(p_idempotency_key, '')) < 8 then
    raise exception 'PHOTO_ANALYSIS_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_consultation_id::text, 0));

  select * into v_existing
    from public.consultation_analysis_runs_v2
   where user_id = p_user_id and idempotency_key = p_idempotency_key
   for update;

  if found and (
    v_existing.state in ('completed', 'queued', 'preflight', 'landmarks', 'analyzing')
    or (v_existing.state = 'retry_required' and v_existing.retryable)
  ) then
    return v_existing;
  end if;

  update public.consultation_analysis_runs_v2
     set state = 'cancelled',
         error_code = 'PHOTO_ANALYSIS_SUPERSEDED',
         error_message = 'A newer photo analysis replaced this run.',
         retryable = false,
         lease_owner = null,
         lease_expires_at = null,
         superseded_at = v_now,
         completed_at = v_now,
         updated_at = v_now
   where consultation_id = p_consultation_id
     and user_id = p_user_id
     and (v_existing.id is null or id <> v_existing.id)
     and state in ('queued', 'retry_required', 'preflight', 'landmarks', 'analyzing');

  if v_existing.id is not null then
    if v_existing.attempt_count >= 3 then
      return v_existing;
    end if;
    update public.consultation_analysis_runs_v2
       set state = 'queued',
           pipeline = jsonb_build_object(
             'upload', 'complete', 'preflight', 'pending', 'landmarks', 'pending',
             'analysis', 'pending', 'persistence', 'pending'
           ),
           input_snapshot = p_input_snapshot,
           retryable = true,
           next_attempt_at = v_now,
           lease_owner = null,
           lease_expires_at = null,
           error_code = null,
           error_message = null,
           completed_at = null,
           superseded_at = null,
           updated_at = v_now
     where id = v_existing.id
     returning * into v_run;
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

create or replace function public.claim_consultation_photo_analysis_v2(
  p_run_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 180
)
returns public.consultation_analysis_runs_v2
language sql
security invoker
set search_path = ''
as $$
  update public.consultation_analysis_runs_v2 as run
     set state = 'preflight',
         attempt_count = run.attempt_count + 1,
         lease_owner = p_worker_id,
         lease_expires_at = timezone('utc', now()) + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 180), 900))),
         fencing_token = run.fencing_token + 1,
         retryable = true,
         error_code = null,
         error_message = null,
         started_at = coalesce(run.started_at, timezone('utc', now())),
         updated_at = timezone('utc', now())
   where run.id = p_run_id
     and run.attempt_count < 3
     and run.next_attempt_at <= timezone('utc', now())
     and run.retryable
     and (
       run.state in ('queued', 'retry_required')
       or (
         run.state in ('preflight', 'landmarks', 'analyzing')
         and coalesce(run.lease_expires_at, '-infinity'::timestamptz) <= timezone('utc', now())
       )
     )
  returning run.*
$$;

create or replace function public.claim_consultation_photo_analyses_v2(
  p_limit integer,
  p_worker_id uuid,
  p_lease_seconds integer default 180
)
returns setof public.consultation_analysis_runs_v2
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select run.id
      from public.consultation_analysis_runs_v2 as run
     where run.attempt_count < 3
       and run.next_attempt_at <= timezone('utc', now())
       and run.retryable
       and (
         run.state in ('queued', 'retry_required')
         or (
           run.state in ('preflight', 'landmarks', 'analyzing')
           and coalesce(run.lease_expires_at, '-infinity'::timestamptz) <= timezone('utc', now())
         )
       )
     order by run.next_attempt_at, run.created_at, run.id
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 1), 10))
  )
  update public.consultation_analysis_runs_v2 as run
     set state = 'preflight',
         attempt_count = run.attempt_count + 1,
         lease_owner = p_worker_id,
         lease_expires_at = timezone('utc', now()) + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 180), 900))),
         fencing_token = run.fencing_token + 1,
         retryable = true,
         error_code = null,
         error_message = null,
         started_at = coalesce(run.started_at, timezone('utc', now())),
         updated_at = timezone('utc', now())
    from candidates
   where run.id = candidates.id
  returning run.*
$$;

create or replace function public.update_consultation_photo_analysis_v2(
  p_run_id uuid,
  p_worker_id uuid,
  p_fencing_token bigint,
  p_state text,
  p_pipeline jsonb,
  p_error_code text default null,
  p_error_message text default null,
  p_retryable boolean default true,
  p_retry_delay_seconds integer default 0
)
returns public.consultation_analysis_runs_v2
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_run public.consultation_analysis_runs_v2%rowtype;
  v_terminal boolean := p_state in ('completed', 'failed', 'cancelled');
begin
  if p_state not in ('preflight', 'landmarks', 'analyzing', 'completed', 'retry_required', 'failed', 'cancelled')
     or jsonb_typeof(p_pipeline) <> 'object' then
    raise exception 'PHOTO_ANALYSIS_STATE_INVALID';
  end if;

  update public.consultation_analysis_runs_v2 as run
     set state = p_state,
         pipeline = p_pipeline,
         error_code = p_error_code,
         error_message = left(p_error_message, 1000),
         retryable = p_retryable,
         next_attempt_at = case when p_state = 'retry_required'
           then v_now + make_interval(secs => greatest(1, least(coalesce(p_retry_delay_seconds, 30), 3600)))
           else run.next_attempt_at end,
         lease_owner = case when p_state in ('preflight', 'landmarks', 'analyzing') then run.lease_owner else null end,
         lease_expires_at = case when p_state in ('preflight', 'landmarks', 'analyzing') then v_now + interval '10 minutes' else null end,
         completed_at = case when v_terminal then v_now else null end,
         updated_at = v_now
   where run.id = p_run_id
     and run.lease_owner = p_worker_id
     and run.fencing_token = p_fencing_token
     and run.state in ('preflight', 'landmarks', 'analyzing')
  returning run.* into v_run;

  if v_run.id is null then raise exception 'PHOTO_ANALYSIS_STALE_FENCE'; end if;
  return v_run;
end;
$$;

create or replace function public.queue_expired_personal_color_capture_cleanup(
  p_limit integer default 100
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    select asset.id
      from public.personal_color_capture_assets as asset
     where asset.status in ('intent_created', 'uploaded', 'quality_ready', 'quality_blocked')
       and asset.expires_at <= timezone('utc', now())
     order by asset.expires_at, asset.id
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 100), 500))
  ), updated as (
    update public.personal_color_capture_assets as asset
       set status = 'cleanup_queued', cleanup_queued_at = coalesce(asset.cleanup_queued_at, timezone('utc', now()))
      from expired
     where asset.id = expired.id
    returning asset.*
  ), queued as (
    insert into public.personal_color_capture_cleanup_outbox (
      asset_id, user_id, storage_bucket, storage_path, checksum_sha256, state, available_at, last_error
    )
    select id, user_id, storage_bucket, storage_path, checksum_sha256, 'pending', timezone('utc', now()), 'retention_expired'
      from updated
    on conflict (asset_id) do nothing
    returning id
  )
  select count(*) into v_count from queued;
  return v_count;
end;
$$;

revoke all on function public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.claim_consultation_photo_analysis_v2(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.claim_consultation_photo_analyses_v2(integer,uuid,integer) from public, anon, authenticated;
revoke all on function public.update_consultation_photo_analysis_v2(uuid,uuid,bigint,text,jsonb,text,text,boolean,integer) from public, anon, authenticated;
revoke all on function public.queue_expired_personal_color_capture_cleanup(integer) from public, anon, authenticated;
grant execute on function public.queue_consultation_photo_analysis_v2(uuid,text,uuid,text,jsonb) to service_role;
grant execute on function public.claim_consultation_photo_analysis_v2(uuid,uuid,integer) to service_role;
grant execute on function public.claim_consultation_photo_analyses_v2(integer,uuid,integer) to service_role;
grant execute on function public.update_consultation_photo_analysis_v2(uuid,uuid,bigint,text,jsonb,text,text,boolean,integer) to service_role;
grant execute on function public.queue_expired_personal_color_capture_cleanup(integer) to service_role;

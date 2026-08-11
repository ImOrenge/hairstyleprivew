-- HairFit V2 consultation operations are additive. Saved consultation and
-- capability results remain the source of truth when any rollout flag is OFF.

create index if not exists idx_hairfit_v2_events_type_created
  on public.hairfit_v2_domain_events (event_type, created_at desc);

create index if not exists idx_consultation_capability_tasks_v2_stale_lease
  on public.consultation_capability_tasks_v2 (lease_expires_at, state)
  where lease_expires_at is not null
    and state in ('running', 'waiting', 'partial', 'retry_required');

create or replace function public.consultation_operations_snapshot_v2(
  p_since interval default interval '24 hours'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with event_counts as (
    select event.event_type, count(*)::integer as count
      from public.hairfit_v2_domain_events as event
     where event.created_at >= timezone('utc', now()) - greatest(p_since, interval '1 minute')
     group by event.event_type
  ), task_counts as (
    select task.state, count(*)::integer as count
      from public.consultation_capability_tasks_v2 as task
     where task.created_at >= timezone('utc', now()) - greatest(p_since, interval '1 minute')
     group by task.state
  ), stale as (
    select count(*)::integer as count
      from public.consultation_capability_tasks_v2 as task
     where task.state in ('running', 'waiting', 'partial', 'retry_required')
       and task.lease_expires_at < timezone('utc', now())
  ), receipt_states as (
    select coalesce(nullif(task.cost_receipt ->> 'state', ''), 'unknown') as state,
           count(*)::integer as count
      from public.consultation_capability_tasks_v2 as task
     where task.created_at >= timezone('utc', now()) - greatest(p_since, interval '1 minute')
     group by coalesce(nullif(task.cost_receipt ->> 'state', ''), 'unknown')
  ), versions as (
    select task.capability,
           task.engine_version,
           task.source_revision,
           task.prompt_policy_version,
           task.catalog_cycle_id,
           count(*)::integer as count
      from public.consultation_capability_tasks_v2 as task
     where task.created_at >= timezone('utc', now()) - greatest(p_since, interval '1 minute')
     group by task.capability, task.engine_version, task.source_revision,
              task.prompt_policy_version, task.catalog_cycle_id
  ), evidence_latency as (
    select avg(extract(epoch from (first_event.created_at - session.created_at)))::numeric(12,3) as seconds
      from public.consultation_sessions as session
      join lateral (
        select event.created_at
          from public.hairfit_v2_domain_events as event
         where event.consultation_id = session.id
           and event.event_type = 'analysis.evidence_ready'
         order by event.created_at
         limit 1
      ) as first_event on true
     where session.created_at >= timezone('utc', now()) - greatest(p_since, interval '1 minute')
  ), preview_latency as (
    select avg(extract(epoch from (accepted.created_at - queued.created_at)))::numeric(12,3) as seconds
      from public.hairfit_v2_domain_events as queued
      join lateral (
        select event.created_at
          from public.hairfit_v2_domain_events as event
         where event.event_type = 'preview_attempt.accepted'
           and event.payload ->> 'boardId' = queued.payload ->> 'boardId'
           and event.created_at >= queued.created_at
         order by event.created_at
         limit 1
      ) as accepted on true
     where queued.event_type = 'preview_board.queued'
       and queued.created_at >= timezone('utc', now()) - greatest(p_since, interval '1 minute')
  ), ready_counts as (
    select event.payload ->> 'boardId' as board_id, count(*)::integer as ready_count
      from public.hairfit_v2_domain_events as event
     where event.event_type = 'preview_attempt.accepted'
       and event.created_at >= timezone('utc', now()) - greatest(p_since, interval '1 minute')
     group by event.payload ->> 'boardId'
  )
  select jsonb_build_object(
    'sinceSeconds', extract(epoch from greatest(p_since, interval '1 minute'))::bigint,
    'events', coalesce((select jsonb_object_agg(event_type, count) from event_counts), '{}'::jsonb),
    'tasks', coalesce((select jsonb_object_agg(state, count) from task_counts), '{}'::jsonb),
    'staleLeaseCount', (select count from stale),
    'receiptStates', coalesce((select jsonb_object_agg(state, count) from receipt_states), '{}'::jsonb),
    'versions', coalesce((select jsonb_agg(to_jsonb(versions)) from versions), '[]'::jsonb),
    'timeToFirstEvidenceSeconds', (select seconds from evidence_latency),
    'timeToFirstPreviewSeconds', (select seconds from preview_latency),
    'readyCount', coalesce((select jsonb_object_agg(board_id, ready_count) from ready_counts where board_id is not null), '{}'::jsonb)
  );
$$;

revoke all on function public.consultation_operations_snapshot_v2(interval)
  from public, anon, authenticated;
grant execute on function public.consultation_operations_snapshot_v2(interval)
  to service_role;

create or replace function public.prune_consultation_observability_v2(
  p_event_retention_days integer default 90,
  p_error_detail_retention_days integer default 7
)
returns table (
  deleted_events bigint,
  redacted_task_errors bigint,
  redacted_attempt_errors bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted_events bigint := 0;
  v_redacted_task_errors bigint := 0;
  v_redacted_attempt_errors bigint := 0;
begin
  if p_event_retention_days not between 30 and 365
     or p_error_detail_retention_days not between 1 and 30 then
    raise exception 'invalid_consultation_observability_retention';
  end if;

  delete from public.hairfit_v2_domain_events as event
   where event.created_at < timezone('utc', now()) - make_interval(days => p_event_retention_days);
  get diagnostics v_deleted_events = row_count;

  update public.consultation_capability_tasks_v2 as task
     set error_message = null,
         updated_at = timezone('utc', now())
   where task.error_message is not null
     and task.state in ('completed', 'failed', 'cancelled')
     and task.updated_at < timezone('utc', now()) - make_interval(days => p_error_detail_retention_days);
  get diagnostics v_redacted_task_errors = row_count;

  update public.consultation_capability_attempts_v2 as attempt
     set error_message = null
   where attempt.error_message is not null
     and attempt.completed_at is not null
     and attempt.completed_at < timezone('utc', now()) - make_interval(days => p_error_detail_retention_days);
  get diagnostics v_redacted_attempt_errors = row_count;

  return query select v_deleted_events, v_redacted_task_errors, v_redacted_attempt_errors;
end;
$$;

revoke all on function public.prune_consultation_observability_v2(integer, integer)
  from public, anon, authenticated;
grant execute on function public.prune_consultation_observability_v2(integer, integer)
  to service_role;

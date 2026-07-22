\set ON_ERROR_STOP on

begin;

set local statement_timeout = '15s';
set local lock_timeout = '5s';

do $$
declare
  v_delayed_generation_id uuid := '41000000-0000-4000-8000-000000000001';
  v_retry_generation_id uuid := '41000000-0000-4000-8000-000000000002';
  v_poison_generation_id uuid := '41000000-0000-4000-8000-000000000003';
  v_delayed_outbox_id uuid := '42000000-0000-4000-8000-000000000001';
  v_retry_outbox_id uuid := '42000000-0000-4000-8000-000000000002';
  v_poison_outbox_id uuid := '42000000-0000-4000-8000-000000000003';
  v_first_lease uuid := '43000000-0000-4000-8000-000000000001';
  v_restart_lease uuid := '43000000-0000-4000-8000-000000000002';
  v_competing_lease uuid := '43000000-0000-4000-8000-000000000003';
  v_retry_lease uuid := '43000000-0000-4000-8000-000000000004';
  v_retry_restart_lease uuid := '43000000-0000-4000-8000-000000000005';
  v_poison_probe_lease uuid := '43000000-0000-4000-8000-000000000006';
  v_claim jsonb;
  v_result jsonb;
  v_count integer;
  v_status text;
  v_attempt_count integer;
  v_workflow_instance_id text;
begin
  insert into public.users (id, email, credits, account_type)
  values (
    'workflow_dispatch_recovery_user',
    'workflow-dispatch-recovery@example.test',
    30,
    'member'
  );

  insert into public.generations (
    id,
    user_id,
    original_image_path,
    prompt_used,
    options,
    status,
    accepted_at,
    preparation_status
  )
  values
    (
      v_delayed_generation_id,
      'workflow_dispatch_recovery_user',
      'smoke/workflow-delayed.webp',
      'dispatch recovery smoke',
      '{}'::jsonb,
      'queued',
      now(),
      'ready'
    ),
    (
      v_retry_generation_id,
      'workflow_dispatch_recovery_user',
      'smoke/workflow-retry.webp',
      'dispatch retry smoke',
      '{}'::jsonb,
      'queued',
      now(),
      'ready'
    ),
    (
      v_poison_generation_id,
      'workflow_dispatch_recovery_user',
      'smoke/workflow-poison.webp',
      'dispatch poison smoke',
      '{}'::jsonb,
      'queued',
      now(),
      'ready'
    );

  insert into public.generation_workflow_outbox (
    id,
    generation_id,
    dispatch_key,
    payload,
    status,
    available_at,
    max_attempts
  )
  values (
    v_delayed_outbox_id,
    v_delayed_generation_id,
    'generation-workflow:' || v_delayed_generation_id::text,
    jsonb_build_object('generationId', v_delayed_generation_id),
    'queued',
    now() + interval '1 minute',
    3
  );

  select count(*)
    into v_count
    from public.claim_generation_workflow_outbox(10, v_first_lease, 120);
  if v_count <> 0 then
    raise exception 'future dispatcher row was claimed before its one-minute delay elapsed';
  end if;

  update public.generation_workflow_outbox
     set available_at = now() - interval '1 second'
   where id = v_delayed_outbox_id;

  select claimed
    into v_claim
    from public.claim_generation_workflow_outbox(10, v_first_lease, 120) as claimed;
  if v_claim ->> 'outboxId' <> v_delayed_outbox_id::text
     or (v_claim ->> 'attemptCount')::integer <> 1 then
    raise exception 'delayed accepted generation was not claimed exactly once: %', v_claim;
  end if;

  select count(*)
    into v_count
    from public.claim_generation_workflow_outbox(10, v_competing_lease, 120);
  if v_count <> 0 then
    raise exception 'active Workflow lease allowed a duplicate dispatcher claim';
  end if;

  update public.generation_workflow_outbox
     set lease_expires_at = now() - interval '1 second'
   where id = v_delayed_outbox_id;

  select claimed
    into v_claim
    from public.claim_generation_workflow_outbox(10, v_restart_lease, 120) as claimed;
  if v_claim ->> 'outboxId' <> v_delayed_outbox_id::text
     or (v_claim ->> 'attemptCount')::integer <> 2 then
    raise exception 'restarted dispatcher did not reclaim the expired lease: %', v_claim;
  end if;

  begin
    perform public.finish_generation_workflow_outbox(
      v_delayed_outbox_id,
      v_first_lease,
      'workflow-stale-instance'
    );
    raise exception 'stale dispatcher unexpectedly finished the reclaimed row';
  exception
    when others then
      if sqlerrm not like 'Stale generation Workflow outbox lease%' then
        raise;
      end if;
  end;

  v_result := public.finish_generation_workflow_outbox(
    v_delayed_outbox_id,
    v_restart_lease,
    'workflow-recovered-instance'
  );
  if coalesce((v_result ->> 'finished')::boolean, false) is not true
     or v_result ->> 'status' <> 'dispatched' then
    raise exception 'restarted dispatcher did not finish the row: %', v_result;
  end if;

  v_result := public.finish_generation_workflow_outbox(
    v_delayed_outbox_id,
    v_restart_lease,
    'workflow-recovered-instance'
  );
  if coalesce((v_result ->> 'idempotentReplay')::boolean, false) is not true then
    raise exception 'dispatcher finish replay was not idempotent: %', v_result;
  end if;

  select status, attempt_count, workflow_instance_id
    into v_status, v_attempt_count, v_workflow_instance_id
    from public.generation_workflow_outbox
   where id = v_delayed_outbox_id;
  if v_status <> 'dispatched'
     or v_attempt_count <> 2
     or v_workflow_instance_id <> 'workflow-recovered-instance' then
    raise exception 'recovered outbox state mismatch: %, %, %',
      v_status, v_attempt_count, v_workflow_instance_id;
  end if;

  select workflow_instance_id
    into v_workflow_instance_id
    from public.generations
   where id = v_delayed_generation_id;
  if v_workflow_instance_id <> 'workflow-recovered-instance' then
    raise exception 'generation did not receive the recovered Workflow instance';
  end if;

  insert into public.generation_workflow_outbox (
    id,
    generation_id,
    dispatch_key,
    payload,
    status,
    available_at,
    max_attempts
  )
  values (
    v_retry_outbox_id,
    v_retry_generation_id,
    'generation-workflow:' || v_retry_generation_id::text,
    jsonb_build_object('generationId', v_retry_generation_id),
    'queued',
    now() - interval '1 second',
    3
  );

  perform public.claim_generation_workflow_outbox(10, v_retry_lease, 120);
  v_result := public.retry_generation_workflow_outbox(
    v_retry_outbox_id,
    v_retry_lease,
    'synthetic dispatcher transport failure',
    60
  );
  if coalesce((v_result ->> 'retried')::boolean, false) is not true
     or v_result ->> 'status' <> 'retry' then
    raise exception 'dispatcher failure did not enter retry: %', v_result;
  end if;

  select count(*)
    into v_count
    from public.claim_generation_workflow_outbox(10, v_retry_restart_lease, 120);
  if v_count <> 0 then
    raise exception 'retry row was reclaimed before its delay elapsed';
  end if;

  update public.generation_workflow_outbox
     set available_at = now() - interval '1 second'
   where id = v_retry_outbox_id;
  select claimed
    into v_claim
    from public.claim_generation_workflow_outbox(10, v_retry_restart_lease, 120) as claimed;
  if v_claim ->> 'outboxId' <> v_retry_outbox_id::text
     or (v_claim ->> 'attemptCount')::integer <> 2 then
    raise exception 'retry row was not reclaimed by the restarted dispatcher: %', v_claim;
  end if;
  perform public.finish_generation_workflow_outbox(
    v_retry_outbox_id,
    v_retry_restart_lease,
    'workflow-retry-recovered-instance'
  );

  insert into public.generation_workflow_outbox (
    id,
    generation_id,
    dispatch_key,
    payload,
    status,
    attempt_count,
    max_attempts,
    available_at,
    lease_token,
    lease_expires_at
  )
  values (
    v_poison_outbox_id,
    v_poison_generation_id,
    'generation-workflow:' || v_poison_generation_id::text,
    jsonb_build_object('generationId', v_poison_generation_id),
    'dispatching',
    2,
    2,
    now() - interval '2 minutes',
    v_competing_lease,
    now() - interval '1 second'
  );

  select count(*)
    into v_count
    from public.claim_generation_workflow_outbox(10, v_poison_probe_lease, 120);
  if v_count <> 0 then
    raise exception 'retry-budget-exhausted poison row was dispatched again';
  end if;

  select status, attempt_count
    into v_status, v_attempt_count
    from public.generation_workflow_outbox
   where id = v_poison_outbox_id;
  if v_status <> 'failed' or v_attempt_count <> 2 then
    raise exception 'poison outbox did not become terminal failed: %, %',
      v_status, v_attempt_count;
  end if;

  select status
    into v_status
    from public.generations
   where id = v_poison_generation_id;
  if v_status <> 'failed' then
    raise exception 'poison generation did not become terminal failed: %', v_status;
  end if;

  select count(*)
    into v_count
    from public.generation_workflow_outbox
   where generation_id in (
     v_delayed_generation_id,
     v_retry_generation_id,
     v_poison_generation_id
   );
  if v_count <> 3 then
    raise exception 'dispatch recovery smoke lost or duplicated outbox rows: %', v_count;
  end if;
end;
$$;

select 'generation_workflow_dispatch_recovery_db_smoke_ok' as result;

rollback;

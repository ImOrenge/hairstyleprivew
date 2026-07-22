\set ON_ERROR_STOP on

begin;

do $$
declare
  v_user_id text := 'styling_workflow_smoke_user';
  v_generation_one uuid := '61000000-0000-4000-8000-000000000001';
  v_session_one uuid := '61000000-0000-4000-8000-000000000002';
  v_generation_two uuid := '62000000-0000-4000-8000-000000000001';
  v_session_two uuid := '62000000-0000-4000-8000-000000000002';
  v_dispatch_lease uuid := '63000000-0000-4000-8000-000000000001';
  v_begin jsonb;
  v_claim jsonb;
  v_result jsonb;
  v_notification jsonb;
  v_attempt_id uuid;
  v_attempt_lease uuid;
  v_count integer;
  v_balance integer;
  v_expires_at timestamptz;
begin
  insert into public.users (id, email, display_name, credits)
  values (v_user_id, 'styling-workflow-smoke@example.test', 'Workflow Smoke', 100);

  insert into public.generations (
    id, user_id, original_image_path, generated_image_path, prompt_used,
    options, status, credits_used, model_provider
  ) values
    (
      v_generation_one,
      v_user_id,
      'original/styling-workflow-one.webp',
      'generated/styling-workflow-one.webp',
      'workflow one',
      jsonb_build_object('recommendationSet', jsonb_build_object(
        'selectedVariantId', 'workflow-v1',
        'variants', jsonb_build_array(jsonb_build_object(
          'id', 'workflow-v1',
          'status', 'completed',
          'generatedImagePath', 'generated/styling-workflow-one.webp'
        ))
      )),
      'completed',
      10,
      'test'
    ),
    (
      v_generation_two,
      v_user_id,
      'original/styling-workflow-two.webp',
      'generated/styling-workflow-two.webp',
      'workflow two',
      jsonb_build_object('recommendationSet', jsonb_build_object(
        'selectedVariantId', 'workflow-v2',
        'variants', jsonb_build_array(jsonb_build_object(
          'id', 'workflow-v2',
          'status', 'completed',
          'generatedImagePath', 'generated/styling-workflow-two.webp'
        ))
      )),
      'completed',
      10,
      'test'
    );

  insert into public.styling_sessions (
    id, user_id, generation_id, selected_variant_id, genre, occasion, mood,
    recommendation, status, credits_used
  ) values
    (
      v_session_one, v_user_id, v_generation_one, 'workflow-v1', 'minimal',
      'daily', 'clean', jsonb_build_object('headline', 'Workflow one'), 'recommended', 0
    ),
    (
      v_session_two, v_user_id, v_generation_two, 'workflow-v2', 'minimal',
      'daily', 'clean', jsonb_build_object('headline', 'Workflow two'), 'recommended', 0
    );

  v_begin := public.begin_styling_execution(
    v_session_one,
    v_user_id,
    jsonb_build_object(
      'action', 'outfit_generation',
      'subjectId', v_session_one,
      'billingScope', 'customer',
      'policyVersion', 'hairfit-credit-policy-2026-07',
      'costCredits', 20,
      'currentBalance', 100,
      'balanceAfter', 80,
      'isAllowed', true,
      'expiresAt', now() + interval '5 minutes',
      'quoteFingerprint', repeat('c', 64)
    )
  );
  v_attempt_id := (v_begin ->> 'attemptId')::uuid;
  v_attempt_lease := (v_begin ->> 'leaseToken')::uuid;
  if coalesce((v_begin ->> 'canRun')::boolean, false) is not true then
    raise exception 'styling acceptance did not return canRun: %', v_begin;
  end if;

  select lease_expires_at into v_expires_at
    from public.styling_credit_attempts
   where id = v_attempt_id;
  if v_expires_at < now() + interval '119 minutes' then
    raise exception 'styling execution lease was not extended to two hours: %', v_expires_at;
  end if;

  select count(*) into v_count
    from public.styling_workflow_outbox
   where styling_attempt_id = v_attempt_id
     and attempt_lease_token = v_attempt_lease
     and status = 'queued';
  if v_count <> 1 then
    raise exception 'atomic styling workflow outbox missing: %', v_count;
  end if;

  select value into v_claim
    from public.claim_styling_workflow_outbox(10, v_dispatch_lease, 120) as value
   where value ->> 'sessionId' = v_session_one::text;
  if v_claim is null or v_claim ->> 'status' <> 'dispatching' then
    raise exception 'styling workflow claim failed: %', v_claim;
  end if;

  begin
    perform public.finish_styling_workflow_outbox(
      (v_claim ->> 'outboxId')::uuid,
      gen_random_uuid(),
      'styling-smoke-wrong-lease'
    );
    raise exception 'wrong dispatch lease was accepted';
  exception when others then
    if sqlerrm = 'wrong dispatch lease was accepted' then raise; end if;
  end;

  v_result := public.finish_styling_workflow_outbox(
    (v_claim ->> 'outboxId')::uuid,
    v_dispatch_lease,
    'styling-smoke-success-instance'
  );
  if v_result ->> 'status' <> 'dispatched' then
    raise exception 'styling workflow finish failed: %', v_result;
  end if;

  update public.styling_credit_attempts
     set output_object_path = v_user_id || '/' || v_session_one::text || '/result.webp'
   where id = v_attempt_id;
  v_result := public.settle_styling_execution(
    v_session_one,
    v_user_id,
    v_attempt_id,
    v_attempt_lease,
    'success',
    v_user_id || '/' || v_session_one::text || '/result.webp',
    null,
    'openai',
    'smoke-model'
  );
  if v_result ->> 'state' <> 'charged' then
    raise exception 'styling success settlement failed: %', v_result;
  end if;

  select count(*) into v_count
    from public.styling_notification_outbox
   where styling_session_id = v_session_one
     and terminal_kind = 'completed'
     and status = 'pending'
     and idempotency_key = 'styling-completed/' || v_session_one::text;
  if v_count <> 1 then
    raise exception 'styling completion notification was not enqueued: %', v_count;
  end if;

  select value into v_notification
    from public.claim_styling_completion_notifications(1, v_session_one, 600) as value;
  if v_notification is null then
    raise exception 'styling notification claim failed';
  end if;
  v_result := public.prepare_styling_completion_notification(
    (v_notification ->> 'outboxId')::uuid,
    (v_notification ->> 'leaseToken')::uuid,
    jsonb_build_object(
      'to', 'styling-workflow-smoke@example.test',
      'from', 'HairFit <noreply@hairfit.beauty>',
      'subject', 'Styling complete',
      'html', '<p>complete</p>',
      'text', 'complete',
      'source', 'styling_completed',
      'idempotencyKey', 'styling-completed/' || v_session_one::text
    )
  );
  if v_result -> 'renderedPayload' is null then
    raise exception 'styling notification payload was not frozen: %', v_result;
  end if;
  perform public.begin_styling_notification_provider_attempt(
    (v_notification ->> 'outboxId')::uuid,
    (v_notification ->> 'leaseToken')::uuid
  );
  v_result := public.finish_styling_completion_notification(
    (v_notification ->> 'outboxId')::uuid,
    (v_notification ->> 'leaseToken')::uuid,
    'sent',
    'resend-smoke-id',
    null
  );
  if v_result ->> 'status' <> 'sent' then
    raise exception 'styling notification finish failed: %', v_result;
  end if;

  v_begin := public.begin_styling_execution(
    v_session_two,
    v_user_id,
    jsonb_build_object(
      'action', 'outfit_generation',
      'subjectId', v_session_two,
      'billingScope', 'customer',
      'policyVersion', 'hairfit-credit-policy-2026-07',
      'costCredits', 20,
      'currentBalance', 80,
      'balanceAfter', 60,
      'isAllowed', true,
      'expiresAt', now() + interval '5 minutes',
      'quoteFingerprint', repeat('d', 64)
    )
  );
  v_attempt_id := (v_begin ->> 'attemptId')::uuid;
  update public.styling_workflow_outbox
     set max_attempts = 1
   where styling_attempt_id = v_attempt_id;
  v_dispatch_lease := '63000000-0000-4000-8000-000000000002';
  select value into v_claim
    from public.claim_styling_workflow_outbox(10, v_dispatch_lease, 120) as value
   where value ->> 'sessionId' = v_session_two::text;
  v_result := public.retry_styling_workflow_outbox(
    (v_claim ->> 'outboxId')::uuid,
    v_dispatch_lease,
    'binding unavailable',
    30
  );
  if v_result ->> 'status' <> 'failed' then
    raise exception 'exhausted workflow outbox did not fail: %', v_result;
  end if;
  select credits into v_balance from public.users where id = v_user_id;
  if v_balance <> 80 then
    raise exception 'workflow dispatch failure did not refund reserved credits: %', v_balance;
  end if;
  select count(*) into v_count
    from public.styling_notification_outbox
   where styling_session_id = v_session_two
     and terminal_kind = 'failed'
     and status = 'pending';
  if v_count <> 1 then
    raise exception 'failed styling notification was not enqueued: %', v_count;
  end if;

  raise notice 'styling_durable_workflow_smoke_ok';
end;
$$;

rollback;

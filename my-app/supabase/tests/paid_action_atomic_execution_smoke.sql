\set ON_ERROR_STOP on

begin;

do $$
declare
  v_styling_generation uuid := '10000000-0000-4000-8000-000000000001';
  v_styling_session uuid := '10000000-0000-4000-8000-000000000002';
  v_aftercare_generation_one uuid := '20000000-0000-4000-8000-000000000001';
  v_aftercare_generation_two uuid := '20000000-0000-4000-8000-000000000002';
  v_aftercare_generation_legacy uuid := '20000000-0000-4000-8000-000000000003';
  v_aftercare_legacy_record uuid := '20000000-0000-4000-8000-000000000004';
  v_aftercare_generation_rollback uuid := '30000000-0000-4000-8000-000000000001';
  v_aftercare_generation_stale uuid := '40000000-0000-4000-8000-000000000001';
  v_begin jsonb;
  v_receipt jsonb;
  v_aftercare jsonb;
  v_guide jsonb;
  v_contents jsonb;
  v_balance integer;
  v_count integer;
  v_first_record uuid;
begin
  insert into public.users (id, email, credits)
  values
    ('atomic_styling_user', 'atomic-styling@example.test', 100),
    ('atomic_aftercare_user', 'atomic-aftercare@example.test', 100),
    ('atomic_rollback_user', 'atomic-rollback@example.test', 40),
    ('atomic_stale_user', 'atomic-stale@example.test', 50);

  insert into public.generations (
    id, user_id, original_image_path, generated_image_path, prompt_used,
    options, status, credits_used, model_provider
  ) values
    (
      v_styling_generation,
      'atomic_styling_user',
      'original/styling.webp',
      'generated/hair.webp',
      'hair prompt',
      jsonb_build_object(
        'recommendationSet', jsonb_build_object(
          'selectedVariantId', 'styling-v1',
          'variants', jsonb_build_array(jsonb_build_object(
            'id', 'styling-v1',
            'prompt', 'styling hair prompt',
            'status', 'completed',
            'generatedImagePath', 'generated/hair.webp'
          ))
        )
      ),
      'completed',
      10,
      'test'
    ),
    (
      v_aftercare_generation_one,
      'atomic_aftercare_user',
      'original/aftercare-one.webp',
      'generated/aftercare-one.webp',
      'aftercare one prompt',
      jsonb_build_object(
        'recommendationSet', jsonb_build_object(
          'selectedVariantId', 'aftercare-v1',
          'variants', jsonb_build_array(jsonb_build_object(
            'id', 'aftercare-v1',
            'prompt', 'aftercare one prompt',
            'status', 'completed',
            'generatedImagePath', 'generated/aftercare-one.webp'
          ))
        )
      ),
      'completed',
      10,
      'test'
    ),
    (
      v_aftercare_generation_two,
      'atomic_aftercare_user',
      'original/aftercare-two.webp',
      'generated/aftercare-two.webp',
      'aftercare two prompt',
      jsonb_build_object(
        'recommendationSet', jsonb_build_object(
          'selectedVariantId', 'aftercare-v2',
          'variants', jsonb_build_array(jsonb_build_object(
            'id', 'aftercare-v2',
            'prompt', 'aftercare two prompt',
            'status', 'completed',
            'generatedImagePath', 'generated/aftercare-two.webp'
          ))
        )
      ),
      'completed',
      10,
      'test'
    ),
    (
      v_aftercare_generation_legacy,
      'atomic_aftercare_user',
      'original/aftercare-legacy.webp',
      'generated/aftercare-legacy.webp',
      'aftercare legacy prompt',
      jsonb_build_object(
        'recommendationSet', jsonb_build_object(
          'selectedVariantId', 'aftercare-v3',
          'variants', jsonb_build_array(
            jsonb_build_object(
              'id', 'aftercare-v3',
              'prompt', 'aftercare legacy prompt',
              'status', 'completed',
              'generatedImagePath', 'generated/aftercare-legacy.webp'
            ),
            jsonb_build_object(
              'id', 'aftercare-v3-alt',
              'prompt', 'aftercare legacy alternate prompt',
              'status', 'completed',
              'generatedImagePath', 'generated/aftercare-legacy.webp'
            )
          )
        )
      ),
      'completed',
      10,
      'test'
    ),
    (
      v_aftercare_generation_rollback,
      'atomic_rollback_user',
      'original/rollback.webp',
      'generated/rollback.webp',
      'rollback prompt',
      jsonb_build_object(
        'recommendationSet', jsonb_build_object(
          'selectedVariantId', 'rollback-v1',
          'variants', jsonb_build_array(jsonb_build_object(
            'id', 'rollback-v1',
            'prompt', 'rollback prompt',
            'status', 'completed',
            'generatedImagePath', 'generated/rollback.webp'
          ))
        )
      ),
      'completed',
      10,
      'test'
    ),
    (
      v_aftercare_generation_stale,
      'atomic_stale_user',
      'original/stale.webp',
      'generated/stale.webp',
      'stale prompt',
      jsonb_build_object(
        'recommendationSet', jsonb_build_object(
          'selectedVariantId', 'stale-v1',
          'variants', jsonb_build_array(jsonb_build_object(
            'id', 'stale-v1',
            'prompt', 'stale prompt',
            'status', 'completed',
            'generatedImagePath', 'generated/stale.webp'
          ))
        )
      ),
      'completed',
      10,
      'test'
    );

  insert into public.styling_sessions (
    id, user_id, generation_id, selected_variant_id, genre, occasion, mood,
    recommendation, status, credits_used
  ) values (
    v_styling_session,
    'atomic_styling_user',
    v_styling_generation,
    'styling-v1',
    'minimal',
    'daily',
    'minimal',
    jsonb_build_object('headline', 'Atomic lookbook'),
    'recommended',
    0
  );

  v_begin := public.begin_styling_execution(
    v_styling_session,
    'atomic_styling_user',
    jsonb_build_object(
      'action', 'outfit_generation',
      'subjectId', v_styling_session,
      'billingScope', 'customer',
      'policyVersion', 'hairfit-credit-policy-2026-07',
      'costCredits', 20,
      'currentBalance', 100,
      'balanceAfter', 80,
      'isAllowed', true,
      'expiresAt', now() + interval '5 minutes',
      'quoteFingerprint', repeat('a', 64)
    )
  );
  if coalesce((v_begin ->> 'canRun')::boolean, false) is not true
     or v_begin #>> '{creditReceipt,state}' <> 'reserved'
     or (v_begin #>> '{creditReceipt,balanceAfter}')::integer <> 80 then
    raise exception 'styling reservation mismatch: %', v_begin;
  end if;

  select credits into v_balance from public.users where id = 'atomic_styling_user';
  if v_balance <> 80 then raise exception 'styling reservation balance mismatch: %', v_balance; end if;

  v_receipt := public.begin_styling_execution(
    v_styling_session,
    'atomic_styling_user',
    '{}'::jsonb
  );
  if coalesce((v_receipt ->> 'inProgress')::boolean, false) is not true
     or coalesce((v_receipt ->> 'canRun')::boolean, true) is not false then
    raise exception 'concurrent styling replay was not fenced: %', v_receipt;
  end if;
  select count(*) into v_count
    from public.credit_ledger
   where user_id = 'atomic_styling_user' and reason = 'outfit_styling_usage';
  if v_count <> 1 then raise exception 'styling replay created % usage ledgers', v_count; end if;

  v_receipt := public.settle_styling_execution(
    v_styling_session,
    'atomic_styling_user',
    (v_begin ->> 'attemptId')::uuid,
    (v_begin ->> 'leaseToken')::uuid,
    'failure',
    null,
    'model timeout',
    null,
    null
  );
  if v_receipt ->> 'state' <> 'refunded'
     or (v_receipt ->> 'refundedCredits')::integer <> 20
     or (v_receipt ->> 'balanceAfter')::integer <> 100 then
    raise exception 'styling refund mismatch: %', v_receipt;
  end if;
  perform public.settle_styling_execution(
    v_styling_session,
    'atomic_styling_user',
    (v_begin ->> 'attemptId')::uuid,
    (v_begin ->> 'leaseToken')::uuid,
    'failure',
    null,
    'replay',
    null,
    null
  );
  select count(*) into v_count
    from public.credit_ledger
   where user_id = 'atomic_styling_user' and reason = 'outfit_styling_failure_refund';
  if v_count <> 1 then raise exception 'styling refund replay created % ledgers', v_count; end if;

  begin
    perform public.begin_styling_execution(
      v_styling_session,
      'atomic_styling_user',
      jsonb_build_object(
        'action', 'outfit_generation',
        'subjectId', v_styling_session,
        'billingScope', 'customer',
        'policyVersion', 'hairfit-credit-policy-2026-07',
        'costCredits', 20,
        'currentBalance', 100,
        'balanceAfter', 80,
        'isAllowed', true,
        'expiresAt', now() + interval '5 minutes',
        'quoteFingerprint', repeat('a', 64)
      )
    );
    raise exception 'refunded styling quote unexpectedly created a new attempt';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'QUOTE_CHANGED:%already settled and refunded%' then raise; end if;
  end;
  select count(*) into v_count
    from public.credit_ledger
   where user_id = 'atomic_styling_user' and reason = 'outfit_styling_usage';
  if v_count <> 1 then raise exception 'refunded quote replay created % usage ledgers', v_count; end if;

  v_begin := public.begin_styling_execution(
    v_styling_session,
    'atomic_styling_user',
    jsonb_build_object(
      'action', 'outfit_generation',
      'subjectId', v_styling_session,
      'billingScope', 'customer',
      'policyVersion', 'hairfit-credit-policy-2026-07',
      'costCredits', 20,
      'currentBalance', 100,
      'balanceAfter', 80,
      'isAllowed', true,
      'expiresAt', now() + interval '5 minutes',
      'quoteFingerprint', repeat('b', 64)
    )
  );
  v_receipt := public.settle_styling_execution(
    v_styling_session,
    'atomic_styling_user',
    (v_begin ->> 'attemptId')::uuid,
    (v_begin ->> 'leaseToken')::uuid,
    'success',
    'atomic/result.webp',
    null,
    'openai',
    'test-model'
  );
  if v_receipt ->> 'state' <> 'charged'
     or (v_receipt ->> 'chargedCredits')::integer <> 20 then
    raise exception 'styling commit mismatch: %', v_receipt;
  end if;
  select count(*) into v_count
    from public.styling_credit_attempts
   where styling_session_id = v_styling_session and state = 'committed';
  if v_count <> 1 then raise exception 'styling committed attempt count mismatch: %', v_count; end if;

  v_guide := jsonb_build_object(
    'overview', jsonb_build_object('headline', 'care'),
    'sections', jsonb_build_object(
      'dry', jsonb_build_object(),
      'treatment', jsonb_build_object(),
      'iron', jsonb_build_object(),
      'styling', jsonb_build_object()
    ),
    'maintenanceSchedule', jsonb_build_array(),
    'warnings', jsonb_build_array(),
    'recommendedNextActions', jsonb_build_array()
  );
  v_contents := jsonb_build_array(
    jsonb_build_object('content_type', 'dry_guide', 'day_offset', 1, 'subject', 'D+1', 'body_html', '<a href="https://example.test/aftercare/__HAIR_RECORD_ID__">care</a>', 'scheduled_send_at', '2026-07-16T01:00:00Z'),
    jsonb_build_object('content_type', 'day3_care', 'day_offset', 3, 'subject', 'D+3', 'body_html', 'care', 'scheduled_send_at', '2026-07-18T01:00:00Z'),
    jsonb_build_object('content_type', 'week1_tip', 'day_offset', 7, 'subject', 'D+7', 'body_html', 'care', 'scheduled_send_at', '2026-07-22T01:00:00Z'),
    jsonb_build_object('content_type', 'month1_revisit', 'day_offset', 30, 'subject', 'D+30', 'body_html', 'care', 'scheduled_send_at', '2026-08-14T01:00:00Z'),
    jsonb_build_object('content_type', 'month1_trend', 'day_offset', 45, 'subject', 'D+45', 'body_html', 'care', 'scheduled_send_at', '2026-08-29T01:00:00Z'),
    jsonb_build_object('content_type', 'month3_cta', 'day_offset', 90, 'subject', 'D+90', 'body_html', 'care', 'scheduled_send_at', '2026-10-13T01:00:00Z')
  );

  v_aftercare := public.execute_aftercare_program(
    'atomic_aftercare_user',
    v_aftercare_generation_one,
    'aftercare-v1',
    'cut',
    '2026-07-15',
    '첫 번째 스타일',
    30,
    v_guide,
    v_contents,
    jsonb_build_object(
      'action', 'aftercare',
      'subjectId', v_aftercare_generation_one,
      'billingScope', 'customer',
      'policyVersion', 'hairfit-credit-policy-2026-07',
      'costCredits', 0,
      'currentBalance', 100,
      'balanceAfter', 100,
      'isAllowed', true,
      'expiresAt', now() + interval '5 minutes',
      'quoteFingerprint', repeat('c', 64)
    )
  );
  v_first_record := (v_aftercare ->> 'hairRecordId')::uuid;
  if v_aftercare #>> '{creditReceipt,state}' <> 'free'
     or (v_aftercare ->> 'careScheduledCount')::integer <> 6 then
    raise exception 'first-free aftercare mismatch: %', v_aftercare;
  end if;
  select credits into v_balance from public.users where id = 'atomic_aftercare_user';
  if v_balance <> 100 then raise exception 'free aftercare changed balance: %', v_balance; end if;
  select count(*) into v_count from public.aftercare_free_claims where user_id = 'atomic_aftercare_user';
  if v_count <> 1 then raise exception 'free aftercare claim count mismatch: %', v_count; end if;
  select count(*) into v_count from public.user_care_contents where hair_record_id = v_first_record;
  if v_count <> 6 then raise exception 'free aftercare content count mismatch: %', v_count; end if;
  if exists (
    select 1 from public.user_care_contents
     where hair_record_id = v_first_record and body_html like '%__HAIR_RECORD_ID__%'
  ) then
    raise exception 'aftercare CTA placeholder was not replaced';
  end if;

  v_receipt := public.execute_aftercare_program(
    'atomic_aftercare_user',
    v_aftercare_generation_one,
    'aftercare-v1',
    'cut',
    '2026-07-15',
    '첫 번째 스타일',
    30,
    v_guide,
    v_contents,
    '{}'::jsonb
  );
  if coalesce((v_receipt ->> 'alreadyConfirmed')::boolean, false) is not true
     or v_receipt #>> '{creditReceipt,replayed}' <> 'true'
     or (v_receipt ->> 'hairRecordId')::uuid <> v_first_record then
    raise exception 'aftercare replay mismatch: %', v_receipt;
  end if;

  v_aftercare := public.execute_aftercare_program(
    'atomic_aftercare_user',
    v_aftercare_generation_two,
    'aftercare-v2',
    'perm',
    '2026-07-15',
    '두 번째 스타일',
    90,
    v_guide,
    v_contents,
    jsonb_build_object(
      'action', 'aftercare',
      'subjectId', v_aftercare_generation_two,
      'billingScope', 'customer',
      'policyVersion', 'hairfit-credit-policy-2026-07',
      'costCredits', 30,
      'currentBalance', 100,
      'balanceAfter', 70,
      'isAllowed', true,
      'expiresAt', now() + interval '5 minutes',
      'quoteFingerprint', repeat('d', 64)
    )
  );
  if v_aftercare #>> '{creditReceipt,state}' <> 'charged'
     or (v_aftercare #>> '{creditReceipt,chargedCredits}')::integer <> 30
     or (v_aftercare #>> '{creditReceipt,balanceAfter}')::integer <> 70 then
    raise exception 'paid aftercare mismatch: %', v_aftercare;
  end if;
  select credits into v_balance from public.users where id = 'atomic_aftercare_user';
  if v_balance <> 70 then raise exception 'paid aftercare balance mismatch: %', v_balance; end if;
  select count(*) into v_count
    from public.credit_ledger
   where user_id = 'atomic_aftercare_user' and reason = 'aftercare_program_usage';
  if v_count <> 1 then raise exception 'paid aftercare ledger count mismatch: %', v_count; end if;

  insert into public.user_hair_records (
    id, user_id, generation_id, style_name, service_type, service_date,
    next_visit_target_days, care_generated_at
  ) values (
    v_aftercare_legacy_record, 'atomic_aftercare_user', v_aftercare_generation_legacy,
    '기존 완성 스타일', 'cut', '2026-07-15', 30, now()
  );
  insert into public.user_aftercare_guides (user_id, hair_record_id, guide_json)
  values ('atomic_aftercare_user', v_aftercare_legacy_record, v_guide);
  insert into public.user_care_contents (
    user_id, hair_record_id, content_type, day_offset, subject, body_html, scheduled_send_at
  )
  select
    'atomic_aftercare_user',
    v_aftercare_legacy_record,
    content.content_type,
    content.day_offset,
    content.subject,
    content.body_html,
    content.scheduled_send_at
  from jsonb_to_recordset(v_contents) as content(
    content_type text,
    day_offset integer,
    subject text,
    body_html text,
    scheduled_send_at timestamptz
  );

  begin
    perform public.execute_aftercare_program(
      'atomic_aftercare_user',
      v_aftercare_generation_legacy,
      'aftercare-v3-alt',
      'cut',
      '2026-07-15',
      '기존 완성 스타일',
      30,
      v_guide,
      v_contents,
      jsonb_build_object(
        'action', 'aftercare',
        'subjectId', v_aftercare_generation_legacy,
        'billingScope', 'customer',
        'policyVersion', 'hairfit-credit-policy-2026-07',
        'costCredits', 0,
        'currentBalance', 70,
        'balanceAfter', 70,
        'isAllowed', true,
        'expiresAt', now() + interval '5 minutes',
        'quoteFingerprint', repeat('6', 64)
      )
    );
    raise exception 'same-label alternate aftercare selection unexpectedly replaced confirmation';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'SELECTION_LOCKED:%' then raise; end if;
  end;

  v_aftercare := public.execute_aftercare_program(
    'atomic_aftercare_user',
    v_aftercare_generation_legacy,
    'aftercare-v3',
    'cut',
    '2026-07-15',
    '기존 완성 스타일',
    30,
    v_guide,
    v_contents,
    jsonb_build_object(
      'action', 'aftercare',
      'subjectId', v_aftercare_generation_legacy,
      'billingScope', 'customer',
      'policyVersion', 'hairfit-credit-policy-2026-07',
      'costCredits', 0,
      'currentBalance', 70,
      'balanceAfter', 70,
      'isAllowed', true,
      'expiresAt', now() + interval '5 minutes',
      'quoteFingerprint', repeat('7', 64)
    )
  );
  if v_aftercare #>> '{creditReceipt,state}' <> 'free'
     or v_aftercare #>> '{creditReceipt,freeReason}' <> 'legacy_complete_program'
     or (v_aftercare #>> '{creditReceipt,balanceAfter}')::integer <> 70 then
    raise exception 'legacy complete aftercare replay mismatch: %', v_aftercare;
  end if;
  select count(*) into v_count
    from public.aftercare_free_claims
   where user_id = 'atomic_aftercare_user';
  if v_count <> 1 then raise exception 'legacy replay changed free claim count: %', v_count; end if;
  select count(*) into v_count
    from public.credit_ledger
   where user_id = 'atomic_aftercare_user' and reason = 'aftercare_program_usage';
  if v_count <> 1 then raise exception 'legacy replay created an extra usage ledger: %', v_count; end if;

  begin
    perform public.execute_aftercare_program(
      'atomic_rollback_user',
      v_aftercare_generation_rollback,
      'rollback-v1',
      'color',
      '2026-07-15',
      '롤백 스타일',
      45,
      jsonb_build_object('invalid', true),
      v_contents,
      jsonb_build_object(
        'action', 'aftercare',
        'subjectId', v_aftercare_generation_rollback,
        'billingScope', 'customer',
        'policyVersion', 'hairfit-credit-policy-2026-07',
        'costCredits', 0,
        'currentBalance', 40,
        'balanceAfter', 40,
        'isAllowed', true,
        'expiresAt', now() + interval '5 minutes',
        'quoteFingerprint', repeat('e', 64)
      )
    );
    raise exception 'invalid guide unexpectedly committed';
  exception when check_violation then
    null;
  end;
  select count(*) into v_count
    from public.user_hair_records
   where user_id = 'atomic_rollback_user';
  if v_count <> 0 then raise exception 'failed aftercare left % hair records', v_count; end if;
  select count(*) into v_count
    from public.aftercare_free_claims
   where user_id = 'atomic_rollback_user';
  if v_count <> 0 then raise exception 'failed aftercare left a free claim'; end if;
  select credits into v_balance from public.users where id = 'atomic_rollback_user';
  if v_balance <> 40 then raise exception 'failed aftercare changed balance: %', v_balance; end if;

  begin
    perform public.execute_aftercare_program(
      'atomic_stale_user',
      v_aftercare_generation_stale,
      'stale-v1',
      'cut',
      '2026-07-15',
      '오래된 견적 스타일',
      30,
      v_guide,
      v_contents,
      jsonb_build_object(
        'action', 'aftercare',
        'subjectId', v_aftercare_generation_stale,
        'billingScope', 'customer',
        'policyVersion', 'hairfit-credit-policy-2026-07',
        'costCredits', 0,
        'currentBalance', 60,
        'balanceAfter', 60,
        'isAllowed', true,
        'expiresAt', now() + interval '5 minutes',
        'quoteFingerprint', repeat('f', 64)
      )
    );
    raise exception 'stale aftercare quote unexpectedly committed';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'QUOTE_CHANGED:%' then raise; end if;
  end;
  select count(*) into v_count
    from public.user_hair_records
   where user_id = 'atomic_stale_user';
  if v_count <> 0 then raise exception 'stale quote left % hair records', v_count; end if;
end;
$$;

select 'paid_action_atomic_execution_smoke_ok' as result;

rollback;

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_draft uuid := '11111111-1111-4111-8111-111111111111';
  v_stale_draft uuid := '22222222-2222-4222-8222-222222222222';
  v_salon_draft uuid := '33333333-3333-4333-8333-333333333333';
  v_receipt jsonb;
  v_balance integer;
  v_count integer;
begin
  insert into public.users (id, email, credits, account_type)
  values
    ('paid_quote_customer', 'paid-quote-customer@example.test', 30, 'member'),
    ('paid_quote_stale', 'paid-quote-stale@example.test', 25, 'member'),
    ('paid_quote_salon', 'paid-quote-salon@example.test', 40, 'salon_owner');

  insert into public.generation_upload_drafts (
    id,
    user_id,
    client_request_id,
    original_image_path,
    content_type,
    byte_size,
    checksum_sha256,
    expires_at
  )
  values
    (
      v_customer_draft,
      'paid_quote_customer',
      '11111111-1111-4111-8111-111111111112',
      'smoke/customer.webp',
      'image/webp',
      1,
      repeat('a', 64),
      now() + interval '1 hour'
    ),
    (
      v_stale_draft,
      'paid_quote_stale',
      '22222222-2222-4222-8222-222222222223',
      'smoke/stale.webp',
      'image/webp',
      1,
      repeat('b', 64),
      now() + interval '1 hour'
    ),
    (
      v_salon_draft,
      'paid_quote_salon',
      '33333333-3333-4333-8333-333333333334',
      'smoke/salon.webp',
      'image/webp',
      1,
      repeat('c', 64),
      now() + interval '1 hour'
    );

  v_receipt := public.accept_generation_upload_draft(
    v_customer_draft,
    'paid_quote_customer',
    'female',
    jsonb_build_object(
      'payerScope', 'customer',
      'creditQuote', jsonb_build_object(
        'action', 'hair_generation',
        'subjectId', v_customer_draft,
        'billingScope', 'customer',
        'policyVersion', 'hairfit-credit-policy-2026-07',
        'costCredits', 10,
        'currentBalance', 30,
        'balanceAfter', 20,
        'isAllowed', true,
        'expiresAt', now() + interval '5 minutes',
        'quoteFingerprint', repeat('d', 64)
      )
    ),
    10,
    now() + interval '30 days'
  );

  if v_receipt #>> '{creditReceipt,state}' <> 'reserved'
     or v_receipt #>> '{creditReceipt,payerScope}' <> 'customer'
     or v_receipt #>> '{creditReceipt,policyVersion}' <> 'generation-grid-credit-v1'
     or v_receipt #>> '{creditReceipt,quotePolicyVersion}' <> 'hairfit-credit-policy-2026-07'
     or (v_receipt #>> '{creditReceipt,quotedBalance}')::integer <> 30
     or (v_receipt #>> '{creditReceipt,balanceAfterReservation}')::integer <> 20 then
    raise exception 'customer quote receipt did not preserve the atomic audit snapshot: %', v_receipt;
  end if;

  select credits into v_balance from public.users where id = 'paid_quote_customer';
  if v_balance <> 20 then
    raise exception 'customer reservation balance mismatch: %', v_balance;
  end if;

  v_receipt := public.accept_generation_upload_draft(
    v_customer_draft,
    'paid_quote_customer',
    'female',
    jsonb_build_object('payerScope', 'customer'),
    10,
    now() + interval '30 days'
  );
  if coalesce((v_receipt ->> 'idempotentReplay')::boolean, false) is not true then
    raise exception 'accepted draft replay was not idempotent: %', v_receipt;
  end if;

  v_receipt := public.settle_generation_credit_reservation(
    v_customer_draft,
    'release',
    'paid_action_quote_smoke_total_failure'
  );
  if v_receipt ->> 'state' <> 'refunded'
     or (v_receipt ->> 'refundedCredits')::integer <> 10
     or (v_receipt ->> 'balanceAfterRefund')::integer <> 30 then
    raise exception 'refund settlement mismatch: %', v_receipt;
  end if;

  perform public.settle_generation_credit_reservation(
    v_customer_draft,
    'release',
    'paid_action_quote_smoke_replay'
  );
  select count(*) into v_count
    from public.credit_ledger
   where generation_id = v_customer_draft
     and entry_type = 'refund';
  if v_count <> 1 then
    raise exception 'refund replay created % refund ledger rows', v_count;
  end if;

  begin
    perform public.accept_generation_upload_draft(
      v_stale_draft,
      'paid_quote_stale',
      'male',
      jsonb_build_object(
        'payerScope', 'customer',
        'creditQuote', jsonb_build_object(
          'action', 'hair_generation',
          'subjectId', v_stale_draft,
          'billingScope', 'customer',
          'policyVersion', 'hairfit-credit-policy-2026-07',
          'costCredits', 10,
          'currentBalance', 30,
          'balanceAfter', 20,
          'isAllowed', true,
          'expiresAt', now() + interval '5 minutes',
          'quoteFingerprint', repeat('e', 64)
        )
      ),
      10,
      now() + interval '30 days'
    );
    raise exception 'stale quote unexpectedly executed';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like 'QUOTE_CHANGED:%' then
        raise;
      end if;
  end;

  select count(*) into v_count from public.generations where id = v_stale_draft;
  if v_count <> 0 then
    raise exception 'stale quote left a generation row';
  end if;
  select credits into v_balance from public.users where id = 'paid_quote_stale';
  if v_balance <> 25 then
    raise exception 'stale quote changed balance to %', v_balance;
  end if;

  v_receipt := public.accept_generation_upload_draft(
    v_salon_draft,
    'paid_quote_salon',
    'female',
    jsonb_build_object(
      'payerScope', 'salon',
      'creditQuote', jsonb_build_object(
        'action', 'hair_generation',
        'subjectId', v_salon_draft,
        'billingScope', 'salon',
        'policyVersion', 'hairfit-credit-policy-2026-07',
        'costCredits', 10,
        'currentBalance', 40,
        'balanceAfter', 30,
        'isAllowed', true,
        'expiresAt', now() + interval '5 minutes',
        'quoteFingerprint', repeat('f', 64)
      )
    ),
    10,
    now() + interval '30 days'
  );
  if v_receipt #>> '{creditReceipt,payerScope}' <> 'salon'
     or (v_receipt #>> '{creditReceipt,balanceAfterReservation}')::integer <> 30 then
    raise exception 'salon payer receipt mismatch: %', v_receipt;
  end if;
end;
$$;

select 'paid_action_quote_db_smoke_ok' as result;

rollback;

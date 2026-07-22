\set ON_ERROR_STOP on

begin;

do $$
declare
  v_user_a text := 'push_smoke_user_a';
  v_user_b text := 'push_smoke_user_b';
  v_installation_id uuid := gen_random_uuid();
  v_generation_one uuid := gen_random_uuid();
  v_generation_two uuid := gen_random_uuid();
  v_device record;
  v_claim record;
  v_receipt_claim record;
  v_count integer;
  v_status text;
begin
  insert into public.users (id, email)
  values
    (v_user_a, 'push-smoke-a@example.test'),
    (v_user_b, 'push-smoke-b@example.test');

  select * into v_device
    from public.register_mobile_push_device(
      v_user_a,
      v_installation_id,
      'ExponentPushToken[abcdefghijklmnopqrstuv]',
      'native-token-a',
      'android',
      '00000000-0000-4000-8000-000000000001',
      '0.0.0'
    );
  if v_device.push_enabled is not true then
    raise exception 'first push registration was not enabled';
  end if;

  -- Reusing an installation under a different signed-in account must revoke A.
  select * into v_device
    from public.register_mobile_push_device(
      v_user_b,
      v_installation_id,
      'ExponentPushToken[abcdefghijklmnopqrstuv]',
      'native-token-b',
      'android',
      '00000000-0000-4000-8000-000000000001',
      '0.0.0'
    );

  select count(*) into v_count
    from public.mobile_push_devices
   where installation_id = v_installation_id
     and user_id = v_user_a
     and push_enabled;
  if v_count <> 0 then
    raise exception 'previous account retained an active device token';
  end if;

  select count(*) into v_count
    from public.mobile_push_devices
   where installation_id = v_installation_id
     and user_id = v_user_b
     and push_enabled
     and revoked_at is null
     and invalidated_at is null;
  if v_count <> 1 then
    raise exception 'new account did not own exactly one active device';
  end if;

  insert into public.generations (
    id, user_id, original_image_path, generated_image_path, prompt_used,
    options, status, model_provider
  ) values
    (
      v_generation_one,
      v_user_b,
      'original/push-one.webp',
      'generated/push-one.webp',
      'push one prompt',
      jsonb_build_object(
        'recommendationSet', jsonb_build_object(
          'selectedVariantId', 'push-v1',
          'variants', jsonb_build_array(jsonb_build_object(
            'id', 'push-v1',
            'status', 'completed',
            'generatedImagePath', 'generated/push-one.webp'
          ))
        )
      ),
      'completed',
      'test'
    ),
    (
      v_generation_two,
      v_user_b,
      'original/push-two.webp',
      null,
      'push two prompt',
      jsonb_build_object(
        'recommendationSet', jsonb_build_object(
          'variants', jsonb_build_array(jsonb_build_object(
            'id', 'push-v2',
            'status', 'failed'
          ))
        )
      ),
      'failed',
      'test'
    );

  insert into public.generation_notification_outbox (
    generation_id,
    user_id,
    terminal_kind,
    event_payload,
    recipient_email,
    idempotency_key
  ) values (
    v_generation_one,
    v_user_b,
    'completed',
    jsonb_build_object(
      'completedCount', 1,
      'failedCount', 0,
      'resultPath', '/generate/' || v_generation_one::text
    ),
    'push-smoke-b@example.test',
    'generation-terminal:email:' || v_generation_one::text
  );

  select count(*) into v_count
    from public.generation_push_outbox
   where generation_id = v_generation_one
     and user_id = v_user_b
     and status = 'pending';
  if v_count <> 1 then
    raise exception 'terminal email event did not enqueue one device push';
  end if;

  select * into v_claim
    from public.claim_generation_push_notifications(10, v_generation_one, 600);
  if v_claim.outbox_id is null or v_claim.device_expo_push_token is null then
    raise exception 'push outbox claim did not return an active token';
  end if;

  if not public.finish_generation_push_ticket(
    v_claim.outbox_id,
    v_claim.outbox_lease_token,
    '00000000-0000-4000-8000-000000000101'
  ) then
    raise exception 'push ticket acknowledgement was rejected';
  end if;

  update public.generation_push_outbox
     set available_at = now()
   where id = v_claim.outbox_id;

  select * into v_receipt_claim
    from public.claim_generation_push_receipts(10, 600)
   where outbox_id = v_claim.outbox_id;
  if v_receipt_claim.outbox_id is null then
    raise exception 'ticketed push was not claimable for receipt verification';
  end if;

  v_status := public.finish_generation_push_receipt(
    v_receipt_claim.outbox_id,
    v_receipt_claim.outbox_lease_token,
    'delivered',
    null,
    null
  );
  if v_status <> 'delivered' then
    raise exception 'successful receipt did not settle as delivered: %', v_status;
  end if;

  insert into public.generation_notification_outbox (
    generation_id,
    user_id,
    terminal_kind,
    event_payload,
    recipient_email,
    idempotency_key
  ) values (
    v_generation_two,
    v_user_b,
    'failed',
    jsonb_build_object(
      'completedCount', 0,
      'failedCount', 1,
      'resultPath', '/generate/' || v_generation_two::text
    ),
    'push-smoke-b@example.test',
    'generation-terminal:email:' || v_generation_two::text
  );

  select * into v_claim
    from public.claim_generation_push_notifications(10, v_generation_two, 600);
  v_status := public.retry_generation_push_notification(
    v_claim.outbox_id,
    v_claim.outbox_lease_token,
    'DeviceNotRegistered',
    'Device is no longer registered',
    false,
    true
  );
  if v_status <> 'invalid_token' then
    raise exception 'invalid token did not terminate its push row: %', v_status;
  end if;

  select count(*) into v_count
    from public.mobile_push_devices
   where id = v_claim.outbox_device_id
     and not push_enabled
     and invalidated_at is not null;
  if v_count <> 1 then
    raise exception 'DeviceNotRegistered did not invalidate the device';
  end if;

  -- Push lifecycle must not mutate or consume the email fallback rows.
  select count(*) into v_count
    from public.generation_notification_outbox
   where user_id = v_user_b
     and channel = 'email'
     and status = 'pending';
  if v_count <> 2 then
    raise exception 'push processing changed email fallback rows: %', v_count;
  end if;

  if has_table_privilege('authenticated', 'public.mobile_push_devices', 'SELECT')
     or has_table_privilege('authenticated', 'public.generation_push_outbox', 'SELECT') then
    raise exception 'authenticated role can read private push token or outbox data';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.register_mobile_push_device(text,uuid,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot register push devices';
  end if;
end;
$$;

select 'generation_push_notifications_smoke_ok' as result;

rollback;

begin;

insert into public.users (id, email, display_name, credits)
values ('user_account_deletion_smoke', 'account-deletion-smoke@example.com', '삭제 테스트', 20);

insert into public.generations (
  id,
  user_id,
  original_image_path,
  generated_image_path,
  prompt_used,
  options,
  status,
  credits_used
)
values (
  '10000000-0000-4000-8000-000000000051',
  'user_account_deletion_smoke',
  'originals/user_account_deletion_smoke/generation/reference.webp',
  'user_account_deletion_smoke/generation/selected.webp',
  'account deletion smoke',
  jsonb_build_object(
    'recommendationSet',
    jsonb_build_object(
      'selectedVariantId', 'variant-1',
      'variants',
      jsonb_build_array(
        jsonb_build_object(
          'id', 'variant-1',
          'generatedImagePath',
          'user_account_deletion_smoke/generation/variant.webp'
        )
      )
    )
  ),
  'completed',
  2
);

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
values (
  '10000000-0000-4000-8000-000000000052',
  'user_account_deletion_smoke',
  '10000000-0000-4000-8000-000000000052',
  'originals/user_account_deletion_smoke/draft/reference.webp',
  'image/webp',
  1024,
  repeat('a', 64),
  timezone('utc', now()) + interval '1 day'
);

insert into public.user_style_profiles (
  user_id,
  body_photo_path,
  body_photo_consent_at
)
values (
  'user_account_deletion_smoke',
  'user_account_deletion_smoke/body.webp',
  timezone('utc', now())
);

insert into public.styling_sessions (
  id,
  user_id,
  generation_id,
  selected_variant_id,
  occasion,
  mood,
  generated_image_path,
  status
)
values (
  '10000000-0000-4000-8000-000000000053',
  'user_account_deletion_smoke',
  '10000000-0000-4000-8000-000000000051',
  'variant-1',
  'daily',
  'natural',
  'user_account_deletion_smoke/styling/look.webp',
  'recommended'
);

insert into public.mobile_push_devices (
  user_id,
  installation_id,
  expo_push_token,
  platform,
  project_id
)
values (
  'user_account_deletion_smoke',
  '10000000-0000-4000-8000-000000000054',
  'ExpoPushToken[account_delete_smoke_token]',
  'android',
  'account-delete-smoke-project'
);

insert into public.user_hair_records (
  id,
  user_id,
  generation_id,
  style_name,
  service_type,
  service_date,
  next_visit_target_days
)
values (
  '10000000-0000-4000-8000-000000000055',
  'user_account_deletion_smoke',
  '10000000-0000-4000-8000-000000000051',
  '탈퇴 테스트 스타일',
  'cut',
  current_date,
  30
);

insert into public.user_aftercare_guides (
  id,
  user_id,
  hair_record_id,
  guide_json
)
values (
  '10000000-0000-4000-8000-000000000056',
  'user_account_deletion_smoke',
  '10000000-0000-4000-8000-000000000055',
  jsonb_build_object(
    'overview', jsonb_build_object(),
    'sections', jsonb_build_object(
      'dry', jsonb_build_object(),
      'treatment', jsonb_build_object(),
      'iron', jsonb_build_object(),
      'styling', jsonb_build_object()
    ),
    'maintenanceSchedule', jsonb_build_array(),
    'warnings', jsonb_build_array(),
    'recommendedNextActions', jsonb_build_array()
  )
);

insert into public.aftercare_program_receipts (
  id,
  user_id,
  generation_id,
  selected_variant_id,
  hair_record_id,
  aftercare_guide_id,
  state,
  free_reason,
  charged_credits,
  balance_after,
  care_scheduled_count
)
values (
  '10000000-0000-4000-8000-000000000057',
  'user_account_deletion_smoke',
  '10000000-0000-4000-8000-000000000051',
  'variant-1',
  '10000000-0000-4000-8000-000000000055',
  '10000000-0000-4000-8000-000000000056',
  'free',
  'first_aftercare_program',
  0,
  20,
  6
);

do $$
declare
  v_begin jsonb;
begin
  v_begin := public.begin_styling_execution(
    '10000000-0000-4000-8000-000000000053',
    'user_account_deletion_smoke',
    jsonb_build_object(
      'action', 'outfit_generation',
      'subjectId', '10000000-0000-4000-8000-000000000053',
      'billingScope', 'customer',
      'policyVersion', 'hairfit-credit-policy-2026-07',
      'costCredits', 20,
      'currentBalance', 20,
      'balanceAfter', 0,
      'isAllowed', true,
      'expiresAt', now() + interval '5 minutes',
      'quoteFingerprint', repeat('f', 64)
    )
  );

  if v_begin #>> '{creditReceipt,state}' <> 'reserved' then
    raise exception 'restrict-linked styling receipt was not created: %', v_begin;
  end if;
end;
$$;

do $$
declare
  v_request record;
  v_hash text;
  v_rows record;
  v_ids uuid[];
begin
  select *
    into v_request
    from public.request_account_deletion('user_account_deletion_smoke');

  if not v_request.user_deleted or v_request.queued_objects <> 6 or v_request.pending_objects <> 6 then
    raise exception 'account deletion did not atomically delete the user and queue six private objects: %',
      row_to_json(v_request);
  end if;

  if exists (select 1 from public.users where id = 'user_account_deletion_smoke') then
    raise exception 'account row survived deletion request';
  end if;

  if exists (
    select 1 from public.mobile_push_devices where user_id = 'user_account_deletion_smoke'
  ) then
    raise exception 'push token survived account cascade';
  end if;

  if exists (
    select 1
      from public.styling_credit_attempts
     where user_id = 'user_account_deletion_smoke'
  ) or exists (
    select 1
      from public.aftercare_program_receipts
     where user_id = 'user_account_deletion_smoke'
  ) then
    raise exception 'restrict-linked paid action receipts survived account cascade';
  end if;

  v_hash := public.account_deletion_user_hash('user_account_deletion_smoke');
  if not exists (
    select 1
      from public.account_deletion_tombstones
     where user_id_hash = v_hash
       and identity_deleted_at is null
  ) then
    raise exception 'hashed account deletion tombstone was not created';
  end if;

  begin
    perform public.ensure_user_profile(
      'user_account_deletion_smoke',
      'account-deletion-smoke@example.com',
      '재생성 금지'
    );
    raise exception 'deleted profile was recreated';
  exception
    when others then
      if sqlerrm <> 'account_deletion_requested' then
        raise;
      end if;
  end;

  select array_agg(outbox_id order by outbox_id)
    into v_ids
    from public.list_account_deletion_storage('user_account_deletion_smoke');

  if coalesce(array_length(v_ids, 1), 0) <> 6 then
    raise exception 'storage cleanup list did not return six objects';
  end if;

  if public.finish_account_deletion_storage(
    'user_account_deletion_smoke',
    v_ids
  ) <> 6 then
    raise exception 'storage deletion receipt did not fence all six rows';
  end if;

  select *
    into v_request
    from public.request_account_deletion('user_account_deletion_smoke');

  if v_request.user_deleted or v_request.queued_objects <> 0 or v_request.pending_objects <> 0 then
    raise exception 'account deletion retry was not idempotent: %', row_to_json(v_request);
  end if;

  perform public.complete_account_identity_deletion('user_account_deletion_smoke');

  if not exists (
    select 1
      from public.account_deletion_tombstones
     where user_id_hash = v_hash
       and storage_cleanup_completed_at is not null
       and identity_deleted_at is not null
       and last_error_code is null
  ) then
    raise exception 'account deletion completion receipt is incomplete';
  end if;

  update public.account_deletion_tombstones
     set expires_at = timezone('utc', now()) - interval '1 second'
   where user_id_hash = v_hash;

  if public.prune_account_deletion_tombstones(10) <> 1 then
    raise exception 'expired completed tombstone was not pruned';
  end if;

  if exists (
    select 1 from public.account_deletion_tombstones where user_id_hash = v_hash
  ) or exists (
    select 1 from public.account_deletion_storage_outbox where user_id_hash = v_hash
  ) then
    raise exception 'tombstone prune did not cascade completed storage receipts';
  end if;
end;
$$;

set local role authenticated;

do $$
begin
  begin
    perform * from public.request_account_deletion('user_account_deletion_smoke');
    raise exception 'authenticated role executed account deletion RPC';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform * from public.account_deletion_tombstones;
    raise exception 'authenticated role read deletion tombstones';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform * from public.account_deletion_storage_outbox;
    raise exception 'authenticated role read private storage cleanup paths';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;

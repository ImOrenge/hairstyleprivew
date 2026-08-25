-- Admin-only V2 entitlement grant and revoke actions.
-- Legacy credits remain available to customer billing/runtime compatibility paths,
-- but are no longer mutated through the admin member API.

alter table public.admin_action_receipts
  drop constraint if exists admin_action_receipts_action_type_check;

alter table public.admin_action_receipts
  add constraint admin_action_receipts_action_type_check
  check (action_type in (
    'credit_adjustment',
    'account_type_change',
    'refund_approval',
    'entitlement_grant',
    'entitlement_revoke'
  ));

create or replace function public.execute_admin_entitlement_grant_v2(
  p_action_key uuid,
  p_actor_user_id text,
  p_target_user_id text,
  p_offering_key text,
  p_expected_offering_version integer,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request jsonb;
  v_existing public.admin_action_receipts%rowtype;
  v_receipt public.admin_action_receipts%rowtype;
  v_offering public.product_offerings_v2%rowtype;
  v_grant public.customer_entitlement_grants_v2%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_expires_at timestamptz;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_active_count integer;
begin
  if p_action_key is null
    or btrim(coalesce(p_actor_user_id, '')) = ''
    or btrim(coalesce(p_target_user_id, '')) = ''
    or btrim(coalesce(p_offering_key, '')) = ''
    or p_expected_offering_version is null
    or p_expected_offering_version <= 0
    or v_reason = ''
    or length(v_reason) > 240
  then
    raise exception 'invalid_admin_entitlement_grant_request';
  end if;

  if not exists (
    select 1 from public.users
    where id = p_actor_user_id and account_type = 'admin'
  ) then
    raise exception 'admin_actor_forbidden';
  end if;

  v_request := jsonb_build_object(
    'offeringKey', p_offering_key,
    'expectedOfferingVersion', p_expected_offering_version,
    'reason', v_reason
  );

  perform pg_advisory_xact_lock(hashtextextended(p_action_key::text, 0));

  select * into v_existing
  from public.admin_action_receipts
  where action_key = p_action_key;

  if found then
    if v_existing.action_type <> 'entitlement_grant'
      or v_existing.actor_user_id <> p_actor_user_id
      or v_existing.target_resource_id <> p_target_user_id
      or v_existing.request_payload <> v_request
    then
      return jsonb_build_object(
        'outcome', 'conflict',
        'replayed', true,
        'errorCode', 'action_key_conflict',
        'receipt', to_jsonb(v_existing)
      );
    end if;

    return jsonb_build_object(
      'outcome', v_existing.status,
      'replayed', true,
      'errorCode', v_existing.error_code,
      'receipt', to_jsonb(v_existing),
      'entitlementGrant', v_existing.after_state -> 'entitlementGrant'
    );
  end if;

  perform 1
  from public.users
  where id = p_target_user_id
  for update;

  if not found then
    insert into public.admin_action_receipts (
      action_key, action_type, actor_user_id, target_user_id,
      target_resource_type, target_resource_id, status,
      request_payload, before_state, after_state,
      error_code, error_message, completed_at
    ) values (
      p_action_key, 'entitlement_grant', p_actor_user_id, p_target_user_id,
      'member_entitlement', p_target_user_id, 'failed',
      v_request, '{}'::jsonb, '{}'::jsonb,
      'member_not_found', 'Target member was not found', v_now
    ) returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'failed',
      'replayed', false,
      'errorCode', 'member_not_found',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  select * into v_offering
  from public.product_offerings_v2
  where offering_key = p_offering_key
    and offering_key like 'full_style_%'
    and status = 'active'
  order by version desc
  limit 1;

  if not found then
    insert into public.admin_action_receipts (
      action_key, action_type, actor_user_id, target_user_id,
      target_resource_type, target_resource_id, status,
      request_payload, before_state, after_state,
      error_code, error_message, completed_at
    ) values (
      p_action_key, 'entitlement_grant', p_actor_user_id, p_target_user_id,
      'member_entitlement', p_target_user_id, 'failed',
      v_request, '{}'::jsonb, '{}'::jsonb,
      'offering_not_grantable', 'Offering is not an active full-style product', v_now
    ) returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'failed',
      'replayed', false,
      'errorCode', 'offering_not_grantable',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  if v_offering.version <> p_expected_offering_version then
    insert into public.admin_action_receipts (
      action_key, action_type, actor_user_id, target_user_id,
      target_resource_type, target_resource_id, status,
      request_payload, before_state, after_state,
      error_code, error_message, completed_at
    ) values (
      p_action_key, 'entitlement_grant', p_actor_user_id, p_target_user_id,
      'member_entitlement', p_target_user_id, 'conflict',
      v_request,
      jsonb_build_object('activeOfferingVersion', v_offering.version),
      '{}'::jsonb,
      'offering_version_conflict', 'The active offering version changed', v_now
    ) returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'conflict',
      'replayed', false,
      'errorCode', 'offering_version_conflict',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  v_expires_at := case
    when v_offering.purchase_mode = 'one_time' and v_offering.billing_interval is null then null
    when v_offering.billing_interval = 'quarter' then v_now + interval '3 months'
    when v_offering.billing_interval = 'year' then v_now + interval '1 year'
    else null
  end;

  if v_offering.purchase_mode <> 'one_time'
    and v_offering.billing_interval not in ('quarter', 'year')
  then
    insert into public.admin_action_receipts (
      action_key, action_type, actor_user_id, target_user_id,
      target_resource_type, target_resource_id, status,
      request_payload, before_state, after_state,
      error_code, error_message, completed_at
    ) values (
      p_action_key, 'entitlement_grant', p_actor_user_id, p_target_user_id,
      'member_entitlement', p_target_user_id, 'failed',
      v_request, '{}'::jsonb, '{}'::jsonb,
      'offering_not_grantable', 'Offering term is unsupported for a manual grant', v_now
    ) returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'failed',
      'replayed', false,
      'errorCode', 'offering_not_grantable',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  select count(*)::integer into v_active_count
  from public.customer_entitlement_grants_v2
  where user_id = p_target_user_id
    and status = 'active'
    and valid_from <= v_now
    and (expires_at is null or expires_at > v_now)
    and quantity_consumed < quantity_granted;

  insert into public.admin_action_receipts (
    action_key, action_type, actor_user_id, target_user_id,
    target_resource_type, target_resource_id, status,
    request_payload, before_state, after_state
  ) values (
    p_action_key, 'entitlement_grant', p_actor_user_id, p_target_user_id,
    'member_entitlement', p_target_user_id, 'processing',
    v_request,
    jsonb_build_object('activeGrantCount', v_active_count),
    '{}'::jsonb
  ) returning * into v_receipt;

  insert into public.customer_entitlement_grants_v2 (
    user_id, offering_id, offering_key, offering_version,
    capability_snapshot, quantity_granted, quantity_consumed,
    status, source, source_transaction_id, valid_from, expires_at
  ) values (
    p_target_user_id, v_offering.id, v_offering.offering_key, v_offering.version,
    v_offering.capabilities, v_offering.included_consultation_sessions, 0,
    'active', 'manual', 'admin-action:' || p_action_key::text, v_now, v_expires_at
  ) returning * into v_grant;

  update public.admin_action_receipts
  set status = 'succeeded',
      after_state = jsonb_build_object(
        'entitlementGrant', to_jsonb(v_grant),
        'reason', v_reason,
        'complimentary', true
      ),
      completed_at = v_now
  where id = v_receipt.id
  returning * into v_receipt;

  return jsonb_build_object(
    'outcome', 'succeeded',
    'replayed', false,
    'receipt', to_jsonb(v_receipt),
    'entitlementGrant', to_jsonb(v_grant)
  );
end;
$$;

create or replace function public.execute_admin_entitlement_revoke_v2(
  p_action_key uuid,
  p_actor_user_id text,
  p_target_user_id text,
  p_grant_id uuid,
  p_expected_status text,
  p_expected_quantity_consumed integer,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request jsonb;
  v_existing public.admin_action_receipts%rowtype;
  v_receipt public.admin_action_receipts%rowtype;
  v_grant public.customer_entitlement_grants_v2%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_linked_consultation_id uuid;
begin
  if p_action_key is null
    or btrim(coalesce(p_actor_user_id, '')) = ''
    or btrim(coalesce(p_target_user_id, '')) = ''
    or p_grant_id is null
    or p_expected_status <> 'active'
    or p_expected_quantity_consumed <> 0
    or v_reason = ''
    or length(v_reason) > 240
  then
    raise exception 'invalid_admin_entitlement_revoke_request';
  end if;

  if not exists (
    select 1 from public.users
    where id = p_actor_user_id and account_type = 'admin'
  ) then
    raise exception 'admin_actor_forbidden';
  end if;

  v_request := jsonb_build_object(
    'grantId', p_grant_id,
    'expectedStatus', p_expected_status,
    'expectedQuantityConsumed', p_expected_quantity_consumed,
    'reason', v_reason
  );

  perform pg_advisory_xact_lock(hashtextextended(p_action_key::text, 0));

  select * into v_existing
  from public.admin_action_receipts
  where action_key = p_action_key;

  if found then
    if v_existing.action_type <> 'entitlement_revoke'
      or v_existing.actor_user_id <> p_actor_user_id
      or v_existing.target_resource_id <> p_grant_id::text
      or v_existing.request_payload <> v_request
    then
      return jsonb_build_object(
        'outcome', 'conflict',
        'replayed', true,
        'errorCode', 'action_key_conflict',
        'receipt', to_jsonb(v_existing)
      );
    end if;

    return jsonb_build_object(
      'outcome', v_existing.status,
      'replayed', true,
      'errorCode', v_existing.error_code,
      'receipt', to_jsonb(v_existing),
      'entitlementGrant', v_existing.after_state -> 'entitlementGrant'
    );
  end if;

  select * into v_grant
  from public.customer_entitlement_grants_v2
  where id = p_grant_id
    and user_id = p_target_user_id
  for update;

  if not found then
    insert into public.admin_action_receipts (
      action_key, action_type, actor_user_id, target_user_id,
      target_resource_type, target_resource_id, status,
      request_payload, before_state, after_state,
      error_code, error_message, completed_at
    ) values (
      p_action_key, 'entitlement_revoke', p_actor_user_id, p_target_user_id,
      'entitlement_grant', p_grant_id::text, 'failed',
      v_request, '{}'::jsonb, '{}'::jsonb,
      'entitlement_not_found', 'Entitlement grant was not found', v_now
    ) returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'failed',
      'replayed', false,
      'errorCode', 'entitlement_not_found',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  if v_grant.status <> p_expected_status
    or v_grant.quantity_consumed <> p_expected_quantity_consumed
  then
    insert into public.admin_action_receipts (
      action_key, action_type, actor_user_id, target_user_id,
      target_resource_type, target_resource_id, status,
      request_payload, before_state, after_state,
      error_code, error_message, completed_at
    ) values (
      p_action_key, 'entitlement_revoke', p_actor_user_id, p_target_user_id,
      'entitlement_grant', p_grant_id::text, 'conflict',
      v_request, to_jsonb(v_grant), '{}'::jsonb,
      'entitlement_state_conflict', 'Entitlement state changed before revoke', v_now
    ) returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'conflict',
      'replayed', false,
      'errorCode', 'entitlement_state_conflict',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  if v_grant.source <> 'manual'
    or v_grant.status <> 'active'
    or v_grant.quantity_consumed <> 0
    or (v_grant.expires_at is not null and v_grant.expires_at <= v_now)
  then
    insert into public.admin_action_receipts (
      action_key, action_type, actor_user_id, target_user_id,
      target_resource_type, target_resource_id, status,
      request_payload, before_state, after_state,
      error_code, error_message, completed_at
    ) values (
      p_action_key, 'entitlement_revoke', p_actor_user_id, p_target_user_id,
      'entitlement_grant', p_grant_id::text, 'conflict',
      v_request, to_jsonb(v_grant), '{}'::jsonb,
      'entitlement_not_revocable', 'Only active unused manual grants can be revoked', v_now
    ) returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'conflict',
      'replayed', false,
      'errorCode', 'entitlement_not_revocable',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  select id into v_linked_consultation_id
  from public.consultation_sessions
  where entitlement_grant_id = p_grant_id
    and lifecycle_state not in ('completed', 'cancelled')
  order by created_at desc
  limit 1;

  if v_linked_consultation_id is not null
    or exists (
      select 1
      from public.entitlement_consumptions_v2
      where grant_id = p_grant_id
        and state in ('reserved', 'consumed')
    )
  then
    insert into public.admin_action_receipts (
      action_key, action_type, actor_user_id, target_user_id,
      target_resource_type, target_resource_id, status,
      request_payload, before_state, after_state,
      error_code, error_message, completed_at
    ) values (
      p_action_key, 'entitlement_revoke', p_actor_user_id, p_target_user_id,
      'entitlement_grant', p_grant_id::text, 'conflict',
      v_request, to_jsonb(v_grant), '{}'::jsonb,
      'entitlement_in_use', 'Entitlement is linked to an active consultation', v_now
    ) returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'conflict',
      'replayed', false,
      'errorCode', 'entitlement_in_use',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  insert into public.admin_action_receipts (
    action_key, action_type, actor_user_id, target_user_id,
    target_resource_type, target_resource_id, status,
    request_payload, before_state, after_state
  ) values (
    p_action_key, 'entitlement_revoke', p_actor_user_id, p_target_user_id,
    'entitlement_grant', p_grant_id::text, 'processing',
    v_request, to_jsonb(v_grant), '{}'::jsonb
  ) returning * into v_receipt;

  update public.customer_entitlement_grants_v2
  set status = 'revoked',
      updated_at = v_now
  where id = p_grant_id
  returning * into v_grant;

  update public.admin_action_receipts
  set status = 'succeeded',
      after_state = jsonb_build_object(
        'entitlementGrant', to_jsonb(v_grant),
        'reason', v_reason
      ),
      completed_at = v_now
  where id = v_receipt.id
  returning * into v_receipt;

  return jsonb_build_object(
    'outcome', 'succeeded',
    'replayed', false,
    'receipt', to_jsonb(v_receipt),
    'entitlementGrant', to_jsonb(v_grant)
  );
end;
$$;

revoke all on function public.execute_admin_entitlement_grant_v2(uuid, text, text, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.execute_admin_entitlement_revoke_v2(uuid, text, text, uuid, text, integer, text)
  from public, anon, authenticated;

grant execute on function public.execute_admin_entitlement_grant_v2(uuid, text, text, text, integer, text)
  to service_role;
grant execute on function public.execute_admin_entitlement_revoke_v2(uuid, text, text, uuid, text, integer, text)
  to service_role;

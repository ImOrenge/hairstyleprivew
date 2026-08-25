-- Recreate the entitlement acceptance function after correcting NULLIF usage.
-- Accept a durable 3x3 generation against a V2 product entitlement without
-- weakening the existing 10-credit reservation contract.
create or replace function public.accept_entitled_generation_upload_draft_v2(
  p_draft_id uuid,
  p_user_id text,
  p_consultation_id uuid,
  p_offering_key text,
  p_style_target text,
  p_options jsonb,
  p_generated_assets_expires_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_draft public.generation_upload_drafts%rowtype;
  v_generation public.generations%rowtype;
  v_outbox public.generation_workflow_outbox%rowtype;
  v_session public.consultation_sessions%rowtype;
  v_consumption public.entitlement_consumptions_v2%rowtype;
  v_grant public.customer_entitlement_grants_v2%rowtype;
  v_consumption_receipt jsonb;
  v_options jsonb;
begin
  if p_draft_id is null then
    raise exception 'p_draft_id is required';
  end if;
  if nullif(pg_catalog.btrim(p_user_id), '') is null then
    raise exception 'p_user_id is required';
  end if;
  if p_consultation_id is null then
    raise exception 'p_consultation_id is required';
  end if;
  if p_offering_key is null or p_offering_key not in (
    'free_hair_demo',
    'full_style_once',
    'full_style_quarterly',
    'full_style_annual'
  ) then
    raise exception 'ENTITLEMENT_OFFERING_NOT_SUPPORTED' using errcode = '22023';
  end if;
  if p_style_target is null or p_style_target not in ('male', 'female') then
    raise exception 'p_style_target must be male or female';
  end if;
  if p_options is null or pg_catalog.jsonb_typeof(p_options) <> 'object' then
    raise exception 'p_options must be a JSON object';
  end if;
  if p_generated_assets_expires_at is not null
     and p_generated_assets_expires_at <= v_now then
    raise exception 'p_generated_assets_expires_at must be in the future';
  end if;

  select draft.*
    into v_draft
    from public.generation_upload_drafts as draft
   where draft.id = p_draft_id
     and draft.user_id = p_user_id
   for update;

  if not found then
    raise exception 'Upload draft % was not found for this user', p_draft_id;
  end if;

  if v_draft.state = 'accepted' then
    select generation.*
      into v_generation
      from public.generations as generation
     where generation.id = v_draft.generation_id;

    select outbox.*
      into v_outbox
      from public.generation_workflow_outbox as outbox
     where outbox.generation_id = v_draft.generation_id;

    if v_generation.id is null
       or v_outbox.id is null
       or v_generation.user_id <> p_user_id
       or v_generation.accepted_at is null then
      raise exception 'Accepted upload draft % has an incomplete durable receipt', p_draft_id;
    end if;

    return pg_catalog.jsonb_build_object(
      'draftId', v_draft.id,
      'generationId', v_generation.id,
      'acceptedAt', v_generation.accepted_at,
      'preparationStatus', v_generation.preparation_status,
      'workflowOutboxId', v_outbox.id,
      'workflowDispatchStatus', v_outbox.status,
      'creditReceipt', null,
      'billingMode', 'entitlement_v2',
      'idempotentReplay', true
    );
  end if;

  if v_draft.state = 'expired' or v_draft.expires_at <= v_now then
    raise exception 'Upload draft % has expired', p_draft_id;
  end if;
  if v_draft.state <> 'ready' then
    raise exception 'Upload draft % cannot be accepted from state %', p_draft_id, v_draft.state;
  end if;

  select session.*
    into v_session
    from public.consultation_sessions as session
   where session.id = p_consultation_id
     and session.user_id = p_user_id
   for update;

  if not found then
    raise exception 'CONSULTATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select consumption.*
    into v_consumption
    from public.entitlement_consumptions_v2 as consumption
    join public.customer_entitlement_grants_v2 as entitlement_grant
      on entitlement_grant.id = consumption.grant_id
   where consumption.user_id = p_user_id
     and consumption.consultation_id = p_consultation_id
     and consumption.state <> 'restored'
     and entitlement_grant.user_id = p_user_id
     and entitlement_grant.offering_key = p_offering_key
     and entitlement_grant.status <> 'revoked'
   order by consumption.created_at
   limit 1
   for update of consumption;

  if not found then
    v_consumption_receipt := public.consume_entitlement_v2(
      p_user_id,
      p_offering_key,
      p_consultation_id,
      'generation-entitlement:' || p_draft_id::text
    );

    select consumption.*
      into v_consumption
      from public.entitlement_consumptions_v2 as consumption
     where consumption.id = (v_consumption_receipt ->> 'id')::uuid
       and consumption.user_id = p_user_id
       and consumption.consultation_id = p_consultation_id
       and consumption.state <> 'restored'
     for update;

    if not found then
      raise exception 'ENTITLEMENT_CONSUMPTION_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  select entitlement_grant.*
    into v_grant
    from public.customer_entitlement_grants_v2 as entitlement_grant
   where entitlement_grant.id = v_consumption.grant_id
     and entitlement_grant.user_id = p_user_id
     and entitlement_grant.offering_key = p_offering_key
     and entitlement_grant.status <> 'revoked'
   for update;

  if not found then
    raise exception 'ENTITLEMENT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.consultation_sessions as session
     set entitlement_grant_id = v_grant.id,
         user_restart_limit = pg_catalog.coalesce(
           (v_grant.capability_snapshot ->> 'hairRestartCount')::integer,
           session.user_restart_limit
         ),
         retention_policy_days = pg_catalog.coalesce(
           (v_grant.capability_snapshot ->> 'generatedAssetRetentionDays')::integer,
           session.retention_policy_days
         ),
         updated_at = v_now
   where session.id = p_consultation_id
     and session.user_id = p_user_id;

  v_options := p_options || pg_catalog.jsonb_build_object(
    'styleTarget', p_style_target,
    'uploadDraftId', p_draft_id,
    'entitlementBilling', pg_catalog.jsonb_build_object(
      'mode', 'entitlement_v2',
      'offeringKey', v_grant.offering_key,
      'offeringVersion', v_grant.offering_version,
      'grantId', v_grant.id,
      'consumptionId', v_consumption.id,
      'reservedCredits', 0
    )
  );

  insert into public.generations (
    id,
    user_id,
    original_image_path,
    prompt_used,
    options,
    status,
    error_message,
    credits_used,
    model_provider,
    model_name,
    accepted_at,
    generated_assets_expires_at,
    preparation_status,
    preparation_attempt_count,
    preparation_available_at,
    preparation_error,
    completion_notification_status,
    created_at,
    updated_at
  )
  values (
    p_draft_id,
    p_user_id,
    v_draft.original_image_path,
    '',
    v_options,
    'queued',
    null,
    0,
    'gemini',
    null,
    v_now,
    p_generated_assets_expires_at,
    'queued',
    0,
    v_now,
    null,
    'pending',
    v_now,
    v_now
  )
  returning * into v_generation;

  insert into public.generation_workflow_outbox (
    generation_id,
    dispatch_key,
    payload,
    status,
    available_at
  )
  values (
    v_generation.id,
    'generation-workflow:' || v_generation.id::text,
    pg_catalog.jsonb_build_object(
      'generationId', v_generation.id,
      'draftId', v_draft.id,
      'userId', v_generation.user_id,
      'acceptedAt', v_generation.accepted_at,
      'entitlementConsumptionId', v_consumption.id
    ),
    'queued',
    v_now
  )
  returning * into v_outbox;

  update public.generation_upload_drafts as draft
     set state = 'accepted',
         generation_id = v_generation.id,
         accepted_at = v_generation.accepted_at,
         updated_at = v_now
   where draft.id = v_draft.id;

  return pg_catalog.jsonb_build_object(
    'draftId', v_draft.id,
    'generationId', v_generation.id,
    'acceptedAt', v_generation.accepted_at,
    'preparationStatus', v_generation.preparation_status,
    'workflowOutboxId', v_outbox.id,
    'workflowDispatchStatus', v_outbox.status,
    'creditReceipt', null,
    'billingMode', 'entitlement_v2',
    'entitlementConsumptionId', v_consumption.id,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.accept_entitled_generation_upload_draft_v2(
  uuid, text, uuid, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.accept_entitled_generation_upload_draft_v2(
  uuid, text, uuid, text, text, jsonb, timestamptz
) to service_role;

comment on function public.accept_entitled_generation_upload_draft_v2(
  uuid, text, uuid, text, text, jsonb, timestamptz
) is 'Atomically consumes a V2 HairFit entitlement and accepts one durable 3x3 generation without a legacy credit reservation.';

;

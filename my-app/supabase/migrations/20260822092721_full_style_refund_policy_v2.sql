-- Full-style statutory withdrawal, paid service activation, and refund quote evidence.
-- The customer-facing policy is versioned independently from legacy credit refunds.

alter table public.full_style_contracts_v2
  add column if not exists contract_document_delivered_at timestamptz,
  add column if not exists statutory_withdrawal_deadline timestamptz,
  add column if not exists refund_policy_version text;

update public.full_style_contracts_v2
set
  contract_document_delivered_at = coalesce(contract_document_delivered_at, created_at),
  statutory_withdrawal_deadline = coalesce(statutory_withdrawal_deadline, created_at + interval '7 days'),
  refund_policy_version = coalesce(refund_policy_version, 'full-style-refund-2026-08-22-v1');

alter table public.full_style_contracts_v2
  alter column contract_document_delivered_at set not null,
  alter column statutory_withdrawal_deadline set not null,
  alter column refund_policy_version set not null;

alter table public.entitlement_consumptions_v2
  drop constraint if exists entitlement_consumptions_v2_consultation_id_key;
create unique index if not exists uq_entitlement_consumptions_v2_consultation_grant
  on public.entitlement_consumptions_v2(consultation_id,grant_id)
  where state<>'restored';

create table if not exists public.full_style_service_activations_v2 (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.full_style_contracts_v2(id) on delete restrict,
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  entitlement_grant_id uuid not null references public.customer_entitlement_grants_v2(id) on delete restrict,
  consultation_id uuid not null references public.consultation_sessions(id) on delete restrict,
  user_id text not null references public.users(id) on delete cascade,
  start_trigger text not null check(start_trigger in ('paid_preview_generation','demo_upgrade_compare')),
  refund_policy_version text not null,
  consented_at timestamptz not null,
  started_at timestamptz not null default timezone('utc',now()),
  created_at timestamptz not null default timezone('utc',now()),
  unique(contract_id,consultation_id),
  unique(entitlement_grant_id,consultation_id)
);
create index if not exists idx_full_style_service_activations_contract_started
  on public.full_style_service_activations_v2(contract_id,started_at);
create index if not exists idx_full_style_service_activations_user
  on public.full_style_service_activations_v2(user_id,started_at desc);

alter table public.full_style_service_activations_v2 enable row level security;
alter table public.full_style_service_activations_v2 force row level security;
revoke all on table public.full_style_service_activations_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.full_style_service_activations_v2 to service_role;

create or replace function public.activate_full_style_consultation_v2(
  p_user_id text,
  p_consultation_id uuid,
  p_start_trigger text,
  p_refund_policy_version text,
  p_consented_at timestamptz
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_session public.consultation_sessions%rowtype;
  v_grant public.customer_entitlement_grants_v2%rowtype;
  v_contract public.full_style_contracts_v2%rowtype;
  v_activation public.full_style_service_activations_v2%rowtype;
  v_consumption public.entitlement_consumptions_v2%rowtype;
  v_started_at timestamptz:=timezone('utc',now());
  v_consumption_state text;
begin
  if p_start_trigger not in ('paid_preview_generation','demo_upgrade_compare') then
    raise exception 'INVALID_START_TRIGGER' using errcode='22023';
  end if;
  if p_refund_policy_version<>'full-style-refund-2026-08-22-v1' then
    raise exception 'REFUND_POLICY_VERSION_MISMATCH' using errcode='22023';
  end if;
  if p_consented_at is null or p_consented_at>v_started_at+interval '5 minutes'
     or p_consented_at<v_started_at-interval '30 minutes' then
    raise exception 'PAID_START_CONSENT_REQUIRED' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id||':'||p_consultation_id::text,0));
  select * into v_session from public.consultation_sessions
    where id=p_consultation_id and user_id=p_user_id for update;
  if not found then raise exception 'CONSULTATION_NOT_FOUND' using errcode='P0002'; end if;

  select * into v_grant from public.customer_entitlement_grants_v2
    where id=v_session.entitlement_grant_id and user_id=p_user_id
      and offering_key like 'full_style_%' for update;
  if not found or v_grant.status='revoked' then
    raise exception 'PAID_FULL_STYLE_REQUIRED' using errcode='P0001';
  end if;

  select * into v_contract from public.full_style_contracts_v2
    where user_id=p_user_id and latest_payment_transaction_id::text=v_grant.source_transaction_id
      and offering_key=v_grant.offering_key
    order by created_at desc limit 1 for update;
  if not found then raise exception 'FULL_STYLE_CONTRACT_NOT_FOUND' using errcode='P0002'; end if;

  select * into v_activation from public.full_style_service_activations_v2
    where contract_id=v_contract.id and consultation_id=p_consultation_id;
  if found then
    return jsonb_build_object(
      'activationId',v_activation.id,'contractId',v_contract.id,'consultationId',p_consultation_id,
      'startTrigger',v_activation.start_trigger,'startedAt',v_activation.started_at,
      'statutoryWithdrawalDeadline',v_contract.statutory_withdrawal_deadline,'replayed',true
    );
  end if;

  select * into v_consumption from public.entitlement_consumptions_v2
    where consultation_id=p_consultation_id and grant_id=v_grant.id and state<>'restored' for update;
  if not found then
    if v_grant.status not in ('active','exhausted') or v_grant.quantity_consumed>=v_grant.quantity_granted then
      raise exception 'ENTITLEMENT_UNAVAILABLE' using errcode='P0001';
    end if;
    v_consumption_state:=case when p_start_trigger='demo_upgrade_compare' then 'consumed' else 'reserved' end;
    insert into public.entitlement_consumptions_v2(
      grant_id,user_id,consultation_id,idempotency_key,state,settled_at
    ) values (
      v_grant.id,p_user_id,p_consultation_id,
      'paid-start:'||p_consultation_id::text||':'||v_grant.id::text,
      v_consumption_state,
      case when v_consumption_state='consumed' then v_started_at else null end
    ) returning * into v_consumption;
    update public.customer_entitlement_grants_v2 set
      quantity_consumed=quantity_consumed+1,
      status=case when quantity_consumed+1>=quantity_granted then 'exhausted' else 'active' end,
      updated_at=v_started_at
      where id=v_grant.id;
  elsif p_start_trigger='demo_upgrade_compare' and v_consumption.state='reserved' then
    update public.entitlement_consumptions_v2 set state='consumed',settled_at=v_started_at
      where id=v_consumption.id returning * into v_consumption;
  end if;

  insert into public.full_style_service_activations_v2(
    contract_id,payment_transaction_id,entitlement_grant_id,consultation_id,user_id,
    start_trigger,refund_policy_version,consented_at,started_at
  ) values (
    v_contract.id,v_contract.latest_payment_transaction_id,v_grant.id,p_consultation_id,p_user_id,
    p_start_trigger,p_refund_policy_version,p_consented_at,v_started_at
  ) returning * into v_activation;

  update public.full_style_contracts_v2 set
    statutory_withdrawal_deadline=
      greatest(contract_document_delivered_at,v_started_at)+interval '7 days',
    updated_at=v_started_at
    where id=v_contract.id
    returning * into v_contract;

  return jsonb_build_object(
    'activationId',v_activation.id,'contractId',v_contract.id,'consultationId',p_consultation_id,
    'startTrigger',v_activation.start_trigger,'startedAt',v_activation.started_at,
    'statutoryWithdrawalDeadline',v_contract.statutory_withdrawal_deadline,
    'entitlementConsumptionId',v_consumption.id,'replayed',false
  );
end $$;
revoke execute on function public.activate_full_style_consultation_v2(text,uuid,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.activate_full_style_consultation_v2(text,uuid,text,text,timestamptz)
  to service_role;

alter table public.payment_refund_quotes
  drop constraint if exists payment_refund_quotes_reason_category_check;
alter table public.payment_refund_quotes
  add constraint payment_refund_quotes_reason_category_check check(reason_category in (
    'changed_mind','accidental_renewal','price','quality_expectation','technical_issue',
    'duplicate_charge','unauthorized_charge','privacy_or_safety','overpayment',
    'service_not_delivered','service_not_as_described','other'
  )),
  add column if not exists product_family text check(product_family is null or product_family='full_style'),
  add column if not exists full_style_contract_id uuid references public.full_style_contracts_v2(id) on delete set null,
  add column if not exists contract_document_delivered_at timestamptz,
  add column if not exists service_started_at timestamptz,
  add column if not exists statutory_withdrawal_deadline timestamptz,
  add column if not exists full_style_started_sessions integer check(full_style_started_sessions is null or full_style_started_sessions>=0),
  add column if not exists full_style_unused_sessions integer check(full_style_unused_sessions is null or full_style_unused_sessions>=0),
  add column if not exists full_style_session_unit_amount_krw integer check(full_style_session_unit_amount_krw is null or full_style_session_unit_amount_krw>=0),
  add column if not exists refund_eligibility_code text check(refund_eligibility_code is null or refund_eligibility_code in (
    'statutory_withdrawal','started_session_restriction','window_expired','exception_review'
  )),
  add column if not exists eligible_for_immediate_refund boolean;

create index if not exists idx_payment_refund_quotes_full_style_contract
  on public.payment_refund_quotes(full_style_contract_id,created_at desc)
  where full_style_contract_id is not null;

create or replace function public.submit_full_style_refund_request_v2(
  p_user_id text,
  p_quote_id uuid,
  p_idempotency_key uuid,
  p_accepted_amount_krw integer,
  p_answers jsonb
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_quote public.payment_refund_quotes%rowtype;
  v_existing public.payment_refund_requests%rowtype;
  v_request public.payment_refund_requests%rowtype;
  v_support public.refund_support_cases%rowtype;
  v_status text;
  v_decision text;
  v_detail text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into v_existing from public.payment_refund_requests where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.user_id<>p_user_id or v_existing.quote_id<>p_quote_id then
      raise exception 'refund_idempotency_conflict';
    end if;
    return to_jsonb(v_existing);
  end if;

  select * into v_quote from public.payment_refund_quotes
    where id=p_quote_id and user_id=p_user_id and product_family='full_style' for update;
  if not found then raise exception 'refund_quote_not_found'; end if;
  if v_quote.consumed_at is not null then raise exception 'refund_quote_consumed'; end if;
  if v_quote.expires_at<=timezone('utc',now()) then raise exception 'refund_quote_expired'; end if;
  if v_quote.refund_amount_krw<>p_accepted_amount_krw then raise exception 'refund_quote_amount_changed'; end if;
  if v_quote.outcome_choice='immediate_refund_and_cancel'
     and coalesce(v_quote.eligible_for_immediate_refund,false)=false
     and v_quote.refund_eligibility_code<>'exception_review' then
    raise exception 'refund_not_eligible';
  end if;

  v_status:=case when v_quote.outcome_choice='cancel_at_period_end'
    then 'period_end_scheduled' else 'manual_review_required' end;
  v_decision:=case when v_quote.outcome_choice='cancel_at_period_end'
    then 'period_end' else 'manual' end;
  v_detail:=left(btrim(coalesce(p_answers->>'detail','')),500);

  insert into public.payment_refund_requests(
    payment_transaction_id,user_id,requested_by,refund_type,amount_krw,reason,status,
    quote_id,idempotency_key,outcome_choice,reason_category,decision,risk_codes,
    policy_version,original_amount_krw,provider_cancellable_amount_krw,
    credits_granted,credits_remaining,credits_to_claw_back,preserved_credits,metadata
  ) values (
    v_quote.payment_transaction_id,p_user_id,p_user_id,
    case when v_quote.refund_amount_krw=v_quote.original_amount_krw then 'full' else 'partial' end,
    case when v_quote.refund_amount_krw=v_quote.original_amount_krw then null else v_quote.refund_amount_krw end,
    coalesce(nullif(v_detail,''),v_quote.reason_category),v_status,
    v_quote.id,p_idempotency_key,v_quote.outcome_choice,v_quote.reason_category,v_decision,
    v_quote.risk_codes,v_quote.policy_version,v_quote.original_amount_krw,
    v_quote.provider_cancellable_amount_krw,v_quote.credits_granted,v_quote.credits_remaining,
    v_quote.credits_to_claw_back,v_quote.preserved_credits,
    jsonb_build_object(
      'source','full_style_refund_interview','productFamily','full_style',
      'fullStyleContractId',v_quote.full_style_contract_id,
      'eligibilityCode',v_quote.refund_eligibility_code,
      'startedSessions',v_quote.full_style_started_sessions,
      'unusedSessions',v_quote.full_style_unused_sessions
    )
  ) returning * into v_request;

  insert into public.refund_interview_responses(refund_request_id,user_id,reason_category,answers)
    values(v_request.id,p_user_id,v_quote.reason_category,coalesce(p_answers,'{}'::jsonb));

  if v_quote.refund_eligibility_code='exception_review' then
    insert into public.refund_support_cases(refund_request_id,user_id,priority,reason_category,summary)
    values(
      v_request.id,p_user_id,
      case when v_quote.reason_category in ('unauthorized_charge','privacy_or_safety') then 'urgent' else 'high' end,
      v_quote.reason_category,coalesce(nullif(v_detail,''),v_quote.reason_category)
    ) returning * into v_support;
    update public.payment_refund_requests set support_case_id=v_support.id
      where id=v_request.id returning * into v_request;
  end if;

  if v_quote.outcome_choice='cancel_at_period_end' then
    update public.full_style_contracts_v2 set
      cancel_at_period_end=true,status='cancel_at_period_end',
      cancelled_at=coalesce(cancelled_at,period_ends_at),updated_at=timezone('utc',now())
      where id=v_quote.full_style_contract_id and user_id=p_user_id;
  else
    update public.full_style_contracts_v2 set status='refund_review',updated_at=timezone('utc',now())
      where id=v_quote.full_style_contract_id and user_id=p_user_id;
  end if;

  insert into public.refund_notification_outbox(refund_request_id,user_id,event_type,channels,event_payload)
  values(
    v_request.id,p_user_id,
    case when v_status='period_end_scheduled' then 'period_end_scheduled' else 'manual_review' end,
    array['in_app','email','push']::text[],
    jsonb_build_object('status',v_status,'refundAmountKrw',v_quote.refund_amount_krw)
  );
  update public.payment_refund_quotes set consumed_at=timezone('utc',now()) where id=v_quote.id;
  return to_jsonb(v_request);
end $$;
revoke execute on function public.submit_full_style_refund_request_v2(text,uuid,uuid,integer,jsonb)
  from public,anon,authenticated;
grant execute on function public.submit_full_style_refund_request_v2(text,uuid,uuid,integer,jsonb)
  to service_role;

create or replace function public.finalize_full_style_refund_v2(
  p_payment_transaction_id uuid,
  p_refund_request_id uuid
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_request public.payment_refund_requests%rowtype;
  v_quote public.payment_refund_quotes%rowtype;
  v_contract public.full_style_contracts_v2%rowtype;
  v_grant public.customer_entitlement_grants_v2%rowtype;
  v_now timestamptz:=timezone('utc',now());
  v_full_refund boolean;
  v_exception_partial boolean;
  v_grant_found boolean:=false;
begin
  select * into v_request from public.payment_refund_requests
    where id=p_refund_request_id and payment_transaction_id=p_payment_transaction_id for update;
  if not found then raise exception 'refund_request_not_found'; end if;
  select * into v_quote from public.payment_refund_quotes
    where id=v_request.quote_id and product_family='full_style' for update;
  if not found then raise exception 'full_style_refund_quote_not_found'; end if;
  select * into v_contract from public.full_style_contracts_v2
    where id=v_quote.full_style_contract_id for update;
  if not found then raise exception 'full_style_contract_not_found'; end if;
  select * into v_grant from public.customer_entitlement_grants_v2
    where source='portone' and source_transaction_id=p_payment_transaction_id::text
      and offering_key=v_contract.offering_key for update;
  v_grant_found:=found;

  v_full_refund:=v_quote.refund_amount_krw>=v_quote.original_amount_krw;
  v_exception_partial:=v_quote.refund_eligibility_code='exception_review' and not v_full_refund;
  if v_grant_found then
    if v_full_refund then
      update public.customer_entitlement_grants_v2 set
        quantity_granted=quantity_consumed,
        status=case when quantity_consumed=0 then 'revoked' else 'exhausted' end,
        updated_at=v_now where id=v_grant.id;
    elsif not v_exception_partial then
      update public.customer_entitlement_grants_v2 set
        quantity_granted=greatest(quantity_consumed,quantity_granted-coalesce(v_quote.full_style_unused_sessions,0)),
        status='exhausted',updated_at=v_now where id=v_grant.id;
    end if;
  end if;

  update public.full_style_contracts_v2 set
    status=case
      when v_full_refund then 'refunded'
      when not v_exception_partial then 'cancelled'
      when billing_interval is not null then 'cancel_at_period_end'
      else 'active' end,
    cancel_at_period_end=case when billing_interval is not null or not v_exception_partial then true else cancel_at_period_end end,
    cancelled_at=case when v_exception_partial and billing_interval is not null then period_ends_at when not v_exception_partial then v_now else cancelled_at end,
    next_billing_at=case when billing_interval is not null or not v_exception_partial then null else next_billing_at end,
    billing_key_encrypted=case when billing_interval is not null or not v_exception_partial then null else billing_key_encrypted end,
    billing_key_hash=case when billing_interval is not null or not v_exception_partial then null else billing_key_hash end,
    billing_key_masked=case when billing_interval is not null or not v_exception_partial then null else billing_key_masked end,
    updated_at=v_now
    where id=v_contract.id;

  update public.payment_refund_requests set
    status='completed',completed_at=coalesce(completed_at,v_now),failed_code=null,failed_message=null,updated_at=v_now
    where id=v_request.id returning * into v_request;
  update public.refund_execution_outbox set
    status='completed',lease_token=null,lease_expires_at=null,terminal_at=coalesce(terminal_at,v_now),updated_at=v_now
    where refund_request_id=v_request.id and status<>'completed';
  insert into public.refund_notification_outbox(refund_request_id,user_id,event_type,channels,event_payload)
  values(v_request.id,v_request.user_id,'completed',array['in_app','email','push']::text[],
    jsonb_build_object('refundAmountKrw',v_quote.refund_amount_krw,'remainingRightsPreserved',v_exception_partial))
  on conflict(refund_request_id,event_type) do nothing;

  return jsonb_build_object(
    'contractId',v_contract.id,'grantId',case when v_grant_found then v_grant.id else null end,'fullRefund',v_full_refund,
    'refundAmountKrw',v_quote.refund_amount_krw,'remainingRightsPreserved',v_exception_partial
  );
end $$;
revoke execute on function public.finalize_full_style_refund_v2(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.finalize_full_style_refund_v2(uuid,uuid)
  to service_role;

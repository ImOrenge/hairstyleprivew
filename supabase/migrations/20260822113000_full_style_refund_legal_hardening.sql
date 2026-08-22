-- Legal hardening for the full-style withdrawal flow.
-- Keeps legacy rows unverified, records immutable contract evidence, and prevents
-- stale refund quotes from racing a newly started consultation.

alter table public.full_style_contracts_v2
  add column if not exists contract_document_status text not null default 'pending'
    check(contract_document_status in ('pending','sent','delivery_uncertain','failed','legacy_unverified')),
  add column if not exists contract_document_snapshot jsonb,
  add column if not exists contract_document_provided_at timestamptz,
  add column if not exists contract_document_provider_message_id text,
  add column if not exists contract_document_last_attempted_at timestamptz,
  add column if not exists legal_calendar_verified boolean not null default false;

alter table public.full_style_contracts_v2
  alter column contract_document_delivered_at drop not null,
  alter column statutory_withdrawal_deadline drop not null,
  alter column refund_policy_version drop not null;

update public.full_style_contracts_v2
set
  contract_document_status='legacy_unverified',
  contract_document_delivered_at=null,
  statutory_withdrawal_deadline=null,
  refund_policy_version=null,
  legal_calendar_verified=false
where contract_document_snapshot is null;

create table if not exists public.full_style_contract_documents_v2 (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.full_style_contracts_v2(id) on delete restrict,
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  user_id text not null references public.users(id) on delete cascade,
  policy_version text not null,
  status text not null default 'pending' check(status in ('pending','sent','delivery_uncertain','failed','legacy_unverified')),
  document_snapshot jsonb not null,
  last_attempted_at timestamptz,
  provided_at timestamptz,
  statutory_withdrawal_deadline timestamptz,
  legal_calendar_verified boolean not null default false,
  provider_message_id text,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique(payment_transaction_id)
);
create index if not exists idx_full_style_contract_documents_contract
  on public.full_style_contract_documents_v2(contract_id,created_at desc);
alter table public.full_style_contract_documents_v2 enable row level security;
alter table public.full_style_contract_documents_v2 force row level security;
revoke all on table public.full_style_contract_documents_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.full_style_contract_documents_v2 to service_role;


create table if not exists public.legal_non_business_days_kr_v1 (
  calendar_date date primary key,
  reason text not null,
  source_url text not null,
  verified_at timestamptz not null default timezone('utc',now())
);
alter table public.legal_non_business_days_kr_v1 enable row level security;
alter table public.legal_non_business_days_kr_v1 force row level security;
revoke all on table public.legal_non_business_days_kr_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.legal_non_business_days_kr_v1 to service_role;

insert into public.legal_non_business_days_kr_v1(calendar_date,reason,source_url) values
  ('2026-01-01','신정','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-02-16','설날 연휴','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-02-17','설날','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-02-18','설날 연휴','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-03-01','삼일절','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-03-02','삼일절 대체공휴일','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-05-01','노동절','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-05-05','어린이날','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-05-24','부처님 오신 날','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-05-25','부처님 오신 날 대체공휴일','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-06-03','전국동시지방선거일','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-06-06','현충일','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-07-17','제헌절','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-08-15','광복절','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-08-17','광복절 대체공휴일','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-09-24','추석 연휴','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-09-25','추석','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-09-26','추석 연휴','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-10-03','개천절','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-10-05','개천절 대체공휴일','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-10-09','한글날','https://www.law.go.kr/lsInfoP.do?lsId=002404'),
  ('2026-12-25','기독탄신일','https://www.law.go.kr/lsInfoP.do?lsId=002404')
on conflict(calendar_date) do update set
  reason=excluded.reason,source_url=excluded.source_url,verified_at=timezone('utc',now());

create or replace function public.full_style_legal_deadline_v2(
  p_base_at timestamptz,
  p_calendar_days integer
) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$
declare
  v_deadline_date date;
begin
  if p_base_at is null or p_calendar_days<1 then return null; end if;
  v_deadline_date:=(p_base_at at time zone 'Asia/Seoul')::date+p_calendar_days;
  loop
    exit when extract(isodow from v_deadline_date) not in (6,7)
      and not exists(
        select 1 from public.legal_non_business_days_kr_v1 d
        where d.calendar_date=v_deadline_date
      );
    v_deadline_date:=v_deadline_date+1;
  end loop;
  if v_deadline_date>date '2026-12-31' then return null; end if;
  return ((v_deadline_date+1)::timestamp at time zone 'Asia/Seoul')-interval '1 millisecond';
end $$;
revoke execute on function public.full_style_legal_deadline_v2(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.full_style_legal_deadline_v2(timestamptz,integer) to service_role;

create or replace function public.full_style_business_day_deadline_v2(
  p_base_at timestamptz,
  p_business_days integer
) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$
declare
  v_deadline_date date;
  v_count integer:=0;
begin
  if p_base_at is null or p_business_days<1 then return null; end if;
  v_deadline_date:=(p_base_at at time zone 'Asia/Seoul')::date;
  while v_count<p_business_days loop
    v_deadline_date:=v_deadline_date+1;
    if extract(isodow from v_deadline_date) not in (6,7)
       and not exists(select 1 from public.legal_non_business_days_kr_v1 d where d.calendar_date=v_deadline_date) then
      v_count:=v_count+1;
    end if;
  end loop;
  if v_deadline_date>date '2026-12-31' then return null; end if;
  return ((v_deadline_date+1)::timestamp at time zone 'Asia/Seoul')-interval '1 millisecond';
end $$;
revoke execute on function public.full_style_business_day_deadline_v2(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.full_style_business_day_deadline_v2(timestamptz,integer) to service_role;

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
  v_deadline timestamptz;
begin
  if p_start_trigger not in ('paid_preview_generation','demo_upgrade_compare') then
    raise exception 'INVALID_START_TRIGGER' using errcode='22023';
  end if;
  if p_refund_policy_version<>'full-style-refund-2026-08-22-v2' then
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
  if v_contract.status not in ('active','cancel_at_period_end') then
    raise exception 'CONTRACT_NOT_ACTIVE' using errcode='P0001';
  end if;
  if v_contract.contract_document_status<>'sent' or v_contract.contract_document_provided_at is null then
    raise exception 'CONTRACT_DOCUMENT_NOT_PROVIDED' using errcode='P0001';
  end if;

  select * into v_activation from public.full_style_service_activations_v2
    where contract_id=v_contract.id and consultation_id=p_consultation_id;
  if found then return jsonb_build_object(
    'activationId',v_activation.id,'contractId',v_contract.id,'consultationId',p_consultation_id,
    'startTrigger',v_activation.start_trigger,'startedAt',v_activation.started_at,
    'statutoryWithdrawalDeadline',v_contract.statutory_withdrawal_deadline,'replayed',true
  ); end if;

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
      v_consumption_state,case when v_consumption_state='consumed' then v_started_at else null end
    ) returning * into v_consumption;
    update public.customer_entitlement_grants_v2 set
      quantity_consumed=quantity_consumed+1,
      status=case when quantity_consumed+1>=quantity_granted then 'exhausted' else 'active' end,
      updated_at=v_started_at where id=v_grant.id;
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

  v_deadline:=public.full_style_legal_deadline_v2(greatest(v_contract.contract_document_provided_at,v_started_at),7);
  update public.full_style_contracts_v2 set
    statutory_withdrawal_deadline=v_deadline,legal_calendar_verified=v_deadline is not null,
    updated_at=v_started_at where id=v_contract.id returning * into v_contract;

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
  add column if not exists contract_document_provided_at timestamptz,
  add column if not exists legal_calendar_verified boolean,
  add column if not exists recovery_status text not null default 'not_offered'
    check(recovery_status in ('not_applicable','not_offered','offered','accepted','declined','failed','restored'));

alter table public.payment_refund_quotes drop constraint if exists payment_refund_quotes_refund_eligibility_code_check;
alter table public.payment_refund_quotes
  add constraint payment_refund_quotes_refund_eligibility_code_check check(refund_eligibility_code is null or refund_eligibility_code in (
    'statutory_withdrawal','started_session_restriction','window_expired','exception_review',
    'document_delivery_unverified','legal_calendar_review'
  ));

alter table public.payment_refund_requests
  add column if not exists statutory_refund_due_at timestamptz,
  add column if not exists recovery_status text not null default 'not_offered'
    check(recovery_status in ('not_applicable','not_offered','offered','accepted','declined','failed','restored')),
  add column if not exists legal_review_required boolean not null default false;

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
  v_contract public.full_style_contracts_v2%rowtype;
  v_grant public.customer_entitlement_grants_v2%rowtype;
  v_status text; v_decision text; v_detail text;
  v_started integer; v_unused integer; v_deadline timestamptz; v_amount integer;
  v_first_started timestamptz; v_manual_legal boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into v_existing from public.payment_refund_requests where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.user_id<>p_user_id or v_existing.quote_id<>p_quote_id then raise exception 'refund_idempotency_conflict'; end if;
    return to_jsonb(v_existing);
  end if;

  select * into v_quote from public.payment_refund_quotes
    where id=p_quote_id and user_id=p_user_id and product_family='full_style' for update;
  if not found then raise exception 'refund_quote_not_found'; end if;
  if v_quote.consumed_at is not null then raise exception 'refund_quote_consumed'; end if;
  if v_quote.expires_at<=timezone('utc',now()) then raise exception 'refund_quote_expired'; end if;

  select * into v_contract from public.full_style_contracts_v2
    where id=v_quote.full_style_contract_id and user_id=p_user_id for update;
  if not found then raise exception 'full_style_contract_not_found'; end if;
  select * into v_grant from public.customer_entitlement_grants_v2
    where source='portone' and source_transaction_id=v_quote.payment_transaction_id::text
      and offering_key=v_contract.offering_key for update;

  select count(*),min(started_at) into v_started,v_first_started
    from public.full_style_service_activations_v2
    where contract_id=v_contract.id and payment_transaction_id=v_quote.payment_transaction_id;
  v_started:=least(coalesce(v_quote.credits_granted,1),coalesce(v_started,0));
  v_unused:=greatest(0,coalesce(v_quote.credits_granted,1)-v_started);
  if v_started<>coalesce(v_quote.full_style_started_sessions,0) then raise exception 'refund_quote_state_changed'; end if;

  v_deadline:=public.full_style_legal_deadline_v2(
    greatest(v_contract.contract_document_provided_at,coalesce(v_first_started,v_contract.contract_document_provided_at)),7
  );
  v_manual_legal:=v_contract.contract_document_status<>'sent'
    or v_contract.contract_document_provided_at is null or v_deadline is null;
  if v_quote.refund_eligibility_code<>'exception_review' and not v_manual_legal
     and timezone('utc',now())>v_deadline and v_quote.refund_eligibility_code<>'window_expired' then
    raise exception 'refund_quote_state_changed';
  end if;

  v_amount:=case
    when v_quote.outcome_choice='cancel_at_period_end' then 0
    when v_quote.refund_eligibility_code='exception_review' then v_quote.refund_amount_krw
    when v_manual_legal then 0
    when timezone('utc',now())>v_deadline then 0
    when v_started=0 then least(v_quote.original_amount_krw,v_quote.provider_cancellable_amount_krw)
    when v_contract.offering_key='full_style_annual' then
      least(v_quote.provider_cancellable_amount_krw,v_quote.full_style_session_unit_amount_krw*v_unused)
    else 0 end;
  if v_amount<>v_quote.refund_amount_krw or v_amount<>p_accepted_amount_krw then
    raise exception 'refund_quote_amount_changed';
  end if;

  v_status:=case when v_quote.outcome_choice='cancel_at_period_end'
    then 'period_end_scheduled' else 'manual_review_required' end;
  v_decision:=case when v_quote.outcome_choice='cancel_at_period_end' then 'period_end' else 'manual' end;
  v_detail:=left(btrim(coalesce(p_answers->>'detail','')),500);

  insert into public.payment_refund_requests(
    payment_transaction_id,user_id,requested_by,refund_type,amount_krw,reason,status,
    quote_id,idempotency_key,outcome_choice,reason_category,decision,risk_codes,
    policy_version,original_amount_krw,provider_cancellable_amount_krw,
    credits_granted,credits_remaining,credits_to_claw_back,preserved_credits,metadata,
    statutory_refund_due_at,recovery_status,legal_review_required
  ) values (
    v_quote.payment_transaction_id,p_user_id,p_user_id,
    case when v_amount=v_quote.original_amount_krw then 'full' else 'partial' end,
    case when v_amount=v_quote.original_amount_krw then null else v_amount end,
    coalesce(nullif(v_detail,''),v_quote.reason_category),v_status,
    v_quote.id,p_idempotency_key,v_quote.outcome_choice,v_quote.reason_category,v_decision,
    v_quote.risk_codes,v_quote.policy_version,v_quote.original_amount_krw,
    v_quote.provider_cancellable_amount_krw,v_quote.credits_granted,v_unused,
    case when v_quote.outcome_choice='cancel_at_period_end' then 0 else v_unused end,
    v_quote.preserved_credits,
    jsonb_build_object('source','full_style_refund_interview','productFamily','full_style',
      'fullStyleContractId',v_contract.id,'eligibilityCode',v_quote.refund_eligibility_code,
      'startedSessions',v_started,'unusedSessions',v_unused),
    case when v_amount>0 then public.full_style_business_day_deadline_v2(timezone('utc',now()),3) else null end,
    v_quote.recovery_status,v_manual_legal
  ) returning * into v_request;

  insert into public.refund_interview_responses(refund_request_id,user_id,reason_category,answers)
    values(v_request.id,p_user_id,v_quote.reason_category,coalesce(p_answers,'{}'::jsonb));

  if v_quote.refund_eligibility_code in ('exception_review','document_delivery_unverified','legal_calendar_review') then
    insert into public.refund_support_cases(refund_request_id,user_id,priority,reason_category,summary)
    values(v_request.id,p_user_id,
      case when v_quote.reason_category in ('unauthorized_charge','privacy_or_safety') then 'urgent' else 'high' end,
      v_quote.reason_category,coalesce(nullif(v_detail,''),v_quote.reason_category))
    returning * into v_support;
    update public.payment_refund_requests set support_case_id=v_support.id where id=v_request.id returning * into v_request;
  end if;

  if v_quote.outcome_choice='cancel_at_period_end' then
    update public.full_style_contracts_v2 set cancel_at_period_end=true,status='cancel_at_period_end',
      cancelled_at=coalesce(cancelled_at,period_ends_at),updated_at=timezone('utc',now())
      where id=v_contract.id;
  else
    update public.full_style_contracts_v2 set status='refund_review',updated_at=timezone('utc',now())
      where id=v_contract.id;
  end if;

  insert into public.refund_notification_outbox(refund_request_id,user_id,event_type,channels,event_payload)
  values(v_request.id,p_user_id,
    case when v_status='period_end_scheduled' then 'period_end_scheduled' else 'manual_review' end,
    array['in_app','email','push']::text[],
    jsonb_build_object('status',v_status,'refundAmountKrw',v_amount));
  update public.payment_refund_quotes set consumed_at=timezone('utc',now()) where id=v_quote.id;
  return to_jsonb(v_request);
end $$;
revoke execute on function public.submit_full_style_refund_request_v2(text,uuid,uuid,integer,jsonb)
  from public,anon,authenticated;
grant execute on function public.submit_full_style_refund_request_v2(text,uuid,uuid,integer,jsonb)
  to service_role;

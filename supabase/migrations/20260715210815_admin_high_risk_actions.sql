-- Phase 04: make administrator credit, role, and refund mutations auditable and idempotent.
-- All RPCs are service-role only and use the caller's privileges (security invoker).

alter table public.payment_refund_requests
  drop constraint if exists payment_refund_requests_status_check;

alter table public.payment_refund_requests
  add constraint payment_refund_requests_status_check
  check (
    status in (
      'pending',
      'processing',
      'approved',
      'completed',
      'failed',
      'manual_review_required',
      'rejected'
    )
  );

drop index if exists public.idx_payment_refund_requests_one_open_per_payment;
create unique index idx_payment_refund_requests_one_open_per_payment
  on public.payment_refund_requests (payment_transaction_id)
  where status in ('pending', 'processing', 'approved');

alter table public.payment_refund_requests force row level security;

create table if not exists public.admin_action_receipts (
  id uuid primary key default gen_random_uuid(),
  action_key uuid not null unique,
  action_type text not null
    check (action_type in ('credit_adjustment', 'account_type_change', 'refund_approval')),
  actor_user_id text not null,
  target_user_id text,
  target_resource_type text not null,
  target_resource_id text not null,
  status text not null
    check (
      status in (
        'processing',
        'succeeded',
        'already_processed',
        'conflict',
        'provider_pending',
        'failed'
      )
    ),
  request_payload jsonb not null default '{}'::jsonb,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  external_reference text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_admin_action_receipts_actor_created_at
  on public.admin_action_receipts (actor_user_id, created_at desc);

create index if not exists idx_admin_action_receipts_target_created_at
  on public.admin_action_receipts (target_resource_type, target_resource_id, created_at desc);

create unique index if not exists idx_credit_ledger_admin_action_key
  on public.credit_ledger ((metadata ->> 'adminActionKey'))
  where entry_type = 'adjustment'
    and metadata ? 'adminActionKey';

create or replace function public.set_admin_action_receipt_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_admin_action_receipt_updated_at()
  from public, anon, authenticated;

drop trigger if exists trg_admin_action_receipts_set_updated_at
  on public.admin_action_receipts;
create trigger trg_admin_action_receipts_set_updated_at
before update on public.admin_action_receipts
for each row execute function public.set_admin_action_receipt_updated_at();

alter table public.admin_action_receipts enable row level security;
alter table public.admin_action_receipts force row level security;

revoke all on table public.admin_action_receipts from public, anon, authenticated;
grant select, insert, update on table public.admin_action_receipts to service_role;

create or replace function public.execute_admin_credit_adjustment(
  p_action_key uuid,
  p_actor_user_id text,
  p_target_user_id text,
  p_expected_balance integer,
  p_delta integer,
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
  v_before_balance integer;
  v_after_balance integer;
  v_ledger public.credit_ledger%rowtype;
  v_reason text;
begin
  v_reason := btrim(coalesce(p_reason, ''));
  if p_action_key is null
    or btrim(coalesce(p_actor_user_id, '')) = ''
    or btrim(coalesce(p_target_user_id, '')) = ''
    or p_expected_balance is null
    or p_delta is null
    or p_delta = 0
    or v_reason = ''
    or length(v_reason) > 240
  then
    raise exception 'invalid_admin_credit_adjustment';
  end if;

  v_request := jsonb_build_object(
    'targetUserId', p_target_user_id,
    'expectedBalance', p_expected_balance,
    'delta', p_delta,
    'reason', v_reason
  );

  perform pg_advisory_xact_lock(hashtextextended(p_action_key::text, 0));

  select *
    into v_existing
    from public.admin_action_receipts
   where action_key = p_action_key;

  if found then
    if v_existing.action_type <> 'credit_adjustment'
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
      'receipt', to_jsonb(v_existing)
    );
  end if;

  select credits
    into v_before_balance
    from public.users
   where id = p_target_user_id
   for update;

  if not found then
    insert into public.admin_action_receipts (
      action_key,
      action_type,
      actor_user_id,
      target_user_id,
      target_resource_type,
      target_resource_id,
      status,
      request_payload,
      error_code,
      error_message,
      completed_at
    )
    values (
      p_action_key,
      'credit_adjustment',
      p_actor_user_id,
      p_target_user_id,
      'user',
      p_target_user_id,
      'failed',
      v_request,
      'member_not_found',
      'Member not found',
      now()
    )
    returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'failed',
      'replayed', false,
      'errorCode', 'member_not_found',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  v_after_balance := v_before_balance + p_delta;

  if v_before_balance <> p_expected_balance then
    insert into public.admin_action_receipts (
      action_key,
      action_type,
      actor_user_id,
      target_user_id,
      target_resource_type,
      target_resource_id,
      status,
      request_payload,
      before_state,
      after_state,
      error_code,
      error_message,
      completed_at
    )
    values (
      p_action_key,
      'credit_adjustment',
      p_actor_user_id,
      p_target_user_id,
      'user',
      p_target_user_id,
      'conflict',
      v_request,
      jsonb_build_object('credits', v_before_balance),
      jsonb_build_object('credits', v_before_balance),
      'stale_balance',
      'Credit balance changed before confirmation',
      now()
    )
    returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'conflict',
      'replayed', false,
      'errorCode', 'stale_balance',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  if v_after_balance < 0 then
    insert into public.admin_action_receipts (
      action_key,
      action_type,
      actor_user_id,
      target_user_id,
      target_resource_type,
      target_resource_id,
      status,
      request_payload,
      before_state,
      after_state,
      error_code,
      error_message,
      completed_at
    )
    values (
      p_action_key,
      'credit_adjustment',
      p_actor_user_id,
      p_target_user_id,
      'user',
      p_target_user_id,
      'conflict',
      v_request,
      jsonb_build_object('credits', v_before_balance),
      jsonb_build_object('credits', v_before_balance),
      'insufficient_credits',
      'Adjustment would make the balance negative',
      now()
    )
    returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'conflict',
      'replayed', false,
      'errorCode', 'insufficient_credits',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  insert into public.admin_action_receipts (
    action_key,
    action_type,
    actor_user_id,
    target_user_id,
    target_resource_type,
    target_resource_id,
    status,
    request_payload,
    before_state
  )
  values (
    p_action_key,
    'credit_adjustment',
    p_actor_user_id,
    p_target_user_id,
    'user',
    p_target_user_id,
    'processing',
    v_request,
    jsonb_build_object('credits', v_before_balance)
  )
  returning * into v_receipt;

  insert into public.credit_ledger (
    user_id,
    entry_type,
    amount,
    balance_after,
    reason,
    metadata
  )
  values (
    p_target_user_id,
    'adjustment',
    p_delta,
    0,
    v_reason,
    jsonb_build_object(
      'source', 'admin_dashboard',
      'adminUserId', p_actor_user_id,
      'adminActionKey', p_action_key,
      'adminActionReceiptId', v_receipt.id
    )
  )
  returning * into v_ledger;

  update public.admin_action_receipts
     set status = 'succeeded',
         after_state = jsonb_build_object(
           'credits', v_ledger.balance_after,
           'delta', p_delta,
           'reason', v_reason,
           'ledgerId', v_ledger.id
         ),
         completed_at = now()
   where id = v_receipt.id
  returning * into v_receipt;

  return jsonb_build_object(
    'outcome', 'succeeded',
    'replayed', false,
    'receipt', to_jsonb(v_receipt),
    'ledger', to_jsonb(v_ledger)
  );
end;
$$;

create or replace function public.execute_admin_account_type_change(
  p_action_key uuid,
  p_actor_user_id text,
  p_target_user_id text,
  p_expected_account_type text,
  p_target_account_type text
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
  v_current_account_type text;
  v_member jsonb;
begin
  if p_action_key is null
    or btrim(coalesce(p_actor_user_id, '')) = ''
    or btrim(coalesce(p_target_user_id, '')) = ''
    or p_target_account_type not in ('member', 'salon_owner', 'admin')
    or p_expected_account_type not in ('member', 'salon_owner', 'admin')
  then
    raise exception 'invalid_admin_account_type_change';
  end if;

  v_request := jsonb_build_object(
    'targetUserId', p_target_user_id,
    'expectedAccountType', p_expected_account_type,
    'targetAccountType', p_target_account_type
  );

  perform pg_advisory_xact_lock(hashtextextended(p_action_key::text, 0));

  select *
    into v_existing
    from public.admin_action_receipts
   where action_key = p_action_key;

  if found then
    if v_existing.action_type <> 'account_type_change'
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
      'receipt', to_jsonb(v_existing)
    );
  end if;

  if p_actor_user_id = p_target_user_id then
    insert into public.admin_action_receipts (
      action_key,
      action_type,
      actor_user_id,
      target_user_id,
      target_resource_type,
      target_resource_id,
      status,
      request_payload,
      error_code,
      error_message,
      completed_at
    )
    values (
      p_action_key,
      'account_type_change',
      p_actor_user_id,
      p_target_user_id,
      'user',
      p_target_user_id,
      'conflict',
      v_request,
      'self_role_change_forbidden',
      'Administrators cannot change their own account type',
      now()
    )
    returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'conflict',
      'replayed', false,
      'errorCode', 'self_role_change_forbidden',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  select account_type::text
    into v_current_account_type
    from public.users
   where id = p_target_user_id
   for update;

  if not found then
    insert into public.admin_action_receipts (
      action_key,
      action_type,
      actor_user_id,
      target_user_id,
      target_resource_type,
      target_resource_id,
      status,
      request_payload,
      error_code,
      error_message,
      completed_at
    )
    values (
      p_action_key,
      'account_type_change',
      p_actor_user_id,
      p_target_user_id,
      'user',
      p_target_user_id,
      'failed',
      v_request,
      'member_not_found',
      'Member not found',
      now()
    )
    returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'failed',
      'replayed', false,
      'errorCode', 'member_not_found',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  if coalesce(v_current_account_type, 'member') <> p_expected_account_type then
    insert into public.admin_action_receipts (
      action_key,
      action_type,
      actor_user_id,
      target_user_id,
      target_resource_type,
      target_resource_id,
      status,
      request_payload,
      before_state,
      after_state,
      error_code,
      error_message,
      completed_at
    )
    values (
      p_action_key,
      'account_type_change',
      p_actor_user_id,
      p_target_user_id,
      'user',
      p_target_user_id,
      'conflict',
      v_request,
      jsonb_build_object('accountType', coalesce(v_current_account_type, 'member')),
      jsonb_build_object('accountType', coalesce(v_current_account_type, 'member')),
      'stale_account_type',
      'Account type changed before confirmation',
      now()
    )
    returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'conflict',
      'replayed', false,
      'errorCode', 'stale_account_type',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  if coalesce(v_current_account_type, 'member') = p_target_account_type then
    insert into public.admin_action_receipts (
      action_key,
      action_type,
      actor_user_id,
      target_user_id,
      target_resource_type,
      target_resource_id,
      status,
      request_payload,
      before_state,
      after_state,
      completed_at
    )
    values (
      p_action_key,
      'account_type_change',
      p_actor_user_id,
      p_target_user_id,
      'user',
      p_target_user_id,
      'already_processed',
      v_request,
      jsonb_build_object('accountType', p_target_account_type),
      jsonb_build_object('accountType', p_target_account_type),
      now()
    )
    returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'already_processed',
      'replayed', false,
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  insert into public.admin_action_receipts (
    action_key,
    action_type,
    actor_user_id,
    target_user_id,
    target_resource_type,
    target_resource_id,
    status,
    request_payload,
    before_state
  )
  values (
    p_action_key,
    'account_type_change',
    p_actor_user_id,
    p_target_user_id,
    'user',
    p_target_user_id,
    'processing',
    v_request,
    jsonb_build_object('accountType', coalesce(v_current_account_type, 'member'))
  )
  returning * into v_receipt;

  update public.users
     set account_type = p_target_account_type::public.account_type,
         onboarding_completed_at = case
           when p_target_account_type = 'admin'
             then coalesce(onboarding_completed_at, now())
           else onboarding_completed_at
         end
   where id = p_target_user_id
  returning jsonb_build_object(
    'id', id,
    'email', email,
    'displayName', display_name,
    'accountType', account_type::text,
    'credits', credits,
    'onboardingCompletedAt', onboarding_completed_at,
    'createdAt', created_at,
    'updatedAt', updated_at
  )
  into v_member;

  update public.admin_action_receipts
     set status = 'provider_pending',
         after_state = jsonb_build_object(
           'accountType', p_target_account_type,
           'clerkMetadataSynced', false
         )
   where id = v_receipt.id
  returning * into v_receipt;

  return jsonb_build_object(
    'outcome', 'provider_pending',
    'replayed', false,
    'receipt', to_jsonb(v_receipt),
    'member', v_member
  );
end;
$$;

create or replace function public.begin_admin_refund_approval(
  p_action_key uuid,
  p_actor_user_id text,
  p_refund_request_id uuid,
  p_expected_status text,
  p_expected_amount integer,
  p_admin_note text
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
  v_refund public.payment_refund_requests%rowtype;
  v_payment_amount integer;
  v_effective_amount integer;
  v_note text;
  v_receipt_status text;
  v_error_code text;
begin
  v_note := left(btrim(coalesce(p_admin_note, '')), 500);
  if p_action_key is null
    or btrim(coalesce(p_actor_user_id, '')) = ''
    or p_refund_request_id is null
    or p_expected_status is null
    or p_expected_amount is null
    or p_expected_amount <= 0
  then
    raise exception 'invalid_admin_refund_approval';
  end if;

  v_request := jsonb_build_object(
    'refundRequestId', p_refund_request_id,
    'expectedStatus', p_expected_status,
    'expectedAmount', p_expected_amount,
    'adminNote', v_note
  );

  perform pg_advisory_xact_lock(hashtextextended(p_action_key::text, 0));

  select *
    into v_existing
    from public.admin_action_receipts
   where action_key = p_action_key;

  if found then
    if v_existing.action_type <> 'refund_approval'
      or v_existing.actor_user_id <> p_actor_user_id
      or v_existing.target_resource_id <> p_refund_request_id::text
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
      'receipt', to_jsonb(v_existing)
    );
  end if;

  select *
    into v_refund
    from public.payment_refund_requests
   where id = p_refund_request_id
   for update;

  if not found then
    insert into public.admin_action_receipts (
      action_key,
      action_type,
      actor_user_id,
      target_resource_type,
      target_resource_id,
      status,
      request_payload,
      error_code,
      error_message,
      completed_at
    )
    values (
      p_action_key,
      'refund_approval',
      p_actor_user_id,
      'payment_refund_request',
      p_refund_request_id::text,
      'failed',
      v_request,
      'refund_request_not_found',
      'Refund request not found',
      now()
    )
    returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'failed',
      'replayed', false,
      'errorCode', 'refund_request_not_found',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  select amount
    into v_payment_amount
    from public.payment_transactions
   where id = v_refund.payment_transaction_id;

  v_effective_amount := case
    when v_refund.refund_type = 'full' then v_payment_amount
    else v_refund.amount_krw
  end;

  if v_refund.status <> 'pending' then
    v_receipt_status := case
      when v_refund.status in ('completed', 'manual_review_required', 'rejected', 'failed')
        then 'already_processed'
      else 'conflict'
    end;
    v_error_code := case
      when v_receipt_status = 'already_processed' then 'refund_already_processed'
      else 'refund_in_progress'
    end;

    insert into public.admin_action_receipts (
      action_key,
      action_type,
      actor_user_id,
      target_user_id,
      target_resource_type,
      target_resource_id,
      status,
      request_payload,
      before_state,
      after_state,
      error_code,
      error_message,
      completed_at
    )
    values (
      p_action_key,
      'refund_approval',
      p_actor_user_id,
      v_refund.user_id,
      'payment_refund_request',
      p_refund_request_id::text,
      v_receipt_status,
      v_request,
      jsonb_build_object('status', v_refund.status, 'amountKrw', v_effective_amount),
      jsonb_build_object('status', v_refund.status, 'amountKrw', v_effective_amount),
      v_error_code,
      case
        when v_receipt_status = 'already_processed' then 'Refund request was already processed'
        else 'Refund request is already being processed'
      end,
      now()
    )
    returning * into v_receipt;

    return jsonb_build_object(
      'outcome', v_receipt_status,
      'replayed', false,
      'errorCode', v_error_code,
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  if p_expected_status <> v_refund.status or p_expected_amount <> v_effective_amount then
    insert into public.admin_action_receipts (
      action_key,
      action_type,
      actor_user_id,
      target_user_id,
      target_resource_type,
      target_resource_id,
      status,
      request_payload,
      before_state,
      after_state,
      error_code,
      error_message,
      completed_at
    )
    values (
      p_action_key,
      'refund_approval',
      p_actor_user_id,
      v_refund.user_id,
      'payment_refund_request',
      p_refund_request_id::text,
      'conflict',
      v_request,
      jsonb_build_object('status', v_refund.status, 'amountKrw', v_effective_amount),
      jsonb_build_object('status', v_refund.status, 'amountKrw', v_effective_amount),
      'stale_refund_state',
      'Refund status or amount changed before confirmation',
      now()
    )
    returning * into v_receipt;

    return jsonb_build_object(
      'outcome', 'conflict',
      'replayed', false,
      'errorCode', 'stale_refund_state',
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  insert into public.admin_action_receipts (
    action_key,
    action_type,
    actor_user_id,
    target_user_id,
    target_resource_type,
    target_resource_id,
    status,
    request_payload,
    before_state
  )
  values (
    p_action_key,
    'refund_approval',
    p_actor_user_id,
    v_refund.user_id,
    'payment_refund_request',
    p_refund_request_id::text,
    'processing',
    v_request,
    jsonb_build_object(
      'status', v_refund.status,
      'amountKrw', v_effective_amount,
      'refundType', v_refund.refund_type,
      'paymentTransactionId', v_refund.payment_transaction_id
    )
  )
  returning * into v_receipt;

  update public.payment_refund_requests
     set status = 'processing',
         approved_by = p_actor_user_id,
         approved_at = now(),
         failed_code = null,
         failed_message = null,
         metadata = metadata || jsonb_build_object(
           'adminActionKey', p_action_key,
           'adminActionReceiptId', v_receipt.id,
           'adminNote', v_note,
           'processingStartedAt', now()
         )
   where id = p_refund_request_id
  returning * into v_refund;

  return jsonb_build_object(
    'outcome', 'processing',
    'replayed', false,
    'receipt', to_jsonb(v_receipt),
    'refundRequest', to_jsonb(v_refund)
  );
end;
$$;

create or replace function public.finalize_admin_action_receipt(
  p_action_key uuid,
  p_actor_user_id text,
  p_status text,
  p_external_reference text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_after_state jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receipt public.admin_action_receipts%rowtype;
begin
  if p_action_key is null
    or btrim(coalesce(p_actor_user_id, '')) = ''
    or p_status not in ('succeeded', 'provider_pending', 'failed')
  then
    raise exception 'invalid_admin_action_receipt_finalization';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action_key::text, 0));

  select *
    into v_receipt
    from public.admin_action_receipts
   where action_key = p_action_key
     and actor_user_id = p_actor_user_id
   for update;

  if not found then
    raise exception 'admin_action_receipt_not_found';
  end if;

  if v_receipt.status in ('succeeded', 'already_processed', 'conflict', 'failed')
     and v_receipt.status <> p_status
  then
    return jsonb_build_object(
      'outcome', v_receipt.status,
      'replayed', true,
      'receipt', to_jsonb(v_receipt)
    );
  end if;

  update public.admin_action_receipts
     set status = p_status,
         external_reference = coalesce(p_external_reference, external_reference),
         error_code = p_error_code,
         error_message = p_error_message,
         after_state = case
           when p_after_state is null then after_state
           else after_state || p_after_state
         end,
         completed_at = case when p_status = 'provider_pending' then null else now() end
   where id = v_receipt.id
  returning * into v_receipt;

  return jsonb_build_object(
    'outcome', v_receipt.status,
    'replayed', false,
    'receipt', to_jsonb(v_receipt)
  );
end;
$$;

create or replace function public.complete_admin_refund_action(
  p_action_key uuid,
  p_actor_user_id text,
  p_refund_request_id uuid,
  p_refund_status text,
  p_external_reference text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_metadata_patch jsonb default '{}'::jsonb,
  p_after_state jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receipt public.admin_action_receipts%rowtype;
  v_refund public.payment_refund_requests%rowtype;
  v_receipt_status text;
begin
  if p_action_key is null
    or btrim(coalesce(p_actor_user_id, '')) = ''
    or p_refund_request_id is null
    or p_refund_status not in ('approved', 'completed', 'manual_review_required', 'failed')
  then
    raise exception 'invalid_admin_refund_completion';
  end if;

  v_receipt_status := case
    when p_refund_status = 'approved' then 'provider_pending'
    when p_refund_status = 'failed' then 'failed'
    else 'succeeded'
  end;

  perform pg_advisory_xact_lock(hashtextextended(p_action_key::text, 0));

  select *
    into v_receipt
    from public.admin_action_receipts
   where action_key = p_action_key
     and actor_user_id = p_actor_user_id
     and action_type = 'refund_approval'
     and target_resource_id = p_refund_request_id::text
   for update;

  if not found then
    raise exception 'admin_refund_receipt_not_found';
  end if;

  select *
    into v_refund
    from public.payment_refund_requests
   where id = p_refund_request_id
   for update;

  if not found then
    raise exception 'refund_request_not_found';
  end if;

  if coalesce(v_refund.metadata ->> 'adminActionKey', '') <> p_action_key::text then
    raise exception 'refund_action_key_mismatch';
  end if;

  update public.payment_refund_requests
     set status = p_refund_status,
         portone_cancel_id = coalesce(p_external_reference, portone_cancel_id),
         completed_at = case when p_refund_status = 'completed' then now() else null end,
         failed_code = p_error_code,
         failed_message = p_error_message,
         metadata = metadata || coalesce(p_metadata_patch, '{}'::jsonb)
   where id = p_refund_request_id
  returning * into v_refund;

  update public.admin_action_receipts
     set status = v_receipt_status,
         external_reference = coalesce(p_external_reference, external_reference),
         error_code = p_error_code,
         error_message = p_error_message,
         after_state = after_state
           || jsonb_build_object(
             'status', p_refund_status,
             'portoneCancelId', coalesce(p_external_reference, v_refund.portone_cancel_id)
           )
           || coalesce(p_after_state, '{}'::jsonb),
         completed_at = case when v_receipt_status = 'provider_pending' then null else now() end
   where id = v_receipt.id
  returning * into v_receipt;

  return jsonb_build_object(
    'outcome', v_receipt.status,
    'replayed', false,
    'receipt', to_jsonb(v_receipt),
    'refundRequest', to_jsonb(v_refund)
  );
end;
$$;

create or replace function public.mark_payment_refund_after_cancellation(
  p_payment_transaction_id uuid,
  p_status text,
  p_metadata_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_refund public.payment_refund_requests%rowtype;
  v_receipt public.admin_action_receipts%rowtype;
  v_action_key uuid;
begin
  if p_payment_transaction_id is null
    or p_status not in ('completed', 'manual_review_required')
  then
    raise exception 'invalid_refund_cancellation_status';
  end if;

  select *
    into v_refund
    from public.payment_refund_requests
   where payment_transaction_id = p_payment_transaction_id
   order by requested_at desc
   limit 1
   for update;

  if not found then
    return null;
  end if;

  if v_refund.status in ('pending', 'processing', 'approved') then
    update public.payment_refund_requests
       set status = p_status,
           completed_at = case when p_status = 'completed' then now() else null end,
           failed_code = null,
           failed_message = null,
           metadata = metadata || coalesce(p_metadata_patch, '{}'::jsonb)
     where id = v_refund.id
    returning * into v_refund;
  end if;

  begin
    v_action_key := nullif(v_refund.metadata ->> 'adminActionKey', '')::uuid;
  exception when invalid_text_representation then
    v_action_key := null;
  end;

  if v_action_key is not null then
    update public.admin_action_receipts
       set status = 'succeeded',
           external_reference = coalesce(v_refund.portone_cancel_id, external_reference),
           error_code = null,
           error_message = null,
           after_state = after_state || jsonb_build_object(
             'status', v_refund.status,
             'portoneCancelId', v_refund.portone_cancel_id,
             'finalizedBy', 'portone_webhook'
           ),
           completed_at = now()
     where action_key = v_action_key
       and action_type = 'refund_approval'
       and target_resource_id = v_refund.id::text
       and status in ('processing', 'provider_pending')
    returning * into v_receipt;
  end if;

  return jsonb_build_object(
    'refundRequest', to_jsonb(v_refund),
    'receipt', case when v_receipt.id is null then null else to_jsonb(v_receipt) end
  );
end;
$$;

revoke all on function public.execute_admin_credit_adjustment(uuid, text, text, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.execute_admin_account_type_change(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.begin_admin_refund_approval(uuid, text, uuid, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.finalize_admin_action_receipt(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.complete_admin_refund_action(uuid, text, uuid, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.mark_payment_refund_after_cancellation(uuid, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.execute_admin_credit_adjustment(uuid, text, text, integer, integer, text)
  to service_role;
grant execute on function public.execute_admin_account_type_change(uuid, text, text, text, text)
  to service_role;
grant execute on function public.begin_admin_refund_approval(uuid, text, uuid, text, integer, text)
  to service_role;
grant execute on function public.finalize_admin_action_receipt(uuid, text, text, text, text, text, jsonb)
  to service_role;
grant execute on function public.complete_admin_refund_action(uuid, text, uuid, text, text, text, text, jsonb, jsonb)
  to service_role;
grant execute on function public.mark_payment_refund_after_cancellation(uuid, text, jsonb)
  to service_role;

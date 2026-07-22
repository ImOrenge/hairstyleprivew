-- Refund interview, payment-specific credit lots, durable execution and retention.
-- Public entrypoints are service-role only. Privileged implementations stay private.

create schema if not exists private;
revoke all on schema private from public;
revoke usage on schema private from anon, authenticated;
grant usage on schema private to service_role;

create table public.credit_grant_lots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  source_ledger_id bigint references public.credit_ledger(id) on delete set null,
  source_type text not null check (source_type in ('payment', 'free', 'compensation', 'adjustment')),
  granted_credits integer not null check (granted_credits > 0),
  remaining_credits integer not null check (remaining_credits >= 0),
  held_credits integer not null default 0 check (held_credits >= 0),
  reconciliation_status text not null default 'reconciled'
    check (reconciliation_status in ('reconciled', 'reconciliation_required')),
  metadata jsonb not null default '{}'::jsonb,
  granted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_grant_lots_remaining_within_grant
    check (remaining_credits <= granted_credits),
  constraint credit_grant_lots_hold_within_remaining
    check (held_credits <= remaining_credits)
);

create unique index credit_grant_lots_payment_key
  on public.credit_grant_lots (payment_transaction_id)
  where payment_transaction_id is not null;
create unique index credit_grant_lots_source_ledger_key
  on public.credit_grant_lots (source_ledger_id)
  where source_ledger_id is not null and payment_transaction_id is null;
create index credit_grant_lots_user_fifo
  on public.credit_grant_lots (user_id, granted_at, id);
create index credit_grant_lots_reconciliation
  on public.credit_grant_lots (reconciliation_status, user_id);

create table public.credit_lot_events (
  id bigint generated always as identity primary key,
  lot_id uuid not null references public.credit_grant_lots(id) on delete restrict,
  user_id text not null references public.users(id) on delete cascade,
  refund_request_id uuid,
  ledger_id bigint references public.credit_ledger(id) on delete set null,
  event_type text not null
    check (event_type in ('grant', 'spend', 'hold', 'release', 'clawback', 'restore', 'reconcile')),
  credits integer not null check (credits > 0),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index credit_lot_events_idempotency_key
  on public.credit_lot_events (idempotency_key)
  where idempotency_key is not null;
create index credit_lot_events_lot_created_at
  on public.credit_lot_events (lot_id, created_at, id);

create or replace function private.prevent_credit_lot_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'credit_lot_events_are_immutable';
end;
$$;

create trigger credit_lot_events_immutable_update
before update on public.credit_lot_events
for each row execute function private.prevent_credit_lot_event_mutation();
create trigger credit_lot_events_immutable_delete
before delete on public.credit_lot_events
for each row execute function private.prevent_credit_lot_event_mutation();

-- Reconstruct payment lots and non-payment grants. FIFO consumption means the
-- newest grants contain the final account balance.
insert into public.credit_grant_lots (
  user_id, payment_transaction_id, source_type, granted_credits,
  remaining_credits, reconciliation_status, metadata, granted_at
)
select
  ledger.user_id,
  ledger.payment_transaction_id,
  'payment',
  sum(ledger.amount)::integer,
  sum(ledger.amount)::integer,
  'reconciled',
  jsonb_build_object('backfilled', true, 'ledgerIds', jsonb_agg(ledger.id order by ledger.id)),
  min(ledger.created_at)
from public.credit_ledger ledger
where ledger.amount > 0 and ledger.payment_transaction_id is not null
group by ledger.user_id, ledger.payment_transaction_id
on conflict (payment_transaction_id) where payment_transaction_id is not null do nothing;

insert into public.credit_grant_lots (
  user_id, source_ledger_id, source_type, granted_credits,
  remaining_credits, reconciliation_status, metadata, granted_at
)
select
  ledger.user_id,
  ledger.id,
  case
    when coalesce(ledger.reason, '') ilike '%free%' then 'free'
    when coalesce(ledger.reason, '') ilike '%compens%' then 'compensation'
    else 'adjustment'
  end,
  ledger.amount,
  ledger.amount,
  'reconciled',
  jsonb_build_object('backfilled', true, 'ledgerId', ledger.id),
  ledger.created_at
from public.credit_ledger ledger
where ledger.amount > 0 and ledger.payment_transaction_id is null
on conflict (source_ledger_id) where source_ledger_id is not null and payment_transaction_id is null do nothing;

with ordered as (
  select
    lot.id,
    greatest(coalesce(users.credits, 0) - coalesce(sum(lot.granted_credits) over (
      partition by lot.user_id
      order by lot.granted_at desc, lot.id desc
      rows between unbounded preceding and 1 preceding
    ), 0), 0) as available_for_lot
  from public.credit_grant_lots lot
  join public.users users on users.id = lot.user_id
)
update public.credit_grant_lots lot
set remaining_credits = least(lot.granted_credits, ordered.available_for_lot)::integer,
    updated_at = now()
from ordered
where ordered.id = lot.id;

with balances as (
  select users.id as user_id, users.credits, coalesce(sum(lot.remaining_credits), 0) as lot_credits
  from public.users users
  left join public.credit_grant_lots lot on lot.user_id = users.id
  group by users.id, users.credits
)
update public.credit_grant_lots lot
set reconciliation_status = case
      when balances.credits = balances.lot_credits then 'reconciled'
      else 'reconciliation_required'
    end,
    updated_at = now()
from balances
where balances.user_id = lot.user_id;

insert into public.credit_lot_events (
  lot_id, user_id, event_type, credits, idempotency_key, metadata, created_at
)
select
  lot.id, lot.user_id, 'reconcile', lot.granted_credits,
  'backfill:' || lot.id::text,
  jsonb_build_object(
    'remainingCredits', lot.remaining_credits,
    'reconciliationStatus', lot.reconciliation_status
  ),
  now()
from public.credit_grant_lots lot
on conflict (idempotency_key) where idempotency_key is not null do nothing;

create or replace function private.sync_credit_lots_from_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := coalesce(new.metadata ->> 'creditLotAction', '');
  v_target_lot_id uuid;
  v_refund_request_id uuid;
  v_lot public.credit_grant_lots%rowtype;
  v_remaining integer;
  v_take integer;
begin
  begin
    v_target_lot_id := nullif(new.metadata ->> 'targetLotId', '')::uuid;
    v_refund_request_id := nullif(new.metadata ->> 'refundRequestId', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid_credit_lot_metadata';
  end;

  if v_action = 'hold' then
    if new.amount >= 0 or v_target_lot_id is null or v_refund_request_id is null then
      raise exception 'invalid_credit_lot_hold';
    end if;
    select * into v_lot from public.credit_grant_lots
     where id = v_target_lot_id and user_id = new.user_id for update;
    if not found or v_lot.reconciliation_status <> 'reconciled'
       or v_lot.remaining_credits - v_lot.held_credits < abs(new.amount) then
      raise exception 'credit_lot_hold_conflict';
    end if;
    update public.credit_grant_lots
       set held_credits = held_credits + abs(new.amount), updated_at = now()
     where id = v_target_lot_id;
    insert into public.credit_lot_events (
      lot_id, user_id, refund_request_id, ledger_id, event_type, credits, idempotency_key, metadata
    ) values (
      v_target_lot_id, new.user_id, v_refund_request_id, new.id, 'hold', abs(new.amount),
      'refund-hold:' || v_refund_request_id::text, new.metadata
    );
    return new;
  end if;

  if v_action = 'release' then
    if new.amount <= 0 or v_target_lot_id is null or v_refund_request_id is null then
      raise exception 'invalid_credit_lot_release';
    end if;
    select * into v_lot from public.credit_grant_lots
     where id = v_target_lot_id and user_id = new.user_id for update;
    if not found or v_lot.held_credits < new.amount then
      raise exception 'credit_lot_release_conflict';
    end if;
    update public.credit_grant_lots
       set held_credits = held_credits - new.amount, updated_at = now()
     where id = v_target_lot_id;
    insert into public.credit_lot_events (
      lot_id, user_id, refund_request_id, ledger_id, event_type, credits, idempotency_key, metadata
    ) values (
      v_target_lot_id, new.user_id, v_refund_request_id, new.id, 'release', new.amount,
      'refund-release:' || v_refund_request_id::text, new.metadata
    );
    return new;
  end if;

  if new.amount > 0 then
    if new.payment_transaction_id is not null then
      insert into public.credit_grant_lots (
        user_id, payment_transaction_id, source_ledger_id, source_type,
        granted_credits, remaining_credits, granted_at, metadata
      ) values (
        new.user_id, new.payment_transaction_id, new.id, 'payment',
        new.amount, new.amount, new.created_at, jsonb_build_object('ledgerId', new.id)
      )
      on conflict (payment_transaction_id) where payment_transaction_id is not null
      do update set
        granted_credits = public.credit_grant_lots.granted_credits + excluded.granted_credits,
        remaining_credits = public.credit_grant_lots.remaining_credits + excluded.remaining_credits,
        updated_at = now()
      returning * into v_lot;
    else
      insert into public.credit_grant_lots (
        user_id, source_ledger_id, source_type, granted_credits,
        remaining_credits, granted_at, metadata
      ) values (
        new.user_id, new.id,
        case when coalesce(new.reason, '') ilike '%free%' then 'free'
             when coalesce(new.reason, '') ilike '%compens%' then 'compensation'
             else 'adjustment' end,
        new.amount, new.amount, new.created_at, jsonb_build_object('ledgerId', new.id)
      ) returning * into v_lot;
    end if;
    insert into public.credit_lot_events (
      lot_id, user_id, ledger_id, event_type, credits, idempotency_key, metadata
    ) values (
      v_lot.id, new.user_id, new.id, 'grant', new.amount,
      'ledger-grant:' || new.id::text, new.metadata
    );
    return new;
  end if;

  v_remaining := abs(new.amount);
  for v_lot in
    select * from public.credit_grant_lots
     where user_id = new.user_id
       and reconciliation_status = 'reconciled'
       and remaining_credits > held_credits
     order by granted_at, id
     for update
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_lot.remaining_credits - v_lot.held_credits);
    update public.credit_grant_lots
       set remaining_credits = remaining_credits - v_take, updated_at = now()
     where id = v_lot.id;
    insert into public.credit_lot_events (
      lot_id, user_id, ledger_id, event_type, credits, idempotency_key, metadata
    ) values (
      v_lot.id, new.user_id, new.id, 'spend', v_take,
      'ledger-spend:' || new.id::text || ':' || v_lot.id::text, new.metadata
    );
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    update public.credit_grant_lots
       set reconciliation_status = 'reconciliation_required', updated_at = now()
     where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger sync_credit_lots_after_ledger_insert
after insert on public.credit_ledger
for each row execute function private.sync_credit_lots_from_ledger();

create table public.payment_refund_quotes (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  outcome_choice text not null check (outcome_choice in ('immediate_refund_and_cancel', 'cancel_at_period_end')),
  reason_category text not null check (reason_category in (
    'changed_mind', 'accidental_renewal', 'price', 'quality_expectation',
    'technical_issue', 'duplicate_charge', 'unauthorized_charge', 'privacy_or_safety', 'other'
  )),
  interview_answers jsonb not null default '{}'::jsonb,
  decision text not null check (decision in ('automatic', 'manual', 'period_end')),
  risk_codes text[] not null default '{}',
  policy_version text not null,
  original_amount_krw integer not null check (original_amount_krw >= 0),
  provider_cancellable_amount_krw integer not null check (provider_cancellable_amount_krw >= 0),
  credits_granted integer not null check (credits_granted >= 0),
  credits_remaining integer not null check (credits_remaining >= 0),
  credits_to_claw_back integer not null check (credits_to_claw_back >= 0),
  preserved_credits integer not null check (preserved_credits >= 0),
  refund_amount_krw integer not null check (refund_amount_krw >= 0),
  credit_lot_id uuid references public.credit_grant_lots(id) on delete set null,
  subscription_ends_at timestamptz,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index payment_refund_quotes_user_created
  on public.payment_refund_quotes (user_id, created_at desc);
create index payment_refund_quotes_expiry
  on public.payment_refund_quotes (expires_at) where consumed_at is null;

alter table public.payment_refund_requests
  add column quote_id uuid references public.payment_refund_quotes(id) on delete set null,
  add column idempotency_key uuid,
  add column outcome_choice text,
  add column reason_category text,
  add column decision text,
  add column risk_codes text[] not null default '{}',
  add column policy_version text,
  add column original_amount_krw integer,
  add column provider_cancellable_amount_krw integer,
  add column credits_granted integer,
  add column credits_remaining integer,
  add column credits_to_claw_back integer,
  add column preserved_credits integer,
  add column support_case_id uuid;

create unique index payment_refund_requests_idempotency_key
  on public.payment_refund_requests (idempotency_key) where idempotency_key is not null;
alter table public.payment_refund_requests
  drop constraint if exists payment_refund_requests_status_check;
alter table public.payment_refund_requests
  add constraint payment_refund_requests_status_check check (status in (
    'pending', 'queued', 'processing', 'cancel_pending', 'approved',
    'period_end_scheduled', 'completed', 'failed', 'manual_review_required', 'rejected'
  ));
alter table public.payment_refund_requests
  add constraint payment_refund_requests_outcome_check check (
    outcome_choice is null or outcome_choice in ('immediate_refund_and_cancel', 'cancel_at_period_end')
  ),
  add constraint payment_refund_requests_decision_check check (
    decision is null or decision in ('automatic', 'manual', 'period_end')
  );
drop index if exists public.idx_payment_refund_requests_one_open_per_payment;
create unique index idx_payment_refund_requests_one_open_per_payment
  on public.payment_refund_requests (payment_transaction_id)
  where status in ('pending', 'queued', 'processing', 'cancel_pending', 'approved', 'period_end_scheduled', 'manual_review_required');

create table public.refund_interview_responses (
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null unique references public.payment_refund_requests(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  reason_category text not null,
  answers jsonb not null,
  retain_until timestamptz not null default (now() + interval '3 years'),
  created_at timestamptz not null default now()
);

create table public.refund_support_cases (
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null unique references public.payment_refund_requests(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  priority text not null default 'high' check (priority in ('normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  reason_category text not null,
  summary text not null,
  retain_until timestamptz not null default (now() + interval '3 years'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_refund_requests
  add constraint payment_refund_requests_support_case_fk
  foreign key (support_case_id) references public.refund_support_cases(id) on delete set null;
alter table public.credit_lot_events
  add constraint credit_lot_events_refund_request_fk
  foreign key (refund_request_id) references public.payment_refund_requests(id) on delete set null;

create table public.refund_execution_outbox (
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null unique references public.payment_refund_requests(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'leased', 'retry_wait', 'cancel_pending', 'completed', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_cancel_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terminal_at timestamptz
);
create index refund_execution_outbox_claim
  on public.refund_execution_outbox (available_at, created_at)
  where status in ('pending', 'retry_wait');

create table public.refund_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null references public.payment_refund_requests(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  event_type text not null check (event_type in ('submitted', 'manual_review', 'cancel_pending', 'completed', 'failed', 'period_end_scheduled')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'retry_wait', 'sent', 'dead_letter')),
  channels text[] not null default array['in_app', 'email']::text[],
  event_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  sent_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (refund_request_id, event_type)
);
create index refund_notification_outbox_claim
  on public.refund_notification_outbox (available_at, created_at)
  where status in ('pending', 'retry_wait');

create or replace function private.claim_refund_notification(
  p_lease_token uuid,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_outbox public.refund_notification_outbox%rowtype;
begin
  if p_lease_token is null or p_lease_seconds not between 30 and 600 then
    raise exception 'invalid_refund_notification_lease';
  end if;
  select * into v_outbox from public.refund_notification_outbox
   where status in ('pending', 'retry_wait') and available_at <= now()
     and (lease_expires_at is null or lease_expires_at <= now())
   order by available_at, created_at
   limit 1 for update skip locked;
  if not found then return null; end if;
  update public.refund_notification_outbox
     set status = 'sending', lease_token = p_lease_token,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempt_count = attempt_count + 1, updated_at = now()
   where id = v_outbox.id returning * into v_outbox;
  return to_jsonb(v_outbox);
end;
$$;

create or replace function private.finish_refund_notification(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_outbox public.refund_notification_outbox%rowtype;
begin
  select * into v_outbox from public.refund_notification_outbox
   where id = p_outbox_id and lease_token = p_lease_token for update;
  if not found then raise exception 'refund_notification_lease_lost'; end if;
  update public.refund_notification_outbox
     set status = case when p_succeeded then 'sent'
                       when attempt_count >= 5 then 'dead_letter'
                       else 'retry_wait' end,
         available_at = case when not p_succeeded and attempt_count < 5
           then now() + make_interval(mins => least(60, greatest(1, attempt_count * 2)))
           else available_at end,
         last_error = case when p_succeeded then null else left(coalesce(p_error, 'notification_failed'), 1000) end,
         sent_at = case when p_succeeded then now() else sent_at end,
         terminal_at = case when p_succeeded or attempt_count >= 5 then now() else terminal_at end,
         lease_token = null, lease_expires_at = null, updated_at = now()
   where id = v_outbox.id returning * into v_outbox;
  return to_jsonb(v_outbox);
end;
$$;

create or replace function private.submit_payment_refund_request(
  p_user_id text,
  p_quote_id uuid,
  p_idempotency_key uuid,
  p_accepted_amount_krw integer,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.payment_refund_quotes%rowtype;
  v_existing public.payment_refund_requests%rowtype;
  v_request public.payment_refund_requests%rowtype;
  v_lot public.credit_grant_lots%rowtype;
  v_support public.refund_support_cases%rowtype;
  v_status text;
  v_refund_type text;
  v_detail text;
begin
  if btrim(coalesce(p_user_id, '')) = '' or p_quote_id is null
     or p_idempotency_key is null or p_accepted_amount_krw is null then
    raise exception 'invalid_refund_submission';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.payment_refund_requests
   where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.quote_id <> p_quote_id then
      raise exception 'refund_idempotency_conflict';
    end if;
    return to_jsonb(v_existing);
  end if;

  select * into v_quote from public.payment_refund_quotes
   where id = p_quote_id and user_id = p_user_id for update;
  if not found then raise exception 'refund_quote_not_found'; end if;
  if v_quote.consumed_at is not null then raise exception 'refund_quote_consumed'; end if;
  if v_quote.expires_at <= now() then raise exception 'refund_quote_expired'; end if;
  if v_quote.refund_amount_krw <> p_accepted_amount_krw then
    raise exception 'refund_quote_amount_changed';
  end if;

  if v_quote.decision = 'period_end' then
    v_status := 'period_end_scheduled';
  elsif v_quote.decision = 'automatic' then
    v_status := 'queued';
  else
    v_status := 'manual_review_required';
  end if;
  v_refund_type := case when v_quote.refund_amount_krw = v_quote.original_amount_krw then 'full' else 'partial' end;
  v_detail := left(btrim(coalesce(p_answers ->> 'detail', '')), 500);

  insert into public.payment_refund_requests (
    payment_transaction_id, user_id, requested_by, refund_type, amount_krw,
    reason, status, quote_id, idempotency_key, outcome_choice, reason_category,
    decision, risk_codes, policy_version, original_amount_krw,
    provider_cancellable_amount_krw, credits_granted, credits_remaining,
    credits_to_claw_back, preserved_credits, metadata
  ) values (
    v_quote.payment_transaction_id, p_user_id, p_user_id, v_refund_type,
    case when v_refund_type = 'partial' then v_quote.refund_amount_krw else null end,
    coalesce(nullif(v_detail, ''), v_quote.reason_category), v_status, v_quote.id,
    p_idempotency_key, v_quote.outcome_choice, v_quote.reason_category,
    v_quote.decision, v_quote.risk_codes, v_quote.policy_version,
    v_quote.original_amount_krw, v_quote.provider_cancellable_amount_krw,
    v_quote.credits_granted, v_quote.credits_remaining,
    v_quote.credits_to_claw_back, v_quote.preserved_credits,
    jsonb_build_object('source', 'refund_interview', 'quoteExpiresAt', v_quote.expires_at)
  ) returning * into v_request;

  insert into public.refund_interview_responses (
    refund_request_id, user_id, reason_category, answers
  ) values (v_request.id, p_user_id, v_quote.reason_category, coalesce(p_answers, '{}'::jsonb));

  if v_quote.reason_category in ('technical_issue', 'duplicate_charge', 'unauthorized_charge', 'privacy_or_safety') then
    insert into public.refund_support_cases (
      refund_request_id, user_id, priority, reason_category, summary
    ) values (
      v_request.id, p_user_id,
      case when v_quote.reason_category in ('unauthorized_charge', 'privacy_or_safety') then 'urgent' else 'high' end,
      v_quote.reason_category, coalesce(nullif(v_detail, ''), v_quote.reason_category)
    ) returning * into v_support;
    update public.payment_refund_requests set support_case_id = v_support.id where id = v_request.id
      returning * into v_request;
  end if;

  if v_quote.decision = 'period_end' then
    update public.user_subscriptions
       set cancel_at_period_end = true,
           canceled_at = coalesce(canceled_at, v_quote.subscription_ends_at, current_period_end),
           updated_at = now()
     where user_id = p_user_id and status in ('active', 'trialing', 'past_due');
  elsif v_quote.decision = 'automatic' then
    if v_quote.credits_to_claw_back > 0 then
      select * into v_lot from public.credit_grant_lots
       where id = v_quote.credit_lot_id and user_id = p_user_id for update;
      if not found or v_lot.reconciliation_status <> 'reconciled'
         or v_lot.remaining_credits - v_lot.held_credits <> v_quote.credits_to_claw_back then
        raise exception 'refund_credit_lot_changed';
      end if;
      insert into public.credit_ledger (
        user_id, payment_transaction_id, entry_type, amount, balance_after, reason, metadata
      ) values (
        p_user_id, v_quote.payment_transaction_id, 'adjustment', -v_quote.credits_to_claw_back,
        0, 'refund_credit_hold', jsonb_build_object(
          'creditLotAction', 'hold', 'targetLotId', v_lot.id,
          'refundRequestId', v_request.id, 'quoteId', v_quote.id
        )
      );
    end if;
    update public.user_subscriptions
       set cancel_at_period_end = true, updated_at = now()
     where user_id = p_user_id and status in ('active', 'trialing', 'past_due');
    insert into public.refund_execution_outbox (refund_request_id)
      values (v_request.id);
  end if;

  insert into public.refund_notification_outbox (
    refund_request_id, user_id, event_type, channels, event_payload
  ) values (
    v_request.id, p_user_id,
    case when v_status = 'manual_review_required' then 'manual_review'
         when v_status = 'period_end_scheduled' then 'period_end_scheduled'
         else 'submitted' end,
    array['in_app', 'email', 'push']::text[],
    jsonb_build_object('status', v_status, 'refundAmountKrw', v_quote.refund_amount_krw)
  );

  update public.payment_refund_quotes set consumed_at = now() where id = v_quote.id;
  return to_jsonb(v_request);
end;
$$;

create or replace function private.claim_refund_execution(
  p_lease_token uuid,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_outbox public.refund_execution_outbox%rowtype;
begin
  if p_lease_token is null or p_lease_seconds not between 30 and 600 then
    raise exception 'invalid_refund_execution_lease';
  end if;
  select * into v_outbox from public.refund_execution_outbox
   where status in ('pending', 'retry_wait') and available_at <= now()
     and (lease_expires_at is null or lease_expires_at <= now())
   order by available_at, created_at
   limit 1 for update skip locked;
  if not found then return null; end if;
  update public.refund_execution_outbox
     set status = 'leased', lease_token = p_lease_token,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempt_count = attempt_count + 1, updated_at = now()
   where id = v_outbox.id returning * into v_outbox;
  update public.payment_refund_requests set status = 'processing'
   where id = v_outbox.refund_request_id and status = 'queued';
  return to_jsonb(v_outbox);
end;
$$;

create or replace function private.finish_refund_execution(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_status text,
  p_provider_cancel_id text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outbox public.refund_execution_outbox%rowtype;
  v_request public.payment_refund_requests%rowtype;
  v_lot public.credit_grant_lots%rowtype;
  v_ledger public.credit_ledger%rowtype;
begin
  if p_status not in ('cancel_pending', 'completed', 'retry_wait', 'dead_letter') then
    raise exception 'invalid_refund_execution_status';
  end if;
  select * into v_outbox from public.refund_execution_outbox
   where id = p_outbox_id and lease_token = p_lease_token for update;
  if not found then raise exception 'refund_execution_lease_lost'; end if;
  select * into v_request from public.payment_refund_requests
   where id = v_outbox.refund_request_id for update;

  if p_status = 'dead_letter' and v_request.credits_to_claw_back > 0 then
    select * into v_lot from public.credit_grant_lots
     where payment_transaction_id = v_request.payment_transaction_id for update;
    if found and v_lot.held_credits > 0 then
      insert into public.credit_ledger (
        user_id, payment_transaction_id, entry_type, amount, balance_after, reason, metadata
      ) values (
        v_request.user_id, v_request.payment_transaction_id, 'adjustment', v_lot.held_credits,
        0, 'refund_credit_hold_release', jsonb_build_object(
          'creditLotAction', 'release', 'targetLotId', v_lot.id,
          'refundRequestId', v_request.id
        )
      ) returning * into v_ledger;
    end if;
  end if;

  update public.refund_execution_outbox
     set status = p_status,
         provider_cancel_id = coalesce(p_provider_cancel_id, provider_cancel_id),
         last_error = p_error,
         available_at = case when p_status = 'retry_wait'
           then now() + make_interval(mins => least(60, greatest(1, attempt_count * 2)))
           else available_at end,
         lease_token = null, lease_expires_at = null, updated_at = now(),
         terminal_at = case when p_status in ('completed', 'dead_letter') then now() else null end
   where id = v_outbox.id returning * into v_outbox;

  update public.payment_refund_requests
     set status = case
       when p_status = 'cancel_pending' then 'cancel_pending'
       when p_status = 'completed' then 'completed'
       when p_status = 'dead_letter' then 'failed'
       else 'queued' end,
       portone_cancel_id = coalesce(p_provider_cancel_id, portone_cancel_id),
       failed_code = case when p_status = 'dead_letter' then 'refund_execution_failed' else null end,
       failed_message = case when p_status = 'dead_letter' then p_error else null end,
       completed_at = case when p_status = 'completed' then now() else completed_at end,
       updated_at = now()
   where id = v_request.id;
  if p_status in ('cancel_pending', 'completed', 'dead_letter') then
    insert into public.refund_notification_outbox (
      refund_request_id, user_id, event_type, channels, event_payload
    ) values (
      v_request.id, v_request.user_id,
      case when p_status = 'dead_letter' then 'failed' else p_status end,
      array['in_app', 'email', 'push']::text[],
      jsonb_build_object('refundAmountKrw', coalesce(v_request.amount_krw, v_request.original_amount_krw), 'error', p_error)
    ) on conflict (refund_request_id, event_type) do nothing;
  end if;
  return to_jsonb(v_outbox);
end;
$$;

create or replace function private.finalize_automated_refund(
  p_payment_transaction_id uuid,
  p_provider_cancel_id text,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.payment_refund_requests%rowtype;
  v_lot public.credit_grant_lots%rowtype;
begin
  select * into v_request from public.payment_refund_requests
   where payment_transaction_id = p_payment_transaction_id
     and status in ('queued', 'processing', 'cancel_pending', 'approved')
   order by requested_at desc limit 1 for update;
  if not found then return null; end if;

  select * into v_lot from public.credit_grant_lots
   where payment_transaction_id = p_payment_transaction_id for update;
  if found and v_lot.held_credits > 0 then
    update public.credit_grant_lots
       set remaining_credits = remaining_credits - held_credits,
           held_credits = 0, updated_at = now()
     where id = v_lot.id;
    insert into public.credit_lot_events (
      lot_id, user_id, refund_request_id, event_type, credits, idempotency_key, metadata
    ) values (
      v_lot.id, v_request.user_id, v_request.id, 'clawback', v_lot.held_credits,
      'refund-clawback:' || v_request.id::text,
      jsonb_build_object('providerCancelId', p_provider_cancel_id, 'eventType', p_event_type)
    ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;

  update public.payment_refund_requests
     set status = 'completed', portone_cancel_id = coalesce(p_provider_cancel_id, portone_cancel_id),
         completed_at = coalesce(completed_at, now()), failed_code = null, failed_message = null,
         metadata = metadata || coalesce(p_metadata, '{}'::jsonb), updated_at = now()
   where id = v_request.id returning * into v_request;
  update public.refund_execution_outbox
     set status = 'completed', provider_cancel_id = coalesce(p_provider_cancel_id, provider_cancel_id),
         lease_token = null, lease_expires_at = null, terminal_at = coalesce(terminal_at, now()), updated_at = now()
   where refund_request_id = v_request.id and status <> 'completed';
  update public.user_subscriptions
     set status = 'canceled', cancel_at_period_end = true, canceled_at = coalesce(canceled_at, now()),
         pg_billing_key = null, pg_billing_key_encrypted = null, pg_billing_key_hash = null, updated_at = now()
   where user_id = v_request.user_id;
  insert into public.refund_notification_outbox (
    refund_request_id, user_id, event_type, channels, event_payload
  ) values (
    v_request.id, v_request.user_id, 'completed', array['in_app', 'email', 'push']::text[],
    jsonb_build_object('refundAmountKrw', coalesce(v_request.amount_krw, v_request.original_amount_krw))
  ) on conflict (refund_request_id, event_type) do nothing;
  return to_jsonb(v_request);
end;
$$;

create or replace function private.mark_automated_refund_cancel_pending(
  p_payment_transaction_id uuid,
  p_event_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.payment_refund_requests%rowtype;
  v_lot public.credit_grant_lots%rowtype;
begin
  select * into v_request from public.payment_refund_requests
   where payment_transaction_id = p_payment_transaction_id
     and decision = 'automatic'
     and status in ('queued', 'processing', 'cancel_pending')
   order by requested_at desc limit 1 for update;
  if not found then return null; end if;
  update public.payment_refund_requests
     set status = 'cancel_pending',
         metadata = metadata || jsonb_build_object('cancelPendingEventType', p_event_type),
         updated_at = now()
   where id = v_request.id returning * into v_request;
  update public.refund_execution_outbox
     set status = 'cancel_pending', lease_token = null, lease_expires_at = null, updated_at = now()
   where refund_request_id = v_request.id and status <> 'completed';
  insert into public.refund_notification_outbox (
    refund_request_id, user_id, event_type, channels, event_payload
  ) values (
    v_request.id, v_request.user_id, 'cancel_pending', array['in_app', 'email', 'push']::text[],
    jsonb_build_object('eventType', p_event_type)
  ) on conflict (refund_request_id, event_type) do nothing;
  return to_jsonb(v_request);
end;
$$;

create or replace function private.prepare_manual_refund_approval(
  p_refund_request_id uuid,
  p_actor_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.payment_refund_requests%rowtype;
  v_lot public.credit_grant_lots%rowtype;
begin
  if p_refund_request_id is null or btrim(coalesce(p_actor_user_id, '')) = '' then
    raise exception 'invalid_manual_refund_approval';
  end if;
  select * into v_request from public.payment_refund_requests
   where id = p_refund_request_id for update;
  if not found then raise exception 'refund_request_not_found'; end if;
  if v_request.status = 'manual_review_required' then
    if coalesce(v_request.credits_to_claw_back, 0) > 0 then
      select * into v_lot from public.credit_grant_lots
       where payment_transaction_id = v_request.payment_transaction_id
         and user_id = v_request.user_id
       for update;
      if not found or v_lot.reconciliation_status <> 'reconciled'
         or v_lot.remaining_credits - v_lot.held_credits <> v_request.credits_to_claw_back then
        raise exception 'manual_refund_credit_lot_changed';
      end if;
      insert into public.credit_ledger (
        user_id, payment_transaction_id, entry_type, amount, balance_after, reason, metadata
      ) values (
        v_request.user_id, v_request.payment_transaction_id, 'adjustment',
        -v_request.credits_to_claw_back, 0, 'manual_refund_credit_hold',
        jsonb_build_object(
          'creditLotAction', 'hold', 'targetLotId', v_lot.id,
          'refundRequestId', v_request.id
        )
      );
    end if;
    update public.payment_refund_requests
       set status = 'pending',
           metadata = metadata || jsonb_build_object(
             'manualReviewApprovedBy', p_actor_user_id,
             'manualReviewApprovedAt', now()
           ),
           updated_at = now()
     where id = v_request.id returning * into v_request;
  elsif v_request.status <> 'pending' then
    raise exception 'manual_refund_not_approvable';
  end if;
  return to_jsonb(v_request);
end;
$$;

create or replace function private.apply_refund_retention(
  p_limit integer default 500,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_quotes integer := 0; v_interviews integer := 0; v_cases integer := 0;
begin
  with due as (
    select id from public.payment_refund_quotes
     where consumed_at is null and created_at <= p_now - interval '30 days'
     order by created_at limit p_limit for update skip locked
  ) delete from public.payment_refund_quotes quote using due where quote.id = due.id;
  get diagnostics v_quotes = row_count;
  with due as (
    select id from public.refund_interview_responses where retain_until <= p_now
     order by retain_until limit p_limit for update skip locked
  ) delete from public.refund_interview_responses response using due where response.id = due.id;
  get diagnostics v_interviews = row_count;
  with due as (
    select id from public.refund_support_cases where retain_until <= p_now
     order by retain_until limit p_limit for update skip locked
  ) delete from public.refund_support_cases support using due where support.id = due.id;
  get diagnostics v_cases = row_count;
  return jsonb_build_object('quotesDeleted', v_quotes, 'interviewsDeleted', v_interviews, 'supportCasesDeleted', v_cases);
end;
$$;

create or replace function public.submit_payment_refund_request(
  p_user_id text, p_quote_id uuid, p_idempotency_key uuid,
  p_accepted_amount_krw integer, p_answers jsonb
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.submit_payment_refund_request(p_user_id, p_quote_id, p_idempotency_key, p_accepted_amount_krw, p_answers); $$;
create or replace function public.claim_refund_execution(p_lease_token uuid, p_lease_seconds integer default 120)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.claim_refund_execution(p_lease_token, p_lease_seconds); $$;
create or replace function public.finish_refund_execution(
  p_outbox_id uuid, p_lease_token uuid, p_status text,
  p_provider_cancel_id text default null, p_error text default null
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.finish_refund_execution(p_outbox_id, p_lease_token, p_status, p_provider_cancel_id, p_error); $$;
create or replace function public.finalize_automated_refund(
  p_payment_transaction_id uuid, p_provider_cancel_id text,
  p_event_type text, p_metadata jsonb default '{}'::jsonb
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.finalize_automated_refund(p_payment_transaction_id, p_provider_cancel_id, p_event_type, p_metadata); $$;
create or replace function public.apply_refund_retention(p_limit integer default 500, p_now timestamptz default now())
returns jsonb language sql security invoker set search_path = ''
as $$ select private.apply_refund_retention(p_limit, p_now); $$;
create or replace function public.mark_automated_refund_cancel_pending(p_payment_transaction_id uuid, p_event_type text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.mark_automated_refund_cancel_pending(p_payment_transaction_id, p_event_type); $$;
create or replace function public.prepare_manual_refund_approval(p_refund_request_id uuid, p_actor_user_id text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.prepare_manual_refund_approval(p_refund_request_id, p_actor_user_id); $$;
create or replace function public.claim_refund_notification(p_lease_token uuid, p_lease_seconds integer default 120)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.claim_refund_notification(p_lease_token, p_lease_seconds); $$;
create or replace function public.finish_refund_notification(p_outbox_id uuid, p_lease_token uuid, p_succeeded boolean, p_error text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.finish_refund_notification(p_outbox_id, p_lease_token, p_succeeded, p_error); $$;

alter table public.credit_grant_lots enable row level security;
alter table public.credit_grant_lots force row level security;
alter table public.credit_lot_events enable row level security;
alter table public.credit_lot_events force row level security;
alter table public.payment_refund_quotes enable row level security;
alter table public.payment_refund_quotes force row level security;
alter table public.refund_interview_responses enable row level security;
alter table public.refund_interview_responses force row level security;
alter table public.refund_support_cases enable row level security;
alter table public.refund_support_cases force row level security;
alter table public.refund_execution_outbox enable row level security;
alter table public.refund_execution_outbox force row level security;
alter table public.refund_notification_outbox enable row level security;
alter table public.refund_notification_outbox force row level security;

revoke all on table public.credit_grant_lots, public.credit_lot_events,
  public.payment_refund_quotes, public.refund_interview_responses,
  public.refund_support_cases, public.refund_execution_outbox,
  public.refund_notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.credit_grant_lots,
  public.payment_refund_quotes, public.refund_interview_responses,
  public.refund_support_cases, public.refund_execution_outbox,
  public.refund_notification_outbox to service_role;
grant select, insert on table public.credit_lot_events to service_role;
grant usage, select on sequence public.credit_lot_events_id_seq to service_role;

revoke all on function public.submit_payment_refund_request(text, uuid, uuid, integer, jsonb),
  public.claim_refund_execution(uuid, integer),
  public.finish_refund_execution(uuid, uuid, text, text, text),
  public.finalize_automated_refund(uuid, text, text, jsonb),
  public.apply_refund_retention(integer, timestamptz),
  public.mark_automated_refund_cancel_pending(uuid, text),
  public.prepare_manual_refund_approval(uuid, text),
  public.claim_refund_notification(uuid, integer),
  public.finish_refund_notification(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.submit_payment_refund_request(text, uuid, uuid, integer, jsonb),
  public.claim_refund_execution(uuid, integer),
  public.finish_refund_execution(uuid, uuid, text, text, text),
  public.finalize_automated_refund(uuid, text, text, jsonb),
  public.apply_refund_retention(integer, timestamptz),
  public.mark_automated_refund_cancel_pending(uuid, text),
  public.prepare_manual_refund_approval(uuid, text),
  public.claim_refund_notification(uuid, integer),
  public.finish_refund_notification(uuid, uuid, boolean, text)
  to service_role;

do $$
declare v_cron_schema name;
begin
  select namespace.nspname into v_cron_schema
    from pg_namespace namespace
   where namespace.nspname = 'cron' and to_regclass('cron.job') is not null;
  if v_cron_schema is not null then
    execute format(
      'select %1$I.unschedule(jobid) from %1$I.job where jobname = %2$L',
      v_cron_schema, 'refund-retention-daily'
    );
    execute format(
      'select %1$I.schedule(%2$L, %3$L, %4$L)',
      v_cron_schema, 'refund-retention-daily', '31 17 * * *',
      'select public.apply_refund_retention(1000, now());'
    );
  end if;
end;
$$;

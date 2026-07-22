-- Atomic paid-action execution contracts for Fashion Styler and Aftercare.
-- Server routes validate the signed HMAC quote first; these RPCs re-check the
-- authoritative subject, policy snapshot, balance, ownership, and replay state.

create table if not exists public.styling_credit_attempts (
  id uuid primary key default gen_random_uuid(),
  styling_session_id uuid not null references public.styling_sessions(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  idempotency_key text not null unique,
  quote_fingerprint text not null unique,
  quoted_balance integer not null,
  quote_expires_at timestamptz not null,
  quote_policy_version text not null,
  policy_version text not null default 'styling-lookbook-credit-v1',
  amount integer not null default 20,
  state text not null default 'reserved',
  reservation_ledger_id bigint not null unique references public.credit_ledger(id) on delete restrict,
  refund_ledger_id bigint unique references public.credit_ledger(id) on delete restrict,
  balance_after_reservation integer not null,
  balance_after_refund integer,
  lease_token uuid not null unique default gen_random_uuid(),
  lease_expires_at timestamptz not null,
  attempt_count integer not null default 1,
  reserved_at timestamptz not null default now(),
  committed_at timestamptz,
  released_at timestamptz,
  settlement_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint styling_credit_attempts_amount_check check (amount = 20),
  constraint styling_credit_attempts_quote_fingerprint_check
    check (quote_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint styling_credit_attempts_quote_policy_check
    check (length(btrim(quote_policy_version)) between 1 and 128),
  constraint styling_credit_attempts_policy_check
    check (policy_version = 'styling-lookbook-credit-v1'),
  constraint styling_credit_attempts_balance_check
    check (
      quoted_balance >= amount
      and balance_after_reservation >= 0
      and (balance_after_refund is null or balance_after_refund >= 0)
    ),
  constraint styling_credit_attempts_attempt_count_check check (attempt_count > 0),
  constraint styling_credit_attempts_state_check
    check (state in ('reserved', 'committed', 'released')),
  constraint styling_credit_attempts_state_shape_check
    check (
      (state = 'reserved' and committed_at is null and released_at is null and refund_ledger_id is null)
      or
      (state = 'committed' and committed_at is not null and released_at is null and refund_ledger_id is null)
      or
      (state = 'released' and committed_at is null and released_at is not null and refund_ledger_id is not null)
    )
);

create unique index if not exists idx_styling_credit_attempts_one_reserved
  on public.styling_credit_attempts (styling_session_id)
  where state = 'reserved';

create unique index if not exists idx_styling_credit_attempts_one_committed
  on public.styling_credit_attempts (styling_session_id)
  where state = 'committed';

create index if not exists idx_styling_credit_attempts_user_created
  on public.styling_credit_attempts (user_id, created_at desc);

drop trigger if exists trg_styling_credit_attempts_set_updated_at
  on public.styling_credit_attempts;
create trigger trg_styling_credit_attempts_set_updated_at
before update on public.styling_credit_attempts
for each row execute procedure public.set_updated_at();

alter table public.styling_credit_attempts enable row level security;
alter table public.styling_credit_attempts force row level security;
revoke all on table public.styling_credit_attempts from public, anon, authenticated;
grant select, insert, update on table public.styling_credit_attempts to service_role;

-- Preserve legacy Styler charges. Completed sessions become committed receipts;
-- failed charged sessions become expired reservations so the same session can
-- be retried without another debit.
insert into public.styling_credit_attempts (
  id,
  styling_session_id,
  generation_id,
  user_id,
  idempotency_key,
  quote_fingerprint,
  quoted_balance,
  quote_expires_at,
  quote_policy_version,
  amount,
  state,
  reservation_ledger_id,
  balance_after_reservation,
  lease_token,
  lease_expires_at,
  attempt_count,
  reserved_at,
  committed_at,
  settlement_reason
)
select
  gen_random_uuid(),
  session.id,
  session.generation_id,
  session.user_id,
  'styling:' || session.id::text || ':legacy-charge',
  md5(session.id::text || ':legacy-charge') || md5('legacy-charge:' || session.id::text),
  ledger.balance_after + 20,
  now() + interval '100 years',
  'legacy-styling-charge',
  20,
  case when session.status = 'completed' then 'committed' else 'reserved' end,
  ledger.id,
  ledger.balance_after,
  gen_random_uuid(),
  now() - interval '1 minute',
  1,
  ledger.created_at,
  case when session.status = 'completed' then coalesce(session.updated_at, ledger.created_at) else null end,
  'legacy_charge_backfill'
from public.styling_sessions as session
join lateral (
  select entry.id, entry.balance_after, entry.created_at
    from public.credit_ledger as entry
   where entry.user_id = session.user_id
     and entry.generation_id = session.generation_id
     and entry.entry_type = 'usage'
     and entry.reason = 'outfit_styling_usage'
     and entry.metadata ->> 'stylingSessionId' = session.id::text
   order by entry.created_at desc
   limit 1
) as ledger on true
where session.credits_used >= 20
  and session.status in ('completed', 'failed')
on conflict (idempotency_key) do nothing;

create or replace function public.read_styling_credit_receipt(
  p_styling_session_id uuid,
  p_user_id text
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $$
  select jsonb_build_object(
    'executionId', attempt.id,
    'action', 'outfit_generation',
    'subjectId', attempt.styling_session_id,
    'state', case attempt.state
      when 'committed' then 'charged'
      when 'released' then 'refunded'
      else 'reserved'
    end,
    'costCredits', attempt.amount,
    'chargedCredits', case when attempt.state = 'committed' then attempt.amount else 0 end,
    'refundedCredits', case when attempt.state = 'released' then attempt.amount else 0 end,
    'balanceAfter', case
      when attempt.state = 'released' then attempt.balance_after_refund
      else attempt.balance_after_reservation
    end,
    'freeReason', null,
    'ledgerId', attempt.reservation_ledger_id::text,
    'refundLedgerId', case when attempt.refund_ledger_id is null then null else attempt.refund_ledger_id::text end,
    'createdAt', attempt.reserved_at,
    'completedAt', coalesce(attempt.committed_at, attempt.released_at),
    'replayed', false
  )
  from public.styling_credit_attempts as attempt
  where attempt.styling_session_id = p_styling_session_id
    and attempt.user_id = p_user_id
  order by case attempt.state
      when 'committed' then 3
      when 'reserved' then 2
      else 1
    end desc,
    attempt.created_at desc,
    attempt.id desc
  limit 1;
$$;

revoke all on function public.read_styling_credit_receipt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.read_styling_credit_receipt(uuid, text)
  to service_role;

create or replace function public.begin_styling_execution(
  p_styling_session_id uuid,
  p_user_id text,
  p_quote jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_session public.styling_sessions%rowtype;
  v_generation public.generations%rowtype;
  v_attempt public.styling_credit_attempts%rowtype;
  v_attempt_id uuid := gen_random_uuid();
  v_lease_token uuid := gen_random_uuid();
  v_receipt jsonb;
  v_variant jsonb;
  v_quote_action text;
  v_quote_subject text;
  v_quote_scope text;
  v_quote_policy text;
  v_quote_cost integer;
  v_quote_balance integer;
  v_quote_balance_after integer;
  v_quote_allowed boolean;
  v_quote_expires_at timestamptz;
  v_quote_fingerprint text;
  v_current_balance integer;
  v_ledger_id bigint;
  v_balance_after integer;
begin
  if p_styling_session_id is null or nullif(btrim(p_user_id), '') is null then
    raise exception 'styling session and user are required';
  end if;

  select session.* into v_session
    from public.styling_sessions as session
   where session.id = p_styling_session_id
     and session.user_id = p_user_id
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'Styling session was not found for this user';
  end if;

  select generation.* into v_generation
    from public.generations as generation
   where generation.id = v_session.generation_id
     and generation.user_id = p_user_id
   for share;
  if not found then
    raise exception using errcode = '42501', message = 'Styling generation owner does not match';
  end if;

  if coalesce(v_generation.options #>> '{recommendationSet,selectedVariantId}', '')
       <> v_session.selected_variant_id then
    raise exception using errcode = 'P0001', message = 'STYLING_SELECTION_CHANGED: selected hairstyle changed';
  end if;

  select variant.value into v_variant
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_generation.options #> '{recommendationSet,variants}') = 'array'
          then v_generation.options #> '{recommendationSet,variants}'
        else '[]'::jsonb
      end
    ) as variant(value)
   where variant.value ->> 'id' = v_session.selected_variant_id
     and coalesce(nullif(variant.value ->> 'generatedImagePath', ''), nullif(variant.value ->> 'outputUrl', '')) is not null
   limit 1;
  if v_variant is null then
    raise exception using errcode = 'P0001', message = 'STYLING_SELECTION_CHANGED: selected hairstyle image is unavailable';
  end if;

  select attempt.* into v_attempt
    from public.styling_credit_attempts as attempt
   where attempt.styling_session_id = p_styling_session_id
     and attempt.state = 'committed'
   order by attempt.created_at desc
   limit 1
   for update;
  if found then
    v_receipt := public.read_styling_credit_receipt(p_styling_session_id, p_user_id);
    return jsonb_build_object(
      'canRun', false,
      'inProgress', false,
      'terminal', true,
      'attemptId', v_attempt.id,
      'leaseToken', null,
      'creditReceipt', v_receipt || jsonb_build_object('replayed', true)
    );
  end if;

  select attempt.* into v_attempt
    from public.styling_credit_attempts as attempt
   where attempt.styling_session_id = p_styling_session_id
     and attempt.state = 'reserved'
   order by attempt.created_at desc
   limit 1
   for update;
  if found then
    if v_attempt.lease_expires_at > v_now and v_session.status = 'generating' then
      v_receipt := public.read_styling_credit_receipt(p_styling_session_id, p_user_id);
      return jsonb_build_object(
        'canRun', false,
        'inProgress', true,
        'terminal', false,
        'attemptId', v_attempt.id,
        'leaseToken', null,
        'creditReceipt', v_receipt || jsonb_build_object('replayed', true)
      );
    end if;

    update public.styling_credit_attempts as attempt
       set lease_token = v_lease_token,
           lease_expires_at = v_now + interval '20 minutes',
           attempt_count = attempt.attempt_count + 1,
           settlement_reason = null
     where attempt.id = v_attempt.id
     returning * into v_attempt;

    update public.styling_sessions as session
       set status = 'generating', error_message = null
     where session.id = p_styling_session_id;

    v_receipt := public.read_styling_credit_receipt(p_styling_session_id, p_user_id);
    return jsonb_build_object(
      'canRun', true,
      'inProgress', false,
      'terminal', false,
      'attemptId', v_attempt.id,
      'leaseToken', v_attempt.lease_token,
      'creditReceipt', v_receipt || jsonb_build_object('replayed', true)
    );
  end if;

  if p_quote is null or jsonb_typeof(p_quote) <> 'object' then
    raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: styling quote snapshot is required';
  end if;
  begin
    v_quote_action := p_quote ->> 'action';
    v_quote_subject := p_quote ->> 'subjectId';
    v_quote_scope := p_quote ->> 'billingScope';
    v_quote_policy := p_quote ->> 'policyVersion';
    v_quote_cost := (p_quote ->> 'costCredits')::integer;
    v_quote_balance := (p_quote ->> 'currentBalance')::integer;
    v_quote_balance_after := (p_quote ->> 'balanceAfter')::integer;
    v_quote_allowed := (p_quote ->> 'isAllowed')::boolean;
    v_quote_expires_at := (p_quote ->> 'expiresAt')::timestamptz;
    v_quote_fingerprint := lower(p_quote ->> 'quoteFingerprint');
  exception when others then
    raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: styling quote snapshot is invalid';
  end;

  if v_quote_action <> 'outfit_generation'
     or v_quote_subject <> p_styling_session_id::text
     or v_quote_scope <> 'customer'
     or v_quote_policy <> 'hairfit-credit-policy-2026-07'
     or v_quote_cost <> 20
     or v_quote_allowed is not true
     or v_quote_expires_at <= v_now
     or v_quote_fingerprint !~ '^[0-9a-f]{64}$'
     or v_quote_balance_after <> v_quote_balance - 20 then
    raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: styling quote has expired or is inconsistent';
  end if;

  if exists (
    select 1
      from public.styling_credit_attempts as attempt
     where attempt.styling_session_id = p_styling_session_id
       and attempt.user_id = p_user_id
       and attempt.quote_fingerprint = v_quote_fingerprint
       and attempt.state = 'released'
  ) then
    raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: styling quote was already settled and refunded';
  end if;

  select users.credits into v_current_balance
    from public.users as users
   where users.id = p_user_id
   for update;
  if not found then
    raise exception 'User credit account was not found';
  end if;
  if v_current_balance <> v_quote_balance then
    raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: current credit balance no longer matches quote';
  end if;

  insert into public.credit_ledger (
    user_id, generation_id, entry_type, amount, balance_after, reason, metadata
  ) values (
    p_user_id,
    v_session.generation_id,
    'usage',
    -20,
    0,
    'outfit_styling_usage',
    jsonb_build_object(
      'source', 'begin_styling_execution',
      'stylingSessionId', p_styling_session_id,
      'stylingAttemptId', v_attempt_id,
      'policyVersion', 'styling-lookbook-credit-v1'
    )
  ) returning id, balance_after into v_ledger_id, v_balance_after;

  if v_balance_after <> v_quote_balance_after then
    raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: styling reserved balance does not match quote';
  end if;

  insert into public.styling_credit_attempts (
    id, styling_session_id, generation_id, user_id, idempotency_key,
    quote_fingerprint, quoted_balance, quote_expires_at, quote_policy_version,
    amount, state, reservation_ledger_id, balance_after_reservation,
    lease_token, lease_expires_at, reserved_at
  ) values (
    v_attempt_id,
    p_styling_session_id,
    v_session.generation_id,
    p_user_id,
    'styling:' || p_styling_session_id::text || ':' || v_quote_fingerprint,
    v_quote_fingerprint,
    v_quote_balance,
    v_quote_expires_at,
    v_quote_policy,
    20,
    'reserved',
    v_ledger_id,
    v_balance_after,
    v_lease_token,
    v_now + interval '20 minutes',
    v_now
  ) returning * into v_attempt;

  update public.styling_sessions as session
     set status = 'generating', error_message = null, credits_used = 0
   where session.id = p_styling_session_id;

  v_receipt := public.read_styling_credit_receipt(p_styling_session_id, p_user_id);
  return jsonb_build_object(
    'canRun', true,
    'inProgress', false,
    'terminal', false,
    'attemptId', v_attempt.id,
    'leaseToken', v_attempt.lease_token,
    'creditReceipt', v_receipt
  );
end;
$$;

revoke all on function public.begin_styling_execution(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.begin_styling_execution(uuid, text, jsonb)
  to service_role;

create or replace function public.settle_styling_execution(
  p_styling_session_id uuid,
  p_user_id text,
  p_attempt_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_generated_image_path text default null,
  p_error_message text default null,
  p_model_provider text default null,
  p_model_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_attempt public.styling_credit_attempts%rowtype;
  v_refund_ledger_id bigint;
  v_balance_after_refund integer;
  v_receipt jsonb;
begin
  if p_outcome not in ('success', 'failure') then
    raise exception 'p_outcome must be success or failure';
  end if;

  select attempt.* into v_attempt
    from public.styling_credit_attempts as attempt
   where attempt.id = p_attempt_id
     and attempt.styling_session_id = p_styling_session_id
     and attempt.user_id = p_user_id
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'Styling credit attempt was not found';
  end if;

  if v_attempt.state <> 'reserved' then
    v_receipt := public.read_styling_credit_receipt(p_styling_session_id, p_user_id);
    return v_receipt || jsonb_build_object('replayed', true);
  end if;
  if v_attempt.lease_token <> p_lease_token then
    raise exception using errcode = '40001', message = 'Styling execution lease is stale';
  end if;

  if p_outcome = 'success' then
    if nullif(btrim(p_generated_image_path), '') is null then
      raise exception 'generated image path is required for success';
    end if;

    update public.styling_sessions as session
       set status = 'completed',
           generated_image_path = btrim(p_generated_image_path),
           credits_used = v_attempt.amount,
           error_message = null,
           model_provider = coalesce(nullif(btrim(p_model_provider), ''), session.model_provider),
           model_name = coalesce(nullif(btrim(p_model_name), ''), session.model_name)
     where session.id = p_styling_session_id
       and session.user_id = p_user_id;

    update public.styling_credit_attempts as attempt
       set state = 'committed',
           committed_at = v_now,
           settlement_reason = 'lookbook_image_completed'
     where attempt.id = v_attempt.id;
  else
    insert into public.credit_ledger (
      user_id, generation_id, entry_type, amount, balance_after, reason, metadata
    ) values (
      v_attempt.user_id,
      v_attempt.generation_id,
      'refund',
      v_attempt.amount,
      0,
      'outfit_styling_failure_refund',
      jsonb_build_object(
        'source', 'settle_styling_execution',
        'stylingSessionId', p_styling_session_id,
        'stylingAttemptId', v_attempt.id,
        'reservationLedgerId', v_attempt.reservation_ledger_id::text,
        'reason', left(coalesce(nullif(btrim(p_error_message), ''), 'lookbook_generation_failed'), 500)
      )
    ) returning id, balance_after into v_refund_ledger_id, v_balance_after_refund;

    update public.styling_sessions as session
       set status = 'failed',
           error_message = left(coalesce(nullif(btrim(p_error_message), ''), '룩북 생성에 실패했습니다.'), 1000),
           credits_used = 0
     where session.id = p_styling_session_id
       and session.user_id = p_user_id;

    update public.styling_credit_attempts as attempt
       set state = 'released',
           refund_ledger_id = v_refund_ledger_id,
           balance_after_refund = v_balance_after_refund,
           released_at = v_now,
           settlement_reason = left(coalesce(nullif(btrim(p_error_message), ''), 'lookbook_generation_failed'), 256)
     where attempt.id = v_attempt.id;
  end if;

  return public.read_styling_credit_receipt(p_styling_session_id, p_user_id);
end;
$$;

revoke all on function public.settle_styling_execution(uuid, text, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_styling_execution(uuid, text, uuid, uuid, text, text, text, text, text)
  to service_role;

-- A user-level claim serializes the first-free program across different hair
-- generations. Legacy complete programs are backfilled below.
create table if not exists public.aftercare_free_claims (
  user_id text primary key references public.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  claimed_at timestamptz not null default now()
);

create table if not exists public.aftercare_program_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  selected_variant_id text not null,
  hair_record_id uuid not null unique references public.user_hair_records(id) on delete restrict,
  aftercare_guide_id uuid not null unique references public.user_aftercare_guides(id) on delete restrict,
  state text not null,
  free_reason text,
  charged_credits integer not null,
  balance_after integer not null,
  ledger_id bigint unique references public.credit_ledger(id) on delete restrict,
  quote_fingerprint text,
  quoted_balance integer,
  quote_expires_at timestamptz,
  quote_policy_version text,
  policy_version text not null default 'aftercare-program-credit-v1',
  care_scheduled_count integer not null default 6,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint aftercare_program_receipts_user_generation_key unique (user_id, generation_id),
  constraint aftercare_program_receipts_state_check check (state in ('free', 'charged')),
  constraint aftercare_program_receipts_charge_shape_check check (
    (state = 'free' and charged_credits = 0 and ledger_id is null and free_reason is not null)
    or
    (state = 'charged' and charged_credits = 30 and ledger_id is not null and free_reason is null)
  ),
  constraint aftercare_program_receipts_balance_check check (balance_after >= 0),
  constraint aftercare_program_receipts_quote_fingerprint_check
    check (quote_fingerprint is null or quote_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint aftercare_program_receipts_quote_shape_check check (
    (quote_fingerprint is null and quoted_balance is null and quote_expires_at is null and quote_policy_version is null)
    or
    (quote_fingerprint is not null and quoted_balance is not null and quote_expires_at is not null and quote_policy_version is not null)
  ),
  constraint aftercare_program_receipts_policy_check
    check (policy_version = 'aftercare-program-credit-v1'),
  constraint aftercare_program_receipts_content_count_check check (care_scheduled_count = 6)
);

create index if not exists idx_aftercare_program_receipts_user_created
  on public.aftercare_program_receipts (user_id, created_at desc);

alter table public.aftercare_free_claims enable row level security;
alter table public.aftercare_free_claims force row level security;
alter table public.aftercare_program_receipts enable row level security;
alter table public.aftercare_program_receipts force row level security;
revoke all on table public.aftercare_free_claims from public, anon, authenticated;
revoke all on table public.aftercare_program_receipts from public, anon, authenticated;
grant select, insert on table public.aftercare_free_claims to service_role;
grant select, insert on table public.aftercare_program_receipts to service_role;

-- Only fully formed legacy programs (guide + all six distinct scheduled
-- content types + generated marker) become durable receipts. Partial rows stay
-- repairable and do not consume the first-free claim.
with complete_programs as (
  select
    record.id as hair_record_id,
    record.user_id,
    record.generation_id,
    record.style_name,
    record.care_generated_at,
    guide.id as guide_id,
    min(content.created_at) as content_created_at,
    count(distinct content.content_type) as content_count
  from public.user_hair_records as record
  join public.user_aftercare_guides as guide
    on guide.hair_record_id = record.id
   and guide.user_id = record.user_id
  join public.user_care_contents as content
    on content.hair_record_id = record.id
   and content.user_id = record.user_id
  where record.generation_id is not null
    and record.care_generated_at is not null
  group by record.id, record.user_id, record.generation_id, record.style_name,
           record.care_generated_at, guide.id
  having count(*) = 6
     and count(distinct content.content_type) = 6
), legacy_rows as (
  select
    program.*,
    ledger.id as ledger_id,
    ledger.balance_after,
    row_number() over (partition by program.user_id order by program.care_generated_at, program.hair_record_id) as program_rank,
    coalesce(
      generation.options #>> '{recommendationSet,selectedVariantId}',
      'legacy:' || program.hair_record_id::text
    ) as selected_variant_id
  from complete_programs as program
  join public.generations as generation on generation.id = program.generation_id
  left join lateral (
    select entry.id, entry.balance_after
      from public.credit_ledger as entry
     where entry.user_id = program.user_id
       and entry.generation_id = program.generation_id
       and entry.entry_type = 'usage'
       and entry.reason = 'aftercare_program_usage'
     order by entry.created_at desc
     limit 1
  ) as ledger on true
)
insert into public.aftercare_program_receipts (
  user_id, generation_id, selected_variant_id, hair_record_id,
  aftercare_guide_id, state, free_reason, charged_credits, balance_after,
  ledger_id, policy_version, care_scheduled_count, completed_at
)
select
  legacy.user_id,
  legacy.generation_id,
  legacy.selected_variant_id,
  legacy.hair_record_id,
  legacy.guide_id,
  case when legacy.ledger_id is null then 'free' else 'charged' end,
  case when legacy.ledger_id is null then 'legacy_complete_program' else null end,
  case when legacy.ledger_id is null then 0 else 30 end,
  coalesce(legacy.balance_after, users.credits),
  legacy.ledger_id,
  'aftercare-program-credit-v1',
  6,
  legacy.care_generated_at
from legacy_rows as legacy
join public.users as users on users.id = legacy.user_id
on conflict (user_id, generation_id) do nothing;

insert into public.aftercare_free_claims (user_id, generation_id, claimed_at)
select distinct on (receipt.user_id)
  receipt.user_id,
  receipt.generation_id,
  receipt.completed_at
from public.aftercare_program_receipts as receipt
order by receipt.user_id, receipt.completed_at, receipt.id
on conflict (user_id) do nothing;

create or replace function public.read_aftercare_program_receipt(
  p_generation_id uuid,
  p_user_id text
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $$
  select jsonb_build_object(
    'executionId', receipt.id,
    'action', 'aftercare',
    'subjectId', receipt.generation_id,
    'state', receipt.state,
    'costCredits', receipt.charged_credits,
    'chargedCredits', receipt.charged_credits,
    'refundedCredits', 0,
    'balanceAfter', receipt.balance_after,
    'freeReason', receipt.free_reason,
    'ledgerId', case when receipt.ledger_id is null then null else receipt.ledger_id::text end,
    'refundLedgerId', null,
    'createdAt', receipt.created_at,
    'completedAt', receipt.completed_at,
    'replayed', false
  )
  from public.aftercare_program_receipts as receipt
  where receipt.generation_id = p_generation_id
    and receipt.user_id = p_user_id
  limit 1;
$$;

revoke all on function public.read_aftercare_program_receipt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.read_aftercare_program_receipt(uuid, text)
  to service_role;

create or replace function public.execute_aftercare_program(
  p_user_id text,
  p_generation_id uuid,
  p_selected_variant_id text,
  p_service_type text,
  p_service_date date,
  p_style_name text,
  p_next_visit_target_days integer,
  p_guide_json jsonb,
  p_care_contents jsonb,
  p_quote jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_generation public.generations%rowtype;
  v_record public.user_hair_records%rowtype;
  v_receipt public.aftercare_program_receipts%rowtype;
  v_variant jsonb;
  v_record_id uuid;
  v_guide_id uuid;
  v_existing_guide_id uuid;
  v_existing_content_row_count integer := 0;
  v_existing_content_count integer := 0;
  v_existing_program_complete boolean := false;
  v_existing_ledger_id bigint;
  v_existing_ledger_balance integer;
  v_has_free_claim boolean;
  v_expected_cost integer;
  v_is_repair boolean := false;
  v_quote_action text;
  v_quote_subject text;
  v_quote_scope text;
  v_quote_policy text;
  v_quote_cost integer;
  v_quote_balance integer;
  v_quote_balance_after integer;
  v_quote_allowed boolean;
  v_quote_expires_at timestamptz;
  v_quote_fingerprint text;
  v_current_balance integer;
  v_ledger_id bigint;
  v_balance_after integer;
  v_credit_receipt jsonb;
  v_care_count integer;
begin
  if nullif(btrim(p_user_id), '') is null
     or p_generation_id is null
     or nullif(btrim(p_selected_variant_id), '') is null then
    raise exception 'aftercare user, generation, and selected variant are required';
  end if;
  if p_service_type not in ('perm', 'color', 'cut', 'bleach', 'treatment', 'other') then
    raise exception 'unsupported service type';
  end if;
  if p_service_date is null or p_next_visit_target_days is null or p_next_visit_target_days <= 0 then
    raise exception 'valid service date and next visit days are required';
  end if;
  if nullif(btrim(p_style_name), '') is null or char_length(btrim(p_style_name)) > 80 then
    raise exception 'valid style name is required';
  end if;
  if p_guide_json is null or jsonb_typeof(p_guide_json) <> 'object' then
    raise exception 'aftercare guide must be an object';
  end if;
  if p_care_contents is null or jsonb_typeof(p_care_contents) <> 'array'
     or jsonb_array_length(p_care_contents) <> 6 then
    raise exception 'aftercare requires exactly six scheduled contents';
  end if;

  select generation.* into v_generation
    from public.generations as generation
   where generation.id = p_generation_id
     and generation.user_id = p_user_id
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'Aftercare generation was not found for this user';
  end if;

  select variant.value into v_variant
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_generation.options #> '{recommendationSet,variants}') = 'array'
          then v_generation.options #> '{recommendationSet,variants}'
        else '[]'::jsonb
      end
    ) as variant(value)
   where variant.value ->> 'id' = p_selected_variant_id
   limit 1;
  if v_variant is null then
    raise exception using errcode = 'P0001', message = 'SELECTION_LOCKED: selected hairstyle is unavailable';
  end if;

  select receipt.* into v_receipt
    from public.aftercare_program_receipts as receipt
   where receipt.user_id = p_user_id
     and receipt.generation_id = p_generation_id
   for update;
  if found then
    if v_receipt.selected_variant_id <> p_selected_variant_id then
      raise exception using errcode = 'P0001', message = 'SELECTION_LOCKED: another hairstyle is already confirmed';
    end if;
    v_credit_receipt := public.read_aftercare_program_receipt(p_generation_id, p_user_id);
    return jsonb_build_object(
      'hairRecordId', v_receipt.hair_record_id,
      'aftercareGuideId', v_receipt.aftercare_guide_id,
      'styleName', p_style_name,
      'serviceType', p_service_type,
      'serviceDate', p_service_date,
      'nextVisitTargetDays', p_next_visit_target_days,
      'careScheduledCount', v_receipt.care_scheduled_count,
      'chargedCredits', v_receipt.charged_credits,
      'firstAftercareProgramFreeUsed', v_receipt.state = 'free',
      'aftercareProgramCreditCost', 30,
      'alreadyConfirmed', true,
      'selectionLocked', true,
      'creditReceipt', v_credit_receipt || jsonb_build_object('replayed', true)
    );
  end if;

  select record.* into v_record
    from public.user_hair_records as record
   where record.user_id = p_user_id
     and record.generation_id = p_generation_id
   order by record.created_at desc
   limit 1
   for update;

  if found then
    if coalesce(v_generation.options #>> '{recommendationSet,selectedVariantId}', '') not in ('', p_selected_variant_id)
       or (
         coalesce(v_generation.options #>> '{recommendationSet,selectedVariantId}', '') = ''
         and v_record.style_name <> btrim(p_style_name)
       ) then
      raise exception using errcode = 'P0001', message = 'SELECTION_LOCKED: another hairstyle is already confirmed';
    end if;

    select guide.id into v_existing_guide_id
      from public.user_aftercare_guides as guide
     where guide.hair_record_id = v_record.id
       and guide.user_id = p_user_id
     limit 1;
    select count(*), count(distinct content.content_type)
      into v_existing_content_row_count, v_existing_content_count
      from public.user_care_contents as content
     where content.hair_record_id = v_record.id
       and content.user_id = p_user_id;
    select entry.id, entry.balance_after
      into v_existing_ledger_id, v_existing_ledger_balance
      from public.credit_ledger as entry
     where entry.user_id = p_user_id
       and entry.generation_id = p_generation_id
       and entry.entry_type = 'usage'
       and entry.reason = 'aftercare_program_usage'
     order by entry.created_at desc
     limit 1;
    v_existing_program_complete := v_existing_guide_id is not null
      and v_existing_content_row_count = 6
      and v_existing_content_count = 6;
    v_is_repair := not v_existing_program_complete;
  end if;

  select users.credits into v_current_balance
    from public.users as users
   where users.id = p_user_id
   for update;
  if not found then
    raise exception 'User credit account was not found';
  end if;

  select exists(
    select 1 from public.aftercare_free_claims as claim where claim.user_id = p_user_id
  ) into v_has_free_claim;
  v_expected_cost := case
    when v_existing_ledger_id is not null then 0
    when v_existing_program_complete then 0
    when v_has_free_claim then 30
    else 0
  end;

  if p_quote is null or jsonb_typeof(p_quote) <> 'object' then
    raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: aftercare quote snapshot is required';
  end if;
  begin
    v_quote_action := p_quote ->> 'action';
    v_quote_subject := p_quote ->> 'subjectId';
    v_quote_scope := p_quote ->> 'billingScope';
    v_quote_policy := p_quote ->> 'policyVersion';
    v_quote_cost := (p_quote ->> 'costCredits')::integer;
    v_quote_balance := (p_quote ->> 'currentBalance')::integer;
    v_quote_balance_after := (p_quote ->> 'balanceAfter')::integer;
    v_quote_allowed := (p_quote ->> 'isAllowed')::boolean;
    v_quote_expires_at := (p_quote ->> 'expiresAt')::timestamptz;
    v_quote_fingerprint := lower(p_quote ->> 'quoteFingerprint');
  exception when others then
    raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: aftercare quote snapshot is invalid';
  end;

  if v_quote_action <> 'aftercare'
     or v_quote_subject <> p_generation_id::text
     or v_quote_scope <> 'customer'
     or v_quote_policy <> 'hairfit-credit-policy-2026-07'
     or v_quote_cost <> v_expected_cost
     or v_quote_allowed is not true
     or v_quote_expires_at <= v_now
     or v_quote_fingerprint !~ '^[0-9a-f]{64}$'
     or v_quote_balance <> v_current_balance
     or v_quote_balance_after <> v_quote_balance - v_expected_cost then
    raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: aftercare quote has expired or is inconsistent';
  end if;

  if v_existing_ledger_id is null and v_expected_cost = 30 then
    insert into public.credit_ledger (
      user_id, generation_id, entry_type, amount, balance_after, reason, metadata
    ) values (
      p_user_id,
      p_generation_id,
      'usage',
      -30,
      0,
      'aftercare_program_usage',
      jsonb_build_object(
        'source', 'execute_aftercare_program',
        'policyVersion', 'aftercare-program-credit-v1',
        'selectedVariantId', p_selected_variant_id
      )
    ) returning id, balance_after into v_ledger_id, v_balance_after;
  elsif v_existing_ledger_id is not null then
    v_ledger_id := v_existing_ledger_id;
    v_balance_after := v_existing_ledger_balance;
  elsif v_existing_program_complete then
    if not v_has_free_claim then
      insert into public.aftercare_free_claims (user_id, generation_id, claimed_at)
      values (p_user_id, p_generation_id, v_now)
      on conflict (user_id) do nothing;
      if not found then
        raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: first-free aftercare claim was already used';
      end if;
    end if;
    v_balance_after := v_current_balance;
  else
    insert into public.aftercare_free_claims (user_id, generation_id, claimed_at)
    values (p_user_id, p_generation_id, v_now)
    on conflict (user_id) do nothing;
    if not found then
      raise exception using errcode = 'P0001', message = 'QUOTE_CHANGED: first-free aftercare claim was already used';
    end if;
    v_balance_after := v_current_balance;
  end if;

  if v_record.id is null then
    v_record_id := gen_random_uuid();
    insert into public.user_hair_records (
      id, user_id, generation_id, style_name, service_type, service_date,
      next_visit_target_days, care_generated_at
    ) values (
      v_record_id, p_user_id, p_generation_id, btrim(p_style_name), p_service_type,
      p_service_date, p_next_visit_target_days, v_now
    );
  else
    v_record_id := v_record.id;
    delete from public.user_care_contents where hair_record_id = v_record_id and user_id = p_user_id;
    delete from public.user_aftercare_guides where hair_record_id = v_record_id and user_id = p_user_id;
    update public.user_hair_records
       set style_name = btrim(p_style_name),
           service_type = p_service_type,
           service_date = p_service_date,
           next_visit_target_days = p_next_visit_target_days,
           care_generated_at = v_now
     where id = v_record_id and user_id = p_user_id;
  end if;

  v_guide_id := gen_random_uuid();
  insert into public.user_aftercare_guides (
    id, user_id, hair_record_id, guide_json
  ) values (
    v_guide_id, p_user_id, v_record_id, p_guide_json
  );

  insert into public.user_care_contents (
    user_id, hair_record_id, content_type, day_offset, subject,
    body_html, scheduled_send_at
  )
  select
    p_user_id,
    v_record_id,
    content.content_type,
    content.day_offset,
    content.subject,
    replace(content.body_html, '__HAIR_RECORD_ID__', v_record_id::text),
    content.scheduled_send_at
  from jsonb_to_recordset(p_care_contents) as content(
    content_type text,
    day_offset integer,
    subject text,
    body_html text,
    scheduled_send_at timestamptz
  );

  select count(distinct content.content_type) into v_care_count
    from public.user_care_contents as content
   where content.hair_record_id = v_record_id
     and content.user_id = p_user_id
     and content.content_type in (
       'dry_guide', 'day3_care', 'week1_tip',
       'month1_revisit', 'month1_trend', 'month3_cta'
     );
  if v_care_count <> 6 then
    raise exception 'aftercare transaction did not create all six content types';
  end if;

  update public.generations as generation
     set prompt_used = coalesce(v_variant ->> 'prompt', generation.prompt_used),
         generated_image_path = coalesce(v_variant ->> 'generatedImagePath', generation.generated_image_path),
         options = jsonb_set(
           generation.options,
           '{recommendationSet,selectedVariantId}',
           to_jsonb(p_selected_variant_id),
           true
         )
   where generation.id = p_generation_id
     and generation.user_id = p_user_id;

  insert into public.aftercare_program_receipts (
    user_id, generation_id, selected_variant_id, hair_record_id,
    aftercare_guide_id, state, free_reason, charged_credits, balance_after,
    ledger_id, quote_fingerprint, quoted_balance, quote_expires_at,
    quote_policy_version, care_scheduled_count, completed_at
  ) values (
    p_user_id,
    p_generation_id,
    p_selected_variant_id,
    v_record_id,
    v_guide_id,
    case when v_ledger_id is null then 'free' else 'charged' end,
    case
      when v_ledger_id is not null then null
      when v_existing_program_complete then 'legacy_complete_program'
      else 'first_aftercare_program'
    end,
    case when v_ledger_id is null then 0 else 30 end,
    v_balance_after,
    v_ledger_id,
    v_quote_fingerprint,
    v_quote_balance,
    v_quote_expires_at,
    v_quote_policy,
    6,
    v_now
  ) returning * into v_receipt;

  v_credit_receipt := public.read_aftercare_program_receipt(p_generation_id, p_user_id);
  return jsonb_build_object(
    'hairRecordId', v_record_id,
    'aftercareGuideId', v_guide_id,
    'styleName', btrim(p_style_name),
    'serviceType', p_service_type,
    'serviceDate', p_service_date,
    'nextVisitTargetDays', p_next_visit_target_days,
    'careScheduledCount', 6,
    'chargedCredits', v_receipt.charged_credits,
    'firstAftercareProgramFreeUsed', v_receipt.state = 'free',
    'aftercareProgramCreditCost', 30,
    'alreadyConfirmed', false,
    'selectionLocked', true,
    'repairedPartialProgram', v_is_repair,
    'creditReceipt', v_credit_receipt
  );
end;
$$;

revoke all on function public.execute_aftercare_program(text, uuid, text, text, date, text, integer, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.execute_aftercare_program(text, uuid, text, text, date, text, integer, jsonb, jsonb, jsonb)
  to service_role;

grant select, insert, update, delete on table public.user_hair_records to service_role;
grant select, insert, update, delete on table public.user_aftercare_guides to service_role;
grant select, insert, update, delete on table public.user_care_contents to service_role;

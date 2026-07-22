-- Reserve the generation-grid price at the durable acceptance boundary, then
-- settle that hold exactly once from authoritative generation state.

-- All current callers go through authenticated server routes backed by the
-- service-role client. The previous SECURITY DEFINER implementation checked
-- current_user for `authenticated`, which is not a valid caller check inside a
-- definer function. Keep the legacy RPC for non-generation paid actions, but
-- make it service-role-only and invoker scoped.
create or replace function public.consume_credits(
  p_user_id text,
  p_generation_id uuid,
  p_amount integer default 10,
  p_reason text default 'generation_usage',
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_generation_user_id text;
  v_ledger_id bigint;
begin
  if nullif(btrim(p_user_id), '') is null then
    raise exception 'p_user_id is required';
  end if;
  if p_generation_id is null then
    raise exception 'p_generation_id is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be > 0';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'p_reason is required';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'p_metadata must be a JSON object';
  end if;

  select generation.user_id
    into v_generation_user_id
    from public.generations as generation
   where generation.id = p_generation_id;

  if not found then
    raise exception 'Generation % not found', p_generation_id;
  end if;
  if v_generation_user_id <> p_user_id then
    raise exception using
      errcode = '42501',
      message = 'Generation billing user does not match its owner';
  end if;

  insert into public.credit_ledger (
    user_id,
    generation_id,
    entry_type,
    amount,
    balance_after,
    reason,
    metadata
  )
  values (
    p_user_id,
    p_generation_id,
    'usage',
    -1 * p_amount,
    0,
    btrim(p_reason),
    p_metadata
  )
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$$;

revoke all on function public.consume_credits(text, uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.consume_credits(text, uuid, integer, text, jsonb)
  to service_role;

-- RLS alone does not protect individual financial columns when a table-level
-- UPDATE grant is present. Current clients mutate these rows through server
-- APIs, so remove direct browser/mobile writes while keeping own-row SELECT
-- policies intact.
revoke insert, update, delete on table public.users from anon, authenticated;
revoke insert, update, delete on table public.generations from anon, authenticated;
revoke all on function public.ensure_user_profile(text, text, text)
  from public, anon, authenticated;
grant execute on function public.ensure_user_profile(text, text, text)
  to service_role;
grant select, insert, update on table public.users to service_role;
grant select, insert, update on table public.generations to service_role;
grant select, insert on table public.credit_ledger to service_role;

create table public.generation_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null unique
    references public.generations(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  idempotency_key text not null unique,
  billing_scope text not null default 'recommendation_grid',
  payer_scope text not null default 'customer',
  quote_fingerprint text,
  quoted_balance integer,
  quote_expires_at timestamptz,
  quote_policy_version text,
  policy_version text not null,
  amount integer not null,
  state text not null default 'reserved',
  reservation_ledger_id bigint not null unique
    references public.credit_ledger(id) on delete restrict,
  release_ledger_id bigint unique
    references public.credit_ledger(id) on delete restrict,
  balance_after_reservation integer not null,
  balance_after_release integer,
  reserved_at timestamptz not null default now(),
  committed_at timestamptz,
  released_at timestamptz,
  settlement_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint generation_credit_reservations_idempotency_key_check
    check (length(btrim(idempotency_key)) between 1 and 256),
  constraint generation_credit_reservations_billing_scope_check
    check (billing_scope = 'recommendation_grid'),
  constraint generation_credit_reservations_payer_scope_check
    check (payer_scope in ('customer', 'salon')),
  constraint generation_credit_reservations_quote_fingerprint_check
    check (quote_fingerprint is null or quote_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint generation_credit_reservations_quote_shape_check
    check (
      (
        quote_fingerprint is null
        and quoted_balance is null
        and quote_expires_at is null
        and quote_policy_version is null
      )
      or
      (
        quote_fingerprint is not null
        and quoted_balance is not null
        and quoted_balance >= amount
        and quote_expires_at is not null
        and quote_expires_at > reserved_at
        and quote_policy_version is not null
        and length(btrim(quote_policy_version)) between 1 and 128
      )
    ),
  constraint generation_credit_reservations_policy_version_check
    check (length(btrim(policy_version)) between 1 and 128),
  constraint generation_credit_reservations_amount_check
    check (amount > 0),
  constraint generation_credit_reservations_settlement_reason_check
    check (settlement_reason is null or length(settlement_reason) between 1 and 256),
  constraint generation_credit_reservations_balance_check
    check (
      balance_after_reservation >= 0
      and (balance_after_release is null or balance_after_release >= 0)
    ),
  constraint generation_credit_reservations_state_check
    check (state in ('reserved', 'committed', 'released')),
  constraint generation_credit_reservations_state_shape_check
    check (
      (
        state = 'reserved'
        and committed_at is null
        and released_at is null
        and release_ledger_id is null
        and balance_after_release is null
      )
      or
      (
        state = 'committed'
        and committed_at is not null
        and released_at is null
        and release_ledger_id is null
        and balance_after_release is null
      )
      or
      (
        state = 'released'
        and committed_at is null
        and released_at is not null
        and release_ledger_id is not null
        and balance_after_release is not null
      )
    )
);

create index idx_generation_credit_reservations_user_created
  on public.generation_credit_reservations (user_id, created_at desc);

create index idx_generation_credit_reservations_unsettled
  on public.generation_credit_reservations (created_at, generation_id)
  where state = 'reserved';

create unique index idx_credit_ledger_unique_recommendation_grid_release
  on public.credit_ledger (generation_id, reason)
  where generation_id is not null
    and entry_type = 'refund'
    and reason = 'recommendation_grid_full_failure_refund';

drop trigger if exists trg_generation_credit_reservations_set_updated_at
  on public.generation_credit_reservations;
create trigger trg_generation_credit_reservations_set_updated_at
before update on public.generation_credit_reservations
for each row
execute procedure public.set_updated_at();

alter table public.generation_credit_reservations enable row level security;
alter table public.generation_credit_reservations force row level security;

revoke all on table public.generation_credit_reservations from public, anon, authenticated;
grant select, insert, update on table public.generation_credit_reservations to service_role;

create or replace function public.read_generation_credit_receipt(
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
    'reservationId', reservation.id,
    'generationId', reservation.generation_id,
    'state', case reservation.state
      when 'committed' then 'charged'
      when 'released' then 'refunded'
      else 'reserved'
    end,
    'billingScope', reservation.billing_scope,
    'payerScope', reservation.payer_scope,
    'quoteFingerprint', reservation.quote_fingerprint,
    'quotedBalance', reservation.quoted_balance,
    'quoteExpiresAt', reservation.quote_expires_at,
    'quotePolicyVersion', reservation.quote_policy_version,
    'policyVersion', reservation.policy_version,
    'reservedCredits', reservation.amount,
    'chargedCredits', case when reservation.state = 'committed' then reservation.amount else 0 end,
    'refundedCredits', case when reservation.state = 'released' then reservation.amount else 0 end,
    'reservedAt', reservation.reserved_at,
    'chargedAt', reservation.committed_at,
    'refundedAt', reservation.released_at,
    'balanceAfterReservation', reservation.balance_after_reservation,
    'balanceAfterRefund', reservation.balance_after_release,
    'reservationLedgerId', reservation.reservation_ledger_id::text,
    'refundLedgerId', case
      when reservation.release_ledger_id is null then null
      else reservation.release_ledger_id::text
    end,
    'settlementReason', reservation.settlement_reason
  )
  from public.generation_credit_reservations as reservation
  where reservation.generation_id = p_generation_id
    and (p_user_id is null or reservation.user_id = p_user_id)
  limit 1;
$$;

revoke all on function public.read_generation_credit_receipt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.read_generation_credit_receipt(uuid, text)
  to service_role;

create or replace function public.settle_generation_credit_reservation(
  p_generation_id uuid,
  p_outcome text,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_reservation public.generation_credit_reservations%rowtype;
  v_release_ledger_id bigint;
  v_balance_after_release integer;
  v_recommendation_set jsonb;
  v_settlement_reason text;
begin
  if p_generation_id is null then
    raise exception 'p_generation_id is required';
  end if;
  if p_outcome not in ('commit', 'release') then
    raise exception 'p_outcome must be commit or release';
  end if;

  v_settlement_reason := left(
    coalesce(
      nullif(btrim(p_reason), ''),
      case
        when p_outcome = 'commit' then 'first_completed_variant'
        else 'generation_failed_without_results'
      end
    ),
    256
  );

  select reservation.*
    into v_reservation
    from public.generation_credit_reservations as reservation
   where reservation.generation_id = p_generation_id
   for update;

  if not found then
    -- Accepted generations created before this migration remain on the legacy
    -- first-variant charge path and must never be retroactively debited.
    return null;
  end if;

  if p_outcome = 'commit' then
    if v_reservation.state = 'released' then
      raise exception 'Generation credit reservation % was already released', v_reservation.id;
    end if;

    if v_reservation.state = 'reserved' then
      update public.generation_credit_reservations as reservation
         set state = 'committed',
             committed_at = v_now,
             settlement_reason = v_settlement_reason
       where reservation.id = v_reservation.id
       returning * into v_reservation;

      select generation.options -> 'recommendationSet'
        into v_recommendation_set
        from public.generations as generation
       where generation.id = p_generation_id;

      update public.generations as generation
         set credits_used = v_reservation.amount,
             options = case
               when jsonb_typeof(v_recommendation_set) = 'object' then
                 jsonb_set(
                   jsonb_set(
                     generation.options,
                     '{recommendationSet,creditChargedAt}',
                     to_jsonb(v_reservation.committed_at::text),
                     true
                   ),
                   '{recommendationSet,creditChargeAmount}',
                   to_jsonb(v_reservation.amount),
                   true
                 )
               else generation.options
             end,
             updated_at = v_now
       where generation.id = p_generation_id;
    end if;
  else
    if v_reservation.state = 'committed' then
      return public.read_generation_credit_receipt(
        v_reservation.generation_id,
        v_reservation.user_id
      );
    end if;

    if v_reservation.state = 'reserved' then
      insert into public.credit_ledger (
        user_id,
        generation_id,
        entry_type,
        amount,
        balance_after,
        reason,
        metadata
      )
      values (
        v_reservation.user_id,
        v_reservation.generation_id,
        'refund',
        v_reservation.amount,
        0,
        'recommendation_grid_full_failure_refund',
        jsonb_build_object(
          'source', 'settle_generation_credit_reservation',
          'reservationId', v_reservation.id,
          'reservationLedgerId', v_reservation.reservation_ledger_id::text,
          'policyVersion', v_reservation.policy_version,
          'releasedAt', v_now,
          'reason', v_settlement_reason
        )
      )
      returning id, balance_after
        into v_release_ledger_id, v_balance_after_release;

      update public.generation_credit_reservations as reservation
         set state = 'released',
             release_ledger_id = v_release_ledger_id,
             balance_after_release = v_balance_after_release,
             released_at = v_now,
             settlement_reason = v_settlement_reason
       where reservation.id = v_reservation.id
       returning * into v_reservation;

      update public.generations as generation
         set credits_used = 0,
             updated_at = v_now
       where generation.id = p_generation_id;
    end if;
  end if;

  return public.read_generation_credit_receipt(
    v_reservation.generation_id,
    v_reservation.user_id
  );
end;
$$;

revoke all on function public.settle_generation_credit_reservation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_generation_credit_reservation(uuid, text, text)
  to service_role;

create or replace function public.settle_generation_credit_from_authoritative_state()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_variants jsonb;
  v_has_completed_result boolean := false;
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role')
     or new.accepted_at is null then
    return new;
  end if;

  v_variants := new.options #> '{recommendationSet,variants}';
  if jsonb_typeof(v_variants) = 'array' then
    select exists (
      select 1
        from jsonb_array_elements(v_variants) as variant(value)
       where variant.value ->> 'status' = 'completed'
         and nullif(variant.value ->> 'generatedImagePath', '') is not null
    ) into v_has_completed_result;
  end if;

  if v_has_completed_result then
    perform public.settle_generation_credit_reservation(
      new.id,
      'commit',
      'first_completed_variant'
    );
  elsif new.status = 'failed' then
    perform public.settle_generation_credit_reservation(
      new.id,
      'release',
      coalesce(nullif(new.error_message, ''), 'generation_failed_without_results')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_generations_credit_settlement on public.generations;
create trigger trg_generations_credit_settlement
after update of status, options on public.generations
for each row
execute procedure public.settle_generation_credit_from_authoritative_state();

revoke all on function public.settle_generation_credit_from_authoritative_state()
  from public, anon, authenticated;
grant execute on function public.settle_generation_credit_from_authoritative_state()
  to service_role;

create or replace function public.accept_generation_upload_draft(
  p_draft_id uuid,
  p_user_id text,
  p_style_target text,
  p_options jsonb,
  p_credits_used integer,
  p_generated_assets_expires_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_draft public.generation_upload_drafts%rowtype;
  v_generation public.generations%rowtype;
  v_outbox public.generation_workflow_outbox%rowtype;
  v_reservation public.generation_credit_reservations%rowtype;
  v_reservation_ledger_id bigint;
  v_balance_after_reservation integer;
  v_options jsonb;
  v_credit_receipt jsonb;
  v_credit_quote jsonb;
  v_quoted_balance integer;
  v_quoted_balance_after integer;
  v_current_balance integer;
  v_quote_expires_at timestamptz;
  v_quote_fingerprint text;
  v_quote_policy_version text;
  v_quote_billing_scope text;
  v_quote_cost integer;
  v_quote_allowed boolean;
begin
  if p_draft_id is null then
    raise exception 'p_draft_id is required';
  end if;
  if nullif(btrim(p_user_id), '') is null then
    raise exception 'p_user_id is required';
  end if;
  if p_style_target is null or p_style_target not in ('male', 'female') then
    raise exception 'p_style_target must be male or female';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'object' then
    raise exception 'p_options must be a JSON object';
  end if;
  if p_credits_used is null or p_credits_used <= 0 then
    raise exception 'p_credits_used must be positive';
  end if;
  if p_credits_used <> 10 then
    raise exception 'generation-grid-credit-v1 requires exactly 10 credits';
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

    v_credit_receipt := public.read_generation_credit_receipt(
      v_generation.id,
      v_generation.user_id
    );

    return jsonb_build_object(
      'draftId', v_draft.id,
      'generationId', v_generation.id,
      'acceptedAt', v_generation.accepted_at,
      'preparationStatus', v_generation.preparation_status,
      'workflowOutboxId', v_outbox.id,
      'workflowDispatchStatus', v_outbox.status,
      'creditReceipt', v_credit_receipt,
      'billingMode', case
        when v_credit_receipt is null then 'legacy_unmanaged'
        else 'reserved_v1'
      end,
      'idempotentReplay', true
    );
  end if;

  if v_draft.state = 'expired' or v_draft.expires_at <= v_now then
    raise exception 'Upload draft % has expired', p_draft_id;
  end if;
  if v_draft.state <> 'ready' then
    raise exception 'Upload draft % cannot be accepted from state %', p_draft_id, v_draft.state;
  end if;

  v_credit_quote := p_options -> 'creditQuote';
  if v_credit_quote is not null then
    if jsonb_typeof(v_credit_quote) <> 'object' then
      raise exception using
        errcode = 'P0001',
        message = 'QUOTE_CHANGED: generation credit quote snapshot is invalid';
    end if;

    begin
      v_quote_policy_version := nullif(btrim(v_credit_quote ->> 'policyVersion'), '');
      v_quote_billing_scope := v_credit_quote ->> 'billingScope';
      v_quote_cost := (v_credit_quote ->> 'costCredits')::integer;
      v_quote_allowed := (v_credit_quote ->> 'isAllowed')::boolean;
      v_quoted_balance := (v_credit_quote ->> 'currentBalance')::integer;
      v_quoted_balance_after := (v_credit_quote ->> 'balanceAfter')::integer;
      v_quote_expires_at := (v_credit_quote ->> 'expiresAt')::timestamptz;
      v_quote_fingerprint := lower(v_credit_quote ->> 'quoteFingerprint');
    exception when others then
      raise exception using
        errcode = 'P0001',
        message = 'QUOTE_CHANGED: generation credit quote snapshot is invalid';
    end;

    if coalesce(v_credit_quote ->> 'action', '') <> 'hair_generation'
       or coalesce(v_credit_quote ->> 'subjectId', '') <> p_draft_id::text
       or coalesce(v_quote_policy_version, '') <> 'hairfit-credit-policy-2026-07'
       or coalesce(v_quote_billing_scope, '') not in ('customer', 'salon')
       or coalesce(v_quote_cost, -1) <> p_credits_used
       or coalesce(v_quote_allowed, false) is not true
       or (
         p_options ? 'payerScope'
         and coalesce(p_options ->> 'payerScope', '') <> v_quote_billing_scope
       )
       or v_quote_expires_at is null
       or v_quote_expires_at <= v_now
       or v_quote_fingerprint is null
       or v_quote_fingerprint !~ '^[0-9a-f]{64}$'
       or v_quoted_balance is null
       or v_quoted_balance_after is null
       or v_quoted_balance < p_credits_used
       or v_quoted_balance_after <> v_quoted_balance - p_credits_used then
      raise exception using
        errcode = 'P0001',
        message = 'QUOTE_CHANGED: generation credit quote has expired or is inconsistent';
    end if;

    select users.credits
      into v_current_balance
      from public.users as users
     where users.id = p_user_id
     for update;

    if not found then
      raise exception 'User credit account % was not found', p_user_id;
    end if;
    if v_current_balance <> v_quoted_balance then
      raise exception using
        errcode = 'P0001',
        message = 'QUOTE_CHANGED: current credit balance no longer matches quote';
    end if;
  end if;

  v_options := p_options || jsonb_build_object(
    'styleTarget', p_style_target,
    'uploadDraftId', p_draft_id,
    'creditPolicy', jsonb_build_object(
      'billingScope', 'recommendation_grid',
      'policyVersion', 'generation-grid-credit-v1',
      'reservedCredits', p_credits_used,
      'failurePolicy', jsonb_build_object(
        'partialFailure', 'included_failed_variant_retry',
        'totalFailure', 'automatic_full_restore'
      )
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

  insert into public.credit_ledger (
    user_id,
    generation_id,
    entry_type,
    amount,
    balance_after,
    reason,
    metadata
  )
  values (
    p_user_id,
    v_generation.id,
    'usage',
    -1 * p_credits_used,
    0,
    'recommendation_grid_usage',
    jsonb_build_object(
      'source', 'accept_generation_upload_draft',
      'mode', 'recommendation-grid-reservation',
      'draftId', v_draft.id,
      'generationId', v_generation.id,
      'policyVersion', 'generation-grid-credit-v1',
      'reservedAt', v_now
    )
  )
  returning id, balance_after
    into v_reservation_ledger_id, v_balance_after_reservation;

  if v_credit_quote is not null
     and v_balance_after_reservation <> v_quoted_balance_after then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_CHANGED: reserved balance does not match quote';
  end if;

  insert into public.generation_credit_reservations (
    generation_id,
    user_id,
    idempotency_key,
    billing_scope,
    payer_scope,
    quote_fingerprint,
    quoted_balance,
    quote_expires_at,
    quote_policy_version,
    policy_version,
    amount,
    state,
    reservation_ledger_id,
    balance_after_reservation,
    reserved_at
  )
  values (
    v_generation.id,
    v_generation.user_id,
    'generation-grid:' || v_generation.id::text || ':generation-grid-credit-v1',
    'recommendation_grid',
    coalesce(v_credit_quote ->> 'billingScope', p_options ->> 'payerScope', 'customer'),
    v_quote_fingerprint,
    v_quoted_balance,
    v_quote_expires_at,
    v_quote_policy_version,
    'generation-grid-credit-v1',
    p_credits_used,
    'reserved',
    v_reservation_ledger_id,
    v_balance_after_reservation,
    v_now
  )
  returning * into v_reservation;

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
    jsonb_build_object(
      'generationId', v_generation.id,
      'draftId', v_draft.id,
      'userId', v_generation.user_id,
      'acceptedAt', v_generation.accepted_at,
      'creditReservationId', v_reservation.id
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

  v_credit_receipt := public.read_generation_credit_receipt(
    v_generation.id,
    v_generation.user_id
  );

  return jsonb_build_object(
    'draftId', v_draft.id,
    'generationId', v_generation.id,
    'acceptedAt', v_generation.accepted_at,
    'preparationStatus', v_generation.preparation_status,
    'workflowOutboxId', v_outbox.id,
    'workflowDispatchStatus', v_outbox.status,
    'creditReceipt', v_credit_receipt,
    'billingMode', 'reserved_v1',
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.accept_generation_upload_draft(
  uuid, text, text, jsonb, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.accept_generation_upload_draft(
  uuid, text, text, jsonb, integer, timestamptz
) to service_role;

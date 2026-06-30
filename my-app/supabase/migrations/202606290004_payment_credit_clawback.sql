-- Conservative refund/cancellation credit clawback.
-- Full cancellation/refund claws back only currently available credits and
-- records any already-used remainder for manual operations review.

create table if not exists public.payment_credit_clawbacks (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null
    references public.payment_transactions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  ledger_id bigint references public.credit_ledger(id) on delete set null,
  credits_granted int not null check (credits_granted >= 0),
  credits_clawed_back int not null check (credits_clawed_back >= 0),
  credits_unrecovered int not null check (credits_unrecovered >= 0),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint payment_credit_clawbacks_payment_tx_key unique (payment_transaction_id)
);

create index if not exists idx_payment_credit_clawbacks_user_created_at
  on public.payment_credit_clawbacks (user_id, created_at desc);

alter table public.payment_credit_clawbacks enable row level security;
revoke all on table public.payment_credit_clawbacks from anon, authenticated;
grant select, insert on table public.payment_credit_clawbacks to service_role;

create or replace function public.claw_back_payment_credits(
  p_payment_transaction_id uuid,
  p_reason text default 'payment_refund_clawback',
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  clawback_id uuid,
  ledger_id bigint,
  credits_granted int,
  credits_clawed_back int,
  credits_unrecovered int,
  already_processed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.payment_transactions;
  v_user_credits int;
  v_granted int;
  v_clawback int;
  v_unrecovered int;
  v_existing public.payment_credit_clawbacks;
  v_ledger_id bigint;
  v_clawback_id uuid;
begin
  if p_payment_transaction_id is null then
    raise exception 'p_payment_transaction_id is required';
  end if;

  select *
    into v_existing
    from public.payment_credit_clawbacks
   where payment_transaction_id = p_payment_transaction_id;

  if found then
    return query
      select
        v_existing.id,
        v_existing.ledger_id,
        v_existing.credits_granted,
        v_existing.credits_clawed_back,
        v_existing.credits_unrecovered,
        true;
    return;
  end if;

  select *
    into v_tx
    from public.payment_transactions
   where id = p_payment_transaction_id
   for update;

  if not found then
    raise exception 'payment transaction not found: %', p_payment_transaction_id;
  end if;

  select *
    into v_existing
    from public.payment_credit_clawbacks
   where payment_transaction_id = p_payment_transaction_id;

  if found then
    return query
      select
        v_existing.id,
        v_existing.ledger_id,
        v_existing.credits_granted,
        v_existing.credits_clawed_back,
        v_existing.credits_unrecovered,
        true;
    return;
  end if;

  select coalesce(sum(amount), 0)
    into v_granted
    from public.credit_ledger
   where payment_transaction_id = p_payment_transaction_id
     and entry_type in ('purchase', 'grant')
     and amount > 0;

  select credits
    into v_user_credits
    from public.users
   where id = v_tx.user_id
   for update;

  if v_user_credits is null then
    raise exception 'user not found: %', v_tx.user_id;
  end if;

  v_clawback := least(v_granted, greatest(v_user_credits, 0));
  v_unrecovered := greatest(v_granted - v_clawback, 0);

  if v_clawback > 0 then
    insert into public.credit_ledger (
      user_id,
      payment_transaction_id,
      entry_type,
      amount,
      balance_after,
      reason,
      metadata
    )
    values (
      v_tx.user_id,
      p_payment_transaction_id,
      'adjustment',
      -1 * v_clawback,
      0,
      p_reason,
      jsonb_build_object(
        'provider', v_tx.provider,
        'provider_order_id', v_tx.provider_order_id,
        'payment_transaction_id', v_tx.id,
        'credits_granted', v_granted,
        'credits_clawed_back', v_clawback,
        'credits_unrecovered', v_unrecovered
      ) || coalesce(p_metadata, '{}'::jsonb)
    )
    returning id into v_ledger_id;
  end if;

  insert into public.payment_credit_clawbacks (
    payment_transaction_id,
    user_id,
    ledger_id,
    credits_granted,
    credits_clawed_back,
    credits_unrecovered,
    reason,
    metadata
  )
  values (
    p_payment_transaction_id,
    v_tx.user_id,
    v_ledger_id,
    v_granted,
    v_clawback,
    v_unrecovered,
    p_reason,
    jsonb_build_object(
      'provider', v_tx.provider,
      'provider_order_id', v_tx.provider_order_id,
      'payment_status', v_tx.status
    ) || coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_clawback_id;

  return query
    select
      v_clawback_id,
      v_ledger_id,
      v_granted,
      v_clawback,
      v_unrecovered,
      false;
end;
$$;

revoke all on function public.claw_back_payment_credits(uuid, text, jsonb) from public;
grant execute on function public.claw_back_payment_credits(uuid, text, jsonb) to service_role;

-- HairFit AI credit helper functions and seed support
-- Depends on: 202602090001_init_hairfit.sql

create unique index if not exists idx_credit_ledger_unique_purchase_payment
  on public.credit_ledger (payment_transaction_id)
  where entry_type = 'purchase' and payment_transaction_id is not null;

create or replace function public.ensure_user_profile(
  p_user_id text,
  p_email text,
  p_display_name text default null
)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'p_user_id is required';
  end if;

  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'p_email is required';
  end if;

  insert into public.users (id, email, display_name)
  values (p_user_id, p_email, p_display_name)
  on conflict (id)
  do update
     set email = excluded.email,
         display_name = coalesce(excluded.display_name, public.users.display_name),
         updated_at = timezone('utc', now());

  select *
    into v_user
    from public.users
   where id = p_user_id;

  return v_user;
end;
$$;

create or replace function public.grant_credits(
  p_user_id text,
  p_amount integer,
  p_entry_type public.credit_entry_type default 'grant',
  p_reason text default 'manual_grant',
  p_metadata jsonb default '{}'::jsonb,
  p_payment_transaction_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be > 0';
  end if;

  if p_entry_type not in ('grant', 'purchase', 'refund', 'adjustment') then
    raise exception 'invalid positive entry_type: %', p_entry_type;
  end if;

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
    p_user_id,
    p_payment_transaction_id,
    p_entry_type,
    p_amount,
    0,
    p_reason,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$$;

create or replace function public.consume_credits(
  p_user_id text,
  p_generation_id uuid,
  p_amount integer default 2,
  p_reason text default 'generation_usage',
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id bigint;
  v_auth_user_id text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be > 0';
  end if;

  -- authenticated role can only consume own credits
  begin
    v_auth_user_id := auth.jwt() ->> 'sub';
  exception
    when others then
      v_auth_user_id := null;
  end;

  if current_user = 'authenticated' and v_auth_user_id is distinct from p_user_id then
    raise exception 'forbidden: cannot consume credits for another user';
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
    p_reason,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$$;

create or replace function public.apply_payment_credits(
  p_payment_transaction_id uuid,
  p_reason text default 'payment_confirmed'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.payment_transactions;
  v_ledger_id bigint;
begin
  if p_payment_transaction_id is null then
    raise exception 'p_payment_transaction_id is required';
  end if;

  select *
    into v_tx
    from public.payment_transactions
   where id = p_payment_transaction_id
   for update;

  if not found then
    raise exception 'payment transaction not found: %', p_payment_transaction_id;
  end if;

  if v_tx.status <> 'paid' then
    raise exception 'payment status must be paid. current: %', v_tx.status;
  end if;

  -- idempotent: return existing purchase ledger if already granted
  select id
    into v_ledger_id
    from public.credit_ledger
   where payment_transaction_id = p_payment_transaction_id
     and entry_type = 'purchase'
   limit 1;

  if v_ledger_id is not null then
    return v_ledger_id;
  end if;

  v_ledger_id := public.grant_credits(
    v_tx.user_id,
    v_tx.credits_to_grant,
    'purchase',
    p_reason,
    jsonb_build_object(
      'provider', v_tx.provider,
      'provider_order_id', v_tx.provider_order_id,
      'payment_transaction_id', v_tx.id
    ),
    v_tx.id
  );

  return v_ledger_id;
end;
$$;

revoke all on function public.ensure_user_profile(text, text, text) from public;
revoke all on function public.grant_credits(text, integer, public.credit_entry_type, text, jsonb, uuid) from public;
revoke all on function public.consume_credits(text, uuid, integer, text, jsonb) from public;
revoke all on function public.apply_payment_credits(uuid, text) from public;

grant execute on function public.ensure_user_profile(text, text, text) to authenticated, service_role;
grant execute on function public.consume_credits(text, uuid, integer, text, jsonb) to authenticated, service_role;
grant execute on function public.grant_credits(text, integer, public.credit_entry_type, text, jsonb, uuid) to service_role;
grant execute on function public.apply_payment_credits(uuid, text) to service_role;

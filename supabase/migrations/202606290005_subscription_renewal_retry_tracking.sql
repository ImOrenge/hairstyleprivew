-- Track subscription renewal failures so past_due rows are operable.
-- The grace/expiry policy is intentionally left to a later product decision;
-- this migration only records retry state and makes due past_due rows visible.

alter table public.user_subscriptions
  add column if not exists renewal_failure_count int not null default 0,
  add column if not exists renewal_last_failed_at timestamptz,
  add column if not exists renewal_next_retry_at timestamptz,
  add column if not exists renewal_failure_code text,
  add column if not exists renewal_failure_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_subscriptions_renewal_failure_count_nonnegative'
      and conrelid = 'public.user_subscriptions'::regclass
  ) then
    alter table public.user_subscriptions
      add constraint user_subscriptions_renewal_failure_count_nonnegative
      check (renewal_failure_count >= 0);
  end if;
end $$;

create index if not exists idx_user_subscriptions_renewal_next_retry
  on public.user_subscriptions (renewal_next_retry_at)
  where status = 'past_due'
    and cancel_at_period_end = false;

drop function if exists public.get_subscriptions_due_for_renewal(timestamptz);

create or replace function public.get_subscriptions_due_for_renewal(
  p_cutoff timestamptz default now() + interval '1 day'
)
returns table (
  subscription_id uuid,
  user_id text,
  plan_key text,
  pg_billing_key text,
  credits_per_cycle int,
  amount_krw int,
  renewal_failure_count int
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.user_id,
    s.plan_key,
    s.pg_billing_key,
    s.credits_per_cycle,
    case s.plan_key
      when 'basic' then 9900
      when 'standard' then 19900
      when 'pro' then 49900
      when 'salon' then 39900
      else 0
    end as amount_krw,
    s.renewal_failure_count
  from public.user_subscriptions s
  where s.cancel_at_period_end = false
    and (
      (
        s.status = 'active'
        and s.current_period_end <= p_cutoff
      )
      or (
        s.status = 'past_due'
        and coalesce(s.renewal_next_retry_at, s.current_period_end) <= now()
      )
    )
    and (
      s.pg_billing_key_encrypted is not null
      or s.pg_billing_key is not null
    );
$$;

create or replace function public.advance_subscription_period(
  p_subscription_id uuid,
  p_payment_id text,
  p_new_period_start timestamptz,
  p_new_period_end timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest_payment_id text;
begin
  select pg_latest_payment_id
    into v_latest_payment_id
    from public.user_subscriptions
   where id = p_subscription_id
   for update;

  if not found then
    raise exception 'subscription not found: %', p_subscription_id;
  end if;

  if v_latest_payment_id = p_payment_id then
    return;
  end if;

  update public.user_subscriptions
  set
    current_period_start = p_new_period_start,
    current_period_end = p_new_period_end,
    pg_latest_payment_id = p_payment_id,
    status = 'active',
    renewal_failure_count = 0,
    renewal_last_failed_at = null,
    renewal_next_retry_at = null,
    renewal_failure_code = null,
    renewal_failure_message = null,
    updated_at = now()
  where id = p_subscription_id;
end;
$$;

revoke all on function public.get_subscriptions_due_for_renewal(timestamptz) from public;
revoke all on function public.advance_subscription_period(uuid, text, timestamptz, timestamptz) from public;

grant execute on function public.get_subscriptions_due_for_renewal(timestamptz) to service_role;
grant execute on function public.advance_subscription_period(uuid, text, timestamptz, timestamptz) to service_role;

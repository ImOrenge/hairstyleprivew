-- Align PortOne monthly plan prices and credit benefits.
-- Basic: 9,900 KRW / 80 credits
-- Standard: 19,900 KRW / 200 credits
-- Pro: 49,900 KRW / 600 credits

update public.user_subscriptions
set
  credits_per_cycle = case plan_key
    when 'basic' then 80
    when 'standard' then 200
    when 'pro' then 600
    else credits_per_cycle
  end,
  updated_at = now()
where plan_key in ('basic', 'standard', 'pro')
  and credits_per_cycle is distinct from case plan_key
    when 'basic' then 80
    when 'standard' then 200
    when 'pro' then 600
    else credits_per_cycle
  end;

create or replace function public.get_subscriptions_due_for_renewal(
  p_cutoff timestamptz default now() + interval '1 day'
)
returns table (
  subscription_id uuid,
  user_id text,
  plan_key text,
  pg_billing_key text,
  credits_per_cycle int,
  amount_krw int
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
    end as amount_krw
  from public.user_subscriptions s
  where s.status = 'active'
    and s.cancel_at_period_end = false
    and s.current_period_end <= p_cutoff
    and s.pg_billing_key is not null;
$$;

revoke all on function public.get_subscriptions_due_for_renewal(timestamptz) from public;
grant execute on function public.get_subscriptions_due_for_renewal(timestamptz) to service_role;

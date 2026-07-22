-- Store new PortOne billing keys as ciphertext plus a deterministic keyed hash.
-- pg_billing_key remains for legacy rows until a controlled backfill is run.

alter table public.user_subscriptions
  add column if not exists pg_billing_key_encrypted text,
  add column if not exists pg_billing_key_hash text;

create unique index if not exists idx_user_subscriptions_pg_billing_key_hash
  on public.user_subscriptions (pg_billing_key_hash)
  where pg_billing_key_hash is not null;

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
    and (
      s.pg_billing_key_encrypted is not null
      or s.pg_billing_key is not null
    );
$$;

revoke all on function public.get_subscriptions_due_for_renewal(timestamptz) from public;
grant execute on function public.get_subscriptions_due_for_renewal(timestamptz) to service_role;

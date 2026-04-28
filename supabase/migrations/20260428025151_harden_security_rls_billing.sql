-- Harden sensitive tables and make subscription credit grants idempotent.

do $$
begin
  if to_regclass('public.user_subscriptions') is not null then
    execute 'alter table public.user_subscriptions enable row level security';
    execute 'revoke all on table public.user_subscriptions from anon, authenticated';
    execute 'drop policy if exists "user_subscriptions_select_own" on public.user_subscriptions';
    execute $policy$
      create policy "user_subscriptions_select_own"
        on public.user_subscriptions
        for select
        to authenticated
        using (user_id = auth.jwt() ->> 'sub')
    $policy$;
  end if;

  if to_regclass('public.user_hair_records') is not null then
    execute 'alter table public.user_hair_records enable row level security';
    execute 'revoke all on table public.user_hair_records from anon, authenticated';
    execute 'drop policy if exists "user_hair_records_select_own" on public.user_hair_records';
    execute $policy$
      create policy "user_hair_records_select_own"
        on public.user_hair_records
        for select
        to authenticated
        using (user_id = auth.jwt() ->> 'sub')
    $policy$;
  end if;

  if to_regclass('public.user_care_contents') is not null then
    execute 'alter table public.user_care_contents enable row level security';
    execute 'revoke all on table public.user_care_contents from anon, authenticated';
    execute 'drop policy if exists "user_care_contents_select_own" on public.user_care_contents';
    execute $policy$
      create policy "user_care_contents_select_own"
        on public.user_care_contents
        for select
        to authenticated
        using (user_id = auth.jwt() ->> 'sub')
    $policy$;
  end if;

  if to_regclass('public.trend_alerts') is not null then
    execute 'alter table public.trend_alerts enable row level security';
    execute 'revoke all on table public.trend_alerts from anon, authenticated';
  end if;

  if to_regclass('public.b2b_leads') is not null then
    execute 'revoke all on table public.b2b_leads from anon, authenticated';
  end if;
end
$$;

create unique index if not exists idx_credit_ledger_unique_paid_transaction
  on public.credit_ledger (payment_transaction_id)
  where entry_type in ('purchase', 'grant') and payment_transaction_id is not null;

create or replace function public.grant_subscription_credits(
  p_user_id text,
  p_credits int,
  p_subscription_id uuid,
  p_reason text default 'subscription_renewal',
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
  if p_credits is null or p_credits <= 0 then
    raise exception 'p_credits must be > 0';
  end if;

  if p_payment_transaction_id is not null then
    select id
      into v_ledger_id
      from public.credit_ledger
     where payment_transaction_id = p_payment_transaction_id
       and entry_type in ('purchase', 'grant')
     limit 1;

    if v_ledger_id is not null then
      return v_ledger_id;
    end if;
  end if;

  v_ledger_id := public.grant_credits(
    p_user_id,
    p_credits,
    'purchase',
    p_reason,
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'payment_transaction_id', p_payment_transaction_id
    ),
    p_payment_transaction_id
  );

  return v_ledger_id;
end;
$$;

do $$
begin
  if to_regclass('public.user_subscriptions') is not null then
    execute $fn$
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
      as $body$
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
          updated_at = now()
        where id = p_subscription_id;
      end;
      $body$
    $fn$;
  end if;
end
$$;

revoke all on function public.grant_subscription_credits(text, int, uuid, text, uuid) from public;
grant execute on function public.grant_subscription_credits(text, int, uuid, text, uuid) to service_role;

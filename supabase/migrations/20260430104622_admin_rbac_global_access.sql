-- Admin-aware RBAC helpers and RLS policies.
-- App-level route handlers still enforce the write surface because service_role bypasses RLS.

create schema if not exists private;

create or replace function private.current_clerk_user_id()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'sub';
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.users
     where id = auth.jwt() ->> 'sub'
       and account_type = 'admin'
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.current_clerk_user_id() from public;
revoke all on function private.is_admin() from public;
grant execute on function private.current_clerk_user_id() to authenticated;
grant execute on function private.is_admin() to authenticated;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'users',
    'generations',
    'payment_transactions',
    'credit_ledger',
    'generation_reviews',
    'user_style_profiles',
    'styling_sessions',
    'member_profiles',
    'salon_profiles',
    'b2b_leads',
    'user_subscriptions',
    'user_hair_records',
    'user_care_contents',
    'user_aftercare_guides',
    'trend_alerts',
    'trend_alert_deliveries',
    'salon_customers',
    'salon_customer_visits',
    'salon_aftercare_tasks'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      policy_name := table_name || '_admin_all';

      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      execute format(
        'create policy %I on public.%I for all to authenticated using (private.is_admin()) with check (private.is_admin())',
        policy_name,
        table_name
      );
    end if;
  end loop;
end
$$;

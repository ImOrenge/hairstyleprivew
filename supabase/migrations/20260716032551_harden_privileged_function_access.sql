-- Close the default function privilege inherited by migrations owned by postgres.
-- Supabase creates functions with EXECUTE granted to PUBLIC unless it is revoked.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from authenticated;

-- Every SECURITY DEFINER function in the exposed public schema is privileged.
-- Service code receives explicit grants in the defining migrations; browser roles
-- must never inherit access through PUBLIC or the default anon/authenticated ACL.
do $$
declare
  v_function record;
begin
  for v_function in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon, authenticated',
      v_function.schema_name,
      v_function.function_name,
      v_function.identity_arguments
    );
  end loop;
end;
$$;

-- Catalog reads are intentionally available to signed-in users. They do not
-- require owner privileges because every source table has authenticated SELECT
-- grants and RLS policies.
alter function public.get_active_hairstyle_catalog(text)
  security invoker;
alter function public.get_active_hairstyle_catalog(text)
  set search_path = pg_catalog, public;
revoke execute on function public.get_active_hairstyle_catalog(text)
  from public, anon, authenticated;
grant execute on function public.get_active_hairstyle_catalog(text)
  to authenticated, service_role;

-- Fix the remaining mutable search_path advisor findings. The bodies either use
-- schema-qualified relations or only pg_catalog built-ins and trigger records.
alter function private.current_clerk_user_id()
  set search_path = pg_catalog, auth;
alter function public.credit_ledger_before_insert()
  set search_path = pg_catalog, public;
alter function public.credit_ledger_after_insert()
  set search_path = pg_catalog, public;
alter function public.set_updated_at()
  set search_path = pg_catalog, public;

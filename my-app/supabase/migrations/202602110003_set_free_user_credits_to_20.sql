-- Set free-tier default credits to 20 for newly created users.
-- Depends on: 202602090002_credit_functions_and_seed_support.sql

alter table if exists public.users
  alter column credits set default 20;

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

  insert into public.users (id, email, display_name, credits)
  values (p_user_id, p_email, p_display_name, 20)
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

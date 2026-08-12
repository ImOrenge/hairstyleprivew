-- Restore the email-conflict protection that was lost when account deletion
-- redefined ensure_user_profile. Keep the deletion tombstone fence intact.

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
  v_email citext;
  v_email_owner_id text;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'p_user_id is required';
  end if;

  if exists (
    select 1
      from public.account_deletion_tombstones as tombstone
     where tombstone.user_id_hash = public.account_deletion_user_hash(p_user_id)
  ) then
    raise exception 'account_deletion_requested';
  end if;

  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'p_email is required';
  end if;

  v_email := trim(p_email)::citext;

  -- Serialize claims for the same normalized email so concurrent profile syncs
  -- cannot both pass the ownership check before either row is inserted.
  perform pg_advisory_xact_lock(hashtextextended(lower(v_email::text), 0));

  select id
    into v_email_owner_id
    from public.users
   where email = v_email
     and id <> p_user_id
   limit 1;

  if v_email_owner_id is not null then
    v_email := (p_user_id || '@placeholder.local')::citext;
  end if;

  insert into public.users (id, email, display_name, credits)
  values (p_user_id, v_email, p_display_name, 20)
  on conflict (id)
  do update
     set email = case
           when exists (
             select 1
               from public.users as email_owner
              where email_owner.email = excluded.email
                and email_owner.id <> public.users.id
           )
           then public.users.email
           else excluded.email
         end,
         display_name = coalesce(excluded.display_name, public.users.display_name),
         updated_at = timezone('utc', now());

  select *
    into v_user
    from public.users
   where id = p_user_id;

  return v_user;
end;
$$;

revoke all on function public.ensure_user_profile(text, text, text)
  from public, anon, authenticated;
grant execute on function public.ensure_user_profile(text, text, text) to service_role;

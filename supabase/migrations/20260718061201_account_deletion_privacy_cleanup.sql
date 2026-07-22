-- Account deletion is a cross-system workflow: database rows are removed first,
-- private Storage objects are drained through the Storage API, and the Clerk
-- identity is deleted last. A hashed tombstone prevents a failed Clerk deletion
-- from recreating the application profile on the next authenticated request.

create table public.account_deletion_tombstones (
  user_id_hash text primary key,
  requested_at timestamptz not null default timezone('utc', now()),
  storage_cleanup_completed_at timestamptz,
  identity_deleted_at timestamptz,
  last_error_code text,
  expires_at timestamptz not null default timezone('utc', now()) + interval '30 days',
  constraint account_deletion_tombstones_hash_check
    check (user_id_hash ~ '^[0-9a-f]{64}$'),
  constraint account_deletion_tombstones_error_length_check
    check (last_error_code is null or length(last_error_code) between 1 and 80)
);

create table public.account_deletion_storage_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id_hash text not null
    references public.account_deletion_tombstones(user_id_hash) on delete cascade,
  bucket text not null,
  object_path text not null,
  state text not null default 'pending',
  attempt_count integer not null default 0,
  last_error_code text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint account_deletion_storage_outbox_object_key
    unique (user_id_hash, bucket, object_path),
  constraint account_deletion_storage_outbox_bucket_check
    check (bucket in ('generation-results', 'profile-body-photos', 'styling-results')),
  constraint account_deletion_storage_outbox_path_length_check
    check (length(object_path) between 1 and 1024),
  constraint account_deletion_storage_outbox_state_check
    check (state in ('pending', 'completed')),
  constraint account_deletion_storage_outbox_attempt_check
    check (attempt_count >= 0),
  constraint account_deletion_storage_outbox_error_length_check
    check (last_error_code is null or length(last_error_code) between 1 and 80)
);

create index account_deletion_storage_outbox_pending_idx
  on public.account_deletion_storage_outbox (user_id_hash, created_at)
  where state = 'pending';

alter table public.account_deletion_tombstones enable row level security;
alter table public.account_deletion_tombstones force row level security;
alter table public.account_deletion_storage_outbox enable row level security;
alter table public.account_deletion_storage_outbox force row level security;

revoke all on table public.account_deletion_tombstones from public, anon, authenticated;
revoke all on table public.account_deletion_storage_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.account_deletion_tombstones to service_role;
grant select, insert, update, delete on table public.account_deletion_storage_outbox to service_role;

create or replace function public.account_deletion_user_hash(p_user_id text)
returns text
language sql
immutable
strict
security definer
set search_path = public, extensions
as $$
  select encode(digest(btrim(p_user_id), 'sha256'), 'hex');
$$;

revoke all on function public.account_deletion_user_hash(text)
  from public, anon, authenticated;
grant execute on function public.account_deletion_user_hash(text)
  to service_role;

create or replace function public.request_account_deletion(p_user_id text)
returns table (
  user_deleted boolean,
  queued_objects integer,
  pending_objects integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := btrim(coalesce(p_user_id, ''));
  v_user_id_hash text;
  v_user_deleted boolean := false;
  v_queued_objects integer := 0;
  v_pending_objects integer := 0;
begin
  if v_user_id = '' or length(v_user_id) > 255 then
    raise exception 'invalid_account_deletion_user';
  end if;

  v_user_id_hash := public.account_deletion_user_hash(v_user_id);
  perform pg_advisory_xact_lock(hashtextextended(v_user_id_hash, 73));

  insert into public.account_deletion_tombstones (
    user_id_hash,
    requested_at,
    last_error_code,
    expires_at
  )
  values (
    v_user_id_hash,
    timezone('utc', now()),
    null,
    timezone('utc', now()) + interval '30 days'
  )
  on conflict (user_id_hash)
  do update
     set requested_at = excluded.requested_at,
         last_error_code = null,
         expires_at = excluded.expires_at;

  with storage_objects(bucket, object_path) as (
    select 'generation-results'::text, btrim(generation.original_image_path)
      from public.generations as generation
     where generation.user_id = v_user_id
       and generation.original_image_path is not null
    union
    select 'generation-results'::text, btrim(generation.generated_image_path)
      from public.generations as generation
     where generation.user_id = v_user_id
       and generation.generated_image_path is not null
    union
    select 'generation-results'::text, btrim(variant_path #>> '{}')
      from public.generations as generation
      cross join lateral jsonb_path_query(
        coalesce(generation.options, '{}'::jsonb),
        '$.**.generatedImagePath'
      ) as variant_path
     where generation.user_id = v_user_id
       and jsonb_typeof(variant_path) = 'string'
    union
    select 'generation-results'::text, btrim(draft.original_image_path)
      from public.generation_upload_drafts as draft
     where draft.user_id = v_user_id
       and draft.original_image_path is not null
    union
    select 'profile-body-photos'::text, btrim(profile.body_photo_path)
      from public.user_style_profiles as profile
     where profile.user_id = v_user_id
       and profile.body_photo_path is not null
    union
    select 'styling-results'::text, btrim(session.generated_image_path)
      from public.styling_sessions as session
     where session.user_id = v_user_id
       and session.generated_image_path is not null
  ), valid_storage_objects as (
    select distinct bucket, object_path
      from storage_objects
     where object_path <> ''
       and length(object_path) <= 1024
       and object_path !~* '^(https?://|data:|inline-output://)'
  )
  insert into public.account_deletion_storage_outbox (
    user_id_hash,
    bucket,
    object_path
  )
  select v_user_id_hash, storage_object.bucket, storage_object.object_path
    from valid_storage_objects as storage_object
  on conflict (user_id_hash, bucket, object_path) do nothing;

  get diagnostics v_queued_objects = row_count;

  delete from public.users where id = v_user_id;
  v_user_deleted := found;

  select count(*)::integer
    into v_pending_objects
    from public.account_deletion_storage_outbox as storage_outbox
   where storage_outbox.user_id_hash = v_user_id_hash
     and storage_outbox.state = 'pending';

  if v_pending_objects = 0 then
    update public.account_deletion_tombstones as tombstone
       set storage_cleanup_completed_at = coalesce(
             tombstone.storage_cleanup_completed_at,
             timezone('utc', now())
           )
     where tombstone.user_id_hash = v_user_id_hash;
  end if;

  return query select v_user_deleted, v_queued_objects, v_pending_objects;
end;
$$;

create or replace function public.list_account_deletion_storage(p_user_id text)
returns table (
  outbox_id uuid,
  bucket text,
  object_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := btrim(coalesce(p_user_id, ''));
  v_user_id_hash text;
begin
  if v_user_id = '' or length(v_user_id) > 255 then
    raise exception 'invalid_account_deletion_user';
  end if;

  v_user_id_hash := public.account_deletion_user_hash(v_user_id);

  update public.account_deletion_storage_outbox as storage_outbox
     set attempt_count = storage_outbox.attempt_count + 1,
         last_error_code = null
   where storage_outbox.user_id_hash = v_user_id_hash
     and storage_outbox.state = 'pending';

  return query
  select storage_outbox.id,
         storage_outbox.bucket,
         storage_outbox.object_path
    from public.account_deletion_storage_outbox as storage_outbox
   where storage_outbox.user_id_hash = v_user_id_hash
     and storage_outbox.state = 'pending'
   order by storage_outbox.created_at, storage_outbox.id;
end;
$$;

create or replace function public.finish_account_deletion_storage(
  p_user_id text,
  p_outbox_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := btrim(coalesce(p_user_id, ''));
  v_user_id_hash text;
  v_completed integer := 0;
  v_pending integer := 0;
begin
  if v_user_id = '' or length(v_user_id) > 255 then
    raise exception 'invalid_account_deletion_user';
  end if;

  v_user_id_hash := public.account_deletion_user_hash(v_user_id);

  update public.account_deletion_storage_outbox as storage_outbox
     set state = 'completed',
         completed_at = timezone('utc', now()),
         last_error_code = null
   where storage_outbox.user_id_hash = v_user_id_hash
     and storage_outbox.state = 'pending'
     and storage_outbox.id = any(coalesce(p_outbox_ids, array[]::uuid[]));

  get diagnostics v_completed = row_count;

  select count(*)::integer
    into v_pending
    from public.account_deletion_storage_outbox as storage_outbox
   where storage_outbox.user_id_hash = v_user_id_hash
     and storage_outbox.state = 'pending';

  if v_pending = 0 then
    update public.account_deletion_tombstones as tombstone
       set storage_cleanup_completed_at = coalesce(
             tombstone.storage_cleanup_completed_at,
             timezone('utc', now())
           ),
           last_error_code = null
     where tombstone.user_id_hash = v_user_id_hash;
  end if;

  return v_completed;
end;
$$;

create or replace function public.fail_account_deletion_storage(
  p_user_id text,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := btrim(coalesce(p_user_id, ''));
  v_user_id_hash text;
  v_error_code text := left(btrim(coalesce(p_error_code, 'storage_cleanup_failed')), 80);
begin
  if v_user_id = '' or length(v_user_id) > 255 then
    raise exception 'invalid_account_deletion_user';
  end if;

  v_user_id_hash := public.account_deletion_user_hash(v_user_id);

  update public.account_deletion_storage_outbox as storage_outbox
     set last_error_code = v_error_code
   where storage_outbox.user_id_hash = v_user_id_hash
     and storage_outbox.state = 'pending';

  update public.account_deletion_tombstones as tombstone
     set last_error_code = v_error_code
   where tombstone.user_id_hash = v_user_id_hash;
end;
$$;

create or replace function public.complete_account_identity_deletion(p_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := btrim(coalesce(p_user_id, ''));
  v_user_id_hash text;
begin
  if v_user_id = '' or length(v_user_id) > 255 then
    raise exception 'invalid_account_deletion_user';
  end if;

  v_user_id_hash := public.account_deletion_user_hash(v_user_id);

  update public.account_deletion_tombstones as tombstone
     set identity_deleted_at = coalesce(tombstone.identity_deleted_at, timezone('utc', now())),
         last_error_code = null
   where tombstone.user_id_hash = v_user_id_hash;
end;
$$;

create or replace function public.fail_account_identity_deletion(
  p_user_id text,
  p_error_code text default 'identity_delete_failed'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := btrim(coalesce(p_user_id, ''));
  v_user_id_hash text;
  v_error_code text := left(btrim(coalesce(p_error_code, 'identity_delete_failed')), 80);
begin
  if v_user_id = '' or length(v_user_id) > 255 then
    raise exception 'invalid_account_deletion_user';
  end if;

  v_user_id_hash := public.account_deletion_user_hash(v_user_id);

  update public.account_deletion_tombstones as tombstone
     set last_error_code = v_error_code
   where tombstone.user_id_hash = v_user_id_hash;
end;
$$;

create or replace function public.prune_account_deletion_tombstones(
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  with expired as (
    select tombstone.user_id_hash
      from public.account_deletion_tombstones as tombstone
     where tombstone.expires_at <= timezone('utc', now())
       and tombstone.identity_deleted_at is not null
       and not exists (
         select 1
           from public.account_deletion_storage_outbox as storage_outbox
          where storage_outbox.user_id_hash = tombstone.user_id_hash
            and storage_outbox.state = 'pending'
       )
     order by tombstone.expires_at, tombstone.user_id_hash
     limit greatest(1, least(coalesce(p_limit, 1000), 5000))
     for update skip locked
  )
  delete from public.account_deletion_tombstones as tombstone
   using expired
   where tombstone.user_id_hash = expired.user_id_hash;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

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

revoke all on function public.request_account_deletion(text)
  from public, anon, authenticated;
revoke all on function public.list_account_deletion_storage(text)
  from public, anon, authenticated;
revoke all on function public.finish_account_deletion_storage(text, uuid[])
  from public, anon, authenticated;
revoke all on function public.fail_account_deletion_storage(text, text)
  from public, anon, authenticated;
revoke all on function public.complete_account_identity_deletion(text)
  from public, anon, authenticated;
revoke all on function public.fail_account_identity_deletion(text, text)
  from public, anon, authenticated;
revoke all on function public.prune_account_deletion_tombstones(integer)
  from public, anon, authenticated;
revoke all on function public.ensure_user_profile(text, text, text)
  from public, anon, authenticated;

grant execute on function public.request_account_deletion(text) to service_role;
grant execute on function public.list_account_deletion_storage(text) to service_role;
grant execute on function public.finish_account_deletion_storage(text, uuid[]) to service_role;
grant execute on function public.fail_account_deletion_storage(text, text) to service_role;
grant execute on function public.complete_account_identity_deletion(text) to service_role;
grant execute on function public.fail_account_identity_deletion(text, text) to service_role;
grant execute on function public.prune_account_deletion_tombstones(integer) to service_role;
grant execute on function public.ensure_user_profile(text, text, text) to service_role;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule('cron-account-deletion-tombstone-prune')
      where exists (
        select 1
          from cron.job
         where jobname = 'cron-account-deletion-tombstone-prune'
      );

    perform cron.schedule(
      'cron-account-deletion-tombstone-prune',
      '17 3 * * *',
      'select public.prune_account_deletion_tombstones(1000);'
    );
  end if;
end
$$;

comment on table public.account_deletion_tombstones is
  'Hashed 30-day tombstones prevent profile recreation while Clerk identity deletion is retried.';
comment on table public.account_deletion_storage_outbox is
  'Private object cleanup queue drained exclusively through the Supabase Storage API.';

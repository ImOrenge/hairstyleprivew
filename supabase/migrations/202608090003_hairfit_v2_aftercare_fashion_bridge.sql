-- Connect real aftercare photos and legacy Styler sessions to immutable HairFit V2 selections.

alter table public.actual_services_v2
  add column if not exists after_photo_path text,
  add column if not exists after_photo_fingerprint text,
  add column if not exists after_photo_consent_at timestamptz;

do $$
begin
  alter table public.actual_services_v2
    add constraint actual_services_v2_after_photo_path_check
    check (after_photo_path is null or (
      length(after_photo_path) between 1 and 1024
      and after_photo_path !~* '^(https?://|data:|inline-output://)'
    ));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.actual_services_v2
    add constraint actual_services_v2_after_photo_fingerprint_check
    check (after_photo_fingerprint is null or after_photo_fingerprint ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.actual_services_v2
    add constraint actual_services_v2_after_photo_bundle_check
    check (
      (after_photo_path is null and after_photo_fingerprint is null and after_photo_consent_at is null)
      or
      (after_photo_path is not null and after_photo_fingerprint is not null and after_photo_consent_at is not null)
    );
exception when duplicate_object then null;
end $$;

alter table public.styling_sessions
  add column if not exists consultation_id uuid references public.consultation_sessions(id) on delete cascade,
  add column if not exists selection_snapshot_id uuid references public.style_selection_snapshots_v2(id) on delete restrict,
  add column if not exists source_mode text not null default 'legacy',
  add column if not exists fashion_slot_id text,
  add column if not exists fashion_direction jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.styling_sessions
    add constraint styling_sessions_source_mode_check
    check (source_mode in ('legacy', 'v2_selection'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.styling_sessions
    add constraint styling_sessions_fashion_slot_check
    check (fashion_slot_id is null or fashion_slot_id in (
      'daily-casual', 'daily-minimal', 'daily-athleisure',
      'work-office', 'work-classic', 'work-smart',
      'statement-street', 'statement-formal', 'statement-date'
    ));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.styling_sessions
    add constraint styling_sessions_fashion_direction_object_check
    check (jsonb_typeof(fashion_direction) = 'object');
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.styling_sessions
    add constraint styling_sessions_v2_source_check
    check (
      source_mode = 'legacy'
      or (consultation_id is not null and selection_snapshot_id is not null)
    );
exception when duplicate_object then null;
end $$;

create index if not exists idx_styling_sessions_consultation
  on public.styling_sessions (consultation_id, created_at desc)
  where consultation_id is not null;
create index if not exists idx_styling_sessions_selection_snapshot
  on public.styling_sessions (selection_snapshot_id)
  where selection_snapshot_id is not null;
create unique index if not exists uq_styling_sessions_v2_fashion_slot
  on public.styling_sessions (user_id, selection_snapshot_id, fashion_slot_id)
  where source_mode = 'v2_selection' and fashion_slot_id is not null;

create or replace function public.sync_style_selection_v2_source(
  p_user_id text,
  p_consultation_id uuid,
  p_snapshot_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_generation_id uuid;
  v_preview_variant_id uuid;
  v_source_variant_id text;
begin
  select consultation.source_generation_id, selection.preview_variant_id
    into v_generation_id, v_preview_variant_id
    from public.consultation_sessions as consultation
    join public.style_selection_snapshots_v2 as selection
      on selection.id = p_snapshot_id
     and selection.consultation_id = consultation.id
     and selection.user_id = consultation.user_id
     and selection.status = 'confirmed'
   where consultation.id = p_consultation_id
     and consultation.user_id = p_user_id
     and consultation.selected_snapshot_id = p_snapshot_id;
  if not found or v_generation_id is null then
    raise exception using errcode = 'P0002', message = 'STYLING_SOURCE_NOT_FOUND';
  end if;

  select variant.value ->> 'id'
    into v_source_variant_id
    from public.generations as generation
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(generation.options #> '{recommendationSet,variants}') = 'array'
          then generation.options #> '{recommendationSet,variants}'
        else '[]'::jsonb
      end
    ) as variant(value)
   where generation.id = v_generation_id
     and generation.user_id = p_user_id
     and variant.value ->> 'v2PreviewVariantId' = v_preview_variant_id::text
     and coalesce(
       nullif(variant.value ->> 'generatedImagePath', ''),
       nullif(variant.value ->> 'outputUrl', '')
     ) is not null
   limit 1;
  if nullif(v_source_variant_id, '') is null then
    raise exception using errcode = 'P0002', message = 'STYLING_SOURCE_IMAGE_UNAVAILABLE';
  end if;

  update public.generations as generation
     set options = jsonb_set(
       coalesce(generation.options, '{}'::jsonb),
       '{recommendationSet,selectedVariantId}',
       to_jsonb(v_source_variant_id),
       true
     )
   where generation.id = v_generation_id
     and generation.user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'STYLING_SOURCE_NOT_FOUND';
  end if;

  return v_source_variant_id;
end;
$$;

revoke all on function public.sync_style_selection_v2_source(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.sync_style_selection_v2_source(text, uuid, uuid)
  to service_role;

create or replace function public.confirm_style_selection_v2(
  p_user_id text,
  p_consultation_id uuid,
  p_snapshot_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.consultation_sessions%rowtype;
  v_snapshot public.style_selection_snapshots_v2%rowtype;
begin
  select *
    into v_session
    from public.consultation_sessions
   where id = p_consultation_id
     and user_id = p_user_id
   for update;
  if not found then
    raise exception 'CONSULTATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_session.lifecycle_state = 'selection_confirmed'
     and v_session.selected_snapshot_id = p_snapshot_id then
    perform public.sync_style_selection_v2_source(p_user_id, p_consultation_id, p_snapshot_id);
    return jsonb_build_object(
      'state', 'confirmed',
      'snapshotId', p_snapshot_id,
      'replayed', true,
      'version', v_session.version
    );
  end if;
  if v_session.version <> p_expected_version then
    return jsonb_build_object('state', 'conflict', 'version', v_session.version);
  end if;
  if v_session.lifecycle_state not in ('style_selected', 'preview_board_ready', 'shortlisted') then
    raise exception 'SELECTION_LOCKED' using errcode = '23514';
  end if;

  select *
    into v_snapshot
    from public.style_selection_snapshots_v2
   where id = p_snapshot_id
     and consultation_id = p_consultation_id
     and user_id = p_user_id
     and status = 'draft'
     and v_session.selected_snapshot_id = p_snapshot_id
   for update;
  if not found then
    raise exception 'SNAPSHOT_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.style_selection_snapshots_v2
     set status = 'superseded'
   where consultation_id = p_consultation_id
     and id <> p_snapshot_id
     and status = 'draft';
  update public.style_selection_snapshots_v2
     set status = 'confirmed',
         confirmed_at = coalesce(confirmed_at, timezone('utc', now()))
   where id = p_snapshot_id;
  update public.consultation_sessions
     set selected_snapshot_id = p_snapshot_id,
         lifecycle_state = 'selection_confirmed',
         version = version + 1,
         updated_at = timezone('utc', now())
   where id = p_consultation_id;

  perform public.sync_style_selection_v2_source(p_user_id, p_consultation_id, p_snapshot_id);
  return jsonb_build_object(
    'state', 'confirmed',
    'snapshotId', p_snapshot_id,
    'replayed', false,
    'version', v_session.version + 1
  );
end;
$$;

revoke all on function public.confirm_style_selection_v2(text, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.confirm_style_selection_v2(text, uuid, uuid, integer)
  to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aftercare-photos', 'aftercare-photos', false, 8000000, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

alter table public.account_deletion_storage_outbox
  drop constraint if exists account_deletion_storage_outbox_bucket_check;
alter table public.account_deletion_storage_outbox
  add constraint account_deletion_storage_outbox_bucket_check
  check (bucket in ('generation-results', 'profile-body-photos', 'styling-results', 'aftercare-photos'));

create or replace function public.request_account_deletion(p_user_id text)
returns table (
  user_deleted boolean,
  queued_objects integer,
  pending_objects integer
)
language plpgsql
security definer
set search_path = ''
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
    union
    select 'aftercare-photos'::text, btrim(service.after_photo_path)
      from public.actual_services_v2 as service
     where service.user_id = v_user_id
       and service.after_photo_path is not null
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

revoke all on function public.request_account_deletion(text)
  from public, anon, authenticated;
grant execute on function public.request_account_deletion(text)
  to service_role;

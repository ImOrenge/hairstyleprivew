-- Phase 01: private, checksum-idempotent capture assets for personal color.
-- This is additive. Existing generation upload drafts and legacy reads remain intact.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-color-inputs',
  'private-color-inputs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.personal_color_capture_assets (
  id uuid primary key,
  consultation_id uuid not null,
  user_id text not null references public.users(id) on delete cascade,
  role text not null check (role in ('color_primary','color_secondary','gray_reference','color_checker')),
  capture_mode text not null check (capture_mode in ('quick','precision')),
  storage_bucket text not null default 'private-color-inputs'
    check (storage_bucket = 'private-color-inputs'),
  storage_path text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  quality jsonb check (quality is null or jsonb_typeof(quality) = 'object'),
  status text not null default 'intent_created'
    check (status in ('intent_created','uploaded','quality_ready','quality_blocked','cleanup_queued','deleted')),
  retention_policy_key text not null default 'personal_color_capture_v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  expires_at timestamptz not null,
  cleanup_queued_at timestamptz,
  deleted_at timestamptz,
  constraint personal_color_capture_asset_path_check
    check (storage_path ~ '^[0-9a-f]{64}/[0-9a-f-]{36}/[0-9a-f-]{36}/(color_primary|color_secondary|gray_reference|color_checker)\.(jpg|png|webp)$'),
  constraint personal_color_capture_asset_lifecycle_check check (
    (status = 'intent_created' and finalized_at is null and deleted_at is null)
    or (status in ('uploaded','quality_ready','quality_blocked') and finalized_at is not null and deleted_at is null)
    or (status = 'cleanup_queued' and cleanup_queued_at is not null and deleted_at is null)
    or (status = 'deleted' and deleted_at is not null)
  ),
  unique (storage_bucket, storage_path)
);

create unique index uq_personal_color_capture_active_checksum
  on public.personal_color_capture_assets (user_id, consultation_id, role, checksum_sha256)
  where status <> 'deleted';

create index idx_personal_color_capture_assets_owner
  on public.personal_color_capture_assets (user_id, consultation_id, created_at desc);
create index idx_personal_color_capture_assets_expiry
  on public.personal_color_capture_assets (expires_at, id)
  where status in ('intent_created','uploaded','quality_ready','quality_blocked');

create table public.personal_color_capture_cleanup_outbox (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.personal_color_capture_assets(id) on delete cascade,
  user_id text not null,
  storage_bucket text not null,
  storage_path text not null,
  checksum_sha256 text not null,
  state text not null default 'pending' check (state in ('pending','processing','retry','completed','failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint personal_color_capture_cleanup_lease_check check (
    (state = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'processing' and lease_token is null and lease_expires_at is null)
  )
);

create index idx_personal_color_capture_cleanup_due
  on public.personal_color_capture_cleanup_outbox (available_at, created_at, id)
  where state in ('pending','retry');

create table public.personal_color_capture_deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.personal_color_capture_assets(id) on delete cascade,
  user_id text not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  reason text not null,
  deleted_at timestamptz not null,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_personal_color_capture_assets_updated_at on public.personal_color_capture_assets;
create trigger trg_personal_color_capture_assets_updated_at
before update on public.personal_color_capture_assets
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_personal_color_capture_cleanup_updated_at on public.personal_color_capture_cleanup_outbox;
create trigger trg_personal_color_capture_cleanup_updated_at
before update on public.personal_color_capture_cleanup_outbox
for each row execute procedure public.set_updated_at();

alter table public.personal_color_capture_assets enable row level security;
alter table public.personal_color_capture_assets force row level security;
alter table public.personal_color_capture_cleanup_outbox enable row level security;
alter table public.personal_color_capture_cleanup_outbox force row level security;
alter table public.personal_color_capture_deletion_receipts enable row level security;
alter table public.personal_color_capture_deletion_receipts force row level security;

revoke all on table public.personal_color_capture_assets from public, anon, authenticated;
revoke all on table public.personal_color_capture_cleanup_outbox from public, anon, authenticated;
revoke all on table public.personal_color_capture_deletion_receipts from public, anon, authenticated;
grant select, insert, update on table public.personal_color_capture_assets to service_role;
grant select, insert, update on table public.personal_color_capture_cleanup_outbox to service_role;
grant select, insert on table public.personal_color_capture_deletion_receipts to service_role;

create or replace function public.queue_personal_color_capture_cleanup(
  p_asset_id uuid,
  p_user_id text,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_asset public.personal_color_capture_assets%rowtype;
  v_outbox public.personal_color_capture_cleanup_outbox%rowtype;
begin
  select * into v_asset
    from public.personal_color_capture_assets
   where id = p_asset_id and user_id = p_user_id
   for update;
  if not found then raise exception 'Personal color capture asset not found'; end if;

  if v_asset.status = 'deleted' then
    return jsonb_build_object('assetId', v_asset.id, 'state', 'completed', 'idempotentReplay', true);
  end if;

  update public.personal_color_capture_assets
     set status = 'cleanup_queued', cleanup_queued_at = coalesce(cleanup_queued_at, v_now)
   where id = v_asset.id;

  insert into public.personal_color_capture_cleanup_outbox (
    asset_id, user_id, storage_bucket, storage_path, checksum_sha256, state, available_at, last_error
  ) values (
    v_asset.id, v_asset.user_id, v_asset.storage_bucket, v_asset.storage_path,
    v_asset.checksum_sha256, 'pending', v_now, left(nullif(btrim(p_reason), ''), 4000)
  ) on conflict (asset_id) do nothing;

  select * into v_outbox from public.personal_color_capture_cleanup_outbox where asset_id = v_asset.id;
  return jsonb_build_object('assetId', v_asset.id, 'outboxId', v_outbox.id, 'state', v_outbox.state, 'idempotentReplay', v_outbox.created_at < v_now);
end;
$$;

create or replace function public.claim_personal_color_capture_cleanup(
  p_limit integer,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns setof jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_now timestamptz := now();
begin
  if p_limit not between 1 and 100 then raise exception 'p_limit must be between 1 and 100'; end if;
  if p_lease_seconds not between 1 and 3600 then raise exception 'p_lease_seconds must be between 1 and 3600'; end if;
  return query
  with candidates as (
    select id from public.personal_color_capture_cleanup_outbox
     where ((state in ('pending','retry') and available_at <= v_now)
        or (state = 'processing' and lease_expires_at <= v_now))
       and attempt_count < 20
     order by available_at, created_at, id
     for update skip locked limit p_limit
  ), claimed as (
    update public.personal_color_capture_cleanup_outbox o
       set state = 'processing', attempt_count = attempt_count + 1,
           lease_token = p_lease_token,
           lease_expires_at = v_now + make_interval(secs => p_lease_seconds)
      from candidates where o.id = candidates.id returning o.*
  )
  select jsonb_build_object(
    'outboxId', claimed.id, 'assetId', claimed.asset_id, 'bucket', claimed.storage_bucket,
    'path', claimed.storage_path, 'checksumSha256', claimed.checksum_sha256,
    'leaseToken', claimed.lease_token
  ) from claimed;
end;
$$;

create or replace function public.finish_personal_color_capture_cleanup(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_outbox public.personal_color_capture_cleanup_outbox%rowtype;
begin
  select * into v_outbox from public.personal_color_capture_cleanup_outbox where id = p_outbox_id for update;
  if not found then raise exception 'Capture cleanup outbox not found'; end if;
  if v_outbox.state = 'completed' then
    return jsonb_build_object('assetId', v_outbox.asset_id, 'state', 'completed', 'idempotentReplay', true);
  end if;
  if v_outbox.state <> 'processing' or v_outbox.lease_token <> p_lease_token or v_outbox.lease_expires_at <= v_now then
    raise exception 'Stale capture cleanup lease';
  end if;

  update public.personal_color_capture_cleanup_outbox
     set state = 'completed', lease_token = null, lease_expires_at = null,
         completed_at = v_now, last_error = null
   where id = p_outbox_id;
  update public.personal_color_capture_assets
     set status = 'deleted', deleted_at = v_now
   where id = v_outbox.asset_id;
  insert into public.personal_color_capture_deletion_receipts(asset_id,user_id,checksum_sha256,reason,deleted_at)
  values (v_outbox.asset_id,v_outbox.user_id,v_outbox.checksum_sha256,coalesce(nullif(btrim(p_reason),''),'retention_cleanup'),v_now)
  on conflict (asset_id) do nothing;
  return jsonb_build_object('assetId', v_outbox.asset_id, 'state', 'completed', 'deletedAt', v_now, 'checksumSha256', v_outbox.checksum_sha256);
end;
$$;

create or replace function public.claim_personal_color_capture_cleanup_asset(
  p_asset_id uuid,
  p_user_id text,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_outbox public.personal_color_capture_cleanup_outbox%rowtype;
begin
  if p_lease_seconds not between 1 and 3600 then raise exception 'p_lease_seconds must be between 1 and 3600'; end if;
  select * into v_outbox
    from public.personal_color_capture_cleanup_outbox
   where asset_id = p_asset_id and user_id = p_user_id
   for update;
  if not found then raise exception 'Capture cleanup outbox not found'; end if;
  if v_outbox.state = 'completed' then
    return jsonb_build_object('claimed',false,'assetId',v_outbox.asset_id,'state','completed');
  end if;
  if v_outbox.state = 'processing' and v_outbox.lease_expires_at > v_now then
    return jsonb_build_object('claimed',false,'assetId',v_outbox.asset_id,'state','processing');
  end if;
  if v_outbox.state not in ('pending','retry','processing') or v_outbox.available_at > v_now or v_outbox.attempt_count >= 20 then
    return jsonb_build_object('claimed',false,'assetId',v_outbox.asset_id,'state',v_outbox.state);
  end if;
  update public.personal_color_capture_cleanup_outbox
     set state='processing', attempt_count=attempt_count+1, lease_token=p_lease_token,
         lease_expires_at=v_now+make_interval(secs=>p_lease_seconds)
   where id=v_outbox.id returning * into v_outbox;
  return jsonb_build_object(
    'claimed',true,'outboxId',v_outbox.id,'assetId',v_outbox.asset_id,
    'bucket',v_outbox.storage_bucket,'path',v_outbox.storage_path,
    'checksumSha256',v_outbox.checksum_sha256,'leaseToken',v_outbox.lease_token
  );
end;
$$;

create or replace function public.retry_personal_color_capture_cleanup(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_error text,
  p_delay_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_outbox public.personal_color_capture_cleanup_outbox%rowtype;
begin
  select * into v_outbox from public.personal_color_capture_cleanup_outbox where id = p_outbox_id for update;
  if not found then raise exception 'Capture cleanup outbox not found'; end if;
  if v_outbox.state <> 'processing' or v_outbox.lease_token <> p_lease_token then raise exception 'Stale capture cleanup lease'; end if;
  update public.personal_color_capture_cleanup_outbox
     set state = case when attempt_count >= 20 then 'failed' else 'retry' end,
         available_at = now() + make_interval(secs => greatest(0,least(p_delay_seconds,86400))),
         lease_token = null, lease_expires_at = null, last_error = left(btrim(p_error),4000)
   where id = p_outbox_id returning * into v_outbox;
  return jsonb_build_object('assetId',v_outbox.asset_id,'state',v_outbox.state,'attemptCount',v_outbox.attempt_count);
end;
$$;

revoke all on function public.queue_personal_color_capture_cleanup(uuid,text,text) from public, anon, authenticated;
revoke all on function public.claim_personal_color_capture_cleanup(integer,uuid,integer) from public, anon, authenticated;
revoke all on function public.finish_personal_color_capture_cleanup(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.claim_personal_color_capture_cleanup_asset(uuid,text,uuid,integer) from public, anon, authenticated;
revoke all on function public.retry_personal_color_capture_cleanup(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.queue_personal_color_capture_cleanup(uuid,text,text) to service_role;
grant execute on function public.claim_personal_color_capture_cleanup(integer,uuid,integer) to service_role;
grant execute on function public.finish_personal_color_capture_cleanup(uuid,uuid,text) to service_role;
grant execute on function public.claim_personal_color_capture_cleanup_asset(uuid,text,uuid,integer) to service_role;
grant execute on function public.retry_personal_color_capture_cleanup(uuid,uuid,text,integer) to service_role;

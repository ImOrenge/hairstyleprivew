-- Immutable HairFit consultation report snapshots and private PDF export lifecycle.

create table if not exists public.consultation_report_snapshots_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  result_snapshot_id uuid references public.consultation_result_snapshots_v2(id) on delete set null,
  profile text not null check (profile in ('full_journey','salon_handoff')),
  consultation_version integer not null check (consultation_version > 0),
  result_version integer not null check (result_version >= 0),
  view_model jsonb not null check (jsonb_typeof(view_model) = 'object'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, consultation_version, result_version, profile),
  unique (user_id, content_sha256, profile)
);
create index if not exists idx_consultation_report_snapshots_v2_owner
  on public.consultation_report_snapshots_v2 (user_id, consultation_id, created_at desc);

create table if not exists public.consultation_report_exports_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  report_snapshot_id uuid not null references public.consultation_report_snapshots_v2(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  status text not null default 'queued' check (status in ('queued','rendering','ready','failed','expired')),
  storage_bucket text check (storage_bucket is null or storage_bucket = 'consultation-report-exports'),
  storage_path text check (storage_path is null or length(storage_path) between 8 and 1024),
  file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer check (byte_size is null or byte_size > 0),
  error_code text check (error_code is null or length(error_code) <= 120),
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key),
  unique (storage_bucket, storage_path)
);
create index if not exists idx_consultation_report_exports_v2_owner
  on public.consultation_report_exports_v2 (user_id, consultation_id, created_at desc);
create index if not exists idx_consultation_report_exports_v2_expiry
  on public.consultation_report_exports_v2 (status, expires_at)
  where status = 'ready';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consultation-report-exports', 'consultation-report-exports', false, 15728640, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.consultation_report_snapshots_v2 enable row level security;
alter table public.consultation_report_snapshots_v2 force row level security;
alter table public.consultation_report_exports_v2 enable row level security;
alter table public.consultation_report_exports_v2 force row level security;

revoke all on table public.consultation_report_snapshots_v2, public.consultation_report_exports_v2 from public, anon, authenticated;
grant select, insert on table public.consultation_report_snapshots_v2 to service_role;
grant select, insert, update, delete on table public.consultation_report_exports_v2 to service_role;

drop trigger if exists consultation_report_snapshots_v2_immutable on public.consultation_report_snapshots_v2;
create trigger consultation_report_snapshots_v2_immutable
before update on public.consultation_report_snapshots_v2
for each row execute function public.reject_immutable_hairfit_snapshot_update_v2();

create or replace function private.queue_hairfit_report_exports_for_account_deletion_v2()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_hash text := public.account_deletion_user_hash(old.id);
begin
  insert into public.account_deletion_storage_outbox(user_id_hash,bucket,object_path)
  select v_hash, storage_bucket, storage_path
  from public.consultation_report_exports_v2
  where user_id = old.id and storage_bucket is not null and storage_path is not null
  on conflict (user_id_hash,bucket,object_path) do nothing;
  return old;
end;
$$;
drop trigger if exists users_queue_hairfit_report_exports_v2 on public.users;
create trigger users_queue_hairfit_report_exports_v2
before delete on public.users
for each row execute function private.queue_hairfit_report_exports_for_account_deletion_v2();
revoke all on function private.queue_hairfit_report_exports_for_account_deletion_v2() from public, anon, authenticated;
grant execute on function private.queue_hairfit_report_exports_for_account_deletion_v2() to service_role;

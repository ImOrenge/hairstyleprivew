-- Additive persistence for personal-color evidence consumers, hair-only color simulation,
-- durable high-fidelity color generation, immutable color decisions, and result compilation.

-- Fashion sessions must be regenerated when a confirmed color snapshot changes while the haircut snapshot stays the same.
alter table public.styling_sessions
  add column if not exists generation_input_fingerprint text;
update public.styling_sessions
set generation_input_fingerprint = coalesce(nullif(recommendation->>'generationInputFingerprint', ''), 'legacy')
where generation_input_fingerprint is null;
alter table public.styling_sessions
  alter column generation_input_fingerprint set default 'legacy';
alter table public.styling_sessions
  alter column generation_input_fingerprint set not null;
alter table public.styling_sessions
  drop constraint if exists styling_sessions_generation_input_fingerprint_length;
alter table public.styling_sessions
  add constraint styling_sessions_generation_input_fingerprint_length
  check (length(generation_input_fingerprint) between 6 and 128);
drop index if exists public.uq_styling_sessions_v2_fashion_slot;
create unique index if not exists uq_styling_sessions_v2_fashion_slot_input
  on public.styling_sessions (user_id, selection_snapshot_id, fashion_slot_id, generation_input_fingerprint)
  where source_mode = 'v2_selection' and fashion_slot_id is not null;

create table if not exists public.hair_mask_artifacts_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  selection_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  source_image_fingerprint text not null check (length(source_image_fingerprint) between 16 and 128),
  mask_version text not null,
  storage_bucket text not null default 'generation-results' check (storage_bucket = 'generation-results'),
  storage_path text not null check (length(storage_path) between 8 and 1024),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  confidence numeric not null check (confidence between 0 and 1),
  boundary_score numeric not null check (boundary_score between 0 and 1),
  quality_state text not null check (quality_state in ('usable','warning','retry_required')),
  quality_details jsonb not null default '{}'::jsonb check (jsonb_typeof(quality_details) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, selection_snapshot_id, source_image_fingerprint, mask_version),
  unique (storage_bucket, storage_path)
);

create table if not exists public.hair_color_generation_runs_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  selection_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  hair_mask_id uuid not null references public.hair_mask_artifacts_v2(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 8 and 512),
  input_fingerprint text not null check (length(input_fingerprint) between 16 and 128),
  state text not null default 'queued' check (state in ('masking','queued','generating','quality','completed','retry_required','failed','cancelled')),
  prompt_policy_version text not null default 'hair-color-change-v1',
  provider text,
  model text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 2),
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  output_bucket text check (output_bucket is null or output_bucket = 'generation-results'),
  output_path text,
  quality_result jsonb check (quality_result is null or jsonb_typeof(quality_result) = 'object'),
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key)
);

create unique index if not exists uq_hair_color_generation_runs_v2_active
  on public.hair_color_generation_runs_v2 (consultation_id, selection_snapshot_id, input_fingerprint)
  where state in ('masking','queued','generating','quality');
create index if not exists idx_hair_color_generation_runs_v2_recovery
  on public.hair_color_generation_runs_v2 (state, lease_expires_at, updated_at)
  where state in ('masking','queued','generating','quality');

create table if not exists public.color_selection_snapshots_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  selection_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  personal_color_evidence_id uuid references public.personal_color_evidence_v2(id) on delete set null,
  hair_mask_id uuid references public.hair_mask_artifacts_v2(id) on delete restrict,
  generation_run_id uuid references public.hair_color_generation_runs_v2(id) on delete restrict,
  snapshot_version integer not null check (snapshot_version > 0),
  status text not null check (status in ('confirmed','keep_current','deferred','salon_review','superseded')),
  input_fingerprint text not null check (length(input_fingerprint) between 16 and 128),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  confirmed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, snapshot_version),
  unique (user_id, input_fingerprint)
);
create index if not exists idx_color_selection_snapshots_v2_latest
  on public.color_selection_snapshots_v2 (consultation_id, selection_snapshot_id, confirmed_at desc)
  where status in ('confirmed','keep_current','deferred','salon_review');

alter table public.fashion_preview_sets_v2
  add column if not exists color_selection_snapshot_id uuid references public.color_selection_snapshots_v2(id) on delete restrict,
  add column if not exists generation_input_fingerprint text;
alter table public.fashion_preview_batches_v2
  add column if not exists color_selection_snapshot_id uuid references public.color_selection_snapshots_v2(id) on delete restrict,
  add column if not exists generation_input_fingerprint text;
update public.fashion_preview_sets_v2
set generation_input_fingerprint = coalesce(nullif(preview_set#>>'{inputSnapshot,inputFingerprint}', ''), 'legacy')
where generation_input_fingerprint is null;
alter table public.fashion_preview_sets_v2
  alter column generation_input_fingerprint set default 'legacy';
alter table public.fashion_preview_sets_v2
  alter column generation_input_fingerprint set not null;
alter table public.fashion_preview_sets_v2
  drop constraint if exists fashion_preview_sets_v2_generation_input_fingerprint_length;
alter table public.fashion_preview_sets_v2
  add constraint fashion_preview_sets_v2_generation_input_fingerprint_length
  check (length(generation_input_fingerprint) between 6 and 128);
update public.fashion_preview_batches_v2
set generation_input_fingerprint = 'legacy'
where generation_input_fingerprint is null;
alter table public.fashion_preview_batches_v2
  alter column generation_input_fingerprint set default 'legacy';
alter table public.fashion_preview_batches_v2
  alter column generation_input_fingerprint set not null;
alter table public.fashion_preview_batches_v2
  drop constraint if exists fashion_preview_batches_v2_generation_input_fingerprint_length;
alter table public.fashion_preview_batches_v2
  add constraint fashion_preview_batches_v2_generation_input_fingerprint_length
  check (length(generation_input_fingerprint) between 6 and 128);
create index if not exists idx_fashion_preview_sets_v2_color_input
  on public.fashion_preview_sets_v2 (consultation_id, color_selection_snapshot_id, generation_input_fingerprint, version desc);
create index if not exists idx_fashion_preview_batches_v2_color_input
  on public.fashion_preview_batches_v2 (consultation_id, color_selection_snapshot_id, generation_input_fingerprint, created_at desc);

create table if not exists public.consultation_result_snapshots_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  selection_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  color_selection_snapshot_id uuid references public.color_selection_snapshots_v2(id) on delete restrict,
  personal_color_evidence_id uuid references public.personal_color_evidence_v2(id) on delete set null,
  salon_brief_version_id uuid references public.salon_brief_versions_v2(id) on delete restrict,
  snapshot_version integer not null check (snapshot_version > 0),
  input_fingerprint text not null check (length(input_fingerprint) between 16 and 128),
  state text not null check (state in ('core_ready','updated','attention_required')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  compiled_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, snapshot_version),
  unique (user_id, input_fingerprint)
);
create index if not exists idx_consultation_result_snapshots_v2_latest
  on public.consultation_result_snapshots_v2 (consultation_id, compiled_at desc);

create or replace function public.reject_immutable_hairfit_snapshot_update_v2()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'IMMUTABLE_HAIRFIT_SNAPSHOT' using errcode = '23514';
end;
$$;

drop trigger if exists color_selection_snapshots_v2_immutable on public.color_selection_snapshots_v2;
create trigger color_selection_snapshots_v2_immutable before update on public.color_selection_snapshots_v2
for each row execute function public.reject_immutable_hairfit_snapshot_update_v2();
drop trigger if exists consultation_result_snapshots_v2_immutable on public.consultation_result_snapshots_v2;
create trigger consultation_result_snapshots_v2_immutable before update on public.consultation_result_snapshots_v2
for each row execute function public.reject_immutable_hairfit_snapshot_update_v2();

alter table public.hair_mask_artifacts_v2 enable row level security;
alter table public.hair_mask_artifacts_v2 force row level security;
alter table public.hair_color_generation_runs_v2 enable row level security;
alter table public.hair_color_generation_runs_v2 force row level security;
alter table public.color_selection_snapshots_v2 enable row level security;
alter table public.color_selection_snapshots_v2 force row level security;
alter table public.consultation_result_snapshots_v2 enable row level security;
alter table public.consultation_result_snapshots_v2 force row level security;

revoke all on table public.hair_mask_artifacts_v2, public.hair_color_generation_runs_v2,
  public.color_selection_snapshots_v2, public.consultation_result_snapshots_v2 from public, anon, authenticated;
grant select, insert, update, delete on table public.hair_mask_artifacts_v2, public.hair_color_generation_runs_v2,
  public.color_selection_snapshots_v2, public.consultation_result_snapshots_v2 to service_role;
revoke all on function public.reject_immutable_hairfit_snapshot_update_v2() from public, anon, authenticated;
grant execute on function public.reject_immutable_hairfit_snapshot_update_v2() to service_role;


create or replace function private.queue_hairfit_color_assets_for_account_deletion_v2()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_hash text := public.account_deletion_user_hash(old.id);
begin
  insert into public.account_deletion_storage_outbox(user_id_hash,bucket,object_path)
  select v_hash, 'generation-results', object_path from (
    select storage_path as object_path from public.hair_mask_artifacts_v2 where user_id = old.id
    union
    select output_path from public.hair_color_generation_runs_v2 where user_id = old.id and output_path is not null
  ) assets
  where object_path <> '' and length(object_path) <= 1024
  on conflict (user_id_hash,bucket,object_path) do nothing;
  return old;
end;
$$;
drop trigger if exists users_queue_hairfit_color_assets_v2 on public.users;
create trigger users_queue_hairfit_color_assets_v2 before delete on public.users
for each row execute function private.queue_hairfit_color_assets_for_account_deletion_v2();
revoke all on function private.queue_hairfit_color_assets_for_account_deletion_v2() from public, anon, authenticated;
grant execute on function private.queue_hairfit_color_assets_for_account_deletion_v2() to service_role;

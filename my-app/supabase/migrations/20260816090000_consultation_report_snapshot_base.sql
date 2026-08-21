-- Fresh-chain compatibility: establish the immutable report snapshot base before
-- the version-extension migration. Existing remote tables are left untouched.
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

comment on table public.consultation_report_snapshots_v2 is
  'Immutable customer report source snapshot; created early so version extensions are fresh-chain safe.';

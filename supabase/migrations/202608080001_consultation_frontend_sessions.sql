create table if not exists public.consultation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  current_stage text not null default 'discovery'
    check (current_stage in ('discovery','photo','scan','analysis','direction','previews','compare','decision','salon-brief','aftercare','fashion')),
  snapshot jsonb not null default '{}'::jsonb,
  share_token_hash text unique,
  share_payload jsonb,
  share_expires_at timestamptz,
  share_revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_consultation_sessions_user_updated
  on public.consultation_sessions (user_id, updated_at desc);

create index if not exists idx_consultation_sessions_active_share
  on public.consultation_sessions (share_token_hash, share_expires_at)
  where share_token_hash is not null and share_revoked_at is null;

alter table public.consultation_sessions enable row level security;
alter table public.consultation_sessions force row level security;
revoke all on table public.consultation_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.consultation_sessions to service_role;

comment on table public.consultation_sessions is
  'Frontend-owned AI consulting journey snapshots. Independent from the backend refactor package.';

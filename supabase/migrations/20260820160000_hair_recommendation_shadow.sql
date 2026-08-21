-- P48 deterministic shadow ranking for the existing nine Hair preview board.
create table if not exists public.consultation_hair_recommendations_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  preview_board_id uuid not null references public.preview_boards_v2(id) on delete cascade,
  input_fingerprint text not null check (length(input_fingerprint) between 16 and 128),
  state text not null check (state in ('planning-nine','clarification-required','preview-batch-generating','ranking','primary-ready','adjustment-requested','confirmed','failed')),
  catalog_version text not null,
  policy_version text not null,
  requested_count integer not null default 9 check (requested_count = 9),
  accepted_count integer not null check (accepted_count between 0 and 9),
  failed_count integer not null check (failed_count between 0 and 9),
  terminal_count integer not null check (terminal_count between 0 and 9),
  ranked_previews jsonb not null check (jsonb_typeof(ranked_previews) = 'array'),
  primary_preview_id uuid references public.preview_variants_v2(id) on delete restrict,
  confidence numeric not null check (confidence between 0 and 1),
  clarification jsonb,
  clarification_count integer not null default 0 check (clarification_count between 0 and 1),
  source_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(source_ids) = 'array'),
  revision integer not null check (revision > 0),
  confirmed_revision integer,
  supersedes_revision integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (accepted_count + failed_count = terminal_count),
  check (confirmed_revision is null or confirmed_revision = revision),
  check (supersedes_revision is null or supersedes_revision < revision),
  check (clarification_count = 0 or clarification is not null),
  check (
    state not in ('clarification-required','primary-ready','confirmed')
    or (
      accepted_count = 9
      and failed_count = 0
      and terminal_count = 9
      and jsonb_array_length(ranked_previews) = 9
      and primary_preview_id is not null
    )
  ),
  unique (consultation_id, revision),
  unique (consultation_id, input_fingerprint, policy_version)
);

create index if not exists idx_consultation_hair_recommendations_v2_owner
  on public.consultation_hair_recommendations_v2 (user_id, consultation_id, revision desc);
create index if not exists idx_consultation_hair_recommendations_v2_board
  on public.consultation_hair_recommendations_v2 (preview_board_id, policy_version);

alter table public.consultation_hair_recommendations_v2 enable row level security;
alter table public.consultation_hair_recommendations_v2 force row level security;
revoke all on table public.consultation_hair_recommendations_v2 from public, anon, authenticated;
grant select, insert, update, delete on table public.consultation_hair_recommendations_v2 to service_role;

comment on table public.consultation_hair_recommendations_v2 is
  'Immutable-by-revision Hair 9-preview shadow ranking decisions. Customer UX cutover is separately gated.';

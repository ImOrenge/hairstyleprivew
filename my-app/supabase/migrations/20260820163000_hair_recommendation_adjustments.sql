-- P49 immutable customer adjustment requests for AI-led Hair recommendations.
alter table public.preview_boards_v2
  add column if not exists source_generation_id uuid references public.generations(id) on delete restrict;

update public.preview_boards_v2 as board
   set source_generation_id = session.source_generation_id
  from public.consultation_sessions as session
 where session.current_preview_board_id = board.id
   and board.source_generation_id is null
   and session.source_generation_id is not null;

create unique index if not exists uq_preview_boards_v2_consultation_generation
  on public.preview_boards_v2 (consultation_id, source_generation_id)
  where source_generation_id is not null;

create table if not exists public.consultation_hair_adjustments_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  recommendation_revision integer not null check (recommendation_revision > 0),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  input_fingerprint text not null check (length(input_fingerprint) between 16 and 128),
  aspects jsonb not null check (jsonb_typeof(aspects) = 'array' and jsonb_array_length(aspects) between 1 and 8),
  state text not null check (state in ('pending-direction-revision','applied','superseded')),
  generation_draft_id uuid references public.generation_upload_drafts(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  applied_at timestamptz,
  unique (user_id, idempotency_key),
  unique (consultation_id, recommendation_revision, input_fingerprint)
);

alter table public.consultation_hair_adjustments_v2
  add column if not exists generation_draft_id uuid references public.generation_upload_drafts(id) on delete set null;

create unique index if not exists uq_consultation_hair_adjustments_v2_generation_draft
  on public.consultation_hair_adjustments_v2 (generation_draft_id)
  where generation_draft_id is not null;

create index if not exists idx_consultation_hair_adjustments_v2_owner
  on public.consultation_hair_adjustments_v2 (user_id, consultation_id, created_at desc);

alter table public.consultation_hair_adjustments_v2 enable row level security;
alter table public.consultation_hair_adjustments_v2 force row level security;
revoke all on table public.consultation_hair_adjustments_v2 from public, anon, authenticated;
grant select, insert, update, delete on table public.consultation_hair_adjustments_v2 to service_role;

comment on table public.consultation_hair_adjustments_v2 is
  'Immutable Hair recommendation adjustment intents; applying one creates a new strategy and nine-preview generation revision.';

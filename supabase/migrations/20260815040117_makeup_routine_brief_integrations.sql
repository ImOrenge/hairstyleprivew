create table if not exists public.makeup_routines (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  makeup_direction_snapshot_id uuid not null references public.makeup_direction_snapshots(id) on delete restrict,
  personal_color_profile_id uuid not null references public.personal_color_profiles_v2(id) on delete restrict,
  selected_style_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  mode text not null check (mode in ('compact','full')),
  compiler_version text not null default 'makeup-routine-v1',
  routine jsonb not null check (jsonb_typeof(routine) = 'object'),
  estimated_seconds integer not null check (estimated_seconds between 0 and 3600),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, makeup_direction_snapshot_id, mode)
);

create table if not exists public.makeup_artist_briefs (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  makeup_direction_snapshot_id uuid not null references public.makeup_direction_snapshots(id) on delete restrict,
  personal_color_profile_id uuid not null references public.personal_color_profiles_v2(id) on delete restrict,
  selected_style_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  compiler_version text not null default 'makeup-artist-brief-v1',
  source_photo_included boolean not null default false,
  brief jsonb not null check (jsonb_typeof(brief) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, makeup_direction_snapshot_id)
);

create table if not exists public.makeup_brief_shares (
  id uuid primary key default gen_random_uuid(),
  makeup_artist_brief_id uuid not null references public.makeup_artist_briefs(id) on delete cascade,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  include_source_photo boolean not null default false,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_makeup_routines_owner on public.makeup_routines(user_id,consultation_id,created_at desc);
create index if not exists idx_makeup_artist_briefs_owner on public.makeup_artist_briefs(user_id,consultation_id,created_at desc);
create index if not exists idx_makeup_brief_shares_active on public.makeup_brief_shares(token_hash,expires_at) where revoked_at is null;

alter table public.hair_color_generation_runs_v2 add column if not exists personal_color_profile_id uuid references public.personal_color_profiles_v2(id) on delete restrict;
alter table public.color_selection_snapshots_v2 add column if not exists personal_color_profile_id uuid references public.personal_color_profiles_v2(id) on delete restrict;
alter table public.styling_sessions add column if not exists personal_color_profile_id uuid references public.personal_color_profiles_v2(id) on delete restrict;
alter table public.fashion_preview_batches_v2 add column if not exists personal_color_profile_id uuid references public.personal_color_profiles_v2(id) on delete restrict;
alter table public.fashion_preview_sets_v2 add column if not exists personal_color_profile_id uuid references public.personal_color_profiles_v2(id) on delete restrict;

create index if not exists idx_hair_color_runs_personal_color_profile on public.hair_color_generation_runs_v2(personal_color_profile_id) where personal_color_profile_id is not null;
create index if not exists idx_color_selections_personal_color_profile on public.color_selection_snapshots_v2(personal_color_profile_id) where personal_color_profile_id is not null;
create index if not exists idx_styling_sessions_personal_color_profile on public.styling_sessions(personal_color_profile_id) where personal_color_profile_id is not null;
create index if not exists idx_fashion_batches_personal_color_profile on public.fashion_preview_batches_v2(personal_color_profile_id) where personal_color_profile_id is not null;
create index if not exists idx_fashion_sets_personal_color_profile on public.fashion_preview_sets_v2(personal_color_profile_id) where personal_color_profile_id is not null;

alter table public.makeup_routines enable row level security;
alter table public.makeup_routines force row level security;
alter table public.makeup_artist_briefs enable row level security;
alter table public.makeup_artist_briefs force row level security;
alter table public.makeup_brief_shares enable row level security;
alter table public.makeup_brief_shares force row level security;
revoke all on table public.makeup_routines, public.makeup_artist_briefs, public.makeup_brief_shares from public, anon, authenticated;
grant select,insert,update,delete on table public.makeup_routines, public.makeup_artist_briefs, public.makeup_brief_shares to service_role;

drop trigger if exists protect_makeup_routine_update on public.makeup_routines;
create trigger protect_makeup_routine_update before update on public.makeup_routines
for each row execute function public.reject_immutable_hairfit_snapshot_update_v2();
drop trigger if exists protect_makeup_artist_brief_update on public.makeup_artist_briefs;
create trigger protect_makeup_artist_brief_update before update on public.makeup_artist_briefs
for each row execute function public.reject_immutable_hairfit_snapshot_update_v2();

comment on column public.makeup_artist_briefs.source_photo_included is 'Must remain false in the stored brief. Source photo sharing requires a separate explicit share permission.';
comment on column public.makeup_brief_shares.include_source_photo is 'Defaults false. Phase 07 public payload never embeds a private source asset path.';

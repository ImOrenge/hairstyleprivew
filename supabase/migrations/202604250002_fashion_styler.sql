-- Fashion styler MVP schema and private storage buckets.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'styling_session_status') then
    create type public.styling_session_status as enum (
      'draft',
      'recommended',
      'generating',
      'completed',
      'failed'
    );
  end if;
end
$$;

create table if not exists public.user_style_profiles (
  user_id text primary key references public.users(id) on delete cascade,
  height_cm integer check (height_cm between 120 and 230),
  body_shape text check (body_shape in ('straight', 'hourglass', 'triangle', 'inverted_triangle', 'round')),
  top_size text,
  bottom_size text,
  fit_preference text check (fit_preference in ('regular', 'slim', 'relaxed', 'oversized')),
  color_preference text,
  exposure_preference text check (exposure_preference in ('low', 'balanced', 'bold')),
  avoid_items text[] not null default '{}'::text[],
  body_photo_path text,
  body_photo_consent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.styling_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  selected_variant_id text not null,
  occasion text not null,
  mood text not null,
  recommendation jsonb not null default '{}'::jsonb,
  generated_image_path text,
  status public.styling_session_status not null default 'draft',
  error_message text,
  credits_used integer not null default 0 check (credits_used >= 0),
  model_provider text not null default 'gemini',
  model_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_styling_sessions_user_created_at
  on public.styling_sessions (user_id, created_at desc);

create index if not exists idx_styling_sessions_generation
  on public.styling_sessions (generation_id, selected_variant_id);

drop trigger if exists trg_user_style_profiles_set_updated_at on public.user_style_profiles;
create trigger trg_user_style_profiles_set_updated_at
before update on public.user_style_profiles
for each row
execute procedure public.set_updated_at();

drop trigger if exists trg_styling_sessions_set_updated_at on public.styling_sessions;
create trigger trg_styling_sessions_set_updated_at
before update on public.styling_sessions
for each row
execute procedure public.set_updated_at();

alter table public.user_style_profiles enable row level security;
alter table public.styling_sessions enable row level security;

drop policy if exists "user_style_profiles_select_own" on public.user_style_profiles;
create policy "user_style_profiles_select_own"
  on public.user_style_profiles
  for select
  using (user_id = auth.jwt() ->> 'sub');

drop policy if exists "user_style_profiles_insert_own" on public.user_style_profiles;
create policy "user_style_profiles_insert_own"
  on public.user_style_profiles
  for insert
  with check (user_id = auth.jwt() ->> 'sub');

drop policy if exists "user_style_profiles_update_own" on public.user_style_profiles;
create policy "user_style_profiles_update_own"
  on public.user_style_profiles
  for update
  using (user_id = auth.jwt() ->> 'sub')
  with check (user_id = auth.jwt() ->> 'sub');

drop policy if exists "styling_sessions_select_own" on public.styling_sessions;
create policy "styling_sessions_select_own"
  on public.styling_sessions
  for select
  using (user_id = auth.jwt() ->> 'sub');

drop policy if exists "styling_sessions_insert_own" on public.styling_sessions;
create policy "styling_sessions_insert_own"
  on public.styling_sessions
  for insert
  with check (user_id = auth.jwt() ->> 'sub');

drop policy if exists "styling_sessions_update_own" on public.styling_sessions;
create policy "styling_sessions_update_own"
  on public.styling_sessions
  for update
  using (user_id = auth.jwt() ->> 'sub')
  with check (user_id = auth.jwt() ->> 'sub');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-body-photos', 'profile-body-photos', false, 8000000, array['image/webp', 'image/jpeg', 'image/png']),
  ('styling-results', 'styling-results', false, 12000000, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- HairFit AI generation review table
-- Stores per-user review (rating + comment) for each generation result page.
-- Depends on: 202602090001_init_hairfit.sql

create table if not exists public.generation_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  generation_id text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 5 and 800),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, generation_id)
);

create index if not exists idx_generation_reviews_user_id_created_at
  on public.generation_reviews (user_id, created_at desc);

create index if not exists idx_generation_reviews_generation_id_created_at
  on public.generation_reviews (generation_id, created_at desc);

drop trigger if exists trg_generation_reviews_set_updated_at on public.generation_reviews;
create trigger trg_generation_reviews_set_updated_at
before update on public.generation_reviews
for each row
execute procedure public.set_updated_at();

alter table public.generation_reviews enable row level security;

drop policy if exists "generation_reviews_select_own" on public.generation_reviews;
create policy "generation_reviews_select_own"
  on public.generation_reviews
  for select
  using (user_id = auth.jwt() ->> 'sub');

drop policy if exists "generation_reviews_insert_own" on public.generation_reviews;
create policy "generation_reviews_insert_own"
  on public.generation_reviews
  for insert
  with check (user_id = auth.jwt() ->> 'sub');

drop policy if exists "generation_reviews_update_own" on public.generation_reviews;
create policy "generation_reviews_update_own"
  on public.generation_reviews
  for update
  using (user_id = auth.jwt() ->> 'sub')
  with check (user_id = auth.jwt() ->> 'sub');

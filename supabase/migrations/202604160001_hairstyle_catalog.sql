-- Hairstyle catalog for periodic weekly refresh
-- Stores catalog rows used at runtime for recommendation and generation.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'hairstyle_catalog_status') then
    create type public.hairstyle_catalog_status as enum ('active', 'archived');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'hairstyle_catalog_cycle_status') then
    create type public.hairstyle_catalog_cycle_status as enum ('running', 'succeeded', 'failed');
  end if;
end
$$;

create table if not exists public.hairstyle_catalog_cycles (
  cycle_id uuid primary key default gen_random_uuid(),
  status public.hairstyle_catalog_cycle_status not null default 'running',
  market text not null,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  item_count integer not null default 0 check (item_count >= 0),
  source_summary jsonb not null default '{}'::jsonb,
  error_log text
);

create table if not exists public.hairstyle_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ko text not null,
  description text not null default '',
  market text not null,
  length_bucket text not null check (length_bucket in ('short', 'medium', 'long')),
  silhouette text not null,
  texture text not null,
  bang_type text not null,
  volume_focus_tags text[] not null default '{}'::text[],
  face_shape_fit_tags text[] not null default '{}'::text[],
  avoid_tags text[] not null default '{}'::text[],
  trend_score numeric(5,2) not null default 0,
  freshness_score numeric(5,2) not null default 0,
  prompt_template text not null,
  negative_prompt text not null,
  prompt_template_version text not null default 'catalog-v1',
  status public.hairstyle_catalog_status not null default 'active',
  source_cycle_id uuid not null references public.hairstyle_catalog_cycles(cycle_id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_hairstyle_catalog_market_cycle
  on public.hairstyle_catalog (market, source_cycle_id, status);

create index if not exists idx_hairstyle_catalog_cycle_started_at
  on public.hairstyle_catalog_cycles (started_at desc);

drop trigger if exists trg_hairstyle_catalog_set_updated_at on public.hairstyle_catalog;
create trigger trg_hairstyle_catalog_set_updated_at
before update on public.hairstyle_catalog
for each row
execute procedure public.set_updated_at();

alter table public.hairstyle_catalog enable row level security;
alter table public.hairstyle_catalog_cycles enable row level security;

drop policy if exists "hairstyle_catalog_select_authenticated" on public.hairstyle_catalog;
create policy "hairstyle_catalog_select_authenticated"
  on public.hairstyle_catalog
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "hairstyle_catalog_cycles_select_authenticated" on public.hairstyle_catalog_cycles;
create policy "hairstyle_catalog_cycles_select_authenticated"
  on public.hairstyle_catalog_cycles
  for select
  using (auth.role() = 'authenticated');

-- Fashion genre catalog for Korean weekly outfit recommendations.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fashion_catalog_status') then
    create type public.fashion_catalog_status as enum ('active', 'archived');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fashion_catalog_cycle_status') then
    create type public.fashion_catalog_cycle_status as enum ('running', 'succeeded', 'failed');
  end if;
end
$$;

create table if not exists public.fashion_catalog_cycles (
  cycle_id uuid primary key default gen_random_uuid(),
  status public.fashion_catalog_cycle_status not null default 'running',
  market text not null default 'kr',
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  item_count integer not null default 0 check (item_count >= 0),
  source_summary jsonb not null default '{}'::jsonb,
  error_log text
);

create table if not exists public.fashion_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  genre text not null check (
    genre in ('minimal', 'street', 'casual', 'classic', 'office', 'date', 'formal', 'athleisure')
  ),
  headline text not null,
  summary text not null default '',
  market text not null default 'kr',
  palette text[] not null default '{}'::text[],
  silhouette text not null default '',
  items jsonb not null default '[]'::jsonb,
  styling_notes text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  trend_score numeric(5,2) not null default 0,
  freshness_score numeric(5,2) not null default 0,
  status public.fashion_catalog_status not null default 'active',
  source_cycle_id uuid not null references public.fashion_catalog_cycles(cycle_id) on delete restrict,
  source_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if to_regclass('public.styling_sessions') is not null then
    alter table public.styling_sessions
      add column if not exists genre text check (
        genre is null or genre in ('minimal', 'street', 'casual', 'classic', 'office', 'date', 'formal', 'athleisure')
      );

    create index if not exists idx_styling_sessions_user_genre_created_at
      on public.styling_sessions (user_id, genre, created_at desc);
  end if;
end
$$;

create index if not exists idx_fashion_catalog_genre_cycle
  on public.fashion_catalog (genre, source_cycle_id, status);

create index if not exists idx_fashion_catalog_cycle_started_at
  on public.fashion_catalog_cycles (started_at desc);

drop trigger if exists trg_fashion_catalog_set_updated_at on public.fashion_catalog;
create trigger trg_fashion_catalog_set_updated_at
before update on public.fashion_catalog
for each row
execute procedure public.set_updated_at();

alter table public.fashion_catalog enable row level security;
alter table public.fashion_catalog_cycles enable row level security;

drop policy if exists "fashion_catalog_select_authenticated" on public.fashion_catalog;
create policy "fashion_catalog_select_authenticated"
  on public.fashion_catalog
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "fashion_catalog_cycles_select_authenticated" on public.fashion_catalog_cycles;
create policy "fashion_catalog_cycles_select_authenticated"
  on public.fashion_catalog_cycles
  for select
  using (auth.role() = 'authenticated');

-- Optional weekly rebuild schedule. Before applying in production, set:
--   set app.web_app_base_url = 'https://<your-app-domain>';
--   set app.internal_api_secret = '<same value as INTERNAL_API_SECRET>';
-- The schedule runs Sunday 19:00 UTC, which is Monday 04:00 KST.
create extension if not exists pg_net schema extensions;

do $$
declare
  app_url text := nullif(current_setting('app.web_app_base_url', true), '');
  admin_secret text := nullif(current_setting('app.internal_api_secret', true), '');
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule('cron-fashion-catalog-rebuild')
      where exists (
        select 1 from cron.job where jobname = 'cron-fashion-catalog-rebuild'
      );

    if app_url is not null and admin_secret is not null then
      perform cron.schedule(
        'cron-fashion-catalog-rebuild',
        '0 19 * * SUN',
        format(
          $sql$
            select net.http_post(
              url     := %L,
              headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-admin-secret', %L
              ),
              body    := '{"mode":"auto"}'::jsonb
            ) as request_id;
          $sql$,
          app_url || '/api/admin/fashion/rebuild',
          admin_secret
        )
      );
    end if;
  end if;
end
$$;

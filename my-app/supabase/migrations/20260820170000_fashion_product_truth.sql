-- P50 Fashion Product Truth: trusted sources, mutable current offers, immutable consultation snapshots.
create table if not exists public.fashion_product_sources_v2 (
  source_id text primary key check (length(source_id) between 2 and 100),
  source_type text not null check (source_type in ('official-api','partner-feed','seller-export','verified-manual')),
  seller_id text not null check (length(seller_id) between 1 and 120),
  territory text[] not null default array['KR']::text[],
  allowed_hosts text[] not null check (cardinality(allowed_hosts) > 0),
  refresh_sla_minutes integer not null check (refresh_sla_minutes between 5 and 1440),
  image_usage_policy text not null check (image_usage_policy in ('link','licensed-cache','none')),
  affiliate_disclosure_required boolean not null default false,
  enabled boolean not null default false,
  last_healthy_at timestamptz,
  quarantined_at timestamptz,
  quarantine_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (quarantined_at is not null or quarantine_reason is null)
);

create unique index if not exists uq_fashion_product_sources_v2_seller_source
  on public.fashion_product_sources_v2 (seller_id, source_id);

create table if not exists public.fashion_products_v2 (
  id uuid primary key default gen_random_uuid(),
  canonical_product_id text not null unique check (length(canonical_product_id) between 2 and 160),
  brand_name text not null check (length(trim(brand_name)) > 0),
  product_name text not null check (length(trim(product_name)) > 0),
  category text not null check (length(trim(category)) > 0),
  color_family text[] not null default '{}'::text[],
  material_tags text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fashion_product_offers_v2 (
  offer_id text primary key check (length(offer_id) between 2 and 160),
  source_id text not null references public.fashion_product_sources_v2(source_id) on delete restrict,
  seller_id text not null check (length(seller_id) between 1 and 120),
  seller_product_id text not null check (length(seller_product_id) between 1 and 160),
  product_id uuid not null references public.fashion_products_v2(id) on delete restrict,
  size_system text not null check (length(size_system) between 1 and 40),
  available_sizes text[] not null default '{}'::text[],
  price_amount integer not null check (price_amount >= 0),
  list_price_amount integer check (list_price_amount is null or list_price_amount >= price_amount),
  currency text not null default 'KRW' check (currency = 'KRW'),
  availability text not null check (availability in ('in-stock','low-stock','out-of-stock','unknown')),
  ships_to_korea boolean not null,
  product_url text not null check (product_url ~ '^https://'),
  image_url text,
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  source_fingerprint text not null check (length(source_fingerprint) between 8 and 160),
  updated_at timestamptz not null default timezone('utc', now()),
  check (expires_at > observed_at),
  unique (source_id, seller_product_id)
);

create index if not exists idx_fashion_product_offers_v2_eligibility
  on public.fashion_product_offers_v2 (source_id, availability, expires_at desc);
create index if not exists idx_fashion_product_offers_v2_product
  on public.fashion_product_offers_v2 (product_id, observed_at desc);

create table if not exists public.fashion_product_offer_snapshots_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  offer_id text not null references public.fashion_product_offers_v2(offer_id) on delete restrict,
  recommendation_revision integer not null check (recommendation_revision > 0),
  replacement_of_snapshot_id uuid references public.fashion_product_offer_snapshots_v2(id) on delete restrict,
  offer_payload jsonb not null check (
    jsonb_typeof(offer_payload) = 'object'
    and offer_payload->>'schemaVersion' = 'fashion-product-offer-v1'
  ),
  eligibility_reason_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(eligibility_reason_codes) = 'array'),
  policy_version text not null default 'fashion-product-truth-v1',
  captured_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, recommendation_revision, offer_id)
);

create index if not exists idx_fashion_product_offer_snapshots_v2_owner
  on public.fashion_product_offer_snapshots_v2 (user_id, consultation_id, recommendation_revision desc);
create unique index if not exists uq_fashion_product_offer_snapshots_v2_replacement
  on public.fashion_product_offer_snapshots_v2 (replacement_of_snapshot_id)
  where replacement_of_snapshot_id is not null;

create or replace function public.prevent_fashion_offer_snapshot_update_v2()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'FASHION_OFFER_SNAPSHOT_IMMUTABLE';
end;
$$;

drop trigger if exists trg_fashion_offer_snapshot_immutable_v2 on public.fashion_product_offer_snapshots_v2;
create trigger trg_fashion_offer_snapshot_immutable_v2
before update on public.fashion_product_offer_snapshots_v2
for each row execute function public.prevent_fashion_offer_snapshot_update_v2();

create table if not exists public.fashion_product_source_runs_v2 (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.fashion_product_sources_v2(source_id) on delete restrict,
  requested_by_user_id text references public.users(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  state text not null check (state in ('queued','running','succeeded','failed','quarantined')),
  received_count integer not null default 0 check (received_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  receipt_hash text,
  error_code text,
  error_message text,
  lease_owner text,
  lease_expires_at timestamptz,
  fencing_token integer not null default 0 check (fencing_token >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (source_id, idempotency_key),
  check (accepted_count + rejected_count <= received_count)
);

create index if not exists idx_fashion_product_source_runs_v2_state
  on public.fashion_product_source_runs_v2 (source_id, state, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'fashion_product_sources_v2',
    'fashion_products_v2',
    'fashion_product_offers_v2',
    'fashion_product_offer_snapshots_v2',
    'fashion_product_source_runs_v2'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

comment on table public.fashion_product_offers_v2 is
  'Mutable latest provider observations. Trend research is forbidden from writing this table.';
comment on table public.fashion_product_offer_snapshots_v2 is
  'Immutable-by-database consultation recommendation evidence. Replacements append a new revision.';

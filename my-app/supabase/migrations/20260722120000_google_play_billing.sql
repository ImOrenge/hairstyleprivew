-- Google Play Billing purchase intents, token bindings, and RTDN idempotency.
-- Google Play purchases reuse payment_transactions, user_subscriptions, and credit_ledger.

alter type public.payment_provider add value if not exists 'google_play';

create table if not exists public.google_play_purchase_intents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  product_key text not null check (product_key in ('basic', 'standard', 'pro', 'usage30', 'usage80', 'usage200')),
  product_id text not null,
  product_type text not null check (product_type in ('subscription', 'consumable')),
  obfuscated_account_id text not null,
  obfuscated_profile_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'bound', 'completed', 'expired', 'conflict')),
  purchase_token_hash text,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_google_play_purchase_intents_user_created
  on public.google_play_purchase_intents (user_id, created_at desc);

create index if not exists idx_google_play_purchase_intents_pending_expiry
  on public.google_play_purchase_intents (expires_at)
  where status = 'pending';

drop trigger if exists trg_google_play_purchase_intents_updated_at on public.google_play_purchase_intents;
create trigger trg_google_play_purchase_intents_updated_at
  before update on public.google_play_purchase_intents
  for each row execute procedure public.set_updated_at();

create table if not exists public.google_play_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  product_key text not null check (product_key in ('basic', 'standard', 'pro', 'usage30', 'usage80', 'usage200')),
  product_id text not null,
  product_type text not null check (product_type in ('subscription', 'consumable')),
  purchase_intent_id uuid references public.google_play_purchase_intents(id) on delete set null,
  purchase_token_hash text not null unique,
  purchase_token_encrypted text not null,
  latest_order_id text,
  payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  subscription_id uuid references public.user_subscriptions(id) on delete set null,
  state text not null check (state in ('pending', 'active', 'canceled', 'grace_period', 'on_hold', 'paused', 'expired', 'revoked')),
  acknowledged boolean not null default false,
  consumed boolean not null default false,
  expiry_time timestamptz,
  auto_renewing boolean not null default false,
  last_verified_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_google_play_purchases_latest_order
  on public.google_play_purchases (latest_order_id)
  where latest_order_id is not null;

create index if not exists idx_google_play_purchases_user_created
  on public.google_play_purchases (user_id, created_at desc);

drop trigger if exists trg_google_play_purchases_updated_at on public.google_play_purchases;
create trigger trg_google_play_purchases_updated_at
  before update on public.google_play_purchases
  for each row execute procedure public.set_updated_at();

alter table public.user_subscriptions
  add column if not exists billing_provider public.payment_provider not null default 'portone',
  add column if not exists provider_product_id text,
  add column if not exists google_play_purchase_id uuid references public.google_play_purchases(id) on delete set null;

create table if not exists public.google_play_rtdn_events (
  message_id text primary key,
  package_name text not null,
  notification_kind text not null,
  notification_type integer,
  purchase_token_hash text,
  order_id text,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error_code text,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz
);

create index if not exists idx_google_play_rtdn_events_received
  on public.google_play_rtdn_events (received_at desc);

alter table public.google_play_purchase_intents enable row level security;
alter table public.google_play_purchase_intents force row level security;
alter table public.google_play_purchases enable row level security;
alter table public.google_play_purchases force row level security;
alter table public.google_play_rtdn_events enable row level security;
alter table public.google_play_rtdn_events force row level security;

revoke all on table public.google_play_purchase_intents from public, anon, authenticated;
revoke all on table public.google_play_purchases from public, anon, authenticated;
revoke all on table public.google_play_rtdn_events from public, anon, authenticated;

grant select, insert, update on table public.google_play_purchase_intents to service_role;
grant select, insert, update on table public.google_play_purchases to service_role;
grant select, insert, update on table public.google_play_rtdn_events to service_role;

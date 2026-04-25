-- HairFit AI initial schema
-- Target: Supabase Postgres

create extension if not exists "pgcrypto";
create extension if not exists "citext";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'generation_status') then
    create type public.generation_status as enum (
      'queued',
      'processing',
      'completed',
      'failed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'credit_entry_type') then
    create type public.credit_entry_type as enum (
      'grant',
      'purchase',
      'usage',
      'refund',
      'adjustment'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_provider') then
    create type public.payment_provider as enum ('polar');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'pending',
      'paid',
      'failed',
      'canceled',
      'refunded'
    );
  end if;
end
$$;

create table if not exists public.users (
  id text primary key,
  email citext not null unique,
  display_name text,
  avatar_url text,
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  original_image_path text not null,
  generated_image_path text,
  prompt_used text not null,
  options jsonb not null default '{}'::jsonb,
  status public.generation_status not null default 'queued',
  error_message text,
  credits_used integer not null default 2 check (credits_used >= 0),
  model_provider text not null default 'gemini',
  model_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  provider public.payment_provider not null default 'polar',
  provider_order_id text,
  provider_customer_id text,
  status public.payment_status not null default 'pending',
  currency text not null default 'KRW',
  amount integer not null check (amount > 0),
  credits_to_grant integer not null check (credits_to_grant > 0),
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_order_id)
);

create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id text not null references public.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  entry_type public.credit_entry_type not null,
  amount integer not null check (amount <> 0),
  balance_after integer not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_generations_user_id_created_at
  on public.generations (user_id, created_at desc);

create index if not exists idx_generations_status
  on public.generations (status);

create index if not exists idx_payment_transactions_user_id_created_at
  on public.payment_transactions (user_id, created_at desc);

create index if not exists idx_credit_ledger_user_id_created_at
  on public.credit_ledger (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_users_set_updated_at on public.users;
create trigger trg_users_set_updated_at
before update on public.users
for each row
execute procedure public.set_updated_at();

drop trigger if exists trg_generations_set_updated_at on public.generations;
create trigger trg_generations_set_updated_at
before update on public.generations
for each row
execute procedure public.set_updated_at();

drop trigger if exists trg_payment_transactions_set_updated_at on public.payment_transactions;
create trigger trg_payment_transactions_set_updated_at
before update on public.payment_transactions
for each row
execute procedure public.set_updated_at();

create or replace function public.credit_ledger_before_insert()
returns trigger
language plpgsql
as $$
declare
  current_credits integer;
begin
  select credits
    into current_credits
    from public.users
   where id = new.user_id
   for update;

  if current_credits is null then
    raise exception 'User % not found', new.user_id;
  end if;

  new.balance_after := current_credits + new.amount;

  if new.balance_after < 0 then
    raise exception 'Insufficient credits for user %', new.user_id;
  end if;

  return new;
end;
$$;

create or replace function public.credit_ledger_after_insert()
returns trigger
language plpgsql
as $$
begin
  update public.users
     set credits = new.balance_after,
         updated_at = timezone('utc', now())
   where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_credit_ledger_before_insert on public.credit_ledger;
create trigger trg_credit_ledger_before_insert
before insert on public.credit_ledger
for each row
execute procedure public.credit_ledger_before_insert();

drop trigger if exists trg_credit_ledger_after_insert on public.credit_ledger;
create trigger trg_credit_ledger_after_insert
after insert on public.credit_ledger
for each row
execute procedure public.credit_ledger_after_insert();

alter table public.users enable row level security;
alter table public.generations enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users
  for select
  using (id = auth.jwt() ->> 'sub');

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
  on public.users
  for insert
  with check (id = auth.jwt() ->> 'sub');

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users
  for update
  using (id = auth.jwt() ->> 'sub')
  with check (id = auth.jwt() ->> 'sub');

drop policy if exists "generations_select_own" on public.generations;
create policy "generations_select_own"
  on public.generations
  for select
  using (user_id = auth.jwt() ->> 'sub');

drop policy if exists "generations_insert_own" on public.generations;
create policy "generations_insert_own"
  on public.generations
  for insert
  with check (user_id = auth.jwt() ->> 'sub');

drop policy if exists "generations_update_own" on public.generations;
create policy "generations_update_own"
  on public.generations
  for update
  using (user_id = auth.jwt() ->> 'sub')
  with check (user_id = auth.jwt() ->> 'sub');

drop policy if exists "payment_transactions_select_own" on public.payment_transactions;
create policy "payment_transactions_select_own"
  on public.payment_transactions
  for select
  using (user_id = auth.jwt() ->> 'sub');

drop policy if exists "credit_ledger_select_own" on public.credit_ledger;
create policy "credit_ledger_select_own"
  on public.credit_ledger
  for select
  using (user_id = auth.jwt() ->> 'sub');

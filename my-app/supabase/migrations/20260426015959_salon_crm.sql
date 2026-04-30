-- Salon owner customer management (CRM)
-- Stores owner-scoped customer records, visit history, and follow-up tasks.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'salon_customer_source') then
    create type public.salon_customer_source as enum ('manual', 'linked_member');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'salon_aftercare_channel') then
    create type public.salon_aftercare_channel as enum ('sms', 'kakao', 'phone', 'manual');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'salon_aftercare_status') then
    create type public.salon_aftercare_status as enum ('pending', 'done', 'canceled');
  end if;
end
$$;

create table if not exists public.salon_customers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.users(id) on delete cascade,
  linked_user_id text references public.users(id) on delete set null,
  source public.salon_customer_source not null default 'manual',
  name text not null check (char_length(trim(name)) between 1 and 120),
  phone text,
  email citext,
  memo text,
  consent_sms boolean not null default false,
  consent_kakao boolean not null default false,
  last_visit_at timestamptz,
  next_follow_up_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint salon_customers_linked_member_requires_user
    check (source <> 'linked_member' or linked_user_id is not null),
  constraint salon_customers_id_owner_unique unique (id, owner_user_id)
);

create table if not exists public.salon_customer_visits (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.users(id) on delete cascade,
  customer_id uuid not null,
  visited_at timestamptz not null,
  service_note text not null check (char_length(trim(service_note)) between 1 and 1000),
  memo text,
  next_recommended_visit_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint salon_customer_visits_customer_owner_fk
    foreign key (customer_id, owner_user_id)
    references public.salon_customers(id, owner_user_id)
    on delete cascade
);

create table if not exists public.salon_aftercare_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.users(id) on delete cascade,
  customer_id uuid not null,
  channel public.salon_aftercare_channel not null default 'manual',
  status public.salon_aftercare_status not null default 'pending',
  scheduled_for timestamptz not null,
  template_key text,
  note text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint salon_aftercare_tasks_customer_owner_fk
    foreign key (customer_id, owner_user_id)
    references public.salon_customers(id, owner_user_id)
    on delete cascade
);

create unique index if not exists idx_salon_customers_owner_linked_active
  on public.salon_customers (owner_user_id, linked_user_id)
  where linked_user_id is not null and archived_at is null;

create index if not exists idx_salon_customers_owner_updated_at
  on public.salon_customers (owner_user_id, updated_at desc);

create index if not exists idx_salon_customers_owner_next_follow_up
  on public.salon_customers (owner_user_id, next_follow_up_at)
  where archived_at is null and next_follow_up_at is not null;

create index if not exists idx_salon_customer_visits_owner_customer_visited
  on public.salon_customer_visits (owner_user_id, customer_id, visited_at desc);

create index if not exists idx_salon_aftercare_owner_status_scheduled
  on public.salon_aftercare_tasks (owner_user_id, status, scheduled_for);

drop trigger if exists trg_salon_customers_set_updated_at on public.salon_customers;
create trigger trg_salon_customers_set_updated_at
before update on public.salon_customers
for each row
execute procedure public.set_updated_at();

drop trigger if exists trg_salon_customer_visits_set_updated_at on public.salon_customer_visits;
create trigger trg_salon_customer_visits_set_updated_at
before update on public.salon_customer_visits
for each row
execute procedure public.set_updated_at();

drop trigger if exists trg_salon_aftercare_tasks_set_updated_at on public.salon_aftercare_tasks;
create trigger trg_salon_aftercare_tasks_set_updated_at
before update on public.salon_aftercare_tasks
for each row
execute procedure public.set_updated_at();

alter table public.salon_customers enable row level security;
alter table public.salon_customer_visits enable row level security;
alter table public.salon_aftercare_tasks enable row level security;

drop policy if exists "salon_customers_select_own" on public.salon_customers;
create policy "salon_customers_select_own"
  on public.salon_customers
  for select
  to authenticated
  using (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_customers_insert_own" on public.salon_customers;
create policy "salon_customers_insert_own"
  on public.salon_customers
  for insert
  to authenticated
  with check (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_customers_update_own" on public.salon_customers;
create policy "salon_customers_update_own"
  on public.salon_customers
  for update
  to authenticated
  using (owner_user_id = (select auth.jwt() ->> 'sub'))
  with check (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_customer_visits_select_own" on public.salon_customer_visits;
create policy "salon_customer_visits_select_own"
  on public.salon_customer_visits
  for select
  to authenticated
  using (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_customer_visits_insert_own" on public.salon_customer_visits;
create policy "salon_customer_visits_insert_own"
  on public.salon_customer_visits
  for insert
  to authenticated
  with check (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_customer_visits_update_own" on public.salon_customer_visits;
create policy "salon_customer_visits_update_own"
  on public.salon_customer_visits
  for update
  to authenticated
  using (owner_user_id = (select auth.jwt() ->> 'sub'))
  with check (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_aftercare_tasks_select_own" on public.salon_aftercare_tasks;
create policy "salon_aftercare_tasks_select_own"
  on public.salon_aftercare_tasks
  for select
  to authenticated
  using (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_aftercare_tasks_insert_own" on public.salon_aftercare_tasks;
create policy "salon_aftercare_tasks_insert_own"
  on public.salon_aftercare_tasks
  for insert
  to authenticated
  with check (owner_user_id = (select auth.jwt() ->> 'sub'));

drop policy if exists "salon_aftercare_tasks_update_own" on public.salon_aftercare_tasks;
create policy "salon_aftercare_tasks_update_own"
  on public.salon_aftercare_tasks
  for update
  to authenticated
  using (owner_user_id = (select auth.jwt() ->> 'sub'))
  with check (owner_user_id = (select auth.jwt() ->> 'sub'));

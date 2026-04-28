-- Admin dashboard support:
-- 1) users.account_type adds 'admin'
-- 2) B2B lead CRM table
-- 3) generation review moderation columns

do $$
begin
  if exists (select 1 from pg_type where typname = 'account_type') then
    alter type public.account_type add value if not exists 'admin';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conname = 'users_account_type_check'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users drop constraint users_account_type_check;
  end if;
end
$$;

alter table public.users
  add constraint users_account_type_check
  check (account_type is null or account_type in ('member', 'salon_owner', 'admin'));

do $$
begin
  if not exists (select 1 from pg_type where typname = 'b2b_lead_stage') then
    create type public.b2b_lead_stage as enum (
      'new',
      'qualified',
      'negotiation',
      'contracted',
      'dropped'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'b2b_lead_source') then
    create type public.b2b_lead_source as enum ('public_form', 'admin_manual');
  end if;
end
$$;

create table if not exists public.b2b_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (char_length(trim(company_name)) between 1 and 120),
  contact_name text not null check (char_length(trim(contact_name)) between 1 and 80),
  email citext not null,
  phone text,
  message text not null check (char_length(trim(message)) between 5 and 2000),
  stage public.b2b_lead_stage not null default 'new',
  source public.b2b_lead_source not null default 'public_form',
  owner_admin_user_id text references public.users(id) on delete set null,
  owner_note text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_b2b_leads_created_at
  on public.b2b_leads (created_at desc);

create index if not exists idx_b2b_leads_stage_created_at
  on public.b2b_leads (stage, created_at desc);

create index if not exists idx_b2b_leads_owner_admin
  on public.b2b_leads (owner_admin_user_id, updated_at desc);

drop trigger if exists trg_b2b_leads_set_updated_at on public.b2b_leads;
create trigger trg_b2b_leads_set_updated_at
before update on public.b2b_leads
for each row
execute procedure public.set_updated_at();

alter table public.b2b_leads enable row level security;

alter table public.generation_reviews
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by text;

create index if not exists idx_generation_reviews_visibility_created_at
  on public.generation_reviews (is_hidden, created_at desc);


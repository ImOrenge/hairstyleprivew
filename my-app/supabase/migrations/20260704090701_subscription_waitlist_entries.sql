create table if not exists public.subscription_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.users(id) on delete set null,
  email text not null,
  email_normalized text not null,
  plan_key text not null check (plan_key in ('basic', 'standard', 'pro')),
  status text not null default 'pending'
    check (status in ('pending', 'notified', 'converted', 'dismissed')),
  source_path text,
  use_case text,
  metadata jsonb not null default '{}'::jsonb,
  last_submitted_at timestamptz not null default timezone('utc', now()),
  notified_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subscription_waitlist_entries_email_normalized_format
    check (position('@' in email_normalized) > 1)
);

create unique index if not exists idx_subscription_waitlist_email_plan
  on public.subscription_waitlist_entries (email_normalized, plan_key);

create index if not exists idx_subscription_waitlist_user_created_at
  on public.subscription_waitlist_entries (user_id, created_at desc)
  where user_id is not null;

create index if not exists idx_subscription_waitlist_status_created_at
  on public.subscription_waitlist_entries (status, created_at desc);

create index if not exists idx_subscription_waitlist_plan_created_at
  on public.subscription_waitlist_entries (plan_key, created_at desc);

drop trigger if exists trg_subscription_waitlist_entries_set_updated_at
  on public.subscription_waitlist_entries;
create trigger trg_subscription_waitlist_entries_set_updated_at
before update on public.subscription_waitlist_entries
for each row execute function public.set_updated_at();

alter table public.subscription_waitlist_entries enable row level security;
revoke all on table public.subscription_waitlist_entries from anon, authenticated;
grant select, insert, update on table public.subscription_waitlist_entries to service_role;

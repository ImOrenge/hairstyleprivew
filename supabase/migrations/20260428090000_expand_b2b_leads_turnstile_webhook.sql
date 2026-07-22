alter table public.b2b_leads
  add column if not exists plan_interest text
    check (plan_interest is null or plan_interest in ('salon', 'pro', 'standard', 'basic', 'other')),
  add column if not exists region text,
  add column if not exists shop_count integer check (shop_count is null or shop_count >= 0),
  add column if not exists seat_count integer check (seat_count is null or seat_count >= 0),
  add column if not exists monthly_clients integer check (monthly_clients is null or monthly_clients >= 0),
  add column if not exists current_tools text,
  add column if not exists desired_timeline text,
  add column if not exists budget_range text,
  add column if not exists source_page text,
  add column if not exists turnstile_hostname text,
  add column if not exists turnstile_challenge_ts timestamptz,
  add column if not exists webhook_delivered boolean not null default false,
  add column if not exists webhook_delivered_at timestamptz,
  add column if not exists webhook_error text;

create index if not exists idx_b2b_leads_plan_interest_created_at
  on public.b2b_leads (plan_interest, created_at desc);

-- Track per-user trend alert delivery so cron retries do not resend to users
-- who already received a given alert.

create table if not exists public.trend_alert_deliveries (
  id               uuid primary key default gen_random_uuid(),
  alert_id         uuid not null references public.trend_alerts(id) on delete cascade,
  user_id          text not null references public.users(id) on delete cascade,
  email            text not null,
  status           text not null default 'pending'
                     check (status in ('pending', 'sent', 'failed')),
  email_message_id text,
  error_message    text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint trend_alert_deliveries_alert_user_key unique (alert_id, user_id)
);

create index if not exists idx_trend_alert_deliveries_alert_status
  on public.trend_alert_deliveries(alert_id, status);

drop trigger if exists trg_trend_alert_deliveries_updated_at on public.trend_alert_deliveries;
create trigger trg_trend_alert_deliveries_updated_at
  before update on public.trend_alert_deliveries
  for each row execute procedure public.set_updated_at();

alter table public.trend_alert_deliveries enable row level security;
revoke all on table public.trend_alert_deliveries from anon, authenticated;
grant select, insert, update on public.trend_alert_deliveries to service_role;

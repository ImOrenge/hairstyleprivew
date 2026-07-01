-- Store app-owned outbound email attempts so admins can review sent mail.

create table if not exists public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  provider_message_id text,
  source text not null default 'app',
  from_email text not null,
  to_emails text[] not null default '{}',
  to_email_text text not null default '',
  subject text not null default '',
  text_body text,
  html_body text,
  body_preview text not null default '',
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_outbound_emails_provider_message_id
  on public.outbound_emails (provider, provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_outbound_emails_status_created_at
  on public.outbound_emails (status, created_at desc);

create index if not exists idx_outbound_emails_created_at
  on public.outbound_emails (created_at desc);

create index if not exists idx_outbound_emails_to_emails
  on public.outbound_emails using gin (to_emails);

drop trigger if exists trg_outbound_emails_set_updated_at on public.outbound_emails;
create trigger trg_outbound_emails_set_updated_at
before update on public.outbound_emails
for each row
execute procedure public.set_updated_at();

alter table public.outbound_emails enable row level security;

revoke all on table public.outbound_emails from anon, authenticated;
grant select, insert, update on table public.outbound_emails to service_role;

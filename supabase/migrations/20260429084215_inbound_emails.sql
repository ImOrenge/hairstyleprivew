create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'cloudflare',
  message_id text,
  envelope_from text not null,
  envelope_to text not null,
  header_from text,
  header_to text[] not null default '{}',
  subject text not null default '',
  text_body text,
  html_body text,
  body_preview text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  admin_note text,
  in_reply_to text,
  reference_ids text[] not null default '{}',
  raw_size integer not null default 0 check (raw_size >= 0),
  received_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_inbound_emails_provider_message_id
  on public.inbound_emails (provider, message_id)
  where message_id is not null;

create index if not exists idx_inbound_emails_status_received_at
  on public.inbound_emails (status, received_at desc);

create index if not exists idx_inbound_emails_received_at
  on public.inbound_emails (received_at desc);

drop trigger if exists trg_inbound_emails_set_updated_at on public.inbound_emails;
create trigger trg_inbound_emails_set_updated_at
before update on public.inbound_emails
for each row
execute procedure public.set_updated_at();

alter table public.inbound_emails enable row level security;

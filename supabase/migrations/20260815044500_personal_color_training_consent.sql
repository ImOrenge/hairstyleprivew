create table if not exists public.personal_color_training_consent_events (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  consent_version text not null check (consent_version = 'personal-color-training-v1'),
  consent_text_hash text not null check (length(consent_text_hash) = 64),
  action text not null check (action in ('granted','revoked')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key)
);
create index if not exists idx_personal_color_training_consent_owner
  on public.personal_color_training_consent_events(user_id,consultation_id,created_at desc);

alter table public.personal_color_training_consent_events enable row level security;
alter table public.personal_color_training_consent_events force row level security;
revoke all on table public.personal_color_training_consent_events from public, anon, authenticated;
grant select,insert on table public.personal_color_training_consent_events to service_role;

comment on table public.personal_color_training_consent_events is
  'Append-only optional model-training consent. Product diagnosis processing never depends on this consent.';
comment on column public.personal_color_training_consent_events.action is
  'Latest event is authoritative. No consent row means not granted.';

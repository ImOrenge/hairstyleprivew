alter table public.fashion_preview_batches_v2
  add column if not exists slot_progress jsonb not null default '{}'::jsonb
    check (jsonb_typeof(slot_progress) = 'object'),
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists retry_count integer not null default 0
    check (retry_count between 0 and 27);

create index if not exists idx_fashion_preview_batches_v2_heartbeat
  on public.fashion_preview_batches_v2 (last_heartbeat_at, state)
  where state in ('approved', 'generating', 'partial');

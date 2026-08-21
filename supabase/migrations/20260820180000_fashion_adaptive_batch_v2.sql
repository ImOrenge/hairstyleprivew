alter table public.fashion_preview_batches_v2
  drop constraint if exists fashion_preview_batches_v2_requested_count_check,
  drop constraint if exists fashion_preview_batches_v2_completed_count_check,
  drop constraint if exists fashion_preview_batches_v2_failed_count_check;

alter table public.fashion_preview_batches_v2
  add column if not exists base_batch_id uuid references public.fashion_preview_batches_v2(id) on delete restrict,
  add column if not exists expansion_level integer not null default 2,
  add column if not exists recommended_preview_id uuid references public.styling_sessions(id) on delete set null,
  add column if not exists selected_preview_id uuid references public.styling_sessions(id) on delete set null,
  add column if not exists revision integer not null default 1,
  add column if not exists slot_roles jsonb not null default '{}'::jsonb,
  add column if not exists expansion_idempotency_keys text[] not null default '{}'::text[];

update public.fashion_preview_batches_v2
set base_batch_id = id
where base_batch_id is null;

alter table public.fashion_preview_batches_v2
  alter column base_batch_id set not null,
  add constraint fashion_preview_batches_v2_requested_count_check check (requested_count in (3, 6, 9)),
  add constraint fashion_preview_batches_v2_completed_count_check check (completed_count between 0 and requested_count),
  add constraint fashion_preview_batches_v2_failed_count_check check (failed_count between 0 and requested_count),
  add constraint fashion_preview_batches_v2_expansion_level_check check (
    (requested_count = 3 and expansion_level = 0)
    or (requested_count = 6 and expansion_level = 1)
    or (requested_count = 9 and expansion_level = 2)
  ),
  add constraint fashion_preview_batches_v2_revision_check check (revision > 0),
  add constraint fashion_preview_batches_v2_slot_roles_check check (jsonb_typeof(slot_roles) = 'object');

create index if not exists idx_fashion_preview_batches_v2_base_batch
  on public.fashion_preview_batches_v2 (base_batch_id, revision desc);

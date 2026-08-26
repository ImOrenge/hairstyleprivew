-- Customer-owned metadata for immutable HairFit V2 stylebook results.
-- Source snapshots remain untouched; every mutable field is stored separately.

create table if not exists public.customer_stylebook_item_states_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  item_kind text not null check (item_kind in ('hair', 'fashion')),
  source_id uuid not null,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  custom_title text,
  note text not null default '',
  tags text[] not null default '{}'::text[],
  is_favorite boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_stylebook_item_states_v2_source_key unique (user_id, item_kind, source_id),
  constraint customer_stylebook_item_states_v2_title_check
    check (custom_title is null or length(btrim(custom_title)) between 1 and 80),
  constraint customer_stylebook_item_states_v2_note_check check (length(note) <= 2000),
  constraint customer_stylebook_item_states_v2_tags_check check (cardinality(tags) <= 20)
);

create table if not exists public.customer_stylebook_collections_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  color_key text not null default 'champagne',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_stylebook_collections_v2_owner_key unique (id, user_id),
  constraint customer_stylebook_collections_v2_name_check check (length(btrim(name)) between 1 and 60),
  constraint customer_stylebook_collections_v2_color_check
    check (color_key in ('champagne', 'ivory', 'graphite', 'rose', 'sage')),
  constraint customer_stylebook_collections_v2_sort_check check (sort_order between 0 and 10000)
);

create table if not exists public.customer_stylebook_collection_items_v2 (
  collection_id uuid not null,
  user_id text not null,
  item_kind text not null check (item_kind in ('hair', 'fashion')),
  source_id uuid not null,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  added_at timestamptz not null default timezone('utc', now()),
  primary key (collection_id, item_kind, source_id),
  constraint customer_stylebook_collection_items_v2_owner_fkey
    foreign key (collection_id, user_id)
    references public.customer_stylebook_collections_v2(id, user_id)
    on delete cascade
);

create table if not exists public.customer_stylebook_wear_logs_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  item_kind text not null check (item_kind in ('hair', 'fashion')),
  source_id uuid not null,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  applied_on date not null,
  application_type text not null check (application_type in ('hair_service', 'outfit_worn', 'other')),
  satisfaction smallint not null check (satisfaction between 1 and 5),
  convenience smallint not null check (convenience between 1 and 5),
  reaction_note text not null default '',
  note text not null default '',
  would_repeat boolean not null default true,
  photo_path text,
  photo_fingerprint text,
  photo_consent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_stylebook_wear_logs_v2_reaction_check check (length(reaction_note) <= 500),
  constraint customer_stylebook_wear_logs_v2_note_check check (length(note) <= 2000),
  constraint customer_stylebook_wear_logs_v2_photo_path_check
    check (photo_path is null or (
      length(photo_path) between 1 and 1024
      and photo_path !~* '^(https?://|data:|inline-output://)'
    )),
  constraint customer_stylebook_wear_logs_v2_photo_fingerprint_check
    check (photo_fingerprint is null or photo_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint customer_stylebook_wear_logs_v2_photo_bundle_check
    check (
      (photo_path is null and photo_fingerprint is null and photo_consent_at is null)
      or
      (photo_path is not null and photo_fingerprint is not null and photo_consent_at is not null)
    )
);

create table if not exists public.customer_stylebook_shares_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  item_kind text not null check (item_kind in ('hair', 'fashion')),
  source_id uuid not null,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  token_hash text not null unique,
  include_private_note boolean not null default false,
  include_actual_photo boolean not null default false,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint customer_stylebook_shares_v2_token_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_stylebook_shares_v2_expiry_check check (expires_at > created_at)
);

create table if not exists public.customer_stylebook_consultation_references_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  source_item_kind text not null check (source_item_kind in ('hair', 'fashion')),
  source_item_id uuid not null,
  source_consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  new_consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint customer_stylebook_consultation_references_v2_new_key unique (new_consultation_id),
  constraint customer_stylebook_consultation_references_v2_distinct_check
    check (source_consultation_id <> new_consultation_id)
);

create index if not exists idx_customer_stylebook_item_states_v2_owner_updated
  on public.customer_stylebook_item_states_v2 (user_id, updated_at desc);
create index if not exists idx_customer_stylebook_item_states_v2_owner_favorite
  on public.customer_stylebook_item_states_v2 (user_id, updated_at desc)
  where is_favorite = true and archived_at is null;
create index if not exists idx_customer_stylebook_collections_v2_owner_sort
  on public.customer_stylebook_collections_v2 (user_id, sort_order, created_at);
create index if not exists idx_customer_stylebook_collection_items_v2_owner_source
  on public.customer_stylebook_collection_items_v2 (user_id, item_kind, source_id);
create index if not exists idx_customer_stylebook_wear_logs_v2_owner_source
  on public.customer_stylebook_wear_logs_v2 (user_id, item_kind, source_id, applied_on desc);
create index if not exists idx_customer_stylebook_shares_v2_owner_active
  on public.customer_stylebook_shares_v2 (user_id, created_at desc)
  where revoked_at is null;
create index if not exists idx_customer_stylebook_consultation_references_v2_owner
  on public.customer_stylebook_consultation_references_v2 (user_id, new_consultation_id);

alter table public.customer_stylebook_item_states_v2 enable row level security;
alter table public.customer_stylebook_item_states_v2 force row level security;
alter table public.customer_stylebook_collections_v2 enable row level security;
alter table public.customer_stylebook_collections_v2 force row level security;
alter table public.customer_stylebook_collection_items_v2 enable row level security;
alter table public.customer_stylebook_collection_items_v2 force row level security;
alter table public.customer_stylebook_wear_logs_v2 enable row level security;
alter table public.customer_stylebook_wear_logs_v2 force row level security;
alter table public.customer_stylebook_shares_v2 enable row level security;
alter table public.customer_stylebook_shares_v2 force row level security;
alter table public.customer_stylebook_consultation_references_v2 enable row level security;
alter table public.customer_stylebook_consultation_references_v2 force row level security;

revoke all on table public.customer_stylebook_item_states_v2 from public, anon, authenticated;
revoke all on table public.customer_stylebook_collections_v2 from public, anon, authenticated;
revoke all on table public.customer_stylebook_collection_items_v2 from public, anon, authenticated;
revoke all on table public.customer_stylebook_wear_logs_v2 from public, anon, authenticated;
revoke all on table public.customer_stylebook_shares_v2 from public, anon, authenticated;
revoke all on table public.customer_stylebook_consultation_references_v2 from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_stylebook_item_states_v2 to service_role;
grant select, insert, update, delete on table public.customer_stylebook_collections_v2 to service_role;
grant select, insert, update, delete on table public.customer_stylebook_collection_items_v2 to service_role;
grant select, insert, update, delete on table public.customer_stylebook_wear_logs_v2 to service_role;
grant select, insert, update, delete on table public.customer_stylebook_shares_v2 to service_role;
grant select, insert, update, delete on table public.customer_stylebook_consultation_references_v2 to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stylebook-wear-photos',
  'stylebook-wear-photos',
  false,
  8000000,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

alter table public.account_deletion_storage_outbox
  drop constraint if exists account_deletion_storage_outbox_bucket_check;
alter table public.account_deletion_storage_outbox
  add constraint account_deletion_storage_outbox_bucket_check
  check (bucket in (
    'generation-results',
    'profile-body-photos',
    'styling-results',
    'aftercare-photos',
    'stylebook-wear-photos'
  ));

create schema if not exists private;
grant usage on schema private to service_role;

create or replace function private.queue_stylebook_wear_photos_on_user_delete_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_deletion_storage_outbox (
    user_id_hash,
    bucket,
    object_path
  )
  select public.account_deletion_user_hash(old.id),
         'stylebook-wear-photos',
         wear_log.photo_path
    from public.customer_stylebook_wear_logs_v2 as wear_log
   where wear_log.user_id = old.id
     and wear_log.photo_path is not null
  on conflict (user_id_hash, bucket, object_path) do nothing;

  return old;
end;
$$;

revoke all on function private.queue_stylebook_wear_photos_on_user_delete_v2()
  from public, anon, authenticated;
grant execute on function private.queue_stylebook_wear_photos_on_user_delete_v2()
  to service_role;

drop trigger if exists trg_queue_stylebook_wear_photos_on_user_delete_v2 on public.users;
create trigger trg_queue_stylebook_wear_photos_on_user_delete_v2
before delete on public.users
for each row execute function private.queue_stylebook_wear_photos_on_user_delete_v2();

comment on table public.customer_stylebook_item_states_v2 is
  'Mutable customer labels, notes, tags, favorites, and archive state for immutable V2 result sources.';
comment on table public.customer_stylebook_wear_logs_v2 is
  'Private real-world hair service or fashion wear records linked to a confirmed V2 stylebook item.';
comment on table public.customer_stylebook_shares_v2 is
  'Revocable and expiring public stylebook links; raw face photos are never included.';
comment on table public.customer_stylebook_consultation_references_v2 is
  'A non-mutating reference from a new consultation to a prior confirmed stylebook result.';

-- P51 persistent onboarding fashion policy, consultation-only context, immutable personalization snapshots.
create table if not exists public.user_fashion_personalization_profiles_v2 (
  user_id text primary key references public.users(id) on delete cascade,
  policy jsonb not null check (
    jsonb_typeof(policy) = 'object'
    and policy->>'schemaVersion' = 'user-fashion-personalization-policy-v1'
  ),
  revision integer not null default 1 check (revision > 0),
  confirmed_revision integer check (confirmed_revision is null or confirmed_revision = revision),
  learning_reset_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.consultation_fashion_contexts_v2 (
  consultation_id uuid primary key references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  context jsonb not null check (
    jsonb_typeof(context) = 'object'
    and context->>'schemaVersion' = 'consultation-fashion-context-v1'
  ),
  revision integer not null default 1 check (revision > 0),
  confirmed_revision integer check (confirmed_revision is null or confirmed_revision = revision),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_consultation_fashion_contexts_v2_owner
  on public.consultation_fashion_contexts_v2 (user_id, updated_at desc);

create table if not exists public.fashion_personalization_snapshots_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  onboarding_policy_revision integer not null check (onboarding_policy_revision > 0),
  consultation_context_revision integer not null check (consultation_context_revision > 0),
  confirmed_hair_revision integer not null check (confirmed_hair_revision > 0),
  confirmed_color_revision integer,
  confirmed_makeup_revision integer,
  product_catalog_revision text not null check (length(product_catalog_revision) between 1 and 160),
  product_offer_snapshot_ids uuid[] not null default '{}'::uuid[],
  policy_payload jsonb not null check (jsonb_typeof(policy_payload) = 'object'),
  context_payload jsonb not null check (jsonb_typeof(context_payload) = 'object'),
  hard_constraints jsonb not null check (jsonb_typeof(hard_constraints) = 'array'),
  soft_preferences jsonb not null check (jsonb_typeof(soft_preferences) = 'array'),
  effective_budget jsonb not null check (jsonb_typeof(effective_budget) = 'object'),
  source_ids jsonb not null check (jsonb_typeof(source_ids) = 'array' and jsonb_array_length(source_ids) > 0),
  fingerprint text not null check (length(fingerprint) between 16 and 160),
  supersedes_snapshot_id uuid references public.fashion_personalization_snapshots_v2(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, fingerprint)
);

create index if not exists idx_fashion_personalization_snapshots_v2_owner
  on public.fashion_personalization_snapshots_v2 (user_id, consultation_id, created_at desc);
create unique index if not exists uq_fashion_personalization_snapshots_v2_superseded
  on public.fashion_personalization_snapshots_v2 (supersedes_snapshot_id)
  where supersedes_snapshot_id is not null;

create table if not exists public.fashion_preference_feedback_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  consultation_id uuid references public.consultation_sessions(id) on delete cascade,
  personalization_snapshot_id uuid references public.fashion_personalization_snapshots_v2(id) on delete restrict,
  target_type text not null check (target_type in ('offer','look','direction')),
  target_id text not null check (length(target_id) between 1 and 200),
  sentiment text not null check (sentiment in ('like','dislike')),
  reason_codes text[] not null default '{}'::text[],
  explicit boolean not null default true check (explicit = true),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_fashion_preference_feedback_v2_learning
  on public.fashion_preference_feedback_v2 (user_id, created_at desc);

create or replace function public.prevent_fashion_personalization_snapshot_update_v2()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'FASHION_PERSONALIZATION_SNAPSHOT_IMMUTABLE';
end;
$$;

drop trigger if exists trg_fashion_personalization_snapshot_immutable_v2 on public.fashion_personalization_snapshots_v2;
create trigger trg_fashion_personalization_snapshot_immutable_v2
before update on public.fashion_personalization_snapshots_v2
for each row execute function public.prevent_fashion_personalization_snapshot_update_v2();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'user_fashion_personalization_profiles_v2',
    'consultation_fashion_contexts_v2',
    'fashion_personalization_snapshots_v2',
    'fashion_preference_feedback_v2'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

grant select, insert, update on table public.user_fashion_personalization_profiles_v2 to authenticated;
grant select, insert, update on table public.consultation_fashion_contexts_v2 to authenticated;
grant select on table public.fashion_personalization_snapshots_v2 to authenticated;
grant select, insert on table public.fashion_preference_feedback_v2 to authenticated;

drop policy if exists user_fashion_personalization_profiles_v2_owner on public.user_fashion_personalization_profiles_v2;
create policy user_fashion_personalization_profiles_v2_owner
on public.user_fashion_personalization_profiles_v2
for all to authenticated
using ((select auth.jwt() ->> 'sub') = user_id)
with check ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists consultation_fashion_contexts_v2_owner on public.consultation_fashion_contexts_v2;
create policy consultation_fashion_contexts_v2_owner
on public.consultation_fashion_contexts_v2
for all to authenticated
using ((select auth.jwt() ->> 'sub') = user_id)
with check ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists fashion_personalization_snapshots_v2_owner_read on public.fashion_personalization_snapshots_v2;
create policy fashion_personalization_snapshots_v2_owner_read
on public.fashion_personalization_snapshots_v2
for select to authenticated
using ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists fashion_preference_feedback_v2_owner on public.fashion_preference_feedback_v2;
create policy fashion_preference_feedback_v2_owner
on public.fashion_preference_feedback_v2
for select to authenticated
using ((select auth.jwt() ->> 'sub') = user_id);
drop policy if exists fashion_preference_feedback_v2_owner_insert on public.fashion_preference_feedback_v2;
create policy fashion_preference_feedback_v2_owner_insert
on public.fashion_preference_feedback_v2
for insert to authenticated
with check ((select auth.jwt() ->> 'sub') = user_id and explicit = true);

comment on table public.user_fashion_personalization_profiles_v2 is
  'User-authored persistent fashion policy. Image inference must never populate size, gender, body or accessibility fields.';
comment on table public.consultation_fashion_contexts_v2 is
  'Consultation-only occasion and override context; it must not mutate onboarding policy.';
comment on table public.fashion_personalization_snapshots_v2 is
  'Immutable composite input tying one confirmed Hair to Color, Makeup and Product Truth revisions.';

-- HairFit V2 backend core. Additive only: legacy credit/generation tables remain authoritative
-- until dual-write reconciliation proves cutover safety.

create table if not exists public.product_offerings_v2 (
  id uuid primary key default gen_random_uuid(),
  offering_key text not null,
  version integer not null check (version > 0),
  internal_name text not null,
  customer_name text,
  description text not null default '',
  purchase_mode text not null check (purchase_mode in ('one_time','recurring')),
  billing_interval text check (billing_interval in ('month','quarter','year')),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  included_consultation_sessions integer not null default 1 check (included_consultation_sessions > 0),
  release_policy text,
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (offering_key, version),
  check ((purchase_mode = 'one_time' and billing_interval is null) or purchase_mode = 'recurring')
);

create unique index if not exists idx_product_offerings_v2_one_active
  on public.product_offerings_v2 (offering_key) where status = 'active';

insert into public.product_offerings_v2(
  offering_key,version,internal_name,description,purchase_mode,status,
  included_consultation_sessions,release_policy,capabilities
) values (
  'hair_decision_once',1,'Hair decision consultation entitlement bridge',
  'Compatibility entitlement for one HairFit V2 consultation. Pricing is provider-owned and intentionally not seeded.',
  'one_time','active',1,'legacy-credit-dual-write',
  '{"acceptedHairPreviews":9,"salonBrief":true,"aftercare":true,"personalColor":false,"fashionPreviews":0,"generatedAssetRetentionDays":7}'::jsonb
)
on conflict (offering_key,version) do nothing;

create table if not exists public.product_prices_v2 (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.product_offerings_v2(id) on delete restrict,
  version integer not null check (version > 0),
  provider text not null check (provider in ('portone','google_play','apple_iap','manual')),
  provider_product_id text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor integer not null check (amount_minor >= 0),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (offering_id, version, provider),
  check (valid_until is null or valid_from is null or valid_until > valid_from)
);

create unique index if not exists idx_product_prices_v2_provider_product
  on public.product_prices_v2 (provider, provider_product_id)
  where provider_product_id is not null and status = 'active';

create table if not exists public.customer_entitlement_grants_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  offering_id uuid not null references public.product_offerings_v2(id) on delete restrict,
  offering_key text not null,
  offering_version integer not null check (offering_version > 0),
  capability_snapshot jsonb not null,
  quantity_granted integer not null check (quantity_granted > 0),
  quantity_consumed integer not null default 0 check (quantity_consumed >= 0),
  status text not null default 'active' check (status in ('active','exhausted','expired','revoked')),
  source text not null check (source in ('portone','google_play','manual','legacy_credit_bridge')),
  source_transaction_id text,
  valid_from timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source, source_transaction_id, offering_key),
  check (quantity_consumed <= quantity_granted),
  check (expires_at is null or expires_at > valid_from)
);

create index if not exists idx_entitlement_grants_v2_user_active
  on public.customer_entitlement_grants_v2 (user_id, offering_key, valid_from)
  where status = 'active';
create index if not exists idx_entitlement_grants_v2_offering_id
  on public.customer_entitlement_grants_v2 (offering_id);

alter table public.consultation_sessions
  add column if not exists session_kind text not null default 'hair_decision',
  add column if not exists lifecycle_state text not null default 'draft',
  add column if not exists idempotency_key text,
  add column if not exists entitlement_grant_id uuid references public.customer_entitlement_grants_v2(id) on delete restrict,
  add column if not exists source_generation_id uuid,
  add column if not exists source_photo_id uuid,
  add column if not exists analysis_evidence_id uuid,
  add column if not exists current_preview_board_id uuid,
  add column if not exists selected_snapshot_id uuid,
  add column if not exists preferences jsonb not null default '{}'::jsonb,
  add column if not exists plan_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

do $$ begin
  alter table public.consultation_sessions add constraint consultation_sessions_kind_v2_check
    check (session_kind in ('hair_decision','full_style','seasonal_update'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.consultation_sessions add constraint consultation_sessions_lifecycle_v2_check
    check (lifecycle_state in ('draft','photo_validated','analysis_ready','preview_board_queued','preview_board_ready','shortlisted','style_selected','selection_confirmed','salon_brief_ready','aftercare_ready','fashion_ready','completed','cancelled'));
exception when duplicate_object then null; end $$;
create unique index if not exists idx_consultation_sessions_v2_idempotency
  on public.consultation_sessions (user_id, idempotency_key) where idempotency_key is not null;

create table if not exists public.entitlement_consumptions_v2 (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.customer_entitlement_grants_v2(id) on delete restrict,
  user_id text not null references public.users(id) on delete cascade,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  idempotency_key text not null,
  quantity integer not null default 1 check (quantity = 1),
  state text not null default 'reserved' check (state in ('reserved','consumed','restored')),
  legacy_ledger_id bigint references public.credit_ledger(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  settled_at timestamptz,
  unique (user_id, idempotency_key),
  unique (consultation_id)
);
create index if not exists idx_entitlement_consumptions_v2_grant_id
  on public.entitlement_consumptions_v2 (grant_id);

create table if not exists public.analysis_evidence_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  source_image_fingerprint text not null check (length(source_image_fingerprint) >= 16),
  source_transform jsonb not null,
  model_provider text not null,
  model_name text not null,
  model_version text not null,
  quality jsonb not null,
  contours jsonb not null default '[]'::jsonb,
  hairline jsonb,
  measurements jsonb not null default '[]'::jsonb,
  face_shape jsonb not null,
  skin_sample_regions jsonb not null default '[]'::jsonb,
  excluded_regions jsonb not null default '[]'::jsonb,
  corrected_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.personal_color_evidence_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  source_analysis_evidence_id uuid not null references public.analysis_evidence_v2(id) on delete restrict,
  model jsonb not null,
  quality jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.preview_boards_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  strategy_version text not null,
  requested_count integer not null default 9 check (requested_count = 9),
  accepted_count integer not null default 0 check (accepted_count between 0 and 9),
  state text not null default 'queued' check (state in ('queued','generating','ready','failed')),
  entitlement_consumption_id uuid not null references public.entitlement_consumptions_v2(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  ready_at timestamptz,
  unique (consultation_id, version)
);
create index if not exists idx_preview_boards_v2_entitlement_consumption_id
  on public.preview_boards_v2 (entitlement_consumption_id);

create table if not exists public.preview_variants_v2 (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.preview_boards_v2(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  slot integer not null check (slot between 1 and 9),
  strategy_bucket text not null check (strategy_bucket in ('face_balance','image_change','manageability')),
  intent text not null,
  catalog_item_id uuid references public.hairstyle_catalog(id) on delete restrict,
  accepted_attempt_id uuid,
  status text not null default 'pending' check (status in ('pending','generating','accepted')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (board_id, slot)
);

create table if not exists public.generation_attempts_v2 (
  id uuid primary key default gen_random_uuid(),
  preview_variant_id uuid not null references public.preview_variants_v2(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  provider text not null,
  model text not null,
  prompt_policy_version text not null,
  prompt_hash text not null check (length(prompt_hash) >= 32),
  prompt_input_snapshot jsonb not null,
  slot_intent text not null,
  status text not null default 'queued' check (status in ('queued','leased','generating','accepted','rejected','failed')),
  rejection_codes text[] not null default '{}',
  output_path text,
  output_fingerprint text,
  provider_cost_minor integer check (provider_cost_minor is null or provider_cost_minor >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  error_code text,
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  finished_at timestamptz,
  unique (preview_variant_id, attempt_number)
);
create index if not exists idx_generation_attempts_v2_preview_variant_id
  on public.generation_attempts_v2 (preview_variant_id);

alter table public.preview_variants_v2
  drop constraint if exists preview_variants_v2_accepted_attempt_id_fkey;
alter table public.preview_variants_v2
  add constraint preview_variants_v2_accepted_attempt_id_fkey
  foreign key (accepted_attempt_id) references public.generation_attempts_v2(id) on delete restrict deferrable initially deferred;

create index if not exists idx_generation_attempts_v2_lease
  on public.generation_attempts_v2 (status, lease_expires_at) where status in ('queued','leased','generating');
create index if not exists idx_generation_attempts_v2_prompt_version
  on public.generation_attempts_v2 (prompt_policy_version, model, created_at desc);

create table if not exists public.style_selection_snapshots_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  preview_variant_id uuid not null references public.preview_variants_v2(id) on delete restrict,
  accepted_attempt_id uuid not null references public.generation_attempts_v2(id) on delete restrict,
  snapshot_version integer not null check (snapshot_version > 0),
  status text not null default 'draft' check (status in ('draft','confirmed','superseded')),
  snapshot jsonb not null,
  selected_at timestamptz not null default timezone('utc', now()),
  confirmed_at timestamptz,
  unique (consultation_id, snapshot_version)
);
create index if not exists idx_selection_snapshots_v2_preview_variant_id
  on public.style_selection_snapshots_v2 (preview_variant_id);
create index if not exists idx_selection_snapshots_v2_accepted_attempt_id
  on public.style_selection_snapshots_v2 (accepted_attempt_id);

create unique index if not exists idx_selection_snapshots_v2_confirmed
  on public.style_selection_snapshots_v2 (consultation_id) where status = 'confirmed';

create table if not exists public.consultation_shortlists_v2 (
  consultation_id uuid primary key references public.consultation_sessions(id) on delete cascade,
  board_id uuid not null references public.preview_boards_v2(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  preview_variant_ids uuid[] not null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default timezone('utc', now()),
  check (cardinality(preview_variant_ids) between 1 and 3)
);

create table if not exists public.salon_brief_versions_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  selection_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  user_id text not null references public.users(id) on delete cascade,
  idempotency_key text not null,
  version integer not null check (version > 0),
  brief jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, version),
  unique (user_id, idempotency_key)
);

create table if not exists public.actual_services_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  selection_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  user_id text not null references public.users(id) on delete cascade,
  idempotency_key text not null,
  services jsonb not null,
  service_date date not null,
  designer_notes text not null default '',
  confirmed_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, id),
  unique (user_id, idempotency_key)
);

create table if not exists public.aftercare_programs_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  selection_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  actual_service_id uuid not null references public.actual_services_v2(id) on delete restrict,
  user_id text not null references public.users(id) on delete cascade,
  idempotency_key text not null,
  version integer not null check (version > 0),
  program jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (actual_service_id, version),
  unique (user_id, idempotency_key)
);

create table if not exists public.fashion_preview_sets_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  selection_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  personal_color_evidence_id uuid references public.personal_color_evidence_v2(id) on delete restrict,
  user_id text not null references public.users(id) on delete cascade,
  idempotency_key text not null,
  version integer not null check (version > 0),
  preview_set jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, version),
  unique (user_id, idempotency_key)
);

create table if not exists public.hairfit_v2_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('entitlement','consultation','selection','output_snapshot')),
  status text not null check (status in ('running','passed','failed')),
  checked_count integer not null default 0,
  mismatch_count integer not null default 0,
  mismatch_sample jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create table if not exists public.hairfit_v2_domain_events (
  id bigint generated always as identity primary key,
  correlation_id uuid not null,
  consultation_id uuid references public.consultation_sessions(id) on delete cascade,
  user_id text references public.users(id) on delete cascade,
  event_type text not null,
  event_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_hairfit_v2_events_correlation on public.hairfit_v2_domain_events (correlation_id, created_at);
create index if not exists idx_hairfit_v2_events_consultation on public.hairfit_v2_domain_events (consultation_id);
create index if not exists idx_hairfit_v2_events_user on public.hairfit_v2_domain_events (user_id);

-- Every FK used by cascade/delete validation or joins has a supporting left-prefix index.
create index if not exists idx_entitlement_grants_v2_user_id on public.customer_entitlement_grants_v2 (user_id);
create index if not exists idx_entitlement_consumptions_v2_legacy_ledger_id on public.entitlement_consumptions_v2 (legacy_ledger_id);
create index if not exists idx_analysis_evidence_v2_user_id on public.analysis_evidence_v2 (user_id);
create index if not exists idx_personal_color_evidence_v2_user_id on public.personal_color_evidence_v2 (user_id);
create index if not exists idx_personal_color_evidence_v2_source_analysis on public.personal_color_evidence_v2 (source_analysis_evidence_id);
create index if not exists idx_preview_boards_v2_user_id on public.preview_boards_v2 (user_id);
create index if not exists idx_preview_variants_v2_user_id on public.preview_variants_v2 (user_id);
create index if not exists idx_preview_variants_v2_catalog_item_id on public.preview_variants_v2 (catalog_item_id);
create index if not exists idx_preview_variants_v2_accepted_attempt_id on public.preview_variants_v2 (accepted_attempt_id);
create index if not exists idx_generation_attempts_v2_user_id on public.generation_attempts_v2 (user_id);
create index if not exists idx_selection_snapshots_v2_user_id on public.style_selection_snapshots_v2 (user_id);
create index if not exists idx_consultation_shortlists_v2_board_id on public.consultation_shortlists_v2 (board_id);
create index if not exists idx_consultation_shortlists_v2_user_id on public.consultation_shortlists_v2 (user_id);
create index if not exists idx_salon_brief_versions_v2_selection on public.salon_brief_versions_v2 (selection_snapshot_id);
create index if not exists idx_actual_services_v2_selection on public.actual_services_v2 (selection_snapshot_id);
create index if not exists idx_aftercare_programs_v2_consultation on public.aftercare_programs_v2 (consultation_id);
create index if not exists idx_aftercare_programs_v2_selection on public.aftercare_programs_v2 (selection_snapshot_id);
create index if not exists idx_fashion_preview_sets_v2_selection on public.fashion_preview_sets_v2 (selection_snapshot_id);
create index if not exists idx_fashion_preview_sets_v2_color_evidence on public.fashion_preview_sets_v2 (personal_color_evidence_id);

alter table if exists public.generations add column if not exists consultation_id uuid references public.consultation_sessions(id) on delete set null;
create index if not exists idx_generations_consultation_id on public.generations (consultation_id) where consultation_id is not null;

-- Cyclic aggregate references are added after dependent tables exist.
do $$ begin alter table public.consultation_sessions add constraint consultation_sessions_analysis_evidence_v2_fkey foreign key (analysis_evidence_id) references public.analysis_evidence_v2(id) on delete set null deferrable initially deferred; exception when duplicate_object then null; end $$;
do $$ begin alter table public.consultation_sessions add constraint consultation_sessions_preview_board_v2_fkey foreign key (current_preview_board_id) references public.preview_boards_v2(id) on delete set null deferrable initially deferred; exception when duplicate_object then null; end $$;
do $$ begin alter table public.consultation_sessions add constraint consultation_sessions_selection_v2_fkey foreign key (selected_snapshot_id) references public.style_selection_snapshots_v2(id) on delete set null deferrable initially deferred; exception when duplicate_object then null; end $$;
do $$ begin alter table public.consultation_sessions add constraint consultation_sessions_source_generation_v2_fkey foreign key (source_generation_id) references public.generations(id) on delete set null deferrable initially deferred; exception when duplicate_object then null; end $$;
create index if not exists idx_consultation_sessions_v2_entitlement_grant on public.consultation_sessions (entitlement_grant_id);
create index if not exists idx_consultation_sessions_v2_analysis_evidence on public.consultation_sessions (analysis_evidence_id);
create index if not exists idx_consultation_sessions_v2_preview_board on public.consultation_sessions (current_preview_board_id);
create index if not exists idx_consultation_sessions_v2_selection on public.consultation_sessions (selected_snapshot_id);
create index if not exists idx_consultation_sessions_v2_source_generation on public.consultation_sessions (source_generation_id);

create or replace function public.consume_entitlement_v2(
  p_user_id text, p_offering_key text, p_consultation_id uuid, p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_grant public.customer_entitlement_grants_v2%rowtype; v_consumption public.entitlement_consumptions_v2%rowtype;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || p_idempotency_key, 0));
  select * into v_consumption from public.entitlement_consumptions_v2 where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_consumption.consultation_id <> p_consultation_id then raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505'; end if;
    return jsonb_build_object('id',v_consumption.id,'state',v_consumption.state,'grantId',v_consumption.grant_id,'replayed',true);
  end if;
  select * into v_grant from public.customer_entitlement_grants_v2
    where user_id = p_user_id and offering_key = p_offering_key and status = 'active'
      and valid_from <= timezone('utc',now()) and (expires_at is null or expires_at > timezone('utc',now()))
      and quantity_consumed < quantity_granted order by expires_at nulls last, valid_from for update skip locked limit 1;
  if not found then raise exception 'ENTITLEMENT_UNAVAILABLE' using errcode = 'P0001'; end if;
  insert into public.entitlement_consumptions_v2(grant_id,user_id,consultation_id,idempotency_key)
    values(v_grant.id,p_user_id,p_consultation_id,p_idempotency_key) returning * into v_consumption;
  update public.customer_entitlement_grants_v2 set quantity_consumed = quantity_consumed + 1,
    status = case when quantity_consumed + 1 >= quantity_granted then 'exhausted' else status end,
    updated_at = timezone('utc',now()) where id = v_grant.id;
  return jsonb_build_object('id',v_consumption.id,'state',v_consumption.state,'grantId',v_grant.id,'replayed',false);
end $$;

create or replace function public.restore_entitlement_v2(p_user_id text, p_consumption_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_consumption public.entitlement_consumptions_v2%rowtype;
begin
  select * into v_consumption from public.entitlement_consumptions_v2 where id = p_consumption_id and user_id = p_user_id for update;
  if not found then raise exception 'CONSUMPTION_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_consumption.state = 'restored' then return jsonb_build_object('id',v_consumption.id,'state','restored','replayed',true); end if;
  update public.entitlement_consumptions_v2 set state='restored',settled_at=timezone('utc',now()) where id=v_consumption.id;
  update public.customer_entitlement_grants_v2 set quantity_consumed=greatest(0,quantity_consumed-1),status='active',updated_at=timezone('utc',now()) where id=v_consumption.grant_id;
  return jsonb_build_object('id',v_consumption.id,'state','restored','replayed',false);
end $$;

create or replace function public.transition_consultation_v2(p_user_id text,p_consultation_id uuid,p_expected_version integer,p_next_state text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session public.consultation_sessions%rowtype; v_allowed boolean := false;
begin
  select * into v_session from public.consultation_sessions where id=p_consultation_id and user_id=p_user_id for update;
  if not found then raise exception 'CONSULTATION_NOT_FOUND' using errcode='P0002'; end if;
  if v_session.version <> p_expected_version then return jsonb_build_object('state','conflict','version',v_session.version,'lifecycleState',v_session.lifecycle_state); end if;
  v_allowed := (v_session.lifecycle_state,p_next_state) in (('draft','photo_validated'),('draft','cancelled'),('photo_validated','analysis_ready'),('photo_validated','cancelled'),('analysis_ready','preview_board_queued'),('analysis_ready','cancelled'),('preview_board_queued','preview_board_ready'),('preview_board_queued','cancelled'),('preview_board_ready','shortlisted'),('preview_board_ready','style_selected'),('shortlisted','style_selected'),('style_selected','preview_board_ready'),('style_selected','selection_confirmed'),('selection_confirmed','salon_brief_ready'),('selection_confirmed','aftercare_ready'),('selection_confirmed','fashion_ready'),('selection_confirmed','completed'),('salon_brief_ready','aftercare_ready'),('salon_brief_ready','fashion_ready'),('salon_brief_ready','completed'),('aftercare_ready','salon_brief_ready'),('aftercare_ready','fashion_ready'),('aftercare_ready','completed'),('fashion_ready','salon_brief_ready'),('fashion_ready','aftercare_ready'),('fashion_ready','completed'));
  if not v_allowed then raise exception 'INVALID_CONSULTATION_TRANSITION:%:%',v_session.lifecycle_state,p_next_state using errcode='23514'; end if;
  update public.consultation_sessions set lifecycle_state=p_next_state,version=version+1,updated_at=timezone('utc',now()),completed_at=case when p_next_state='completed' then timezone('utc',now()) else completed_at end,cancelled_at=case when p_next_state='cancelled' then timezone('utc',now()) else cancelled_at end where id=p_consultation_id;
  return jsonb_build_object('state','updated','version',v_session.version+1,'lifecycleState',p_next_state);
end $$;

create or replace function public.attach_generation_to_consultation_v2(
  p_user_id text,p_consultation_id uuid,p_generation_id uuid,
  p_expected_version integer,p_transition_photo boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.consultation_sessions%rowtype;
  v_generation public.generations%rowtype;
  v_next_version integer;
  v_next_state text;
begin
  select * into v_session from public.consultation_sessions
   where id=p_consultation_id and user_id=p_user_id for update;
  if not found then raise exception 'CONSULTATION_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_generation from public.generations
   where id=p_generation_id and user_id=p_user_id for update;
  if not found or v_generation.original_image_path is null then
    raise exception 'GENERATION_PHOTO_NOT_FOUND' using errcode='P0002';
  end if;
  if p_expected_version is not null and v_session.version<>p_expected_version then
    return jsonb_build_object('state','conflict','version',v_session.version,'lifecycleState',v_session.lifecycle_state);
  end if;
  if v_session.source_generation_id is not null and v_session.source_generation_id<>p_generation_id then
    raise exception 'CONSULTATION_GENERATION_LOCKED' using errcode='23514';
  end if;
  if v_generation.consultation_id is not null and v_generation.consultation_id<>p_consultation_id then
    raise exception 'GENERATION_CONSULTATION_LOCKED' using errcode='23514';
  end if;
  if p_transition_photo and v_session.lifecycle_state not in ('draft','photo_validated') then
    raise exception 'PHOTO_TRANSITION_NOT_ALLOWED' using errcode='23514';
  end if;
  v_next_state := case when p_transition_photo and v_session.lifecycle_state='draft'
    then 'photo_validated' else v_session.lifecycle_state end;
  v_next_version := v_session.version + case when v_next_state<>v_session.lifecycle_state then 1 else 0 end;
  update public.consultation_sessions
     set source_generation_id=p_generation_id,lifecycle_state=v_next_state,
         version=v_next_version,updated_at=timezone('utc',now())
   where id=p_consultation_id;
  update public.generations set consultation_id=p_consultation_id,updated_at=timezone('utc',now())
   where id=p_generation_id;
  return jsonb_build_object(
    'state','linked','version',v_next_version,'lifecycleState',v_next_state,
    'consultationId',p_consultation_id,'generationId',p_generation_id,
    'replayed',v_session.source_generation_id=p_generation_id
  );
end $$;

create or replace function public.accept_generation_attempt_v2(p_user_id text,p_attempt_id uuid,p_output_path text,p_output_fingerprint text,p_provider_cost_minor integer,p_latency_ms integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_attempt public.generation_attempts_v2%rowtype; v_variant public.preview_variants_v2%rowtype; v_count integer; v_board public.preview_boards_v2%rowtype;
begin
  select a.* into v_attempt from public.generation_attempts_v2 a where a.id=p_attempt_id and a.user_id=p_user_id for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_variant from public.preview_variants_v2 where id=v_attempt.preview_variant_id for update;
  if v_variant.accepted_attempt_id is not null then return jsonb_build_object('state','already_accepted','attemptId',v_variant.accepted_attempt_id); end if;
  update public.generation_attempts_v2 set status='accepted',output_path=p_output_path,output_fingerprint=p_output_fingerprint,provider_cost_minor=case when p_provider_cost_minor is null then null else greatest(0,p_provider_cost_minor) end,latency_ms=greatest(0,p_latency_ms),finished_at=timezone('utc',now()),lease_token=null,lease_expires_at=null where id=p_attempt_id;
  update public.preview_variants_v2 set accepted_attempt_id=p_attempt_id,status='accepted' where id=v_variant.id;
  select count(*) into v_count from public.preview_variants_v2 where board_id=v_variant.board_id and accepted_attempt_id is not null;
  update public.preview_boards_v2 set accepted_count=v_count,state=case when v_count=9 then 'ready' else 'generating' end,ready_at=case when v_count=9 then timezone('utc',now()) else null end,version=version+1 where id=v_variant.board_id returning * into v_board;
  if v_count=9 then
    update public.entitlement_consumptions_v2 set state='consumed',settled_at=coalesce(settled_at,timezone('utc',now())) where id=v_board.entitlement_consumption_id and state='reserved';
    update public.consultation_sessions set lifecycle_state='preview_board_ready',current_preview_board_id=v_board.id,version=version+1,updated_at=timezone('utc',now()) where id=v_board.consultation_id and lifecycle_state='preview_board_queued';
  end if;
  return jsonb_build_object('state',case when v_count=9 then 'board_ready' else 'accepted' end,'acceptedCount',v_count,'boardId',v_board.id);
end $$;

create or replace function public.confirm_style_selection_v2(p_user_id text,p_consultation_id uuid,p_snapshot_id uuid,p_expected_version integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session public.consultation_sessions%rowtype; v_snapshot public.style_selection_snapshots_v2%rowtype;
begin
  select * into v_session from public.consultation_sessions where id=p_consultation_id and user_id=p_user_id for update;
  if not found then raise exception 'CONSULTATION_NOT_FOUND' using errcode='P0002'; end if;
  if v_session.lifecycle_state='selection_confirmed' and v_session.selected_snapshot_id=p_snapshot_id then return jsonb_build_object('state','confirmed','snapshotId',p_snapshot_id,'replayed',true); end if;
  if v_session.version<>p_expected_version then return jsonb_build_object('state','conflict','version',v_session.version); end if;
  if v_session.lifecycle_state not in ('style_selected','preview_board_ready','shortlisted') then raise exception 'SELECTION_LOCKED' using errcode='23514'; end if;
  select * into v_snapshot from public.style_selection_snapshots_v2
    where id=p_snapshot_id and consultation_id=p_consultation_id and user_id=p_user_id
      and status='draft' and v_session.selected_snapshot_id=p_snapshot_id
    for update;
  if not found then raise exception 'SNAPSHOT_NOT_FOUND' using errcode='P0002'; end if;
  update public.style_selection_snapshots_v2 set status='superseded' where consultation_id=p_consultation_id and id<>p_snapshot_id and status='draft';
  update public.style_selection_snapshots_v2 set status='confirmed',confirmed_at=coalesce(confirmed_at,timezone('utc',now())) where id=p_snapshot_id;
  update public.consultation_sessions set selected_snapshot_id=p_snapshot_id,lifecycle_state='selection_confirmed',version=version+1,updated_at=timezone('utc',now()) where id=p_consultation_id;
  return jsonb_build_object('state','confirmed','snapshotId',p_snapshot_id,'replayed',false,'version',v_session.version+1);
end $$;

create or replace function public.draft_style_selection_v2(
  p_user_id text,p_consultation_id uuid,p_preview_variant_id uuid,p_snapshot_id uuid,
  p_snapshot_version integer,p_expected_version integer,p_snapshot jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_session public.consultation_sessions%rowtype; v_variant public.preview_variants_v2%rowtype; v_next_version integer;
begin
  select * into v_session from public.consultation_sessions where id=p_consultation_id and user_id=p_user_id for update;
  if not found then raise exception 'CONSULTATION_NOT_FOUND' using errcode='P0002'; end if;
  if v_session.version<>p_expected_version then return jsonb_build_object('state','conflict','version',v_session.version); end if;
  if v_session.lifecycle_state not in ('preview_board_ready','shortlisted','style_selected') then raise exception 'SELECTION_NOT_ALLOWED' using errcode='23514'; end if;
  if exists(select 1 from public.style_selection_snapshots_v2 where consultation_id=p_consultation_id and status='confirmed') then raise exception 'SELECTION_LOCKED' using errcode='23514'; end if;
  select v.* into v_variant from public.preview_variants_v2 v join public.preview_boards_v2 b on b.id=v.board_id
    where v.id=p_preview_variant_id and v.user_id=p_user_id and v.status='accepted' and b.consultation_id=p_consultation_id and b.state='ready';
  if not found then raise exception 'PREVIEW_VARIANT_NOT_ACCEPTED' using errcode='P0002'; end if;
  select coalesce(max(snapshot_version),0)+1 into v_next_version from public.style_selection_snapshots_v2 where consultation_id=p_consultation_id;
  if p_snapshot_version<>v_next_version or p_snapshot->>'id'<>p_snapshot_id::text then raise exception 'INVALID_SNAPSHOT_VERSION' using errcode='22023'; end if;
  update public.style_selection_snapshots_v2 set status='superseded' where consultation_id=p_consultation_id and status='draft';
  insert into public.style_selection_snapshots_v2(id,consultation_id,user_id,preview_variant_id,accepted_attempt_id,snapshot_version,status,snapshot)
    values(p_snapshot_id,p_consultation_id,p_user_id,p_preview_variant_id,v_variant.accepted_attempt_id,p_snapshot_version,'draft',p_snapshot);
  update public.consultation_sessions set selected_snapshot_id=p_snapshot_id,lifecycle_state='style_selected',version=version+1,updated_at=timezone('utc',now()) where id=p_consultation_id;
  return jsonb_build_object('state','drafted','snapshotId',p_snapshot_id,'snapshotVersion',p_snapshot_version,'version',v_session.version+1);
end $$;

comment on table public.consultation_sessions is 'HairFit V2 server-owned consultation aggregate with a legacy frontend snapshot compatibility column.';
comment on column public.generation_attempts_v2.prompt_hash is 'SHA-256 of canonical prompt policy, normalized input, slot intent, and rendered constraints; raw internal prompts are not exposed by customer APIs.';

do $$ declare t text; begin
  foreach t in array array['product_offerings_v2','product_prices_v2','customer_entitlement_grants_v2','entitlement_consumptions_v2','analysis_evidence_v2','personal_color_evidence_v2','preview_boards_v2','preview_variants_v2','generation_attempts_v2','style_selection_snapshots_v2','consultation_shortlists_v2','salon_brief_versions_v2','actual_services_v2','aftercare_programs_v2','fashion_preview_sets_v2','hairfit_v2_reconciliation_runs','hairfit_v2_domain_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on table public.%I to service_role',t);
  end loop;
end $$;

revoke execute on function public.consume_entitlement_v2(text,text,uuid,text) from public, anon, authenticated;
revoke execute on function public.restore_entitlement_v2(text,uuid) from public, anon, authenticated;
revoke execute on function public.transition_consultation_v2(text,uuid,integer,text) from public, anon, authenticated;
revoke execute on function public.attach_generation_to_consultation_v2(text,uuid,uuid,integer,boolean) from public, anon, authenticated;
revoke execute on function public.accept_generation_attempt_v2(text,uuid,text,text,integer,integer) from public, anon, authenticated;
revoke execute on function public.confirm_style_selection_v2(text,uuid,uuid,integer) from public, anon, authenticated;
revoke execute on function public.draft_style_selection_v2(text,uuid,uuid,uuid,integer,integer,jsonb) from public, anon, authenticated;
grant execute on function public.consume_entitlement_v2(text,text,uuid,text) to service_role;
grant execute on function public.restore_entitlement_v2(text,uuid) to service_role;
grant execute on function public.transition_consultation_v2(text,uuid,integer,text) to service_role;
grant execute on function public.attach_generation_to_consultation_v2(text,uuid,uuid,integer,boolean) to service_role;
grant execute on function public.accept_generation_attempt_v2(text,uuid,text,text,integer,integer) to service_role;
grant execute on function public.confirm_style_selection_v2(text,uuid,uuid,integer) to service_role;
grant execute on function public.draft_style_selection_v2(text,uuid,uuid,uuid,integer,integer,jsonb) to service_role;
revoke all on sequence public.hairfit_v2_domain_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.hairfit_v2_domain_events_id_seq to service_role;

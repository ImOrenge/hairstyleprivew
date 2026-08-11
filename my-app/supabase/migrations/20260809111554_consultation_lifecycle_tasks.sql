-- Durable server-owned state for proactive consultation analysis, capability execution,
-- interview autosave, and automatically authorized fashion batches.

create table if not exists public.consultation_analysis_runs_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  source_photo_id uuid not null references public.generation_upload_drafts(id) on delete restrict,
  idempotency_key text not null,
  state text not null default 'queued' check (state in (
    'queued',
    'preflight',
    'landmarks',
    'analyzing',
    'completed',
    'retry_required',
    'failed',
    'cancelled'
  )),
  pipeline jsonb not null default '{}'::jsonb check (jsonb_typeof(pipeline) = 'object'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_code text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key)
);

create unique index if not exists uq_consultation_analysis_runs_v2_active
  on public.consultation_analysis_runs_v2 (consultation_id)
  where state in ('queued', 'preflight', 'landmarks', 'analyzing');
create index if not exists idx_consultation_analysis_runs_v2_owner
  on public.consultation_analysis_runs_v2 (user_id, consultation_id, created_at desc);
create index if not exists idx_consultation_analysis_runs_v2_state
  on public.consultation_analysis_runs_v2 (state, updated_at)
  where state in ('queued', 'preflight', 'landmarks', 'analyzing');

create table if not exists public.fashion_preview_batches_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  selection_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  user_id text not null references public.users(id) on delete cascade,
  idempotency_key text not null,
  state text not null default 'draft' check (state in (
    'draft',
    'quoted',
    'approved',
    'generating',
    'partial',
    'ready',
    'failed',
    'selected',
    'cancelled'
  )),
  direction_snapshot jsonb not null check (jsonb_typeof(direction_snapshot) = 'object'),
  quote_id text,
  quote_snapshot jsonb check (quote_snapshot is null or jsonb_typeof(quote_snapshot) = 'object'),
  requested_count integer not null default 9 check (requested_count = 9),
  completed_count integer not null default 0 check (completed_count between 0 and 9),
  failed_count integer not null default 0 check (failed_count between 0 and 9),
  styling_session_ids uuid[] not null default '{}'::uuid[],
  slot_state jsonb not null default '{}'::jsonb check (jsonb_typeof(slot_state) = 'object'),
  error_code text,
  error_message text,
  approved_at timestamptz,
  ready_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key),
  check (completed_count + failed_count <= requested_count)
);

create unique index if not exists uq_fashion_preview_batches_v2_active
  on public.fashion_preview_batches_v2 (consultation_id, selection_snapshot_id)
  where state in ('draft', 'quoted', 'approved', 'generating', 'partial');
create index if not exists idx_fashion_preview_batches_v2_owner
  on public.fashion_preview_batches_v2 (user_id, consultation_id, created_at desc);
create index if not exists idx_fashion_preview_batches_v2_state
  on public.fashion_preview_batches_v2 (state, updated_at)
  where state in ('approved', 'generating', 'partial');

alter table public.consultation_analysis_runs_v2 enable row level security;
alter table public.consultation_analysis_runs_v2 force row level security;
alter table public.fashion_preview_batches_v2 enable row level security;
alter table public.fashion_preview_batches_v2 force row level security;

revoke all on table public.consultation_analysis_runs_v2 from public, anon, authenticated;
revoke all on table public.fashion_preview_batches_v2 from public, anon, authenticated;
grant select, insert, update, delete on table public.consultation_analysis_runs_v2 to service_role;
grant select, insert, update, delete on table public.fashion_preview_batches_v2 to service_role;

create table if not exists public.hairfit_v2_engine_source_manifests (
  id uuid primary key default gen_random_uuid(),
  capability text not null check (capability in (
    'hair-blueprint-recommendation',
    'hair-preview-generation',
    'personal-color-analysis',
    'salon-brief-generation',
    'aftercare-program-generation',
    'fashion-recommendation-generation'
  )),
  source_revision text not null check (length(source_revision) between 7 and 64),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  file_manifest jsonb not null check (jsonb_typeof(file_manifest) = 'array'),
  imported_from text not null default 'origin/main',
  created_at timestamptz not null default timezone('utc', now()),
  unique (capability, source_revision, manifest_sha256)
);

create table if not exists public.consultation_capability_tasks_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  capability text not null check (capability in (
    'hair-blueprint-recommendation',
    'hair-preview-generation',
    'personal-color-analysis',
    'salon-brief-generation',
    'aftercare-program-generation',
    'fashion-recommendation-generation'
  )),
  state text not null default 'queued' check (state in (
    'queued', 'waiting', 'running', 'partial', 'completed',
    'retry_required', 'failed', 'cancelled'
  )),
  idempotency_key text not null check (length(idempotency_key) between 8 and 512),
  input_fingerprint text not null check (length(input_fingerprint) between 16 and 128),
  output_fingerprint text check (output_fingerprint is null or length(output_fingerprint) between 16 and 128),
  engine_version text not null,
  source_revision text not null,
  provider text,
  model text,
  prompt_policy_version text,
  catalog_cycle_id uuid,
  fallback_mode text not null default 'none' check (fallback_mode in (
    'none', 'deterministic', 'legacy_reuse', 'provider_failover'
  )),
  current_attempt integer not null default 0 check (current_attempt between 0 and 20),
  completed_units integer not null default 0 check (completed_units >= 0),
  total_units integer check (total_units is null or total_units > 0),
  cost_receipt jsonb not null default '{}'::jsonb check (jsonb_typeof(cost_receipt) = 'object'),
  error_code text,
  error_message text,
  retryable boolean not null default false,
  lease_owner uuid,
  lease_expires_at timestamptz,
  fencing_token bigint not null default 0 check (fencing_token >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key),
  check (total_units is null or completed_units <= total_units)
);

create index if not exists idx_consultation_capability_tasks_v2_owner
  on public.consultation_capability_tasks_v2 (user_id, consultation_id, created_at desc);
create index if not exists idx_consultation_capability_tasks_v2_claim
  on public.consultation_capability_tasks_v2 (state, lease_expires_at, created_at)
  where state in ('queued', 'waiting', 'running', 'partial', 'retry_required');

create table if not exists public.consultation_capability_attempts_v2 (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.consultation_capability_tasks_v2(id) on delete cascade,
  attempt integer not null check (attempt between 1 and 20),
  state text not null check (state in (
    'queued', 'waiting', 'running', 'partial', 'completed',
    'retry_required', 'failed', 'cancelled'
  )),
  input_fingerprint text not null check (length(input_fingerprint) between 16 and 128),
  output_fingerprint text check (output_fingerprint is null or length(output_fingerprint) between 16 and 128),
  provider text,
  model text,
  fallback_mode text not null default 'none' check (fallback_mode in (
    'none', 'deterministic', 'legacy_reuse', 'provider_failover'
  )),
  cost_receipt jsonb not null default '{}'::jsonb check (jsonb_typeof(cost_receipt) = 'object'),
  error_code text,
  error_message text,
  fencing_token bigint not null check (fencing_token >= 1),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (task_id, attempt)
);

create index if not exists idx_consultation_capability_attempts_v2_task
  on public.consultation_capability_attempts_v2 (task_id, attempt desc);

create table if not exists public.consultation_capability_results_v2 (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.consultation_capability_tasks_v2(id) on delete cascade,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  capability text not null,
  output jsonb not null check (jsonb_typeof(output) in ('object', 'array')),
  input_fingerprint text not null check (length(input_fingerprint) between 16 and 128),
  output_fingerprint text not null check (length(output_fingerprint) between 16 and 128),
  engine_version text not null,
  source_revision text not null,
  provider text,
  model text,
  prompt_policy_version text,
  catalog_cycle_id uuid,
  fallback_mode text not null default 'none' check (fallback_mode in (
    'none', 'deterministic', 'legacy_reuse', 'provider_failover'
  )),
  cost_receipt jsonb not null default '{}'::jsonb check (jsonb_typeof(cost_receipt) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_consultation_capability_results_v2_owner
  on public.consultation_capability_results_v2 (user_id, consultation_id, created_at desc);

create table if not exists public.consultation_interview_drafts_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  interview_kind text not null check (interview_kind in ('discovery', 'fashion-direction')),
  revision integer not null default 0 check (revision >= 0),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  coverage jsonb not null default '[]'::jsonb check (jsonb_typeof(coverage) = 'array'),
  conflicts jsonb not null default '[]'::jsonb check (jsonb_typeof(conflicts) = 'array'),
  skips jsonb not null default '[]'::jsonb check (jsonb_typeof(skips) = 'array'),
  unknown_field_ids text[] not null default '{}'::text[],
  summary_revision integer not null default 0 check (summary_revision >= 0),
  confirmed_revision integer check (confirmed_revision is null or confirmed_revision >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, interview_kind),
  check (confirmed_revision is null or confirmed_revision <= revision)
);

create index if not exists idx_consultation_interview_drafts_v2_owner
  on public.consultation_interview_drafts_v2 (user_id, consultation_id, updated_at desc);

alter table public.consultation_analysis_runs_v2
  add column if not exists capability_task_id uuid references public.consultation_capability_tasks_v2(id) on delete set null;
alter table public.fashion_preview_batches_v2
  add column if not exists capability_task_id uuid references public.consultation_capability_tasks_v2(id) on delete set null,
  add column if not exists direction_confirmed_at timestamptz,
  add column if not exists entitlement_decision jsonb check (entitlement_decision is null or jsonb_typeof(entitlement_decision) = 'object'),
  add column if not exists consumption_receipt_ids uuid[] not null default '{}'::uuid[];

alter table public.hairfit_v2_engine_source_manifests enable row level security;
alter table public.hairfit_v2_engine_source_manifests force row level security;
alter table public.consultation_capability_tasks_v2 enable row level security;
alter table public.consultation_capability_tasks_v2 force row level security;
alter table public.consultation_capability_attempts_v2 enable row level security;
alter table public.consultation_capability_attempts_v2 force row level security;
alter table public.consultation_capability_results_v2 enable row level security;
alter table public.consultation_capability_results_v2 force row level security;
alter table public.consultation_interview_drafts_v2 enable row level security;
alter table public.consultation_interview_drafts_v2 force row level security;

revoke all on table public.hairfit_v2_engine_source_manifests from public, anon, authenticated;
revoke all on table public.consultation_capability_tasks_v2 from public, anon, authenticated;
revoke all on table public.consultation_capability_attempts_v2 from public, anon, authenticated;
revoke all on table public.consultation_capability_results_v2 from public, anon, authenticated;
revoke all on table public.consultation_interview_drafts_v2 from public, anon, authenticated;
grant select, insert, update, delete on table public.hairfit_v2_engine_source_manifests to service_role;
grant select, insert, update, delete on table public.consultation_capability_tasks_v2 to service_role;
grant select, insert, update, delete on table public.consultation_capability_attempts_v2 to service_role;
grant select, insert, update, delete on table public.consultation_capability_results_v2 to service_role;
grant select, insert, update, delete on table public.consultation_interview_drafts_v2 to service_role;

create or replace function public.claim_consultation_capability_tasks_v2(
  p_limit integer,
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns setof public.consultation_capability_tasks_v2
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select task.id
    from public.consultation_capability_tasks_v2 as task
    where task.state in ('queued', 'waiting', 'retry_required')
       or (task.state in ('running', 'partial') and task.lease_expires_at < timezone('utc', now()))
    order by task.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 50))
  )
  update public.consultation_capability_tasks_v2 as task
  set state = 'running',
      current_attempt = task.current_attempt + 1,
      lease_owner = p_worker_id,
      lease_expires_at = timezone('utc', now()) + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
      fencing_token = task.fencing_token + 1,
      started_at = coalesce(task.started_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  from candidates
  where task.id = candidates.id
  returning task.*;
$$;

create or replace function public.claim_consultation_capability_task_v2(
  p_task_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns public.consultation_capability_tasks_v2
language sql
security invoker
set search_path = ''
as $$
  update public.consultation_capability_tasks_v2 as task
  set state = 'running',
      current_attempt = task.current_attempt + 1,
      lease_owner = p_worker_id,
      lease_expires_at = timezone('utc', now()) + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
      fencing_token = task.fencing_token + 1,
      error_code = null,
      error_message = null,
      started_at = coalesce(task.started_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where task.id = p_task_id
    and task.current_attempt < 20
    and (
      task.state in ('queued', 'waiting', 'retry_required')
      or (task.state = 'failed' and task.retryable)
      or (task.state in ('running', 'partial') and task.lease_expires_at < timezone('utc', now()))
    )
  returning task.*
$$;

create or replace function public.complete_consultation_capability_task_v2(
  p_task_id uuid,
  p_fencing_token bigint,
  p_output jsonb,
  p_output_fingerprint text,
  p_cost_receipt jsonb
)
returns public.consultation_capability_tasks_v2
language plpgsql
security invoker
set search_path = ''
as $$
declare
  completed_task public.consultation_capability_tasks_v2%rowtype;
begin
  if jsonb_typeof(p_output) not in ('object', 'array')
     or length(coalesce(p_output_fingerprint, '')) < 16
     or jsonb_typeof(coalesce(p_cost_receipt, '{}'::jsonb)) <> 'object' then
    raise exception 'CAPABILITY_RESULT_INVALID';
  end if;

  update public.consultation_capability_tasks_v2 as task
  set state = 'completed',
      output_fingerprint = p_output_fingerprint,
      cost_receipt = p_cost_receipt,
      completed_units = coalesce(task.total_units, greatest(task.completed_units, 1)),
      retryable = false,
      lease_owner = null,
      lease_expires_at = null,
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where task.id = p_task_id
    and task.fencing_token = p_fencing_token
    and task.state in ('running', 'partial')
  returning task.* into completed_task;

  if completed_task.id is null then
    raise exception 'CAPABILITY_TASK_STALE_FENCE';
  end if;

  insert into public.consultation_capability_results_v2 (
    task_id, consultation_id, user_id, capability, output,
    input_fingerprint, output_fingerprint, engine_version, source_revision,
    provider, model, prompt_policy_version, catalog_cycle_id, fallback_mode, cost_receipt
  ) values (
    completed_task.id, completed_task.consultation_id, completed_task.user_id, completed_task.capability, p_output,
    completed_task.input_fingerprint, p_output_fingerprint, completed_task.engine_version, completed_task.source_revision,
    completed_task.provider, completed_task.model, completed_task.prompt_policy_version,
    completed_task.catalog_cycle_id, completed_task.fallback_mode, p_cost_receipt
  ) on conflict (task_id) do nothing;

  return completed_task;
end;
$$;

revoke all on function public.claim_consultation_capability_tasks_v2(integer, uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_consultation_capability_task_v2(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_consultation_capability_task_v2(uuid, bigint, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_consultation_capability_tasks_v2(integer, uuid, integer) to service_role;
grant execute on function public.claim_consultation_capability_task_v2(uuid, uuid, integer) to service_role;
grant execute on function public.complete_consultation_capability_task_v2(uuid, bigint, jsonb, text, jsonb) to service_role;

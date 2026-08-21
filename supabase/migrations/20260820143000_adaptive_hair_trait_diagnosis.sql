-- P44 adaptive hair-trait diagnosis. Server-only additive tables; no browser direct writes.
alter table public.hairfit_v2_engine_source_manifests
  drop constraint if exists hairfit_v2_engine_source_manifests_capability_check;
alter table public.hairfit_v2_engine_source_manifests
  add constraint hairfit_v2_engine_source_manifests_capability_check
  check (capability in (
    'hair-blueprint-recommendation', 'hair-preview-generation', 'personal-color-analysis',
    'salon-brief-generation', 'aftercare-program-generation', 'fashion-recommendation-generation',
    'makeup-semantic-map', 'makeup-rationale-generation', 'hair-trait-analysis',
    'makeup-simulation-generation'
  ));

alter table public.consultation_capability_tasks_v2
  drop constraint if exists consultation_capability_tasks_v2_capability_check;
alter table public.consultation_capability_tasks_v2
  add constraint consultation_capability_tasks_v2_capability_check
  check (capability in (
    'hair-blueprint-recommendation', 'hair-preview-generation', 'personal-color-analysis',
    'salon-brief-generation', 'aftercare-program-generation', 'fashion-recommendation-generation',
    'makeup-semantic-map', 'makeup-rationale-generation', 'hair-trait-analysis',
    'makeup-simulation-generation'
  ));

create table if not exists public.hair_trait_analysis_runs_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  capability_task_id uuid references public.consultation_capability_tasks_v2(id) on delete set null,
  state text not null check (state in ('idle','queued','preflight','segmenting','extracting','reconciling','partial_ready','completed','retry_required','failed','cancelled')),
  source_fingerprint text not null check (length(source_fingerprint) between 16 and 128),
  source_asset_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(source_asset_ids) = 'array'),
  model jsonb,
  pipeline jsonb not null default '{}'::jsonb check (jsonb_typeof(pipeline) = 'object'),
  completed_trait_count integer not null default 0 check (completed_trait_count >= 0),
  total_trait_count integer not null default 12 check (total_trait_count > 0),
  attempt_count integer not null default 1 check (attempt_count > 0),
  lease_owner uuid,
  lease_expires_at timestamptz,
  fencing_token bigint not null default 0 check (fencing_token >= 0),
  error_code text,
  error_message text,
  started_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, source_fingerprint)
);

create table if not exists public.hair_profiles_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  state text not null check (state in ('empty','observations_partial','observations_ready','clarification_available','clarification_required','reconciling','ready','confirmed','superseded','attention')),
  source_fingerprint text not null check (length(source_fingerprint) between 16 and 128),
  observed jsonb not null default '[]'::jsonb check (jsonb_typeof(observed) = 'array'),
  reported jsonb not null default '{}'::jsonb check (jsonb_typeof(reported) = 'object'),
  inferred jsonb not null default '{}'::jsonb check (jsonb_typeof(inferred) = 'object'),
  unknown_field_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(unknown_field_ids) = 'array'),
  conflicts jsonb not null default '[]'::jsonb check (jsonb_typeof(conflicts) = 'array'),
  unresolved_field_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(unresolved_field_ids) = 'array'),
  question_budget jsonb not null default '{"preResultUsed":0,"postResultUsed":0,"maximum":4}'::jsonb check ((question_budget ->> 'maximum')::integer = 4),
  confirmed_revision integer,
  supersedes_profile_id uuid references public.hair_profiles_v2(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, source_fingerprint)
);

create table if not exists public.hair_diagnostic_questions_v2 (
  id uuid primary key default gen_random_uuid(),
  template_id text not null,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  analysis_run_id uuid not null references public.hair_trait_analysis_runs_v2(id) on delete cascade,
  profile_id uuid not null references public.hair_profiles_v2(id) on delete cascade,
  profile_revision integer not null check (profile_revision > 0),
  queue text not null check (queue in ('diagnosis-critical','result-refinement','design-deferred')),
  state text not null check (state in ('candidate','proposed','visible','saving','answered','unknown','skipped','salon_confirmation','expired')),
  reason_code text not null,
  evidence_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_ids) = 'array'),
  prompt text not null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  answer jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  unique (analysis_run_id, template_id)
);

create index if not exists idx_hair_trait_runs_owner on public.hair_trait_analysis_runs_v2(user_id, consultation_id, created_at desc);
create index if not exists idx_hair_profiles_owner on public.hair_profiles_v2(user_id, consultation_id, revision desc);
create index if not exists idx_hair_questions_owner on public.hair_diagnostic_questions_v2(user_id, consultation_id, state, created_at);

alter table public.hair_trait_analysis_runs_v2 enable row level security;
alter table public.hair_trait_analysis_runs_v2 force row level security;
alter table public.hair_profiles_v2 enable row level security;
alter table public.hair_profiles_v2 force row level security;
alter table public.hair_diagnostic_questions_v2 enable row level security;
alter table public.hair_diagnostic_questions_v2 force row level security;

revoke all on table public.hair_trait_analysis_runs_v2 from public, anon, authenticated;
revoke all on table public.hair_profiles_v2 from public, anon, authenticated;
revoke all on table public.hair_diagnostic_questions_v2 from public, anon, authenticated;
grant select, insert, update, delete on table public.hair_trait_analysis_runs_v2 to service_role;
grant select, insert, update, delete on table public.hair_profiles_v2 to service_role;
grant select, insert, update, delete on table public.hair_diagnostic_questions_v2 to service_role;


create or replace function public.answer_hair_diagnostic_question_v2(
  p_user_id text,
  p_consultation_id uuid,
  p_question_id uuid,
  p_expected_revision integer,
  p_answer jsonb,
  p_state text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_target_field text;
  v_used integer;
begin
  if p_state not in ('answered','unknown','skipped','salon_confirmation') then
    raise exception 'HAIR_DIAGNOSTIC_STATE_INVALID';
  end if;

  select q.profile_id, split_part(q.reason_code, ':', 2)
    into v_profile_id, v_target_field
  from public.hair_diagnostic_questions_v2 q
  where q.id = p_question_id
    and q.consultation_id = p_consultation_id
    and q.user_id = p_user_id
    and q.state = 'visible'
  for update;

  if v_profile_id is null then
    raise exception 'HAIR_DIAGNOSTIC_QUESTION_NOT_FOUND';
  end if;

  perform 1
  from public.hair_profiles_v2 p
  where p.id = v_profile_id
    and p.consultation_id = p_consultation_id
    and p.user_id = p_user_id
    and p.revision = p_expected_revision
  for update;

  if not found then
    raise exception 'HAIR_PROFILE_REVISION_CONFLICT';
  end if;

  update public.hair_diagnostic_questions_v2
  set state = p_state,
      answer = case when p_state = 'answered' then p_answer else null end,
      resolved_at = timezone('utc', now())
  where id = p_question_id;

  select least(4, coalesce((question_budget ->> 'preResultUsed')::integer, 0) + 1)
    into v_used
  from public.hair_profiles_v2
  where id = v_profile_id;

  update public.hair_profiles_v2
  set revision = revision + 1,
      reported = case
        when p_state = 'answered' then jsonb_set(reported, array[v_target_field], p_answer, true)
        else reported
      end,
      question_budget = jsonb_set(question_budget, '{preResultUsed}', to_jsonb(v_used), true),
      state = 'ready',
      updated_at = timezone('utc', now())
  where id = v_profile_id;
end;
$$;

revoke all on function public.answer_hair_diagnostic_question_v2(text, uuid, uuid, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.answer_hair_diagnostic_question_v2(text, uuid, uuid, integer, jsonb, text) to service_role;

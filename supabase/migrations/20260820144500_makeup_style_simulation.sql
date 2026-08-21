-- P45 makeup style simulation inside the existing makeup stage.
create table if not exists public.makeup_simulation_runs_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  state text not null check (state in ('idle','queued','preparing','generating','quality_review','partial_ready','completed','retry_required','failed','cancelled')),
  purpose text not null default 'makeup_style_simulation' check (purpose = 'makeup_style_simulation'),
  requested_output_count integer not null default 1 check (requested_output_count in (1,2)),
  terminal_output_count integer not null default 0 check (terminal_output_count between 0 and 2),
  source_asset_id text not null,
  source_fingerprint text not null check (length(source_fingerprint) between 16 and 128),
  input_fingerprint text not null check (length(input_fingerprint) between 16 and 128),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  makeup_interview_revision integer not null check (makeup_interview_revision > 0),
  rationale_revision integer not null check (rationale_revision > 0),
  direction_revision integer not null check (direction_revision > 0),
  personal_color_profile_id uuid,
  selected_hair_snapshot_id uuid not null,
  selected_color_snapshot_id uuid,
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
  unique (consultation_id, input_fingerprint)
);

create table if not exists public.makeup_simulation_outputs_v2 (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.makeup_simulation_runs_v2(id) on delete cascade,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  variant text not null check (variant in ('primary','alternative')),
  state text not null check (state in ('pending','generated','quality_rejected','ready','failed')),
  image_path text,
  width integer,
  height integer,
  module_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(module_summary) = 'array'),
  quality jsonb not null default '{}'::jsonb check (jsonb_typeof(quality) = 'object'),
  provider text,
  model text,
  model_version text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (run_id, variant)
);

create table if not exists public.makeup_simulation_selections_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  run_id uuid not null references public.makeup_simulation_runs_v2(id) on delete restrict,
  output_id uuid not null references public.makeup_simulation_outputs_v2(id) on delete restrict,
  input_fingerprint text not null check (length(input_fingerprint) between 16 and 128),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (consultation_id, revision),
  unique (output_id)
);

create index if not exists idx_makeup_simulation_runs_owner on public.makeup_simulation_runs_v2(user_id, consultation_id, created_at desc);
create index if not exists idx_makeup_simulation_outputs_owner on public.makeup_simulation_outputs_v2(user_id, consultation_id, created_at);
create index if not exists idx_makeup_simulation_selections_owner on public.makeup_simulation_selections_v2(user_id, consultation_id, revision desc);

alter table public.makeup_simulation_runs_v2 enable row level security;
alter table public.makeup_simulation_runs_v2 force row level security;
alter table public.makeup_simulation_outputs_v2 enable row level security;
alter table public.makeup_simulation_outputs_v2 force row level security;
alter table public.makeup_simulation_selections_v2 enable row level security;
alter table public.makeup_simulation_selections_v2 force row level security;

revoke all on table public.makeup_simulation_runs_v2 from public, anon, authenticated;
revoke all on table public.makeup_simulation_outputs_v2 from public, anon, authenticated;
revoke all on table public.makeup_simulation_selections_v2 from public, anon, authenticated;
grant select, insert, update, delete on table public.makeup_simulation_runs_v2 to service_role;
grant select, insert, update, delete on table public.makeup_simulation_outputs_v2 to service_role;
grant select, insert on table public.makeup_simulation_selections_v2 to service_role;

create or replace function public.guard_makeup_simulation_selection_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'MAKEUP_SIMULATION_SELECTION_IMMUTABLE';
end;
$$;
drop trigger if exists trg_makeup_simulation_selection_immutable on public.makeup_simulation_selections_v2;
create trigger trg_makeup_simulation_selection_immutable before update or delete on public.makeup_simulation_selections_v2 for each row execute procedure public.guard_makeup_simulation_selection_immutable();
revoke all on function public.guard_makeup_simulation_selection_immutable() from public, anon, authenticated;
grant execute on function public.guard_makeup_simulation_selection_immutable() to service_role;

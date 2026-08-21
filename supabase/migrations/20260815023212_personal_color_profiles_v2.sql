create table if not exists public.personal_color_profiles_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  observation_bundle_id uuid not null references public.face_observation_bundles(id) on delete restrict,
  profile_version integer not null check (profile_version > 0),
  status text not null check (status in ('draft','capture_validating','observation_running','color_processing','profile_ready','drape_in_progress','confirmed','partial_ready','failed_retryable','failed_terminal','superseded')),
  capture_mode text not null check (capture_mode in ('quick','precision','legacy_unknown')),
  profile jsonb not null,
  legacy_projection jsonb,
  legacy_projection_hash text check (legacy_projection_hash is null or length(legacy_projection_hash) = 64),
  profile_model text not null,
  axis_policy_version text not null,
  posterior_version text not null,
  palette_version text not null,
  drape_validated_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(consultation_id,user_id,profile_version)
);

create index if not exists idx_personal_color_profiles_v2_owner_created
  on public.personal_color_profiles_v2(user_id,created_at desc);
create index if not exists idx_personal_color_profiles_v2_consultation_version
  on public.personal_color_profiles_v2(consultation_id,user_id,profile_version desc);
create index if not exists idx_personal_color_profiles_v2_observation_model
  on public.personal_color_profiles_v2(observation_bundle_id,profile_model,axis_policy_version,posterior_version,palette_version,created_at desc);

create table if not exists public.active_personal_color_profiles_v2 (
  user_id text primary key references public.users(id) on delete cascade,
  profile_id uuid not null references public.personal_color_profiles_v2(id) on delete restrict,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  legacy_projection_hash text not null check (length(legacy_projection_hash) = 64),
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_color_projection_reconciliations (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  profile_id uuid not null references public.personal_color_profiles_v2(id) on delete cascade,
  legacy_source_hash text,
  v2_projection_hash text not null check (length(v2_projection_hash) = 64),
  matched boolean,
  created_at timestamptz not null default now()
);

alter table public.personal_color_evidence_v2
  add column if not exists personal_color_profile_id uuid references public.personal_color_profiles_v2(id) on delete set null;
alter table public.user_style_profiles
  add column if not exists active_personal_color_profile_id uuid references public.personal_color_profiles_v2(id) on delete set null;

create or replace function public.activate_personal_color_profile_v2(
  p_user_id text,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_profile public.personal_color_profiles_v2%rowtype;
begin
  select * into v_profile
    from public.personal_color_profiles_v2
   where id=p_profile_id and user_id=p_user_id
   for update;
  if not found then raise exception 'Personal color profile not found'; end if;
  if v_profile.status not in ('profile_ready','confirmed') or v_profile.legacy_projection is null or v_profile.legacy_projection_hash is null then
    raise exception 'Personal color profile is not activatable';
  end if;

  insert into public.active_personal_color_profiles_v2(user_id,profile_id,consultation_id,legacy_projection_hash)
  values(p_user_id,v_profile.id,v_profile.consultation_id,v_profile.legacy_projection_hash)
  on conflict(user_id) do update set
    profile_id=excluded.profile_id,
    consultation_id=excluded.consultation_id,
    legacy_projection_hash=excluded.legacy_projection_hash,
    activated_at=now(),
    updated_at=now();

  insert into public.user_style_profiles(
    user_id,personal_color_tone,personal_color_contrast,personal_color_result,
    personal_color_model,personal_color_diagnosed_at,active_personal_color_profile_id
  ) values (
    p_user_id,
    nullif(v_profile.legacy_projection->>'tone',''),
    nullif(v_profile.legacy_projection->>'contrast',''),
    v_profile.legacy_projection,
    v_profile.profile_model,
    coalesce((v_profile.legacy_projection->>'diagnosedAt')::timestamptz,v_profile.created_at),
    v_profile.id
  ) on conflict(user_id) do update set
    personal_color_tone=excluded.personal_color_tone,
    personal_color_contrast=excluded.personal_color_contrast,
    personal_color_result=excluded.personal_color_result,
    personal_color_model=excluded.personal_color_model,
    personal_color_diagnosed_at=excluded.personal_color_diagnosed_at,
    active_personal_color_profile_id=excluded.active_personal_color_profile_id,
    updated_at=now();

  return jsonb_build_object('profileId',v_profile.id,'state','active','legacyProjectionHash',v_profile.legacy_projection_hash);
end;
$$;

alter table public.personal_color_profiles_v2 enable row level security;
alter table public.personal_color_profiles_v2 force row level security;
alter table public.active_personal_color_profiles_v2 enable row level security;
alter table public.active_personal_color_profiles_v2 force row level security;
alter table public.personal_color_projection_reconciliations enable row level security;
alter table public.personal_color_projection_reconciliations force row level security;

revoke all on public.personal_color_profiles_v2,public.active_personal_color_profiles_v2,public.personal_color_projection_reconciliations from public,anon,authenticated;
grant select,insert,update,delete on public.personal_color_profiles_v2,public.active_personal_color_profiles_v2,public.personal_color_projection_reconciliations to service_role;
revoke all on function public.activate_personal_color_profile_v2(text,uuid) from public,anon,authenticated;
grant execute on function public.activate_personal_color_profile_v2(text,uuid) to service_role;

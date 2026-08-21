alter table public.consultation_sessions
  drop constraint if exists consultation_sessions_current_stage_check;
alter table public.consultation_sessions
  add constraint consultation_sessions_current_stage_check
  check (current_stage in ('discovery','photo','scan','analysis','personal-color','direction','previews','compare','decision','color-studio','salon-brief','makeup','fashion','result','aftercare'));

create table if not exists public.makeup_direction_snapshots (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  snapshot_version integer not null check (snapshot_version > 0),
  revision integer not null default 1 check (revision > 0),
  status text not null check (status in ('context_draft','geometry_building','map_ready','partial_ready','user_adjusted','confirmed','routine_ready','brief_ready','failed_retryable','superseded')),
  face_observation_bundle_id uuid not null references public.face_observation_bundles(id) on delete restrict,
  personal_color_profile_id uuid not null references public.personal_color_profiles_v2(id) on delete restrict,
  selected_style_snapshot_id uuid not null references public.style_selection_snapshots_v2(id) on delete restrict,
  input_profile_revision integer not null check (input_profile_revision > 0),
  source_fingerprint text not null check (length(source_fingerprint) = 64),
  context jsonb not null,
  modules jsonb not null,
  snapshot jsonb not null,
  geometry_policy_version text not null,
  direction_policy_version text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(consultation_id,user_id,snapshot_version)
);

create index if not exists idx_makeup_direction_owner_created
  on public.makeup_direction_snapshots(user_id,consultation_id,created_at desc);
create unique index if not exists uq_makeup_direction_editable
  on public.makeup_direction_snapshots(consultation_id,user_id)
  where status in ('context_draft','geometry_building','map_ready','partial_ready','user_adjusted','failed_retryable');

create table if not exists public.makeup_direction_patches (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.makeup_direction_snapshots(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  module text not null check (module in ('base','brow','eyeshadow','eyeliner','blush','lip','lashes')),
  patch_revision integer not null check (patch_revision > 0),
  patch jsonb not null,
  created_at timestamptz not null default now(),
  unique(snapshot_id,patch_revision)
);

create table if not exists public.active_makeup_direction_snapshots (
  consultation_id uuid primary key references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  snapshot_id uuid not null unique references public.makeup_direction_snapshots(id) on delete restrict,
  source_fingerprint text not null check (length(source_fingerprint) = 64),
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.protect_confirmed_makeup_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
begin
  if old.status in ('confirmed','routine_ready','brief_ready') then
    raise exception 'MAKEUP_ALREADY_CONFIRMED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_confirmed_makeup_snapshot on public.makeup_direction_snapshots;
create trigger trg_protect_confirmed_makeup_snapshot
before update or delete on public.makeup_direction_snapshots
for each row execute function public.protect_confirmed_makeup_snapshot();

create or replace function public.confirm_makeup_direction_snapshot(
  p_user_id text,
  p_snapshot_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_snapshot public.makeup_direction_snapshots%rowtype;
begin
  select * into v_snapshot from public.makeup_direction_snapshots
   where id=p_snapshot_id and user_id=p_user_id for update;
  if not found then raise exception 'MAKEUP_SNAPSHOT_NOT_FOUND'; end if;
  if v_snapshot.status in ('confirmed','routine_ready','brief_ready') then
    return jsonb_build_object('state','confirmed','revision',v_snapshot.revision,'idempotentReplay',true);
  end if;
  if v_snapshot.revision<>p_expected_revision then
    return jsonb_build_object('state','conflict','revision',v_snapshot.revision);
  end if;
  if v_snapshot.status not in ('map_ready','partial_ready','user_adjusted') then
    raise exception 'MAKEUP_MAP_NOT_READY';
  end if;
  update public.makeup_direction_snapshots
     set status='confirmed', revision=revision+1, confirmed_at=now(),
         snapshot=jsonb_set(jsonb_set(snapshot,'{status}','"confirmed"'::jsonb),'{confirmedAt}',to_jsonb(now())),
         updated_at=now()
   where id=p_snapshot_id;
  insert into public.active_makeup_direction_snapshots(consultation_id,user_id,snapshot_id,source_fingerprint)
  values(v_snapshot.consultation_id,p_user_id,p_snapshot_id,v_snapshot.source_fingerprint)
  on conflict(consultation_id) do update set snapshot_id=excluded.snapshot_id,user_id=excluded.user_id,
    source_fingerprint=excluded.source_fingerprint,activated_at=now(),updated_at=now();
  return jsonb_build_object('state','confirmed','revision',v_snapshot.revision+1,'idempotentReplay',false);
end;
$$;

create or replace function public.patch_makeup_direction_snapshot(
  p_user_id text,
  p_snapshot_id uuid,
  p_expected_revision integer,
  p_module text,
  p_patch jsonb,
  p_modules jsonb,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_snapshot public.makeup_direction_snapshots%rowtype; v_next_revision integer;
begin
  select * into v_snapshot from public.makeup_direction_snapshots where id=p_snapshot_id and user_id=p_user_id for update;
  if not found then raise exception 'MAKEUP_SNAPSHOT_NOT_FOUND'; end if;
  if v_snapshot.revision<>p_expected_revision then return jsonb_build_object('state','conflict','revision',v_snapshot.revision); end if;
  if v_snapshot.status in ('confirmed','routine_ready','brief_ready') then return jsonb_build_object('state','confirmed','revision',v_snapshot.revision); end if;
  if v_snapshot.status not in ('map_ready','partial_ready','user_adjusted') then raise exception 'MAKEUP_MAP_NOT_READY'; end if;
  if p_module not in ('base','brow','eyeshadow','eyeliner','blush','lip','lashes') then raise exception 'MAKEUP_MODULE_INVALID'; end if;
  v_next_revision := v_snapshot.revision+1;
  update public.makeup_direction_snapshots set status='user_adjusted',revision=v_next_revision,modules=p_modules,snapshot=p_snapshot,updated_at=now() where id=p_snapshot_id;
  insert into public.makeup_direction_patches(snapshot_id,user_id,module,patch_revision,patch) values(p_snapshot_id,p_user_id,p_module,v_next_revision,p_patch);
  return jsonb_build_object('state','applied','revision',v_next_revision);
end;
$$;

alter table public.makeup_direction_snapshots enable row level security;
alter table public.makeup_direction_snapshots force row level security;
alter table public.makeup_direction_patches enable row level security;
alter table public.makeup_direction_patches force row level security;
alter table public.active_makeup_direction_snapshots enable row level security;
alter table public.active_makeup_direction_snapshots force row level security;

drop policy if exists makeup_direction_snapshots_service_role on public.makeup_direction_snapshots;
create policy makeup_direction_snapshots_service_role on public.makeup_direction_snapshots for all to service_role using (true) with check (true);
drop policy if exists makeup_direction_patches_service_role on public.makeup_direction_patches;
create policy makeup_direction_patches_service_role on public.makeup_direction_patches for all to service_role using (true) with check (true);
drop policy if exists active_makeup_direction_service_role on public.active_makeup_direction_snapshots;
create policy active_makeup_direction_service_role on public.active_makeup_direction_snapshots for all to service_role using (true) with check (true);

revoke all on table public.makeup_direction_snapshots from public,anon,authenticated;
revoke all on table public.makeup_direction_patches from public,anon,authenticated;
revoke all on table public.active_makeup_direction_snapshots from public,anon,authenticated;
grant select,insert,update,delete on table public.makeup_direction_snapshots to service_role;
grant select,insert on table public.makeup_direction_patches to service_role;
grant select,insert,update,delete on table public.active_makeup_direction_snapshots to service_role;
revoke all on function public.confirm_makeup_direction_snapshot(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.confirm_makeup_direction_snapshot(text,uuid,integer) to service_role;
revoke all on function public.patch_makeup_direction_snapshot(text,uuid,integer,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.patch_makeup_direction_snapshot(text,uuid,integer,text,jsonb,jsonb,jsonb) to service_role;

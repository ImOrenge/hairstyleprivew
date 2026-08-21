create table if not exists public.face_observation_bundles (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null,
  source_analysis_evidence_id uuid not null references public.analysis_evidence_v2(id) on delete cascade,
  source_capture_asset_id uuid references public.personal_color_capture_assets(id) on delete set null,
  schema_version text not null default 'face-observation-bundle-v2' check (schema_version = 'face-observation-bundle-v2'),
  input_hash text not null check (length(input_hash) >= 32),
  model_hash text not null check (length(model_hash) >= 32),
  state text not null default 'processing' check (state in ('processing','ready','failed')),
  source_assets jsonb not null default '[]'::jsonb,
  source_transform jsonb not null default '{}'::jsonb,
  landmarks jsonb not null default '[]'::jsonb,
  semantic_masks jsonb not null default '[]'::jsonb,
  calibration jsonb not null default '{}'::jsonb,
  quality jsonb not null default '{}'::jsonb,
  model_manifest jsonb not null default '[]'::jsonb,
  correction_revision integer not null default 0 check (correction_revision >= 0),
  failure_code text,
  failure_message text,
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_face_observation_ready_input_model
  on public.face_observation_bundles(consultation_id,user_id,input_hash,model_hash)
  where state = 'ready';
create index if not exists idx_face_observation_consultation_created
  on public.face_observation_bundles(consultation_id,user_id,created_at desc);

create table if not exists public.face_observation_region_samples (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.face_observation_bundles(id) on delete cascade,
  region_id text not null check (region_id in ('forehead','left_cheek_upper','left_cheek_lower','right_cheek_upper','right_cheek_lower','jaw','neck')),
  polygon jsonb not null,
  sampled_pixel_count integer not null check (sampled_pixel_count >= 0),
  valid_pixel_count integer not null check (valid_pixel_count >= 0 and valid_pixel_count <= sampled_pixel_count),
  lab_statistics jsonb not null,
  excluded_by_kind jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(bundle_id,region_id)
);

create table if not exists public.face_observation_jobs (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null,
  source_analysis_evidence_id uuid not null references public.analysis_evidence_v2(id) on delete cascade,
  source_capture_asset_id uuid references public.personal_color_capture_assets(id) on delete set null,
  request_hash text not null check (length(request_hash) >= 32),
  model_hash text not null check (length(model_hash) >= 32),
  state text not null default 'queued' check (state in ('queued','processing','retry','completed','failed')),
  bundle_id uuid references public.face_observation_bundles(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(consultation_id,user_id,request_hash,model_hash)
);

create table if not exists public.face_observation_outbox (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.face_observation_jobs(id) on delete cascade,
  event_type text not null default 'face_observation.requested' check (event_type = 'face_observation.requested'),
  state text not null default 'pending' check (state in ('pending','processing','retry','completed','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.face_observation_corrections (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.face_observation_bundles(id) on delete cascade,
  user_id text not null,
  revision integer not null check (revision > 0),
  target_mask_id text not null,
  point_index integer not null check (point_index >= 0),
  original_point jsonb not null,
  adjusted_point jsonb not null,
  created_at timestamptz not null default now(),
  unique(bundle_id,revision)
);

create or replace function public.enqueue_face_observation_job(
  p_user_id text,
  p_consultation_id uuid,
  p_source_analysis_evidence_id uuid,
  p_source_capture_asset_id uuid,
  p_request_hash text,
  p_model_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_job public.face_observation_jobs%rowtype;
begin
  insert into public.face_observation_jobs(
    consultation_id,user_id,source_analysis_evidence_id,source_capture_asset_id,request_hash,model_hash
  ) values (
    p_consultation_id,p_user_id,p_source_analysis_evidence_id,p_source_capture_asset_id,p_request_hash,p_model_hash
  )
  on conflict (consultation_id,user_id,request_hash,model_hash)
  do update set updated_at = now()
  returning * into v_job;
  insert into public.face_observation_outbox(job_id)
  values (v_job.id) on conflict (job_id) do nothing;
  return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'bundleId',v_job.bundle_id);
end;
$$;

create or replace function public.claim_face_observation_jobs(
  p_limit integer,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns setof jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_now timestamptz := now();
begin
  if p_limit not between 1 and 50 then raise exception 'p_limit must be between 1 and 50'; end if;
  if p_lease_seconds not between 1 and 3600 then raise exception 'p_lease_seconds must be between 1 and 3600'; end if;
  return query
  with candidates as (
    select j.id
      from public.face_observation_jobs j
      join public.face_observation_outbox o on o.job_id = j.id
     where j.state in ('queued','retry','processing')
       and j.available_at <= v_now
       and (j.state <> 'processing' or j.lease_expires_at <= v_now)
       and j.attempt_count < 8
       and o.state in ('pending','retry','processing')
     order by j.available_at,j.created_at,j.id
     for update of j,o skip locked limit p_limit
  ), claimed as (
    update public.face_observation_jobs j
       set state='processing',attempt_count=attempt_count+1,lease_token=p_lease_token,
           lease_expires_at=v_now+make_interval(secs=>p_lease_seconds),updated_at=v_now
      from candidates c where j.id=c.id returning j.*
  ), marked as (
    update public.face_observation_outbox o
       set state='processing',attempt_count=attempt_count+1,lease_token=p_lease_token,
           lease_expires_at=v_now+make_interval(secs=>p_lease_seconds),updated_at=v_now
      from claimed c where o.job_id=c.id returning o.job_id
  )
  select jsonb_build_object(
    'jobId',c.id,'consultationId',c.consultation_id,'userId',c.user_id,
    'sourceAnalysisEvidenceId',c.source_analysis_evidence_id,'sourceCaptureAssetId',c.source_capture_asset_id,
    'requestHash',c.request_hash,'modelHash',c.model_hash,'leaseToken',c.lease_token
  ) from claimed c join marked m on m.job_id=c.id;
end;
$$;

create or replace function public.finish_face_observation_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_bundle_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_job public.face_observation_jobs%rowtype;
begin
  select * into v_job from public.face_observation_jobs where id=p_job_id for update;
  if not found then raise exception 'Face observation job not found'; end if;
  if v_job.state='completed' then return jsonb_build_object('jobId',v_job.id,'state','completed','bundleId',v_job.bundle_id,'idempotentReplay',true); end if;
  if v_job.state<>'processing' or v_job.lease_token<>p_lease_token or v_job.lease_expires_at<=now() then raise exception 'Stale face observation lease'; end if;
  update public.face_observation_jobs set state='completed',bundle_id=p_bundle_id,lease_token=null,lease_expires_at=null,last_error=null,updated_at=now() where id=p_job_id;
  update public.face_observation_outbox set state='completed',lease_token=null,lease_expires_at=null,last_error=null,completed_at=now(),updated_at=now() where job_id=p_job_id;
  return jsonb_build_object('jobId',p_job_id,'state','completed','bundleId',p_bundle_id);
end;
$$;

create or replace function public.retry_face_observation_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error text,
  p_delay_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_job public.face_observation_jobs%rowtype;
begin
  select * into v_job from public.face_observation_jobs where id=p_job_id for update;
  if not found then raise exception 'Face observation job not found'; end if;
  if v_job.state<>'processing' or v_job.lease_token<>p_lease_token then raise exception 'Stale face observation lease'; end if;
  update public.face_observation_jobs
     set state=case when attempt_count>=8 then 'failed' else 'retry' end,
         available_at=now()+make_interval(secs=>greatest(0,least(p_delay_seconds,86400))),
         lease_token=null,lease_expires_at=null,last_error=left(btrim(p_error),4000),updated_at=now()
   where id=p_job_id returning * into v_job;
  update public.face_observation_outbox
     set state=v_job.state,available_at=v_job.available_at,lease_token=null,lease_expires_at=null,
         last_error=v_job.last_error,updated_at=now()
   where job_id=p_job_id;
  return jsonb_build_object('jobId',p_job_id,'state',v_job.state,'attemptCount',v_job.attempt_count);
end;
$$;

create or replace function public.apply_face_observation_mask_correction(
  p_user_id text,
  p_bundle_id uuid,
  p_expected_revision integer,
  p_target_mask_id text,
  p_point_index integer,
  p_original_point jsonb,
  p_adjusted_point jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare v_bundle public.face_observation_bundles%rowtype; v_revision integer;
begin
  select * into v_bundle from public.face_observation_bundles where id=p_bundle_id and user_id=p_user_id for update;
  if not found then raise exception 'Face observation bundle not found'; end if;
  if v_bundle.correction_revision<>p_expected_revision then return jsonb_build_object('state','conflict','revision',v_bundle.correction_revision); end if;
  if p_point_index<0 or nullif(btrim(p_target_mask_id),'') is null then raise exception 'Invalid face observation correction'; end if;
  v_revision := v_bundle.correction_revision+1;
  insert into public.face_observation_corrections(bundle_id,user_id,revision,target_mask_id,point_index,original_point,adjusted_point)
  values(p_bundle_id,p_user_id,v_revision,p_target_mask_id,p_point_index,p_original_point,p_adjusted_point);
  update public.face_observation_bundles set correction_revision=v_revision,updated_at=now() where id=p_bundle_id;
  return jsonb_build_object('state','applied','revision',v_revision);
end;
$$;

alter table public.face_observation_bundles enable row level security;
alter table public.face_observation_bundles force row level security;
alter table public.face_observation_region_samples enable row level security;
alter table public.face_observation_region_samples force row level security;
alter table public.face_observation_jobs enable row level security;
alter table public.face_observation_jobs force row level security;
alter table public.face_observation_outbox enable row level security;
alter table public.face_observation_outbox force row level security;
alter table public.face_observation_corrections enable row level security;
alter table public.face_observation_corrections force row level security;

revoke all on public.face_observation_bundles,public.face_observation_region_samples,public.face_observation_jobs,public.face_observation_outbox,public.face_observation_corrections from public,anon,authenticated;
grant select,insert,update,delete on public.face_observation_bundles,public.face_observation_region_samples,public.face_observation_jobs,public.face_observation_outbox,public.face_observation_corrections to service_role;
revoke all on function public.enqueue_face_observation_job(text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.claim_face_observation_jobs(integer,uuid,integer) from public,anon,authenticated;
revoke all on function public.finish_face_observation_job(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.retry_face_observation_job(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.apply_face_observation_mask_correction(text,uuid,integer,text,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_face_observation_job(text,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.claim_face_observation_jobs(integer,uuid,integer) to service_role;
grant execute on function public.finish_face_observation_job(uuid,uuid,uuid) to service_role;
grant execute on function public.retry_face_observation_job(uuid,uuid,text,integer) to service_role;
grant execute on function public.apply_face_observation_mask_correction(text,uuid,integer,text,integer,jsonb,jsonb) to service_role;

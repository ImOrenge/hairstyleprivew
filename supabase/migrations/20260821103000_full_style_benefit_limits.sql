-- Version full-style benefits without mutating purchased V1 snapshots.
-- Adds atomic multi-restart claims and treatment-based AI aftercare check-ins.

alter table public.hairfit_v2_engine_source_manifests
  drop constraint if exists hairfit_v2_engine_source_manifests_capability_check;
alter table public.hairfit_v2_engine_source_manifests
  add constraint hairfit_v2_engine_source_manifests_capability_check
  check (capability in (
    'hair-blueprint-recommendation','hair-preview-generation','personal-color-analysis',
    'salon-brief-generation','aftercare-program-generation','fashion-recommendation-generation',
    'makeup-semantic-map','makeup-rationale-generation','hair-trait-analysis',
    'makeup-simulation-generation','consultation-result-narrative-generation',
    'aftercare-checkin-photo-analysis','aftercare-checkin-response-generation'
  ));

alter table public.consultation_capability_tasks_v2
  drop constraint if exists consultation_capability_tasks_v2_capability_check;
alter table public.consultation_capability_tasks_v2
  add constraint consultation_capability_tasks_v2_capability_check
  check (capability in (
    'hair-blueprint-recommendation','hair-preview-generation','personal-color-analysis',
    'salon-brief-generation','aftercare-program-generation','fashion-recommendation-generation',
    'makeup-semantic-map','makeup-rationale-generation','hair-trait-analysis',
    'makeup-simulation-generation','consultation-result-narrative-generation',
    'aftercare-checkin-photo-analysis','aftercare-checkin-response-generation'
  ));

drop index if exists public.idx_consultation_restarts_one_user_restart;
create index if not exists idx_consultation_restarts_user_requested
  on public.consultation_restarts_v2(consultation_id,created_at desc)
  where counts_toward_limit;

create or replace function public.claim_consultation_restart_v2(p_user_id text,p_consultation_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_session public.consultation_sessions%rowtype; v_restart_id uuid; v_offering_key text;
begin
  select * into v_session from public.consultation_sessions
    where id=p_consultation_id and user_id=p_user_id for update;
  if not found then raise exception 'CONSULTATION_NOT_FOUND' using errcode='P0002'; end if;
  select offering_key into v_offering_key from public.customer_entitlement_grants_v2
    where id=v_session.entitlement_grant_id and user_id=p_user_id and status<>'revoked';
  if v_offering_key is null or v_offering_key not like 'full_style_%' then
    raise exception 'PAID_FULL_STYLE_REQUIRED' using errcode='P0001';
  end if;
  if v_session.lifecycle_state not in ('preview_board_ready','shortlisted','style_selected')
     or v_session.current_preview_board_id is null then
    raise exception 'RESTART_ONLY_BEFORE_FINAL' using errcode='P0001';
  end if;
  if v_session.user_restart_count>=v_session.user_restart_limit then
    raise exception 'RESTART_LIMIT_EXCEEDED' using errcode='P0001';
  end if;
  insert into public.consultation_restarts_v2(
    consultation_id,user_id,reason,counts_toward_limit,source_preview_board_id
  ) values (p_consultation_id,p_user_id,'user_requested',true,v_session.current_preview_board_id)
  returning id into v_restart_id;
  update public.style_selection_snapshots_v2 set status='superseded'
    where consultation_id=p_consultation_id and user_id=p_user_id and status='draft';
  update public.consultation_sessions set
    user_restart_count=user_restart_count+1,
    current_preview_board_id=null,
    selected_snapshot_id=null,
    lifecycle_state='analysis_ready',
    version=version+1,
    snapshot=jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(snapshot,'{previews}','[]'::jsonb,true),
          '{shortlist}','{"previewIds":[],"updatedAt":null}'::jsonb,true
        ),
        '{finalist}','{"finalistPreviewId":null,"backupPreviewId":null,"decidedAt":null}'::jsonb,true
      ),
      '{result}','{"stale":true,"reason":"consultation-restarted"}'::jsonb,true
    ),
    updated_at=timezone('utc',now())
    where id=p_consultation_id;
  return jsonb_build_object(
    'restartId',v_restart_id,
    'restartCount',v_session.user_restart_count+1,
    'restartLimit',v_session.user_restart_limit,
    'remaining',greatest(0,v_session.user_restart_limit-v_session.user_restart_count-1)
  );
end $$;
revoke execute on function public.claim_consultation_restart_v2(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_consultation_restart_v2(text,uuid) to service_role;

create or replace function public.link_consultation_restart_board_v2(
  p_user_id text,p_consultation_id uuid,p_preview_board_id uuid
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_restart_id uuid;
begin
  select id into v_restart_id from public.consultation_restarts_v2
    where consultation_id=p_consultation_id and user_id=p_user_id
      and counts_toward_limit and replacement_preview_board_id is null
    order by created_at desc limit 1 for update;
  if v_restart_id is not null then
    update public.consultation_restarts_v2 set replacement_preview_board_id=p_preview_board_id
      where id=v_restart_id;
  end if;
  return v_restart_id;
end $$;
revoke execute on function public.link_consultation_restart_board_v2(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.link_consultation_restart_board_v2(text,uuid,uuid) to service_role;

create table if not exists public.aftercare_checkins_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  actual_service_id uuid not null references public.actual_services_v2(id) on delete cascade,
  entitlement_grant_id uuid references public.customer_entitlement_grants_v2(id) on delete set null,
  user_id text not null references public.users(id) on delete cascade,
  slot integer not null check(slot between 1 and 3),
  offset_days integer not null check(offset_days in (30,60,90)),
  scheduled_for date not null,
  state text not null default 'draft' check(state in ('draft','preparing','ready','failed')),
  concern text not null default '' check(length(concern)<=2000),
  satisfaction integer check(satisfaction between 1 and 5),
  photo_path text,
  photo_fingerprint text check(photo_fingerprint is null or photo_fingerprint~'^[0-9a-f]{64}$'),
  photo_consent_at timestamptz,
  photo_uploaded_at timestamptz,
  observations jsonb not null default '[]'::jsonb,
  response jsonb,
  submit_idempotency_key text,
  photo_capability_task_id uuid references public.consultation_capability_tasks_v2(id) on delete set null,
  response_capability_task_id uuid references public.consultation_capability_tasks_v2(id) on delete set null,
  failure_code text,
  failure_message text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique(actual_service_id,slot),
  unique(user_id,submit_idempotency_key),
  check((photo_path is null and photo_fingerprint is null and photo_consent_at is null and photo_uploaded_at is null)
    or (photo_path is not null and photo_fingerprint is not null and photo_consent_at is not null and photo_uploaded_at is not null))
);
create index if not exists idx_aftercare_checkins_v2_owner
  on public.aftercare_checkins_v2(user_id,consultation_id,scheduled_for);
alter table public.aftercare_checkins_v2 enable row level security;
alter table public.aftercare_checkins_v2 force row level security;
revoke all on table public.aftercare_checkins_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.aftercare_checkins_v2 to service_role;

create or replace function public.ensure_aftercare_checkins_v2(
  p_user_id text,p_consultation_id uuid,p_actual_service_id uuid,p_limit integer,p_days integer[]
) returns setof public.aftercare_checkins_v2
language plpgsql security invoker set search_path='' as $$
declare v_service public.actual_services_v2%rowtype; v_grant_id uuid; v_day integer; v_slot integer:=0;
begin
  select * into v_service from public.actual_services_v2
    where id=p_actual_service_id and consultation_id=p_consultation_id and user_id=p_user_id;
  if not found then raise exception 'ACTUAL_SERVICE_NOT_FOUND' using errcode='P0002'; end if;
  select entitlement_grant_id into v_grant_id from public.consultation_sessions
    where id=p_consultation_id and user_id=p_user_id;
  foreach v_day in array p_days loop
    exit when v_slot>=greatest(0,least(p_limit,3));
    if v_day not in (30,60,90) then continue; end if;
    v_slot:=v_slot+1;
    insert into public.aftercare_checkins_v2(
      consultation_id,actual_service_id,entitlement_grant_id,user_id,slot,offset_days,scheduled_for
    ) values (
      p_consultation_id,p_actual_service_id,v_grant_id,p_user_id,v_slot,v_day,v_service.service_date+v_day
    ) on conflict(actual_service_id,slot) do nothing;
  end loop;
  return query select * from public.aftercare_checkins_v2
    where actual_service_id=p_actual_service_id and user_id=p_user_id order by slot;
end $$;
revoke execute on function public.ensure_aftercare_checkins_v2(text,uuid,uuid,integer,integer[]) from public,anon,authenticated;
grant execute on function public.ensure_aftercare_checkins_v2(text,uuid,uuid,integer,integer[]) to service_role;

create or replace function public.claim_aftercare_checkin_v2(
  p_user_id text,p_checkin_id uuid,p_idempotency_key text
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_checkin public.aftercare_checkins_v2%rowtype; v_grant_status text;
begin
  select * into v_checkin from public.aftercare_checkins_v2
    where id=p_checkin_id and user_id=p_user_id for update;
  if not found then raise exception 'AFTERCARE_CHECKIN_NOT_FOUND' using errcode='P0002'; end if;
  if v_checkin.scheduled_for>current_date then raise exception 'AFTERCARE_CHECKIN_LOCKED' using errcode='P0001'; end if;
  if v_checkin.state='ready' then return jsonb_build_object('claimed',false,'checkin',to_jsonb(v_checkin)); end if;
  if length(btrim(v_checkin.concern))=0 then raise exception 'AFTERCARE_CONCERN_REQUIRED' using errcode='22023'; end if;
  if v_checkin.photo_path is null or v_checkin.photo_consent_at is null then raise exception 'AFTERCARE_PHOTO_REQUIRED' using errcode='22023'; end if;
  if v_checkin.entitlement_grant_id is not null then
    select status into v_grant_status from public.customer_entitlement_grants_v2 where id=v_checkin.entitlement_grant_id;
    if v_grant_status='revoked' then raise exception 'AFTERCARE_ENTITLEMENT_REVOKED' using errcode='P0001'; end if;
  end if;
  if v_checkin.state='preparing' then return jsonb_build_object('claimed',false,'checkin',to_jsonb(v_checkin)); end if;
  update public.aftercare_checkins_v2 set
    state='preparing',submit_idempotency_key=p_idempotency_key,submitted_at=timezone('utc',now()),
    failure_code=null,failure_message=null,updated_at=timezone('utc',now())
    where id=p_checkin_id returning * into v_checkin;
  return jsonb_build_object('claimed',true,'checkin',to_jsonb(v_checkin));
end $$;
revoke execute on function public.claim_aftercare_checkin_v2(text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_aftercare_checkin_v2(text,uuid,text) to service_role;

create or replace function public.append_aftercare_checkin_cleanup_assets_v2()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_paths jsonb;
begin
  select coalesce(jsonb_agg('aftercare-photos:'||photo_path),'[]'::jsonb) into v_paths
    from public.aftercare_checkins_v2 where consultation_id=new.consultation_id and photo_path is not null;
  update public.consultation_asset_cleanup_outbox_v2
    set asset_paths=asset_paths||v_paths where id=new.id;
  update public.aftercare_checkins_v2 set photo_path=null,photo_fingerprint=null,photo_consent_at=null,photo_uploaded_at=null
    where consultation_id=new.consultation_id;
  return new;
end $$;
drop trigger if exists trg_append_aftercare_checkin_cleanup_assets_v2 on public.consultation_asset_cleanup_outbox_v2;
create trigger trg_append_aftercare_checkin_cleanup_assets_v2 after insert
on public.consultation_asset_cleanup_outbox_v2 for each row execute function public.append_aftercare_checkin_cleanup_assets_v2();

update public.product_prices_v2 set status='retired'
where offering_id in (select id from public.product_offerings_v2 where offering_key like 'full_style_%' and version=1);
update public.product_offerings_v2 set status='retired',updated_at=timezone('utc',now())
where offering_key in ('full_style_once','full_style_quarterly','full_style_annual') and version=1;

insert into public.product_offerings_v2(
  offering_key,version,internal_name,customer_name,description,purchase_mode,billing_interval,status,
  included_consultation_sessions,release_policy,capabilities
) values
('full_style_once',2,'Full Style Once V2','풀 스타일 1회',
 '풀코스 1회, 전체 재시작 1회와 시술 후 D+30 AI 사후상담 1회.',
 'one_time',null,'active',1,'full-style-v2',
 '{"acceptedHairPreviews":9,"watermarkGeneratedAssets":false,"hairRestartCount":1,"finalHairSelectionCount":1,"salonBrief":true,"aftercare":true,"aftercareConsultationCount":1,"checkInDays":[30],"personalColor":true,"personalColorMode":"precision","hairColor":true,"makeup":true,"aiNarrative":true,"pdf":true,"fashionPreviews":3,"fashionAdditionalPreviews":6,"beforeAfterComparison":false,"annualSummary":false,"annualArchive":false,"generatedAssetRetentionDays":60}'::jsonb),
('full_style_quarterly',2,'Full Style Quarterly V2','3개월 정기',
 '3개월마다 풀코스 1회, 전체 재시작 2회와 D+30, 60, 90 AI 사후상담.',
 'recurring','quarter','active',1,'full-style-v2',
 '{"acceptedHairPreviews":9,"watermarkGeneratedAssets":false,"hairRestartCount":2,"finalHairSelectionCount":1,"salonBrief":true,"aftercare":true,"aftercareConsultationCount":3,"checkInDays":[30,60,90],"personalColor":true,"personalColorMode":"precision","hairColor":true,"makeup":true,"aiNarrative":true,"pdf":true,"fashionPreviews":3,"fashionAdditionalPreviews":6,"beforeAfterComparison":false,"annualSummary":false,"annualArchive":false,"generatedAssetRetentionDays":90}'::jsonb),
('full_style_annual',2,'Full Style Annual V2','연간',
 '연 4회, 각 상담 전체 재시작 5회와 D+30, 60, 90 AI 사후상담.',
 'recurring','year','active',4,'full-style-v2',
 '{"acceptedHairPreviews":9,"watermarkGeneratedAssets":false,"hairRestartCount":5,"finalHairSelectionCount":1,"salonBrief":true,"aftercare":true,"aftercareConsultationCount":3,"checkInDays":[30,60,90],"personalColor":true,"personalColorMode":"precision","hairColor":true,"makeup":true,"aiNarrative":true,"pdf":true,"fashionPreviews":3,"fashionAdditionalPreviews":6,"beforeAfterComparison":true,"annualSummary":true,"annualArchive":true,"generatedAssetRetentionDays":365}'::jsonb)
on conflict(offering_key,version) do nothing;

insert into public.product_prices_v2(offering_id,version,provider,provider_product_id,currency,amount_minor,status,valid_from)
select id,2,'portone','hairfit-full-style-once-v2','KRW',59000,'active',timezone('utc',now())
from public.product_offerings_v2 where offering_key='full_style_once' and version=2
on conflict(offering_id,version,provider) do update set status='active',amount_minor=excluded.amount_minor;
insert into public.product_prices_v2(offering_id,version,provider,provider_product_id,currency,amount_minor,status,valid_from)
select id,2,'portone','hairfit-full-style-quarterly-v2','KRW',89000,'active',timezone('utc',now())
from public.product_offerings_v2 where offering_key='full_style_quarterly' and version=2
on conflict(offering_id,version,provider) do update set status='active',amount_minor=excluded.amount_minor;
insert into public.product_prices_v2(offering_id,version,provider,provider_product_id,currency,amount_minor,status,valid_from)
select id,2,'portone','hairfit-full-style-annual-v2','KRW',299000,'active',timezone('utc',now())
from public.product_offerings_v2 where offering_key='full_style_annual' and version=2
on conflict(offering_id,version,provider) do update set status='active',amount_minor=excluded.amount_minor;

-- HairFit full-style catalog, free demo, recurring contracts, restart and retention.
-- Additive only. Legacy Basic/Standard/Pro rows and active contracts remain untouched.

alter table public.consultation_sessions
  add column if not exists user_restart_count integer not null default 0 check (user_restart_count >= 0),
  add column if not exists user_restart_limit integer not null default 0 check (user_restart_limit >= 0),
  add column if not exists retention_expires_at timestamptz,
  add column if not exists retention_policy_days integer check (retention_policy_days in (7,60,90,365));

create index if not exists idx_consultation_sessions_retention_expiry
  on public.consultation_sessions(retention_expires_at)
  where retention_expires_at is not null;

create table if not exists public.full_style_contracts_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  offering_id uuid not null references public.product_offerings_v2(id) on delete restrict,
  offering_key text not null check (offering_key in ('full_style_once','full_style_quarterly','full_style_annual')),
  offering_version integer not null check (offering_version > 0),
  price_id uuid not null references public.product_prices_v2(id) on delete restrict,
  price_version integer not null check (price_version > 0),
  price_snapshot jsonb not null,
  capability_snapshot jsonb not null,
  status text not null default 'active' check (status in ('active','past_due','cancel_at_period_end','cancelled','expired','refunded','refund_review')),
  billing_interval text check (billing_interval in ('quarter','year')),
  period_started_at timestamptz not null,
  period_ends_at timestamptz,
  next_billing_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  provider text not null default 'portone',
  provider_contract_id text,
  billing_key_encrypted text,
  billing_key_hash text,
  billing_key_masked text,
  latest_payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  renewal_failure_count integer not null default 0 check (renewal_failure_count >= 0),
  renewal_last_failed_at timestamptz,
  renewal_next_retry_at timestamptz,
  renewal_failure_code text,
  renewal_failure_message text,
  renewal_claimed_until timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique(provider, provider_contract_id),
  check ((billing_interval is null and next_billing_at is null) or billing_interval is not null)
);

create table if not exists public.full_style_checkout_attempts_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  consultation_id uuid references public.consultation_sessions(id) on delete set null,
  offering_id uuid not null references public.product_offerings_v2(id) on delete restrict,
  offering_key text not null,
  offering_version integer not null,
  price_id uuid not null references public.product_prices_v2(id) on delete restrict,
  price_version integer not null,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null default 'KRW',
  purchase_mode text not null check (purchase_mode in ('one_time','recurring')),
  status text not null default 'prepared' check (status in ('prepared','paid','failed','cancelled')),
  provider_payment_id text not null unique,
  snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc',now()),
  completed_at timestamptz
);

create table if not exists public.consultation_restarts_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  reason text not null default 'user_requested' check (reason in ('user_requested','quality_recovery')),
  counts_toward_limit boolean not null,
  source_preview_board_id uuid references public.preview_boards_v2(id) on delete set null,
  replacement_preview_board_id uuid references public.preview_boards_v2(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now())
);
create unique index if not exists idx_consultation_restarts_one_user_restart
  on public.consultation_restarts_v2(consultation_id)
  where counts_toward_limit;

insert into public.product_offerings_v2(
  offering_key,version,internal_name,customer_name,description,purchase_mode,billing_interval,status,
  included_consultation_sessions,release_policy,capabilities
) values
(
  'free_hair_demo',1,'Free Hair Demo','무료 헤어 데모',
  '계정당 한 번 제공되는 사진 기반 간이 퍼스널 컬러와 워터마크 헤어 3x3 데모.',
  'one_time',null,'active',1,'free-demo-account-once',
  '{"acceptedHairPreviews":9,"watermarkGeneratedAssets":true,"hairRestartCount":0,"finalHairSelectionCount":0,"salonBrief":false,"aftercare":false,"checkInDays":[],"personalColor":true,"personalColorMode":"quick_photo","hairColor":false,"makeup":false,"aiNarrative":false,"pdf":false,"fashionPreviews":0,"fashionAdditionalPreviews":0,"beforeAfterComparison":false,"annualSummary":false,"annualArchive":false,"generatedAssetRetentionDays":7}'::jsonb
),
(
  'full_style_once',1,'Full Style Once','풀 스타일 1회',
  'HairFit 풀 스타일 컨설팅 1회.',
  'one_time',null,'active',1,'full-style-v1',
  '{"acceptedHairPreviews":9,"watermarkGeneratedAssets":false,"hairRestartCount":1,"finalHairSelectionCount":1,"salonBrief":true,"aftercare":true,"checkInDays":[],"personalColor":true,"personalColorMode":"precision","hairColor":true,"makeup":true,"aiNarrative":true,"pdf":true,"fashionPreviews":3,"fashionAdditionalPreviews":6,"beforeAfterComparison":false,"annualSummary":false,"annualArchive":false,"generatedAssetRetentionDays":60}'::jsonb
),
(
  'full_style_quarterly',1,'Full Style Quarterly','3개월 정기',
  '3개월 안에 HairFit 풀 스타일 컨설팅 1회와 완료 후 30, 60, 90일 체크인.',
  'recurring','quarter','active',1,'full-style-v1',
  '{"acceptedHairPreviews":9,"watermarkGeneratedAssets":false,"hairRestartCount":1,"finalHairSelectionCount":1,"salonBrief":true,"aftercare":true,"checkInDays":[30,60,90],"personalColor":true,"personalColorMode":"precision","hairColor":true,"makeup":true,"aiNarrative":true,"pdf":true,"fashionPreviews":3,"fashionAdditionalPreviews":6,"beforeAfterComparison":false,"annualSummary":false,"annualArchive":false,"generatedAssetRetentionDays":90}'::jsonb
),
(
  'full_style_annual',1,'Full Style Annual','연간',
  '연 4회 HairFit 풀 스타일 컨설팅과 매 회차 30, 60, 90일 체크인을 누적 비교하는 연간 스타일 아카이브.',
  'recurring','year','active',4,'full-style-v1',
  '{"acceptedHairPreviews":9,"watermarkGeneratedAssets":false,"hairRestartCount":1,"finalHairSelectionCount":1,"salonBrief":true,"aftercare":true,"checkInDays":[30,60,90],"personalColor":true,"personalColorMode":"precision","hairColor":true,"makeup":true,"aiNarrative":true,"pdf":true,"fashionPreviews":3,"fashionAdditionalPreviews":6,"beforeAfterComparison":true,"annualSummary":true,"annualArchive":true,"generatedAssetRetentionDays":365}'::jsonb
)
on conflict (offering_key,version) do update set
  customer_name=excluded.customer_name,
  description=excluded.description,
  purchase_mode=excluded.purchase_mode,
  billing_interval=excluded.billing_interval,
  included_consultation_sessions=excluded.included_consultation_sessions,
  release_policy=excluded.release_policy,
  capabilities=excluded.capabilities,
  updated_at=timezone('utc',now());

insert into public.product_prices_v2(offering_id,version,provider,provider_product_id,currency,amount_minor,status,valid_from)
select id,1,'manual','hairfit-free-demo-v1','KRW',0,'active',timezone('utc',now())
from public.product_offerings_v2 where offering_key='free_hair_demo' and version=1
on conflict (offering_id,version,provider) do update set amount_minor=excluded.amount_minor,status='active';

insert into public.product_prices_v2(offering_id,version,provider,provider_product_id,currency,amount_minor,status,valid_from)
select id,1,'portone','hairfit-full-style-once-v1','KRW',59000,'active',timezone('utc',now())
from public.product_offerings_v2 where offering_key='full_style_once' and version=1
on conflict (offering_id,version,provider) do update set amount_minor=excluded.amount_minor,status='active';

insert into public.product_prices_v2(offering_id,version,provider,provider_product_id,currency,amount_minor,status,valid_from)
select id,1,'portone','hairfit-full-style-quarterly-v1','KRW',89000,'active',timezone('utc',now())
from public.product_offerings_v2 where offering_key='full_style_quarterly' and version=1
on conflict (offering_id,version,provider) do update set amount_minor=excluded.amount_minor,status='active';

insert into public.product_prices_v2(offering_id,version,provider,provider_product_id,currency,amount_minor,status,valid_from)
select id,1,'portone','hairfit-full-style-annual-v1','KRW',299000,'active',timezone('utc',now())
from public.product_offerings_v2 where offering_key='full_style_annual' and version=1
on conflict (offering_id,version,provider) do update set amount_minor=excluded.amount_minor,status='active';

do $$ declare t text; begin
  foreach t in array array['full_style_contracts_v2','full_style_checkout_attempts_v2','consultation_restarts_v2'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on table public.%I to service_role',t);
  end loop;
end $$;

comment on table public.full_style_contracts_v2 is 'Versioned HairFit full-style contracts. Legacy user_subscriptions remain authoritative for grandfathered Basic/Standard/Pro customers.';
comment on column public.consultation_sessions.user_restart_count is 'Only user-requested restart counts here; automatic quality recovery never increments it.';

create or replace function public.claim_full_style_contract_renewals_v2(p_limit integer default 50)
returns setof public.full_style_contracts_v2
language plpgsql security invoker set search_path='' as $$
begin
  return query
  with due as (
    select c.id from public.full_style_contracts_v2 c
    where c.status in ('active','past_due') and not c.cancel_at_period_end
      and c.billing_interval is not null and c.next_billing_at<=timezone('utc',now())
      and (c.renewal_next_retry_at is null or c.renewal_next_retry_at<=timezone('utc',now()))
      and (c.renewal_claimed_until is null or c.renewal_claimed_until<=timezone('utc',now()))
    order by c.next_billing_at,c.id for update skip locked
    limit greatest(1,least(p_limit,100))
  )
  update public.full_style_contracts_v2 c set
    renewal_claimed_until=timezone('utc',now())+interval '10 minutes',
    updated_at=timezone('utc',now())
  from due where c.id=due.id returning c.*;
end $$;
revoke execute on function public.claim_full_style_contract_renewals_v2(integer) from public,anon,authenticated;
grant execute on function public.claim_full_style_contract_renewals_v2(integer) to service_role;


alter table public.consultation_sessions
  add column if not exists retention_cleanup_queued_at timestamptz;

create table if not exists public.consultation_asset_cleanup_outbox_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  asset_paths jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc',now()),
  completed_at timestamptz
);
alter table public.consultation_asset_cleanup_outbox_v2 enable row level security;
alter table public.consultation_asset_cleanup_outbox_v2 force row level security;
revoke all on table public.consultation_asset_cleanup_outbox_v2 from public,anon,authenticated;
grant select,insert,update,delete on table public.consultation_asset_cleanup_outbox_v2 to service_role;

create or replace function public.set_full_style_retention_expiry_v2()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.completed_at is not null and new.retention_policy_days is not null
     and (old.completed_at is distinct from new.completed_at or old.retention_policy_days is distinct from new.retention_policy_days) then
    new.retention_expires_at := new.completed_at + make_interval(days => new.retention_policy_days);
  end if;
  return new;
end $$;
drop trigger if exists trg_set_full_style_retention_expiry_v2 on public.consultation_sessions;
create trigger trg_set_full_style_retention_expiry_v2 before update of completed_at,retention_policy_days
on public.consultation_sessions for each row execute function public.set_full_style_retention_expiry_v2();

create or replace function public.queue_and_scrub_expired_consultation_results_v2(p_limit integer default 100)
returns integer language plpgsql security invoker set search_path='' as $$
declare v_session record; v_paths jsonb; v_count integer:=0;
begin
  for v_session in
    select id,user_id from public.consultation_sessions
    where retention_expires_at is not null and retention_expires_at<=timezone('utc',now())
      and retention_cleanup_queued_at is null
    order by retention_expires_at,id for update skip locked limit greatest(1,least(p_limit,500))
  loop
    select coalesce(jsonb_agg(distinct a.output_path) filter(where a.output_path is not null),'[]'::jsonb)
      into v_paths
      from public.preview_boards_v2 b
      join public.preview_variants_v2 v on v.board_id=b.id
      join public.generation_attempts_v2 a on a.preview_variant_id=v.id
      where b.consultation_id=v_session.id;
    insert into public.consultation_asset_cleanup_outbox_v2(consultation_id,user_id,asset_paths)
      values(v_session.id,v_session.user_id,v_paths) on conflict(consultation_id) do nothing;
    update public.generation_attempts_v2 a set output_path=null
      where exists (
        select 1 from public.preview_variants_v2 v
        join public.preview_boards_v2 b on b.id=v.board_id
        where v.id=a.preview_variant_id and b.consultation_id=v_session.id
      );
    update public.consultation_sessions set
      current_preview_board_id=null,selected_snapshot_id=null,
      snapshot=jsonb_set(jsonb_set(jsonb_set(snapshot,'{previews}','[]'::jsonb,true),'{fashionPreviews}','[]'::jsonb,true),'{result}','{"expired":true}'::jsonb,true),
      retention_cleanup_queued_at=timezone('utc',now()),updated_at=timezone('utc',now())
      where id=v_session.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.queue_and_scrub_expired_consultation_results_v2(integer) from public,anon,authenticated;
grant execute on function public.queue_and_scrub_expired_consultation_results_v2(integer) to service_role;

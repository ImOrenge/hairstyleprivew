-- ============================================================
-- Subscription + Hair Care System
-- Depends on: 202602090001_init_hairfit.sql
-- ============================================================

-- 1. payment_provider enum에 portone 추가
alter type public.payment_provider add value if not exists 'portone';

-- ============================================================
-- 2. 구독 상태 관리
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired'
    );
  end if;
end $$;

create table if not exists public.user_subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               text not null references public.users(id) on delete cascade,
  plan_key              text not null
                          check (plan_key in ('basic', 'standard', 'pro', 'salon')),
  status                public.subscription_status not null default 'active',
  -- PortOne 빌링키 (결제 갱신에 사용)
  pg_billing_key        text,
  -- PortOne 결제 식별자 (최근 결제 추적용)
  pg_latest_payment_id  text,
  credits_per_cycle     int not null check (credits_per_cycle > 0),
  current_period_start  timestamptz not null,
  current_period_end    timestamptz not null,
  cancel_at_period_end  boolean not null default false,
  canceled_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- 유저당 활성 구독 1개
  constraint user_subscriptions_user_id_key unique (user_id)
);

create index if not exists idx_user_subscriptions_status
  on public.user_subscriptions(status);

create index if not exists idx_user_subscriptions_period_end
  on public.user_subscriptions(current_period_end)
  where status = 'active';

drop trigger if exists trg_user_subscriptions_updated_at on public.user_subscriptions;
create trigger trg_user_subscriptions_updated_at
  before update on public.user_subscriptions
  for each row execute procedure public.set_updated_at();

-- payment_transactions에 subscription_id 컬럼 추가
alter table public.payment_transactions
  add column if not exists subscription_id uuid
    references public.user_subscriptions(id) on delete set null;

-- ============================================================
-- 3. 시술 기록 (재방문 유도의 핵심 데이터)
-- ============================================================
create table if not exists public.user_hair_records (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  text not null references public.users(id) on delete cascade,
  generation_id            uuid references public.generations(id) on delete set null,
  style_name               text not null check (char_length(style_name) <= 80),
  service_type             text not null
                             check (service_type in ('perm', 'color', 'cut', 'bleach', 'treatment', 'other')),
  service_date             date not null,
  -- 시술 유형별 권장 재방문일: perm=90, color=45, cut=30, bleach=40, treatment=30
  next_visit_target_days   int not null check (next_visit_target_days > 0),
  care_generated_at        timestamptz,
  created_at               timestamptz not null default now()
);

create index if not exists idx_user_hair_records_user_id
  on public.user_hair_records(user_id, created_at desc);

-- ============================================================
-- 4. AI 생성 케어 콘텐츠 (스케줄 이메일)
-- ============================================================
create table if not exists public.user_care_contents (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null references public.users(id) on delete cascade,
  hair_record_id      uuid not null references public.user_hair_records(id) on delete cascade,
  content_type        text not null
                        check (content_type in (
                          'dry_guide',      -- D+1
                          'day3_care',      -- D+3
                          'week1_tip',      -- D+7
                          'month1_revisit', -- D+30
                          'month1_trend',   -- D+45
                          'month3_cta'      -- D+90
                        )),
  day_offset          int not null check (day_offset > 0),
  subject             text not null,
  body_html           text not null,
  scheduled_send_at   timestamptz not null,
  sent_at             timestamptz,
  email_message_id    text,
  created_at          timestamptz not null default now()
);

-- Cron 쿼리 최적화: 오늘 발송할 미발송 콘텐츠 빠르게 조회
create index if not exists idx_user_care_contents_pending_send
  on public.user_care_contents(scheduled_send_at)
  where sent_at is null;

create index if not exists idx_user_care_contents_user_id
  on public.user_care_contents(user_id);

-- ============================================================
-- 5. 트렌드 알림 (구독 등급별 일괄 발송)
-- ============================================================
create table if not exists public.trend_alerts (
  id                  uuid primary key default gen_random_uuid(),
  season              text not null,       -- "2025-summer"
  target_plans        text[] not null default '{standard,pro,salon}',
  title               text not null,
  body_html           text not null,
  style_tags          text[] not null default '{}',
  scheduled_send_at   timestamptz not null,
  sent_count          int not null default 0,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_trend_alerts_pending_send
  on public.trend_alerts(scheduled_send_at)
  where sent_at is null;

-- ============================================================
-- 6. RPC: 구독 크레딧 지급 (월 갱신 시 호출)
-- ============================================================
create or replace function public.grant_subscription_credits(
  p_user_id        text,
  p_credits        int,
  p_subscription_id uuid,
  p_reason         text default 'subscription_renewal'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id bigint;
begin
  if p_credits is null or p_credits <= 0 then
    raise exception 'p_credits must be > 0';
  end if;

  -- grant_credits 재사용 (idempotent 처리는 caller 책임)
  v_ledger_id := public.grant_credits(
    p_user_id,
    p_credits,
    'grant',
    p_reason,
    jsonb_build_object('subscription_id', p_subscription_id),
    null  -- payment_transaction_id
  );

  return v_ledger_id;
end;
$$;

-- ============================================================
-- 7. RPC: 구독 월 갱신 (Cron에서 호출)
--    active 구독 중 period_end가 오늘 이내인 것을 갱신
-- ============================================================
create or replace function public.get_subscriptions_due_for_renewal(
  p_cutoff timestamptz default now() + interval '1 day'
)
returns table (
  subscription_id   uuid,
  user_id           text,
  plan_key          text,
  pg_billing_key    text,
  credits_per_cycle int,
  amount_krw        int
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.user_id,
    s.plan_key,
    s.pg_billing_key,
    s.credits_per_cycle,
    case s.plan_key
      when 'basic'    then 4900
      when 'standard' then 9900
      when 'pro'      then 19900
      when 'salon'    then 39900
      else 0
    end as amount_krw
  from public.user_subscriptions s
  where s.status = 'active'
    and s.cancel_at_period_end = false
    and s.current_period_end <= p_cutoff
    and s.pg_billing_key is not null;
$$;

-- ============================================================
-- 8. RPC: 구독 period 갱신 (결제 성공 후 호출)
-- ============================================================
create or replace function public.advance_subscription_period(
  p_subscription_id    uuid,
  p_payment_id         text,
  p_new_period_start   timestamptz,
  p_new_period_end     timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_subscriptions
  set
    current_period_start  = p_new_period_start,
    current_period_end    = p_new_period_end,
    pg_latest_payment_id  = p_payment_id,
    status                = 'active',
    updated_at            = now()
  where id = p_subscription_id;

  if not found then
    raise exception 'subscription not found: %', p_subscription_id;
  end if;
end;
$$;

-- ============================================================
-- 9. 권한 설정
-- ============================================================
revoke all on function public.grant_subscription_credits(text, int, uuid, text) from public;
revoke all on function public.get_subscriptions_due_for_renewal(timestamptz) from public;
revoke all on function public.advance_subscription_period(uuid, text, timestamptz, timestamptz) from public;

grant execute on function public.grant_subscription_credits(text, int, uuid, text)              to service_role;
grant execute on function public.get_subscriptions_due_for_renewal(timestamptz)                 to service_role;
grant execute on function public.advance_subscription_period(uuid, text, timestamptz, timestamptz) to service_role;

grant select, insert, update on public.user_subscriptions  to service_role;
grant select, insert         on public.user_hair_records    to service_role;
grant select, insert, update on public.user_care_contents   to service_role;
grant select, insert, update on public.trend_alerts         to service_role;

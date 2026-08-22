-- HairFit formal-launch email campaigns and cohort-bound promotion grants.
create extension if not exists citext;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_entitlement_grants_v2'::regclass
      and conname = 'customer_entitlement_grants_v2_source_check'
  ) then
    alter table public.customer_entitlement_grants_v2
      drop constraint customer_entitlement_grants_v2_source_check;
  end if;
  alter table public.customer_entitlement_grants_v2
    add constraint customer_entitlement_grants_v2_source_check
    check (source in ('portone','google_play','manual','legacy_credit_bridge','promotion'));
end $$;

create table if not exists public.marketing_email_preferences_v2 (
  user_id text primary key references public.users(id) on delete cascade,
  status text not null default 'unknown' check (status in ('unknown','opted_in','opted_out')),
  policy_version text not null default 'marketing-email-consent-2026-08-22-v1',
  source text not null default 'migration' check (source in ('migration','signup','mypage','unsubscribe','admin_suppression','provider')),
  consented_at timestamptz,
  withdrawn_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaigns_v2 (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null unique,
  campaign_type text not null check (campaign_type in ('service_notice','promotion')),
  template_version text not null check (template_version in ('service-premium-update-v1','official-launch-promotion-v1')),
  name text not null,
  subject text not null,
  preheader text not null,
  promotion_code text,
  offering_id uuid references public.product_offerings_v2(id) on delete restrict,
  offering_key text,
  offering_version integer,
  capability_snapshot jsonb,
  eligibility_cutoff timestamptz not null,
  claim_starts_at timestamptz,
  claim_ends_at timestamptz,
  grant_valid_days integer not null default 30 check (grant_valid_days between 1 and 365),
  scheduled_at timestamptz,
  frozen_at timestamptz,
  test_sent_at timestamptz,
  status text not null default 'draft' check (status in ('draft','audience_ready','scheduled','sending','paused','completed','cancelled')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (campaign_type = 'promotion' and promotion_code is not null and offering_id is not null and offering_key = 'full_style_once'
      and claim_starts_at is not null and eligibility_cutoff < claim_starts_at and claim_ends_at > claim_starts_at)
    or
    (campaign_type = 'service_notice' and promotion_code is null)
  )
);

create unique index if not exists uq_email_campaigns_v2_promotion_code
  on public.email_campaigns_v2 (upper(replace(promotion_code, '-', '')))
  where promotion_code is not null and status <> 'cancelled';

create table if not exists public.email_campaign_recipients_v2 (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns_v2(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  recipient_email citext not null,
  consent_status text not null check (consent_status in ('unknown','opted_in','opted_out')),
  delivery_eligible boolean not null default false,
  suppression_reason text,
  subject text,
  html_body text,
  text_body text,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  status text not null default 'in_app_only' check (status in ('in_app_only','pending','claimed','provider_accepted','delivered','retry_wait','delivery_unknown','bounced','dead_letter','cancelled')),
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_attempted_at timestamptz,
  provider_message_id text,
  provider_last_event text,
  provider_last_event_at timestamptz,
  last_error_kind text,
  last_error text,
  delivered_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create index if not exists idx_email_campaign_recipients_v2_claim
  on public.email_campaign_recipients_v2(status, available_at, id);
create unique index if not exists uq_email_campaign_recipients_v2_provider
  on public.email_campaign_recipients_v2(provider_message_id) where provider_message_id is not null;

create table if not exists public.email_campaign_webhook_events_v2 (
  id uuid primary key default gen_random_uuid(),
  svix_id text not null unique,
  event_type text not null,
  provider_message_id text not null,
  provider_created_at timestamptz,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create table if not exists public.promotion_redemptions_v2 (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns_v2(id) on delete restrict,
  user_id text not null references public.users(id) on delete restrict,
  grant_id uuid not null references public.customer_entitlement_grants_v2(id) on delete restrict,
  idempotency_key text not null,
  redeemed_at timestamptz not null default now(),
  unique (campaign_id, user_id),
  unique (user_id, idempotency_key)
);

create or replace function public.capture_signup_marketing_consent_v2(p_user_id text,p_policy_version text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_policy_version <> 'marketing-email-consent-2026-08-22-v1' then
    raise exception 'marketing_consent_policy_mismatch';
  end if;
  insert into public.marketing_email_preferences_v2(user_id,status,policy_version,source,consented_at,withdrawn_at,updated_at)
  values(p_user_id,'opted_in',p_policy_version,'signup',now(),null,now())
  on conflict(user_id) do update
    set status='opted_in',policy_version=excluded.policy_version,source='signup',consented_at=coalesce(public.marketing_email_preferences_v2.consented_at,now()),withdrawn_at=null,updated_at=now()
    where public.marketing_email_preferences_v2.status='unknown';
  return true;
end;
$$;

create or replace function public.freeze_email_campaign_audience_v2(p_campaign_id uuid, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.email_campaigns_v2%rowtype;
  v_total integer;
  v_deliverable integer;
begin
  select * into v_campaign from public.email_campaigns_v2 where id = p_campaign_id for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if v_campaign.status not in ('draft','audience_ready') then raise exception 'campaign_audience_is_immutable'; end if;

  delete from public.email_campaign_recipients_v2 where campaign_id = p_campaign_id;
  insert into public.email_campaign_recipients_v2(
    campaign_id,user_id,recipient_email,consent_status,delivery_eligible,suppression_reason,status,available_at
  )
  select v_campaign.id, users.id, users.email,
    coalesce(pref.status,'unknown'),
    case
      when users.email::text !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then false
      when pref.suppressed_at is not null then false
      when v_campaign.campaign_type = 'promotion' then coalesce(pref.status,'unknown') = 'opted_in'
      else true
    end,
    case
      when users.email::text !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then 'invalid_email'
      when pref.suppressed_at is not null then coalesce(pref.suppression_reason,'suppressed')
      when v_campaign.campaign_type = 'promotion' and coalesce(pref.status,'unknown') <> 'opted_in' then 'marketing_consent_required'
      else null
    end,
    case
      when users.email::text ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       and pref.suppressed_at is null
       and (v_campaign.campaign_type = 'service_notice' or coalesce(pref.status,'unknown') = 'opted_in')
      then 'pending' else 'in_app_only'
    end,
    coalesce(v_campaign.scheduled_at, now())
  from public.users as users
  left join public.marketing_email_preferences_v2 as pref on pref.user_id = users.id
  where users.created_at <= v_campaign.eligibility_cutoff
    and coalesce(users.account_type::text,'member') = 'member'
    and (
      v_campaign.campaign_type = 'promotion'
      or exists (
        select 1 from public.customer_entitlement_grants_v2 as entitlement_grant
        where entitlement_grant.user_id = users.id and entitlement_grant.offering_key like 'full_style_%'
          and entitlement_grant.status in ('active','exhausted')
      )
    );

  update public.email_campaigns_v2
    set status = 'audience_ready', frozen_at = now(), updated_at = now()
    where id = p_campaign_id;
  select count(*), count(*) filter (where delivery_eligible)
    into v_total, v_deliverable from public.email_campaign_recipients_v2 where campaign_id = p_campaign_id;
  return jsonb_build_object('total',v_total,'emailEligible',v_deliverable,'inAppOnly',v_total-v_deliverable,'actor',p_actor);
end;
$$;

create or replace function public.schedule_email_campaign_v2(p_campaign_id uuid, p_scheduled_at timestamptz, p_actor text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text;
begin
  if p_scheduled_at <= now() then raise exception 'future_schedule_required'; end if;
  select status into v_status from public.email_campaigns_v2 where id=p_campaign_id for update;
  if v_status <> 'audience_ready' then raise exception 'audience_not_ready'; end if;
  if not exists(select 1 from public.email_campaigns_v2 where id=p_campaign_id and test_sent_at is not null) then raise exception 'test_send_required'; end if;
  if exists(select 1 from public.email_campaign_recipients_v2 where campaign_id=p_campaign_id and delivery_eligible and (html_body is null or text_body is null)) then raise exception 'recipient_render_incomplete'; end if;
  update public.email_campaigns_v2 set status='scheduled',scheduled_at=p_scheduled_at,updated_at=now() where id=p_campaign_id;
  update public.email_campaign_recipients_v2 set available_at=p_scheduled_at,updated_at=now() where campaign_id=p_campaign_id and status='pending';
  return 'scheduled';
end;
$$;

create or replace function public.get_email_campaign_recipient_counts_v2(p_campaign_ids uuid[])
returns table(campaign_id uuid,status text,delivery_eligible boolean,recipient_count bigint)
language sql
security definer
set search_path=''
as $$
  select recipient.campaign_id,recipient.status,recipient.delivery_eligible,count(*)
  from public.email_campaign_recipients_v2 as recipient
  where recipient.campaign_id=any(coalesce(p_campaign_ids,array[]::uuid[]))
  group by recipient.campaign_id,recipient.status,recipient.delivery_eligible;
$$;

create or replace function public.claim_email_campaign_outbox_v2(p_limit integer default 25, p_lease_seconds integer default 300, p_recipient_email text default null)
returns table(outbox_id uuid,recipient_email text,subject text,html_body text,text_body text,idempotency_key text,attempt_count integer,lease_token uuid,unsubscribe_token uuid,campaign_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_limit integer := greatest(1,least(coalesce(p_limit,25),100)); v_lease integer := greatest(60,least(coalesce(p_lease_seconds,300),900));
begin
  update public.email_campaigns_v2 set status='sending',updated_at=now()
    where status='scheduled' and scheduled_at<=now();
  update public.email_campaign_recipients_v2 set
    status=case when provider_attempted_at is null then 'retry_wait' else 'delivery_unknown' end,
    available_at=now(), terminal_at=case when provider_attempted_at is null then null else now() end,
    last_error_kind=case when provider_attempted_at is null then 'lease_expired_before_provider' else 'lease_expired_after_provider' end,
    lease_token=null,lease_expires_at=null,updated_at=now()
  where status='claimed' and lease_expires_at<=now();
  return query
  with candidates as (
    select recipient.id from public.email_campaign_recipients_v2 as recipient
    join public.email_campaigns_v2 as campaign on campaign.id=recipient.campaign_id
    left join public.marketing_email_preferences_v2 as pref on pref.user_id=recipient.user_id
    where recipient.status in ('pending','retry_wait') and recipient.delivery_eligible
      and recipient.available_at<=now() and campaign.status in ('scheduled','sending')
      and (campaign.campaign_type='service_notice' or (pref.status='opted_in' and pref.suppressed_at is null))
      and (p_recipient_email is null or recipient.recipient_email=p_recipient_email::citext)
    order by recipient.available_at,recipient.id limit v_limit for update of recipient skip locked
  ), claimed as (
    update public.email_campaign_recipients_v2 as recipient set status='claimed',attempt_count=recipient.attempt_count+1,
      lease_token=extensions.gen_random_uuid(),lease_expires_at=now()+make_interval(secs=>v_lease),provider_attempted_at=null,updated_at=now()
    from candidates where recipient.id=candidates.id returning recipient.*
  )
  select claimed.id,claimed.recipient_email::text,claimed.subject,claimed.html_body,claimed.text_body,
    'campaign:'||claimed.campaign_id::text||':'||claimed.id::text||':v1',claimed.attempt_count,claimed.lease_token,claimed.unsubscribe_token,
    campaign.campaign_type
  from claimed
  join public.email_campaigns_v2 as campaign on campaign.id=claimed.campaign_id;
end;
$$;

create or replace function public.begin_email_campaign_provider_attempt_v2(p_outbox_id uuid,p_lease_token uuid)
returns boolean language sql security definer set search_path='' as $$
  with changed as (
    update public.email_campaign_recipients_v2 as recipient set provider_attempted_at=now(),updated_at=now()
    from public.email_campaigns_v2 as campaign
    where recipient.id=p_outbox_id and recipient.campaign_id=campaign.id
      and recipient.status='claimed' and recipient.lease_token=p_lease_token and recipient.lease_expires_at>now()
      and campaign.status in ('scheduled','sending')
      and (campaign.campaign_type='service_notice' or exists(
        select 1 from public.marketing_email_preferences_v2 as pref
        where pref.user_id=recipient.user_id and pref.status='opted_in' and pref.suppressed_at is null
      ))
    returning 1
  )
  select exists(select 1 from changed);
$$;

create or replace function public.complete_email_campaign_provider_attempt_v2(p_outbox_id uuid,p_lease_token uuid,p_provider_message_id text default null,p_error_kind text default null,p_error text default null,p_retryable boolean default false,p_delivery_unknown boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare v_row public.email_campaign_recipients_v2%rowtype; v_status text;
begin
  select * into v_row from public.email_campaign_recipients_v2 where id=p_outbox_id for update;
  if not found or v_row.status<>'claimed' or v_row.lease_token<>p_lease_token or v_row.lease_expires_at<=now() then return 'stale_lease'; end if;
  v_status:=case when p_provider_message_id is not null then 'provider_accepted'
    when p_delivery_unknown then 'delivery_unknown'
    when p_retryable and v_row.attempt_count<v_row.max_attempts then 'retry_wait' else 'dead_letter' end;
  update public.email_campaign_recipients_v2 set status=v_status,provider_message_id=coalesce(p_provider_message_id,provider_message_id),
    provider_last_event=case when p_provider_message_id is not null then 'email.accepted' else provider_last_event end,
    provider_last_event_at=case when p_provider_message_id is not null then now() else provider_last_event_at end,
    available_at=case when v_status='retry_wait' then now()+make_interval(secs=>least(21600,60*power(2,greatest(0,v_row.attempt_count-1))::integer)) else available_at end,
    last_error_kind=p_error_kind,last_error=left(p_error,2000),lease_token=null,lease_expires_at=null,
    terminal_at=case when v_status in ('delivery_unknown','dead_letter') then now() else null end,updated_at=now()
  where id=p_outbox_id;
  return v_status;
end;
$$;

create or replace function public.record_email_campaign_webhook_v2(p_svix_id text,p_event_type text,p_provider_message_id text,p_provider_created_at timestamptz,p_payload jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_inserted integer; v_event_at timestamptz:=coalesce(p_provider_created_at,now()); v_user_id text;
begin
  if not exists (
    select 1
    from public.email_campaign_recipients_v2
    where provider_message_id = p_provider_message_id
  ) then
    return false;
  end if;
  insert into public.email_campaign_webhook_events_v2(svix_id,event_type,provider_message_id,provider_created_at,payload)
  values(p_svix_id,p_event_type,p_provider_message_id,p_provider_created_at,p_payload) on conflict(svix_id) do nothing;
  get diagnostics v_inserted=row_count; if v_inserted=0 then return false; end if;
  update public.email_campaign_recipients_v2 set
    provider_last_event=case when provider_last_event_at is null or v_event_at>=provider_last_event_at then p_event_type else provider_last_event end,
    provider_last_event_at=greatest(coalesce(provider_last_event_at,'-infinity'::timestamptz),v_event_at),
    status=case when p_event_type='email.delivered' then 'delivered'
      when p_event_type in ('email.bounced','email.failed','email.suppressed') and status<>'delivered' then 'bounced'
      when p_event_type in ('email.accepted','email.delayed') and status in ('provider_accepted','claimed') then 'provider_accepted' else status end,
    delivered_at=case when p_event_type='email.delivered' then v_event_at else delivered_at end,
    terminal_at=case when p_event_type in ('email.delivered','email.bounced','email.failed','email.suppressed') then v_event_at else terminal_at end,
    lease_token=case when status='claimed' then null else lease_token end,lease_expires_at=case when status='claimed' then null else lease_expires_at end,updated_at=now()
  where provider_message_id=p_provider_message_id returning user_id into v_user_id;
  if v_user_id is not null and p_event_type in ('email.bounced','email.failed','email.suppressed') then
    insert into public.marketing_email_preferences_v2(user_id,status,source,suppressed_at,suppression_reason,updated_at)
    values(v_user_id,'unknown','provider',v_event_at,p_event_type,now())
    on conflict(user_id) do update set suppressed_at=v_event_at,suppression_reason=p_event_type,source='provider',updated_at=now();
  end if;
  update public.email_campaigns_v2 as campaign set status='completed',updated_at=now()
    where campaign.id in (select recipient.campaign_id from public.email_campaign_recipients_v2 as recipient where recipient.provider_message_id=p_provider_message_id)
      and campaign.status='sending'
      and not exists(select 1 from public.email_campaign_recipients_v2 as pending where pending.campaign_id=campaign.id and pending.delivery_eligible and pending.status not in ('delivered','bounced','dead_letter','cancelled'));
  return true;
end;
$$;

create or replace function public.admin_email_campaign_action_v2(p_campaign_id uuid,p_action text,p_actor text)
returns text language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
  select status into v_status from public.email_campaigns_v2 where id=p_campaign_id for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if p_action='pause' and v_status in ('scheduled','sending') then v_status:='paused';
  elsif p_action='resume' and v_status='paused' then v_status:='scheduled';
  elsif p_action='cancel' and v_status not in ('completed','cancelled') then v_status:='cancelled';
  elsif p_action='retry' and v_status in ('scheduled','sending','paused') then
    update public.email_campaign_recipients_v2 set status='pending',available_at=now(),terminal_at=null,provider_attempted_at=null,last_error_kind='operator_retry',updated_at=now()
      where campaign_id=p_campaign_id and status in ('dead_letter','delivery_unknown','bounced');
  else raise exception 'campaign_action_not_allowed'; end if;
  update public.email_campaigns_v2 set status=v_status,updated_at=now() where id=p_campaign_id;
  if v_status='cancelled' then update public.email_campaign_recipients_v2 set status='cancelled',terminal_at=now(),updated_at=now() where campaign_id=p_campaign_id and status in ('pending','retry_wait','claimed'); end if;
  return v_status;
end;
$$;

create or replace function public.redeem_launch_promotion_v2(p_user_id text,p_code text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_campaign public.email_campaigns_v2%rowtype; v_grant_id uuid; v_redemption_id uuid; v_existing public.promotion_redemptions_v2%rowtype;
begin
  if length(coalesce(p_idempotency_key,''))<8 then raise exception 'invalid_idempotency_key'; end if;
  select campaign.* into v_campaign from public.email_campaigns_v2 as campaign
  join public.email_campaign_recipients_v2 as recipient on recipient.campaign_id=campaign.id and recipient.user_id=p_user_id
  where campaign.campaign_type='promotion' and campaign.status in ('audience_ready','scheduled','sending','paused','completed')
    and upper(replace(campaign.promotion_code,'-',''))=upper(replace(trim(p_code),'-',''))
    and now() between campaign.claim_starts_at and campaign.claim_ends_at
  order by campaign.claim_starts_at desc limit 1 for update of campaign;
  if not found then raise exception 'promotion_not_eligible'; end if;
  select * into v_existing from public.promotion_redemptions_v2 where campaign_id=v_campaign.id and user_id=p_user_id;
  if found then return jsonb_build_object('redemptionId',v_existing.id,'grantId',v_existing.grant_id,'replayed',true); end if;
  insert into public.customer_entitlement_grants_v2(user_id,offering_id,offering_key,offering_version,capability_snapshot,quantity_granted,quantity_consumed,status,source,source_transaction_id,valid_from,expires_at)
  values(p_user_id,v_campaign.offering_id,v_campaign.offering_key,v_campaign.offering_version,v_campaign.capability_snapshot,1,0,'active','promotion','promotion:'||v_campaign.id::text||':'||p_user_id,now(),now()+make_interval(days=>v_campaign.grant_valid_days))
  on conflict(source,source_transaction_id,offering_key) do update
    set source_transaction_id=excluded.source_transaction_id
    returning id into v_grant_id;
  insert into public.promotion_redemptions_v2(campaign_id,user_id,grant_id,idempotency_key)
  values(v_campaign.id,p_user_id,v_grant_id,p_idempotency_key) returning id into v_redemption_id;
  return jsonb_build_object('redemptionId',v_redemption_id,'grantId',v_grant_id,'replayed',false,'expiresAt',now()+make_interval(days=>v_campaign.grant_valid_days));
end;
$$;

create or replace function public.unsubscribe_marketing_email_v2(p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user_id text;
begin
  select user_id into v_user_id from public.email_campaign_recipients_v2 where unsubscribe_token=p_token;
  if not found then return false; end if;
  insert into public.marketing_email_preferences_v2(user_id,status,source,withdrawn_at,updated_at)
  values(v_user_id,'opted_out','unsubscribe',now(),now()) on conflict(user_id) do update
    set status='opted_out',source='unsubscribe',withdrawn_at=now(),updated_at=now();
  update public.email_campaign_recipients_v2 as recipient set status='cancelled',terminal_at=now(),updated_at=now()
  from public.email_campaigns_v2 as campaign where recipient.campaign_id=campaign.id and recipient.user_id=v_user_id
    and campaign.campaign_type='promotion' and recipient.status in ('pending','retry_wait');
  return true;
end;
$$;

do $$ declare t text; begin
  foreach t in array array['marketing_email_preferences_v2','email_campaigns_v2','email_campaign_recipients_v2','email_campaign_webhook_events_v2','promotion_redemptions_v2'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from anon,authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;

revoke all on function public.freeze_email_campaign_audience_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.capture_signup_marketing_consent_v2(text,text) from public,anon,authenticated;
revoke all on function public.schedule_email_campaign_v2(uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.get_email_campaign_recipient_counts_v2(uuid[]) from public,anon,authenticated;
revoke all on function public.claim_email_campaign_outbox_v2(integer,integer,text) from public,anon,authenticated;
revoke all on function public.begin_email_campaign_provider_attempt_v2(uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_email_campaign_provider_attempt_v2(uuid,uuid,text,text,text,boolean,boolean) from public,anon,authenticated;
revoke all on function public.record_email_campaign_webhook_v2(text,text,text,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.admin_email_campaign_action_v2(uuid,text,text) from public,anon,authenticated;
revoke all on function public.redeem_launch_promotion_v2(text,text,text) from public,anon,authenticated;
revoke all on function public.unsubscribe_marketing_email_v2(uuid) from public,anon,authenticated;
grant execute on function public.freeze_email_campaign_audience_v2(uuid,text) to service_role;
grant execute on function public.capture_signup_marketing_consent_v2(text,text) to service_role;
grant execute on function public.schedule_email_campaign_v2(uuid,timestamptz,text) to service_role;
grant execute on function public.get_email_campaign_recipient_counts_v2(uuid[]) to service_role;
grant execute on function public.claim_email_campaign_outbox_v2(integer,integer,text) to service_role;
grant execute on function public.begin_email_campaign_provider_attempt_v2(uuid,uuid) to service_role;
grant execute on function public.complete_email_campaign_provider_attempt_v2(uuid,uuid,text,text,text,boolean,boolean) to service_role;
grant execute on function public.record_email_campaign_webhook_v2(text,text,text,timestamptz,jsonb) to service_role;
grant execute on function public.admin_email_campaign_action_v2(uuid,text,text) to service_role;
grant execute on function public.redeem_launch_promotion_v2(text,text,text) to service_role;
grant execute on function public.unsubscribe_marketing_email_v2(uuid) to service_role;

create or replace function public.authorize_email_campaign_cron_request_v2(p_bearer text)
returns boolean language sql security definer set search_path='' as $$
  select exists(select 1 from vault.decrypted_secrets where name='email_campaign_dispatch_bearer'
    and length(coalesce(p_bearer,''))>=32 and decrypted_secret=p_bearer);
$$;
revoke all on function public.authorize_email_campaign_cron_request_v2(text) from public,anon,authenticated;
grant execute on function public.authorize_email_campaign_cron_request_v2(text) to service_role;

create or replace function public.configure_email_campaign_cron_v2()
returns bigint language plpgsql security definer set search_path='' as $$
declare v_url text;v_bearer text;v_job_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='email_campaign_dispatch_url';
  select decrypted_secret into v_bearer from vault.decrypted_secrets where name='email_campaign_dispatch_bearer';
  if nullif(v_url,'') is null or nullif(v_bearer,'') is null then raise exception 'email_campaign_cron_vault_secrets_missing'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname='cron-email-campaigns';
  select cron.schedule('cron-email-campaigns','*/5 * * * *',format($job$select net.http_post(url := %L, headers := jsonb_build_object('Authorization', %L, 'Content-Type','application/json'), body := '{}'::jsonb);$job$,v_url,'Bearer '||v_bearer)) into v_job_id;
  return v_job_id;
end;
$$;
revoke all on function public.configure_email_campaign_cron_v2() from public,anon,authenticated;
grant execute on function public.configure_email_campaign_cron_v2() to service_role;

-- Add brand partnership inquiries to the existing B2B lead CRM without
-- changing the salon-adoption contract.

create schema if not exists private;
revoke all on schema private from public;
revoke usage on schema private from anon, authenticated;
grant usage on schema private to service_role;

alter table public.b2b_leads
  add column if not exists lead_kind text not null default 'salon_adoption'
    check (lead_kind in ('salon_adoption', 'brand_partnership')),
  add column if not exists partnership_type text
    check (partnership_type is null or partnership_type in ('advertising', 'branded_content', 'joint_campaign', 'other')),
  add column if not exists company_website text,
  add column if not exists campaign_goal text,
  add column if not exists target_audience text,
  add column if not exists reference_url text,
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists privacy_retention_expires_at timestamptz;

alter table public.b2b_leads
  add constraint b2b_leads_company_website_http_check
    check (company_website is null or company_website ~* '^https?://'),
  add constraint b2b_leads_reference_url_http_check
    check (reference_url is null or reference_url ~* '^https?://'),
  add constraint b2b_leads_brand_partnership_fields_check
    check (
      lead_kind = 'salon_adoption'
      or (
        partnership_type is not null
        and campaign_goal is not null
        and char_length(trim(campaign_goal)) between 5 and 500
        and desired_timeline is not null
        and desired_timeline in ('1개월 이내', '1–3개월', '3–6개월', '6개월 이후', '협의 중')
        and budget_range is not null
        and budget_range in ('300만원 미만', '300만–1천만원', '1천만–3천만원', '3천만원 이상', '협의 중')
        and privacy_consent_at is not null
        and privacy_retention_expires_at is not null
        and privacy_retention_expires_at = privacy_consent_at + interval '1 year'
      )
    );

comment on column public.b2b_leads.lead_kind is
  'Distinguishes the legacy salon adoption funnel from public brand partnership inquiries.';
comment on column public.b2b_leads.privacy_retention_expires_at is
  'Deletion eligibility timestamp for non-contracted brand partnership inquiries.';

create or replace function private.set_brand_partnership_retention()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.lead_kind = 'brand_partnership' then
    if new.privacy_consent_at is null then
      raise exception 'privacy consent timestamp is required for brand partnerships';
    end if;
    new.privacy_retention_expires_at := new.privacy_consent_at + interval '1 year';
  end if;
  return new;
end;
$$;

revoke all on function private.set_brand_partnership_retention()
  from public, anon, authenticated;
grant execute on function private.set_brand_partnership_retention()
  to service_role;

drop trigger if exists trg_b2b_leads_brand_partnership_retention on public.b2b_leads;
create trigger trg_b2b_leads_brand_partnership_retention
before insert or update of lead_kind, privacy_consent_at
on public.b2b_leads
for each row execute function private.set_brand_partnership_retention();

create index if not exists idx_b2b_leads_kind_stage_created_at
  on public.b2b_leads (lead_kind, stage, created_at desc);

create index if not exists idx_b2b_brand_partnership_retention_due
  on public.b2b_leads (privacy_retention_expires_at, id)
  where lead_kind = 'brand_partnership' and stage <> 'contracted';

alter table public.b2b_leads enable row level security;
revoke all on table public.b2b_leads from anon, authenticated;

create or replace function private.apply_brand_partnership_lead_retention(
  p_limit integer default 500,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'p_limit must be between 1 and 500';
  end if;
  if p_now is null then
    raise exception 'p_now is required';
  end if;

  with candidates as (
    select lead.id
      from public.b2b_leads as lead
     where lead.lead_kind = 'brand_partnership'
       and lead.stage <> 'contracted'
       and lead.privacy_retention_expires_at <= p_now
     order by lead.privacy_retention_expires_at, lead.id
     limit p_limit
     for update skip locked
  )
  delete from public.b2b_leads as lead
   using candidates
   where lead.id = candidates.id;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'deleted', v_deleted,
    'limit', p_limit,
    'retentionDays', 365
  );
end;
$$;

comment on function private.apply_brand_partnership_lead_retention(integer, timestamptz) is
  'Deletes up to 500 expired non-contracted brand partnership inquiries.';

revoke all on function private.apply_brand_partnership_lead_retention(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function private.apply_brand_partnership_lead_retention(integer, timestamptz)
  to service_role;

create or replace function public.apply_brand_partnership_lead_retention(
  p_limit integer default 500,
  p_now timestamptz default now()
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.apply_brand_partnership_lead_retention(p_limit, p_now);
$$;

comment on function public.apply_brand_partnership_lead_retention(integer, timestamptz) is
  'Service-role entrypoint for the private brand partnership retention worker.';

revoke all on function public.apply_brand_partnership_lead_retention(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_brand_partnership_lead_retention(integer, timestamptz)
  to service_role;

-- Register the 03:43 UTC daily cleanup when pg_cron exists. The same public
-- wrapper remains available for explicit service-role drains without pg_cron.
do $$
declare
  v_cron_schema name;
begin
  select namespace.nspname
    into v_cron_schema
    from pg_namespace as namespace
   where namespace.nspname = 'cron'
     and to_regclass('cron.job') is not null;

  if v_cron_schema is not null then
    execute format(
      'select %1$I.unschedule(jobid) from %1$I.job where jobname = %2$L',
      v_cron_schema,
      'brand-partnership-lead-retention-daily'
    );
    execute format(
      'select %1$I.schedule(%2$L, %3$L, %4$L)',
      v_cron_schema,
      'brand-partnership-lead-retention-daily',
      '43 3 * * *',
      'select public.apply_brand_partnership_lead_retention(500, now());'
    );
  end if;
end;
$$;

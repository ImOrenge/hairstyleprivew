\set ON_ERROR_STOP on

begin;

do $$
declare
  v_now timestamptz := '2026-08-26 12:00:00+00';
  v_result jsonb;
  v_count integer;
begin
  insert into public.b2b_leads (
    id, company_name, contact_name, email, message, stage, source, lead_kind,
    partnership_type, campaign_goal, desired_timeline, budget_range,
    privacy_consent_at
  ) values
    ('86000000-0000-4000-8000-000000000001', 'Expired Brand', '담당자', 'expired-brand@example.test', '만료된 브랜드 제휴 문의입니다.', 'new', 'public_form', 'brand_partnership', 'advertising', '신제품 인지도를 높이는 캠페인', '1–3개월', '300만–1천만원', v_now - interval '1 year 1 day'),
    ('86000000-0000-4000-8000-000000000002', 'Active Brand', '담당자', 'active-brand@example.test', '아직 보유 기간 내 브랜드 문의입니다.', 'qualified', 'public_form', 'brand_partnership', 'branded_content', '스타일 콘텐츠 공동 제작', '3–6개월', '1천만–3천만원', v_now - interval '364 days'),
    ('86000000-0000-4000-8000-000000000003', 'Contracted Brand', '담당자', 'contracted-brand@example.test', '계약 완료 브랜드 제휴 문의입니다.', 'contracted', 'public_form', 'brand_partnership', 'joint_campaign', '공동 캠페인 운영과 콘텐츠 제작', '6개월 이후', '3천만원 이상', v_now - interval '2 years');

  insert into public.b2b_leads (
    id, company_name, contact_name, email, message, stage, source
  ) values (
    '86000000-0000-4000-8000-000000000004', 'Legacy Salon', '담당자',
    'salon@example.test', '기존 살롱 도입 문의입니다.', 'new', 'public_form'
  );

  select count(*) into v_count
    from public.b2b_leads
   where id = '86000000-0000-4000-8000-000000000004'
     and lead_kind = 'salon_adoption';
  if v_count <> 1 then
    raise exception 'legacy lead default was not preserved';
  end if;

  select count(*) into v_count
    from public.b2b_leads
   where id = '86000000-0000-4000-8000-000000000001'
     and privacy_retention_expires_at = privacy_consent_at + interval '1 year';
  if v_count <> 1 then
    raise exception 'brand retention expiry was not derived from consent';
  end if;

  v_result := private.apply_brand_partnership_lead_retention(500, v_now);
  if (v_result ->> 'deleted')::integer <> 1 then
    raise exception 'unexpected retention result: %', v_result;
  end if;

  select count(*) into v_count
    from public.b2b_leads
   where id in (
     '86000000-0000-4000-8000-000000000002',
     '86000000-0000-4000-8000-000000000003',
     '86000000-0000-4000-8000-000000000004'
   );
  if v_count <> 3 then
    raise exception 'active, contracted, or salon lead was deleted';
  end if;

  if has_function_privilege('anon', 'public.apply_brand_partnership_lead_retention(integer,timestamp with time zone)', 'execute')
     or has_function_privilege('authenticated', 'public.apply_brand_partnership_lead_retention(integer,timestamp with time zone)', 'execute')
     or not has_function_privilege('service_role', 'public.apply_brand_partnership_lead_retention(integer,timestamp with time zone)', 'execute') then
    raise exception 'retention function privileges are not service-role only';
  end if;
end;
$$;

rollback;

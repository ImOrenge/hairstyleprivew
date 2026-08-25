\set ON_ERROR_STOP on

begin;

do $$
declare
  v_admin text := 'admin_entitlement_smoke_actor';
  v_member text := 'admin_entitlement_smoke_member';
  v_once public.product_offerings_v2%rowtype;
  v_quarter public.product_offerings_v2%rowtype;
  v_year public.product_offerings_v2%rowtype;
  v_result jsonb;
  v_grant_id uuid;
  v_restricted_id uuid;
  v_action uuid;
begin
  insert into public.users (id, email, account_type) values
    (v_admin, 'admin-entitlement-actor@example.test', 'admin'),
    (v_member, 'admin-entitlement-member@example.test', 'member');

  insert into public.product_offerings_v2 (
    offering_key, version, internal_name, customer_name, description,
    purchase_mode, billing_interval, status, included_consultation_sessions, capabilities
  ) values
    ('full_style_admin_smoke_once', 1, 'smoke once', '스모크 1회권', '', 'one_time', null, 'active', 1, '{"pdf":true}'::jsonb),
    ('full_style_admin_smoke_quarter', 1, 'smoke quarter', '스모크 3개월', '', 'recurring', 'quarter', 'active', 1, '{"pdf":true}'::jsonb),
    ('full_style_admin_smoke_year', 1, 'smoke year', '스모크 연간', '', 'recurring', 'year', 'active', 4, '{"pdf":true}'::jsonb),
    ('full_style_admin_smoke_inactive', 1, 'smoke inactive', '비활성', '', 'one_time', null, 'retired', 1, '{}'::jsonb),
    ('admin_smoke_not_full_style', 1, 'smoke invalid family', '잘못된 상품군', '', 'one_time', null, 'active', 1, '{}'::jsonb);

  select * into v_once from public.product_offerings_v2 where offering_key = 'full_style_admin_smoke_once';
  select * into v_quarter from public.product_offerings_v2 where offering_key = 'full_style_admin_smoke_quarter';
  select * into v_year from public.product_offerings_v2 where offering_key = 'full_style_admin_smoke_year';

  v_action := 'a1000000-0000-4000-8000-000000000001';
  v_result := public.execute_admin_entitlement_grant_v2(v_action, v_admin, v_member, v_once.offering_key, 1, '정상 무상 지급');
  if v_result ->> 'outcome' <> 'succeeded'
    or (v_result #>> '{entitlementGrant,quantity_granted}')::integer <> 1
    or v_result #>> '{entitlementGrant,expires_at}' is not null
    or v_result #>> '{entitlementGrant,capability_snapshot,pdf}' <> 'true'
  then raise exception 'one-time grant mismatch: %', v_result; end if;
  v_grant_id := (v_result #>> '{entitlementGrant,id}')::uuid;

  v_result := public.execute_admin_entitlement_grant_v2(v_action, v_admin, v_member, v_once.offering_key, 1, '정상 무상 지급');
  if coalesce((v_result ->> 'replayed')::boolean, false) is not true
    or v_result #>> '{entitlementGrant,id}' <> v_grant_id::text
  then raise exception 'grant replay mismatch: %', v_result; end if;

  v_result := public.execute_admin_entitlement_grant_v2(v_action, v_admin, v_member, v_once.offering_key, 1, '다른 요청');
  if v_result ->> 'outcome' <> 'conflict' or v_result ->> 'errorCode' <> 'action_key_conflict'
  then raise exception 'action key reuse was not rejected: %', v_result; end if;

  v_result := public.execute_admin_entitlement_grant_v2('a1000000-0000-4000-8000-000000000002', v_admin, v_member, 'full_style_admin_smoke_inactive', 1, '비활성 거부');
  if v_result ->> 'errorCode' <> 'offering_not_grantable' then raise exception 'inactive offering accepted: %', v_result; end if;
  v_result := public.execute_admin_entitlement_grant_v2('a1000000-0000-4000-8000-000000000003', v_admin, v_member, 'admin_smoke_not_full_style', 1, '상품군 거부');
  if v_result ->> 'errorCode' <> 'offering_not_grantable' then raise exception 'non-full-style offering accepted: %', v_result; end if;
  v_result := public.execute_admin_entitlement_grant_v2('a1000000-0000-4000-8000-000000000004', v_admin, v_member, v_once.offering_key, 99, '버전 충돌');
  if v_result ->> 'errorCode' <> 'offering_version_conflict' then raise exception 'catalog conflict missing: %', v_result; end if;

  v_result := public.execute_admin_entitlement_grant_v2('a1000000-0000-4000-8000-000000000005', v_admin, v_member, v_quarter.offering_key, 1, '3개월 지급');
  if (v_result #>> '{entitlementGrant,quantity_granted}')::integer <> 1
    or age((v_result #>> '{entitlementGrant,expires_at}')::timestamptz, (v_result #>> '{entitlementGrant,valid_from}')::timestamptz) <> interval '3 months'
  then raise exception 'quarter grant term mismatch: %', v_result; end if;
  v_result := public.execute_admin_entitlement_grant_v2('a1000000-0000-4000-8000-000000000006', v_admin, v_member, v_year.offering_key, 1, '연간 지급');
  if (v_result #>> '{entitlementGrant,quantity_granted}')::integer <> 4
    or age((v_result #>> '{entitlementGrant,expires_at}')::timestamptz, (v_result #>> '{entitlementGrant,valid_from}')::timestamptz) <> interval '1 year'
  then raise exception 'annual grant term mismatch: %', v_result; end if;

  v_result := public.execute_admin_entitlement_revoke_v2('b1000000-0000-4000-8000-000000000001', v_admin, v_member, v_grant_id, 'active', 0, '정상 회수');
  if v_result ->> 'outcome' <> 'succeeded' or v_result #>> '{entitlementGrant,status}' <> 'revoked'
  then raise exception 'manual revoke mismatch: %', v_result; end if;

  insert into public.customer_entitlement_grants_v2 (
    user_id, offering_id, offering_key, offering_version, capability_snapshot,
    quantity_granted, quantity_consumed, status, source, source_transaction_id
  ) values
    (v_member, v_once.id, v_once.offering_key, 1, '{}', 1, 0, 'active', 'portone', 'smoke-paid'),
    (v_member, v_once.id, v_once.offering_key, 1, '{}', 1, 0, 'active', 'promotion', 'smoke-promotion'),
    (v_member, v_once.id, v_once.offering_key, 1, '{}', 1, 1, 'active', 'manual', 'smoke-used'),
    (v_member, v_once.id, v_once.offering_key, 1, '{}', 1, 0, 'active', 'manual', 'smoke-linked');

  for v_restricted_id in
    select id from public.customer_entitlement_grants_v2 where source_transaction_id in ('smoke-paid', 'smoke-promotion') order by source_transaction_id
  loop
    v_result := public.execute_admin_entitlement_revoke_v2(gen_random_uuid(), v_admin, v_member, v_restricted_id, 'active', 0, '출처 제한');
    if v_result ->> 'errorCode' <> 'entitlement_not_revocable' then raise exception 'restricted source revoked: %', v_result; end if;
  end loop;

  select id into v_restricted_id from public.customer_entitlement_grants_v2 where source_transaction_id = 'smoke-used';
  v_result := public.execute_admin_entitlement_revoke_v2(gen_random_uuid(), v_admin, v_member, v_restricted_id, 'active', 0, '사용량 충돌');
  if v_result ->> 'errorCode' <> 'entitlement_state_conflict' then raise exception 'used grant was not fenced: %', v_result; end if;

  select id into v_restricted_id from public.customer_entitlement_grants_v2 where source_transaction_id = 'smoke-linked';
  insert into public.consultation_sessions (id, user_id, entitlement_grant_id, lifecycle_state)
  values ('c1000000-0000-4000-8000-000000000001', v_member, v_restricted_id, 'draft');
  v_result := public.execute_admin_entitlement_revoke_v2(gen_random_uuid(), v_admin, v_member, v_restricted_id, 'active', 0, '연결 제한');
  if v_result ->> 'errorCode' <> 'entitlement_in_use' then raise exception 'linked grant was revoked: %', v_result; end if;
end;
$$;

rollback;

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_owner text := 'salon_consent_owner';
  v_member text := 'salon_consent_member';
  v_scope jsonb := '{
    "profile": {"displayName": true, "avatarUrl": true, "email": true},
    "hairstyle": {"recentGenerations": true, "selectedStyle": true, "confirmedHairRecords": true},
    "aftercare": {"personalGuide": false, "salonRecords": true}
  }'::jsonb;
  v_first_invite jsonb;
  v_second_invite jsonb;
  v_match jsonb;
  v_customer_id uuid;
  v_count integer;
begin
  insert into public.users (id, email, display_name)
  values
    (v_owner, 'salon-consent-owner@example.test', 'Consent Salon'),
    (v_member, 'salon-consent-member@example.test', 'Consent Member');

  if has_table_privilege('authenticated', 'public.salon_match_requests', 'UPDATE') then
    raise exception 'authenticated must not update salon_match_requests directly';
  end if;
  if has_function_privilege('anon', 'public.accept_salon_match_invite(text,text,text,jsonb)', 'EXECUTE') then
    raise exception 'anon must not execute accept_salon_match_invite';
  end if;
  if not has_function_privilege('service_role', 'public.accept_salon_match_invite(text,text,text,jsonb)', 'EXECUTE') then
    raise exception 'service_role must execute accept_salon_match_invite';
  end if;

  v_first_invite := public.issue_salon_match_invite(
    v_owner,
    '111111111111111111111111',
    timezone('utc', now()) + interval '30 days',
    '2026-07-17.v1',
    false,
    null
  );

  begin
    perform public.issue_salon_match_invite(
      v_owner,
      '222222222222222222222222',
      timezone('utc', now()) + interval '30 days',
      '2026-07-17.v1',
      false,
      null
    );
    raise exception 'reissue without confirmation unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%INVITE_REISSUE_CONFIRMATION_REQUIRED%' then
        raise;
      end if;
  end;

  v_second_invite := public.issue_salon_match_invite(
    v_owner,
    '222222222222222222222222',
    timezone('utc', now()) + interval '30 days',
    '2026-07-17.v1',
    true,
    (v_first_invite ->> 'id')::uuid
  );

  select count(*)
  into v_count
  from public.salon_match_invites
  where id = (v_first_invite ->> 'id')::uuid
    and active = false
    and superseded_by = (v_second_invite ->> 'id')::uuid;

  if v_count <> 1 then
    raise exception 'old invite was not atomically superseded';
  end if;

  begin
    perform public.accept_salon_match_invite(
      '222222222222222222222222',
      v_member,
      'legacy-pre-consent',
      v_scope
    );
    raise exception 'stale consent version unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%CONSENT_CONTRACT_MISMATCH%' then
        raise;
      end if;
  end;

  v_match := public.accept_salon_match_invite(
    '222222222222222222222222',
    v_member,
    '2026-07-17.v1',
    v_scope
  );

  if v_match ->> 'status' <> 'pending'
     or v_match ->> 'consent_version' <> '2026-07-17.v1'
     or v_match ->> 'consented_at' is null then
    raise exception 'explicit consent was not stored: %', v_match;
  end if;

  v_match := public.link_salon_match_request(
    (v_match ->> 'id')::uuid,
    v_owner,
    'Consent Member',
    'salon-consent-member@example.test'
  );
  v_customer_id := (v_match ->> 'linked_customer_id')::uuid;

  if v_match ->> 'status' <> 'linked' or v_customer_id is null then
    raise exception 'link did not produce a customer: %', v_match;
  end if;

  perform public.revoke_salon_connection(
    (v_match ->> 'id')::uuid,
    v_member,
    'member_requested'
  );

  select count(*)
  into v_count
  from public.salon_match_requests
  where id = (v_match ->> 'id')::uuid
    and status = 'linked'
    and consent_version = '2026-07-17.v1'
    and revoked_at is null;

  if v_count <> 0 then
    raise exception 'revoked match still passes the salon detail access gate';
  end if;

  select count(*)
  into v_count
  from public.salon_customers
  where id = v_customer_id
    and linked_user_id is null
    and source = 'manual';

  if v_count <> 1 then
    raise exception 'revocation did not detach member-derived customer access';
  end if;

  v_match := public.accept_salon_match_invite(
    '222222222222222222222222',
    v_member,
    '2026-07-17.v1',
    v_scope
  );
  v_match := public.link_salon_match_request(
    (v_match ->> 'id')::uuid,
    v_owner,
    'Consent Member',
    'salon-consent-member@example.test'
  );

  if (v_match ->> 'linked_customer_id')::uuid <> v_customer_id then
    raise exception 're-consent did not reuse the retained salon customer record';
  end if;

  perform public.revoke_salon_connection(
    (v_match ->> 'id')::uuid,
    v_owner,
    'salon_requested'
  );

  select count(*)
  into v_count
  from public.salon_connection_audit_events
  where match_request_id = (v_match ->> 'id')::uuid
    and event_type = 'connection_revoked';

  if v_count <> 2 then
    raise exception 'member and salon revocations were not both audited';
  end if;

  select count(*)
  into v_count
  from public.salon_connection_audit_events
  where owner_user_id = v_owner
    and event_type in ('invite_issued', 'invite_superseded', 'consent_accepted', 'connection_linked', 'connection_revoked');

  if v_count <> 9 then
    raise exception 'unexpected audit event count: %', v_count;
  end if;
end
$$;

rollback;

select 'salon_connection_consent_revocation_smoke_ok' as result;

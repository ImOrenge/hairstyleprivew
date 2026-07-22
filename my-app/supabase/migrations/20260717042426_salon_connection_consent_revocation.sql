-- Phase 11B: explicit salon connection consent, revocation, invite rotation, and audit history.

alter table if exists public.salon_match_invites
  add column if not exists consent_version text,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid references public.salon_match_invites(id) on delete set null;

update public.salon_match_invites
set consent_version = '2026-07-17.v1'
where consent_version is null;

alter table if exists public.salon_match_invites
  alter column consent_version set default '2026-07-17.v1',
  alter column consent_version set not null;

alter table if exists public.salon_match_requests
  add column if not exists consent_version text,
  add column if not exists consent_scope jsonb,
  add column if not exists consented_at timestamptz,
  add column if not exists linked_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by_user_id text,
  add column if not exists revocation_reason text;

update public.salon_match_requests
set
  consent_version = 'legacy-pre-consent',
  consent_scope = jsonb_build_object(
    'profile', jsonb_build_object('displayName', false, 'avatarUrl', false, 'email', false),
    'hairstyle', jsonb_build_object(
      'recentGenerations', false,
      'selectedStyle', false,
      'confirmedHairRecords', false
    ),
    'aftercare', jsonb_build_object('personalGuide', false, 'salonRecords', true)
  ),
  consented_at = coalesce(consented_at, created_at),
  linked_at = coalesce(linked_at, updated_at)
where status = 'linked'
  and consent_version is null;

update public.salon_match_requests
set
  revoked_at = coalesce(revoked_at, updated_at),
  revoked_by_user_id = coalesce(revoked_by_user_id, owner_user_id),
  revocation_reason = coalesce(revocation_reason, 'legacy_revocation')
where status = 'revoked';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'salon_match_invites_consent_version_length'
      and conrelid = 'public.salon_match_invites'::regclass
  ) then
    alter table public.salon_match_invites
      add constraint salon_match_invites_consent_version_length
      check (char_length(consent_version) between 3 and 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'salon_match_invites_superseded_by_not_self'
      and conrelid = 'public.salon_match_invites'::regclass
  ) then
    alter table public.salon_match_invites
      add constraint salon_match_invites_superseded_by_not_self
      check (superseded_by is null or superseded_by <> id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'salon_match_requests_consent_shape'
      and conrelid = 'public.salon_match_requests'::regclass
  ) then
    alter table public.salon_match_requests
      add constraint salon_match_requests_consent_shape
      check (
        (consent_version is null and consent_scope is null and consented_at is null)
        or (
          consent_version is not null
          and char_length(consent_version) between 3 and 80
          and jsonb_typeof(consent_scope) = 'object'
          and consented_at is not null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'salon_match_requests_linked_requires_consent'
      and conrelid = 'public.salon_match_requests'::regclass
  ) then
    alter table public.salon_match_requests
      add constraint salon_match_requests_linked_requires_consent
      check (
        status <> 'linked'
        or (
          linked_customer_id is not null
          and linked_at is not null
          and consent_version is not null
          and consent_scope is not null
          and consented_at is not null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'salon_match_requests_revoked_requires_audit_fields'
      and conrelid = 'public.salon_match_requests'::regclass
  ) then
    alter table public.salon_match_requests
      add constraint salon_match_requests_revoked_requires_audit_fields
      check (
        status <> 'revoked'
        or (revoked_at is not null and revoked_by_user_id is not null)
      );
  end if;
end
$$;

create table if not exists public.salon_connection_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text,
  member_user_id text,
  match_request_id uuid references public.salon_match_requests(id) on delete set null,
  invite_id uuid references public.salon_match_invites(id) on delete set null,
  actor_user_id text,
  event_type text not null,
  consent_version text,
  consent_scope jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint salon_connection_audit_event_type_check
    check (
      event_type in (
        'invite_issued',
        'invite_superseded',
        'consent_accepted',
        'connection_linked',
        'connection_revoked',
        'legacy_connection_migrated'
      )
    ),
  constraint salon_connection_audit_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint salon_connection_audit_scope_object
    check (consent_scope is null or jsonb_typeof(consent_scope) = 'object')
);

insert into public.salon_connection_audit_events (
  owner_user_id,
  member_user_id,
  match_request_id,
  invite_id,
  actor_user_id,
  event_type,
  consent_version,
  consent_scope,
  metadata,
  created_at
)
select
  owner_user_id,
  member_user_id,
  id,
  invite_id,
  owner_user_id,
  'legacy_connection_migrated',
  consent_version,
  consent_scope,
  jsonb_build_object('status', status, 'explicitConsent', false),
  coalesce(linked_at, updated_at, created_at)
from public.salon_match_requests
where status = 'linked'
  and consent_version = 'legacy-pre-consent'
  and not exists (
    select 1
    from public.salon_connection_audit_events audit
    where audit.match_request_id = salon_match_requests.id
      and audit.event_type = 'legacy_connection_migrated'
  );

with ranked_active_invites as (
  select
    id,
    row_number() over (
      partition by owner_user_id
      order by
        case when expires_at is null or expires_at > timezone('utc', now()) then 0 else 1 end,
        created_at desc,
        id desc
    ) as active_rank
  from public.salon_match_invites
  where active = true
)
update public.salon_match_invites invite
set
  active = false,
  superseded_at = coalesce(invite.superseded_at, timezone('utc', now()))
from ranked_active_invites ranked
where ranked.id = invite.id
  and ranked.active_rank > 1;

create unique index if not exists idx_salon_match_invites_one_active_per_owner
  on public.salon_match_invites(owner_user_id)
  where active = true;

create index if not exists idx_salon_match_invites_superseded_by
  on public.salon_match_invites(superseded_by)
  where superseded_by is not null;

create index if not exists idx_salon_match_requests_member_status_updated
  on public.salon_match_requests(member_user_id, status, updated_at desc);

create index if not exists idx_salon_connection_audit_request_created
  on public.salon_connection_audit_events(match_request_id, created_at desc)
  where match_request_id is not null;

create index if not exists idx_salon_connection_audit_owner_created
  on public.salon_connection_audit_events(owner_user_id, created_at desc);

create index if not exists idx_salon_connection_audit_member_created
  on public.salon_connection_audit_events(member_user_id, created_at desc);

alter table public.salon_connection_audit_events enable row level security;

drop policy if exists "salon_match_invites_insert_owner" on public.salon_match_invites;
drop policy if exists "salon_match_invites_update_owner" on public.salon_match_invites;
drop policy if exists "salon_match_requests_insert_member" on public.salon_match_requests;
drop policy if exists "salon_match_requests_update_participant" on public.salon_match_requests;

revoke insert, update, delete on table public.salon_match_invites from anon, authenticated;
revoke insert, update, delete on table public.salon_match_requests from anon, authenticated;
revoke all on table public.salon_connection_audit_events from anon, authenticated;
grant select on table public.salon_match_invites to authenticated;
grant select on table public.salon_match_requests to authenticated;
grant all on table public.salon_match_invites to service_role;
grant all on table public.salon_match_requests to service_role;
grant all on table public.salon_connection_audit_events to service_role;

create or replace function public.issue_salon_match_invite(
  p_owner_user_id text,
  p_code text,
  p_expires_at timestamptz,
  p_consent_version text,
  p_confirm_replace boolean,
  p_expected_active_invite_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_existing public.salon_match_invites%rowtype;
  v_created public.salon_match_invites%rowtype;
  v_has_existing boolean := false;
  v_existing_is_usable boolean := false;
begin
  if p_owner_user_id is null or btrim(p_owner_user_id) = '' then
    raise exception using errcode = '22023', message = 'OWNER_USER_ID_REQUIRED';
  end if;
  if p_code is null or char_length(p_code) not between 12 and 64 then
    raise exception using errcode = '22023', message = 'INVITE_CODE_INVALID';
  end if;
  if p_expires_at is null or p_expires_at <= v_now then
    raise exception using errcode = '22023', message = 'INVITE_EXPIRY_INVALID';
  end if;
  if p_consent_version <> '2026-07-17.v1' then
    raise exception using errcode = '22023', message = 'CONSENT_VERSION_MISMATCH';
  end if;

  select *
  into v_existing
  from public.salon_match_invites
  where owner_user_id = p_owner_user_id
    and active = true
  order by created_at desc, id desc
  limit 1
  for update;

  v_has_existing := found;
  if v_has_existing then
    v_existing_is_usable := v_existing.expires_at is null or v_existing.expires_at > v_now;

    if v_existing_is_usable and not coalesce(p_confirm_replace, false) then
      raise exception using errcode = 'P0001', message = 'INVITE_REISSUE_CONFIRMATION_REQUIRED';
    end if;

    if v_existing_is_usable
       and (p_expected_active_invite_id is null or p_expected_active_invite_id <> v_existing.id) then
      raise exception using errcode = '40001', message = 'INVITE_REISSUE_STALE';
    end if;

    update public.salon_match_invites
    set
      active = false,
      superseded_at = v_now
    where id = v_existing.id;
  elsif p_expected_active_invite_id is not null then
    raise exception using errcode = '40001', message = 'INVITE_REISSUE_STALE';
  end if;

  insert into public.salon_match_invites (
    owner_user_id,
    code,
    active,
    expires_at,
    consent_version
  )
  values (
    p_owner_user_id,
    p_code,
    true,
    p_expires_at,
    p_consent_version
  )
  returning * into v_created;

  if v_has_existing then
    update public.salon_match_invites
    set superseded_by = v_created.id
    where id = v_existing.id;

    insert into public.salon_connection_audit_events (
      owner_user_id,
      invite_id,
      actor_user_id,
      event_type,
      consent_version,
      metadata
    )
    values (
      p_owner_user_id,
      v_existing.id,
      p_owner_user_id,
      'invite_superseded',
      v_existing.consent_version,
      jsonb_build_object(
        'replacementInviteId', v_created.id,
        'expiredAtReplacement', not v_existing_is_usable
      )
    );
  end if;

  insert into public.salon_connection_audit_events (
    owner_user_id,
    invite_id,
    actor_user_id,
    event_type,
    consent_version,
    metadata
  )
  values (
    p_owner_user_id,
    v_created.id,
    p_owner_user_id,
    'invite_issued',
    p_consent_version,
    jsonb_build_object('expiresAt', p_expires_at)
  );

  return to_jsonb(v_created);
end
$$;

create or replace function public.accept_salon_match_invite(
  p_invite_code text,
  p_member_user_id text,
  p_consent_version text,
  p_consent_scope jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_invite public.salon_match_invites%rowtype;
  v_match public.salon_match_requests%rowtype;
  v_expected_scope constant jsonb := '{
    "profile": {"displayName": true, "avatarUrl": true, "email": true},
    "hairstyle": {"recentGenerations": true, "selectedStyle": true, "confirmedHairRecords": true},
    "aftercare": {"personalGuide": false, "salonRecords": true}
  }'::jsonb;
begin
  if p_member_user_id is null or btrim(p_member_user_id) = '' then
    raise exception using errcode = '22023', message = 'MEMBER_USER_ID_REQUIRED';
  end if;
  if p_consent_version <> '2026-07-17.v1' or p_consent_scope <> v_expected_scope then
    raise exception using errcode = '22023', message = 'CONSENT_CONTRACT_MISMATCH';
  end if;

  select *
  into v_invite
  from public.salon_match_invites
  where code = p_invite_code
  for update;

  if not found
     or v_invite.active is not true
     or (v_invite.expires_at is not null and v_invite.expires_at <= v_now) then
    raise exception using errcode = 'P0002', message = 'INVITE_NOT_FOUND_OR_EXPIRED';
  end if;
  if v_invite.consent_version <> p_consent_version then
    raise exception using errcode = '22023', message = 'CONSENT_VERSION_MISMATCH';
  end if;
  if v_invite.owner_user_id = p_member_user_id then
    raise exception using errcode = '22023', message = 'SALON_OWNER_CANNOT_ACCEPT_OWN_INVITE';
  end if;

  insert into public.salon_match_requests (
    owner_user_id,
    member_user_id,
    invite_id,
    status,
    consent_version,
    consent_scope,
    consented_at,
    revoked_at,
    revoked_by_user_id,
    revocation_reason
  )
  values (
    v_invite.owner_user_id,
    p_member_user_id,
    v_invite.id,
    'pending',
    p_consent_version,
    p_consent_scope,
    v_now,
    null,
    null,
    null
  )
  on conflict (owner_user_id, member_user_id)
  do update set
    invite_id = excluded.invite_id,
    status = case
      when salon_match_requests.status = 'linked' then 'linked'::public.salon_match_status
      else 'pending'::public.salon_match_status
    end,
    consent_version = excluded.consent_version,
    consent_scope = excluded.consent_scope,
    consented_at = excluded.consented_at,
    revoked_at = null,
    revoked_by_user_id = null,
    revocation_reason = null
  returning * into v_match;

  insert into public.salon_connection_audit_events (
    owner_user_id,
    member_user_id,
    match_request_id,
    invite_id,
    actor_user_id,
    event_type,
    consent_version,
    consent_scope,
    metadata
  )
  values (
    v_match.owner_user_id,
    v_match.member_user_id,
    v_match.id,
    v_invite.id,
    p_member_user_id,
    'consent_accepted',
    p_consent_version,
    p_consent_scope,
    jsonb_build_object('resultingStatus', v_match.status)
  );

  return to_jsonb(v_match);
end
$$;

create or replace function public.link_salon_match_request(
  p_request_id uuid,
  p_owner_user_id text,
  p_member_display_name text,
  p_member_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_match public.salon_match_requests%rowtype;
  v_customer public.salon_customers%rowtype;
  v_expected_scope constant jsonb := '{
    "profile": {"displayName": true, "avatarUrl": true, "email": true},
    "hairstyle": {"recentGenerations": true, "selectedStyle": true, "confirmedHairRecords": true},
    "aftercare": {"personalGuide": false, "salonRecords": true}
  }'::jsonb;
begin
  select *
  into v_match
  from public.salon_match_requests
  where id = p_request_id
    and owner_user_id = p_owner_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'MATCH_REQUEST_NOT_FOUND';
  end if;
  if v_match.status = 'revoked' then
    raise exception using errcode = 'P0001', message = 'MATCH_REQUEST_REVOKED';
  end if;
  if v_match.consent_version <> '2026-07-17.v1'
     or v_match.consent_scope <> v_expected_scope
     or v_match.consented_at is null then
    raise exception using errcode = 'P0001', message = 'CURRENT_EXPLICIT_CONSENT_REQUIRED';
  end if;
  if v_match.status = 'linked' then
    return to_jsonb(v_match);
  end if;

  if v_match.linked_customer_id is not null then
    select *
    into v_customer
    from public.salon_customers
    where id = v_match.linked_customer_id
      and owner_user_id = p_owner_user_id
      and archived_at is null
    for update;
  end if;

  if v_customer.id is null then
    select *
    into v_customer
    from public.salon_customers
    where owner_user_id = p_owner_user_id
      and linked_user_id = v_match.member_user_id
      and archived_at is null
    order by updated_at desc, id desc
    limit 1
    for update;
  end if;

  if v_customer.id is null then
    insert into public.salon_customers (
      owner_user_id,
      linked_user_id,
      source,
      name,
      phone,
      email,
      memo,
      consent_sms,
      consent_kakao
    )
    values (
      p_owner_user_id,
      v_match.member_user_id,
      'linked_member',
      left(coalesce(nullif(btrim(p_member_display_name), ''), nullif(btrim(p_member_email), ''), 'HairFit member'), 120),
      null,
      nullif(left(btrim(coalesce(p_member_email, '')), 160), ''),
      null,
      false,
      false
    )
    returning * into v_customer;
  else
    update public.salon_customers
    set
      linked_user_id = v_match.member_user_id,
      source = 'linked_member',
      name = coalesce(nullif(name, ''), left(coalesce(nullif(btrim(p_member_display_name), ''), 'HairFit member'), 120)),
      email = coalesce(email, nullif(left(btrim(coalesce(p_member_email, '')), 160), ''))
    where id = v_customer.id
    returning * into v_customer;
  end if;

  update public.salon_match_requests
  set
    status = 'linked',
    linked_customer_id = v_customer.id,
    linked_at = v_now,
    revoked_at = null,
    revoked_by_user_id = null,
    revocation_reason = null
  where id = v_match.id
  returning * into v_match;

  insert into public.salon_connection_audit_events (
    owner_user_id,
    member_user_id,
    match_request_id,
    invite_id,
    actor_user_id,
    event_type,
    consent_version,
    consent_scope,
    metadata
  )
  values (
    v_match.owner_user_id,
    v_match.member_user_id,
    v_match.id,
    v_match.invite_id,
    p_owner_user_id,
    'connection_linked',
    v_match.consent_version,
    v_match.consent_scope,
    jsonb_build_object('customerId', v_customer.id)
  );

  return to_jsonb(v_match);
end
$$;

create or replace function public.revoke_salon_connection(
  p_request_id uuid,
  p_actor_user_id text,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_match public.salon_match_requests%rowtype;
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'user_requested'), 160);
begin
  select *
  into v_match
  from public.salon_match_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'MATCH_REQUEST_NOT_FOUND';
  end if;
  if p_actor_user_id is null
     or p_actor_user_id not in (v_match.owner_user_id, v_match.member_user_id) then
    raise exception using errcode = '42501', message = 'MATCH_PARTICIPANT_REQUIRED';
  end if;
  if v_match.status = 'revoked' then
    return to_jsonb(v_match);
  end if;

  if v_match.linked_customer_id is not null then
    update public.salon_customers
    set
      linked_user_id = null,
      source = 'manual'
    where id = v_match.linked_customer_id
      and owner_user_id = v_match.owner_user_id
      and linked_user_id = v_match.member_user_id;
  end if;

  update public.salon_match_requests
  set
    status = 'revoked',
    revoked_at = v_now,
    revoked_by_user_id = p_actor_user_id,
    revocation_reason = v_reason
  where id = v_match.id
  returning * into v_match;

  insert into public.salon_connection_audit_events (
    owner_user_id,
    member_user_id,
    match_request_id,
    invite_id,
    actor_user_id,
    event_type,
    consent_version,
    consent_scope,
    metadata
  )
  values (
    v_match.owner_user_id,
    v_match.member_user_id,
    v_match.id,
    v_match.invite_id,
    p_actor_user_id,
    'connection_revoked',
    v_match.consent_version,
    v_match.consent_scope,
    jsonb_build_object(
      'reason', v_reason,
      'retainedSalonCustomerId', v_match.linked_customer_id
    )
  );

  return to_jsonb(v_match);
end
$$;

revoke all on function public.issue_salon_match_invite(text, text, timestamptz, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.accept_salon_match_invite(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.link_salon_match_request(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.revoke_salon_connection(uuid, text, text) from public, anon, authenticated;

grant execute on function public.issue_salon_match_invite(text, text, timestamptz, text, boolean, uuid) to service_role;
grant execute on function public.accept_salon_match_invite(text, text, text, jsonb) to service_role;
grant execute on function public.link_salon_match_request(uuid, text, text, text) to service_role;
grant execute on function public.revoke_salon_connection(uuid, text, text) to service_role;

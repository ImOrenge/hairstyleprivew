-- Native completion push foundation. Email and the in-app generation status stay
-- authoritative fallbacks; push delivery is an independent, device-scoped channel.

create table public.mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  installation_id uuid not null,
  expo_push_token text not null,
  native_push_token text,
  platform text not null,
  project_id text not null,
  app_version text,
  permission_status text not null default 'granted',
  push_enabled boolean not null default true,
  last_registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  invalidated_at timestamptz,
  invalid_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mobile_push_devices_user_installation_key
    unique (user_id, installation_id),
  constraint mobile_push_devices_platform_check
    check (platform in ('ios', 'android')),
  constraint mobile_push_devices_permission_check
    check (permission_status in ('granted', 'denied', 'undetermined')),
  constraint mobile_push_devices_token_length_check
    check (length(expo_push_token) between 20 and 512),
  constraint mobile_push_devices_project_id_length_check
    check (length(project_id) between 1 and 128),
  constraint mobile_push_devices_native_token_length_check
    check (native_push_token is null or length(native_push_token) between 1 and 1024),
  constraint mobile_push_devices_enabled_permission_check
    check (not push_enabled or permission_status = 'granted'),
  constraint mobile_push_devices_revoked_state_check
    check (revoked_at is null or not push_enabled),
  constraint mobile_push_devices_invalid_state_check
    check (invalidated_at is null or not push_enabled)
);

create unique index mobile_push_devices_active_installation_idx
  on public.mobile_push_devices (installation_id)
  where push_enabled and revoked_at is null and invalidated_at is null;
create unique index mobile_push_devices_active_token_idx
  on public.mobile_push_devices (expo_push_token)
  where push_enabled and revoked_at is null and invalidated_at is null;
create index mobile_push_devices_user_active_idx
  on public.mobile_push_devices (user_id, last_seen_at desc)
  where push_enabled and revoked_at is null and invalidated_at is null;

alter table public.mobile_push_devices enable row level security;
alter table public.mobile_push_devices force row level security;
revoke all on table public.mobile_push_devices from public, anon, authenticated;
grant select, insert, update, delete on table public.mobile_push_devices to service_role;

drop trigger if exists trg_mobile_push_devices_set_updated_at
  on public.mobile_push_devices;
create trigger trg_mobile_push_devices_set_updated_at
before update on public.mobile_push_devices
for each row execute procedure public.set_updated_at();

create table public.generation_push_outbox (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  device_id uuid not null references public.mobile_push_devices(id) on delete cascade,
  event_type text not null default 'generation_terminal',
  terminal_kind text not null,
  status text not null default 'pending',
  event_payload jsonb not null,
  template_version text not null default 'generation-terminal-push-v1',
  idempotency_key text not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  receipt_attempt_count integer not null default 0,
  max_receipt_attempts integer not null default 6,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  expo_ticket_id text,
  ticketed_at timestamptz,
  delivered_at timestamptz,
  terminal_at timestamptz,
  last_error_kind text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint generation_push_outbox_event_type_check
    check (event_type = 'generation_terminal'),
  constraint generation_push_outbox_terminal_kind_check
    check (terminal_kind in ('completed', 'partial', 'failed')),
  constraint generation_push_outbox_status_check
    check (status in (
      'pending',
      'sending',
      'retry_wait',
      'ticketed',
      'receipt_checking',
      'delivered',
      'skipped',
      'invalid_token',
      'dead_letter',
      'delivery_unknown'
    )),
  constraint generation_push_outbox_payload_check
    check (jsonb_typeof(event_payload) = 'object'),
  constraint generation_push_outbox_attempt_check
    check (attempt_count between 0 and max_attempts),
  constraint generation_push_outbox_max_attempts_check
    check (max_attempts between 1 and 100),
  constraint generation_push_outbox_receipt_attempt_check
    check (receipt_attempt_count between 0 and max_receipt_attempts),
  constraint generation_push_outbox_max_receipt_attempts_check
    check (max_receipt_attempts between 1 and 100),
  constraint generation_push_outbox_idempotency_key_check
    check (length(idempotency_key) between 1 and 256),
  constraint generation_push_outbox_lease_check
    check (
      (
        status in ('sending', 'receipt_checking')
        and lease_token is not null
        and lease_expires_at is not null
      )
      or
      (
        status not in ('sending', 'receipt_checking')
        and lease_token is null
        and lease_expires_at is null
      )
    ),
  constraint generation_push_outbox_ticket_check
    check (
      (expo_ticket_id is null) = (ticketed_at is null)
      and (
        status not in ('ticketed', 'receipt_checking', 'delivered', 'delivery_unknown')
        or expo_ticket_id is not null
      )
      and (
        expo_ticket_id is null
        or status in (
          'ticketed',
          'receipt_checking',
          'delivered',
          'invalid_token',
          'dead_letter',
          'delivery_unknown'
        )
      )
    ),
  constraint generation_push_outbox_terminal_check
    check (
      (status in ('delivered', 'skipped', 'invalid_token', 'dead_letter', 'delivery_unknown'))
      = (terminal_at is not null)
    ),
  constraint generation_push_outbox_delivered_check
    check ((status = 'delivered') = (delivered_at is not null)),
  constraint generation_push_outbox_generation_device_key
    unique (generation_id, event_type, device_id),
  constraint generation_push_outbox_idempotency_key_key
    unique (idempotency_key)
);

create index generation_push_outbox_due_idx
  on public.generation_push_outbox (available_at, created_at, id)
  where status in ('pending', 'retry_wait');
create index generation_push_outbox_receipt_due_idx
  on public.generation_push_outbox (available_at, ticketed_at, id)
  where status = 'ticketed';
create index generation_push_outbox_expired_lease_idx
  on public.generation_push_outbox (lease_expires_at, id)
  where status in ('sending', 'receipt_checking');
create index generation_push_outbox_user_created_idx
  on public.generation_push_outbox (user_id, created_at desc);

alter table public.generation_push_outbox enable row level security;
alter table public.generation_push_outbox force row level security;
revoke all on table public.generation_push_outbox from public, anon, authenticated;
grant select, insert, update on table public.generation_push_outbox to service_role;

drop trigger if exists trg_generation_push_outbox_set_updated_at
  on public.generation_push_outbox;
create trigger trg_generation_push_outbox_set_updated_at
before update on public.generation_push_outbox
for each row execute procedure public.set_updated_at();

create or replace function public.register_mobile_push_device(
  p_user_id text,
  p_installation_id uuid,
  p_expo_push_token text,
  p_native_push_token text,
  p_platform text,
  p_project_id text,
  p_app_version text
)
returns table (
  device_id uuid,
  push_enabled boolean,
  permission_status text,
  registered_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_device public.mobile_push_devices%rowtype;
begin
  if p_user_id is null or btrim(p_user_id) = '' then
    raise exception 'p_user_id is required';
  end if;
  if p_installation_id is null then
    raise exception 'p_installation_id is required';
  end if;
  if p_expo_push_token is null
     or p_expo_push_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'invalid_expo_push_token';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'invalid_push_platform';
  end if;
  if p_project_id is null or length(btrim(p_project_id)) not between 1 and 128 then
    raise exception 'invalid_push_project_id';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_installation_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_expo_push_token, 1));

  update public.mobile_push_devices as device
     set push_enabled = false,
         revoked_at = coalesce(device.revoked_at, now()),
         invalid_reason = coalesce(device.invalid_reason, 'installation_reassigned')
   where device.push_enabled
     and (device.installation_id = p_installation_id or device.expo_push_token = p_expo_push_token)
     and device.user_id <> p_user_id;

  update public.mobile_push_devices as device
     set push_enabled = false,
         revoked_at = coalesce(device.revoked_at, now()),
         invalid_reason = coalesce(device.invalid_reason, 'token_rotated')
   where device.push_enabled
     and device.user_id = p_user_id
     and device.installation_id <> p_installation_id
     and device.expo_push_token = p_expo_push_token;

  insert into public.mobile_push_devices (
    user_id,
    installation_id,
    expo_push_token,
    native_push_token,
    platform,
    project_id,
    app_version,
    permission_status,
    push_enabled,
    last_registered_at,
    last_seen_at,
    revoked_at,
    invalidated_at,
    invalid_reason
  ) values (
    p_user_id,
    p_installation_id,
    p_expo_push_token,
    nullif(btrim(p_native_push_token), ''),
    p_platform,
    btrim(p_project_id),
    nullif(btrim(p_app_version), ''),
    'granted',
    true,
    now(),
    now(),
    null,
    null,
    null
  )
  on conflict (user_id, installation_id) do update
    set expo_push_token = excluded.expo_push_token,
        native_push_token = excluded.native_push_token,
        platform = excluded.platform,
        project_id = excluded.project_id,
        app_version = excluded.app_version,
        permission_status = 'granted',
        push_enabled = true,
        last_registered_at = now(),
        last_seen_at = now(),
        revoked_at = null,
        invalidated_at = null,
        invalid_reason = null
  returning * into v_device;

  return query
  select v_device.id, v_device.push_enabled, v_device.permission_status, v_device.last_registered_at;
end;
$$;

create or replace function public.revoke_mobile_push_device(
  p_user_id text,
  p_installation_id uuid,
  p_reason text default 'user_disabled'
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.mobile_push_devices
     set push_enabled = false,
         revoked_at = coalesce(revoked_at, now()),
         invalid_reason = left(coalesce(nullif(btrim(p_reason), ''), 'user_disabled'), 200)
   where user_id = p_user_id
     and installation_id = p_installation_id
     and push_enabled;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.enqueue_generation_push_notifications()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.event_type <> 'generation_terminal' or new.channel <> 'email' then
    return new;
  end if;

  insert into public.generation_push_outbox (
    generation_id,
    user_id,
    device_id,
    terminal_kind,
    event_payload,
    idempotency_key
  )
  select
    new.generation_id,
    new.user_id,
    device.id,
    new.terminal_kind,
    jsonb_build_object(
      'type', 'generation_terminal',
      'generationId', new.generation_id,
      'terminalKind', new.terminal_kind,
      'completedCount', coalesce((new.event_payload ->> 'completedCount')::integer, 0),
      'failedCount', coalesce((new.event_payload ->> 'failedCount')::integer, 0),
      'resultPath', coalesce(
        nullif(new.event_payload ->> 'resultPath', ''),
        '/generate/' || new.generation_id::text
      )
    ),
    'generation-terminal:push:' || new.generation_id::text || ':' || device.id::text
  from public.mobile_push_devices as device
  where device.user_id = new.user_id
    and device.push_enabled
    and device.permission_status = 'granted'
    and device.revoked_at is null
    and device.invalidated_at is null
  on conflict (generation_id, event_type, device_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_generation_notification_enqueue_push
  on public.generation_notification_outbox;
create trigger trg_generation_notification_enqueue_push
after insert on public.generation_notification_outbox
for each row execute function public.enqueue_generation_push_notifications();

create or replace function public.claim_generation_push_notifications(
  p_limit integer default 25,
  p_generation_id uuid default null,
  p_lease_seconds integer default 600
)
returns table (
  outbox_id uuid,
  outbox_generation_id uuid,
  outbox_user_id text,
  outbox_device_id uuid,
  outbox_terminal_kind text,
  outbox_event_payload jsonb,
  outbox_idempotency_key text,
  outbox_attempt_count integer,
  outbox_lease_token uuid,
  outbox_lease_expires_at timestamptz,
  device_expo_push_token text,
  device_project_id text,
  device_platform text
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
begin
  update public.generation_push_outbox
     set status = 'retry_wait',
         available_at = now(),
         lease_token = null,
         lease_expires_at = null,
         last_error_kind = 'send_lease_expired',
         last_error = 'Push send lease expired before acknowledgement'
   where status = 'sending'
     and lease_expires_at <= now();

  update public.generation_push_outbox as outbox
     set status = 'skipped',
         terminal_at = now(),
         last_error_kind = 'device_inactive',
         last_error = 'Push device is no longer active'
    from public.mobile_push_devices as device
   where outbox.device_id = device.id
     and outbox.status in ('pending', 'retry_wait')
     and (
       not device.push_enabled
       or device.permission_status <> 'granted'
       or device.revoked_at is not null
       or device.invalidated_at is not null
     );

  return query
  with candidates as (
    select outbox.id
      from public.generation_push_outbox as outbox
      join public.mobile_push_devices as device on device.id = outbox.device_id
     where outbox.status in ('pending', 'retry_wait')
       and outbox.available_at <= now()
       and (p_generation_id is null or outbox.generation_id = p_generation_id)
       and device.push_enabled
       and device.permission_status = 'granted'
       and device.revoked_at is null
       and device.invalidated_at is null
     order by outbox.available_at, outbox.created_at, outbox.id
     for update of outbox skip locked
     limit greatest(1, least(coalesce(p_limit, 25), 100))
  ), claimed as (
    update public.generation_push_outbox as outbox
       set status = 'sending',
           attempt_count = outbox.attempt_count + 1,
           lease_token = gen_random_uuid(),
           lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 600), 3600))),
           last_error_kind = null,
           last_error = null
      from candidates
     where outbox.id = candidates.id
     returning outbox.*
  )
  select
    claimed.id,
    claimed.generation_id,
    claimed.user_id,
    claimed.device_id,
    claimed.terminal_kind,
    claimed.event_payload,
    claimed.idempotency_key,
    claimed.attempt_count,
    claimed.lease_token,
    claimed.lease_expires_at,
    device.expo_push_token,
    device.project_id,
    device.platform
  from claimed
  join public.mobile_push_devices as device on device.id = claimed.device_id;
end;
$$;

create or replace function public.finish_generation_push_ticket(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_ticket_id text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.generation_push_outbox
     set status = 'ticketed',
         expo_ticket_id = nullif(btrim(p_ticket_id), ''),
         ticketed_at = now(),
         available_at = now() + interval '15 minutes',
         lease_token = null,
         lease_expires_at = null
   where id = p_outbox_id
     and status = 'sending'
     and lease_token = p_lease_token
     and nullif(btrim(p_ticket_id), '') is not null;
  return found;
end;
$$;

create or replace function public.retry_generation_push_notification(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_error_kind text,
  p_error_message text,
  p_permanent boolean default false,
  p_invalidate_device boolean default false
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_outbox public.generation_push_outbox%rowtype;
  v_next_status text;
begin
  select * into v_outbox
    from public.generation_push_outbox
   where id = p_outbox_id
   for update;

  if not found or v_outbox.status <> 'sending' or v_outbox.lease_token <> p_lease_token then
    return null;
  end if;

  v_next_status := case
    when p_invalidate_device then 'invalid_token'
    when p_permanent or v_outbox.attempt_count >= v_outbox.max_attempts then 'dead_letter'
    else 'retry_wait'
  end;

  if p_invalidate_device then
    update public.mobile_push_devices
       set push_enabled = false,
           invalidated_at = coalesce(invalidated_at, now()),
           invalid_reason = left(coalesce(nullif(btrim(p_error_kind), ''), 'DeviceNotRegistered'), 200)
     where id = v_outbox.device_id;
  end if;

  update public.generation_push_outbox
     set status = v_next_status,
         available_at = case
           when v_next_status = 'retry_wait' then
             now() + make_interval(secs => least(3600, 30 * power(2, least(v_outbox.attempt_count, 7))::integer))
           else available_at
         end,
         lease_token = null,
         lease_expires_at = null,
         terminal_at = case when v_next_status in ('invalid_token', 'dead_letter') then now() else null end,
         last_error_kind = left(coalesce(nullif(btrim(p_error_kind), ''), 'provider_error'), 100),
         last_error = left(coalesce(nullif(btrim(p_error_message), ''), 'Push provider error'), 1000)
   where id = p_outbox_id;

  return v_next_status;
end;
$$;

create or replace function public.claim_generation_push_receipts(
  p_limit integer default 100,
  p_lease_seconds integer default 600
)
returns table (
  outbox_id uuid,
  outbox_generation_id uuid,
  outbox_device_id uuid,
  outbox_ticket_id text,
  outbox_receipt_attempt_count integer,
  outbox_lease_token uuid,
  outbox_lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
begin
  update public.generation_push_outbox
     set status = 'ticketed',
         available_at = now(),
         lease_token = null,
         lease_expires_at = null,
         last_error_kind = 'receipt_lease_expired',
         last_error = 'Push receipt lease expired before acknowledgement'
   where status = 'receipt_checking'
     and lease_expires_at <= now();

  return query
  with candidates as (
    select outbox.id
      from public.generation_push_outbox as outbox
     where outbox.status = 'ticketed'
       and outbox.available_at <= now()
     order by outbox.available_at, outbox.ticketed_at, outbox.id
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 100), 1000))
  ), claimed as (
    update public.generation_push_outbox as outbox
       set status = 'receipt_checking',
           receipt_attempt_count = outbox.receipt_attempt_count + 1,
           lease_token = gen_random_uuid(),
           lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 600), 3600)))
      from candidates
     where outbox.id = candidates.id
     returning outbox.*
  )
  select
    claimed.id,
    claimed.generation_id,
    claimed.device_id,
    claimed.expo_ticket_id,
    claimed.receipt_attempt_count,
    claimed.lease_token,
    claimed.lease_expires_at
  from claimed;
end;
$$;

create or replace function public.finish_generation_push_receipt(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_error_kind text default null,
  p_error_message text default null
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_outbox public.generation_push_outbox%rowtype;
  v_next_status text;
begin
  select * into v_outbox
    from public.generation_push_outbox
   where id = p_outbox_id
   for update;

  if not found
     or v_outbox.status <> 'receipt_checking'
     or v_outbox.lease_token <> p_lease_token then
    return null;
  end if;

  if p_outcome = 'delivered' then
    v_next_status := 'delivered';
  elsif p_outcome = 'invalid_token' then
    v_next_status := 'invalid_token';
  elsif p_outcome = 'dead_letter' then
    v_next_status := 'dead_letter';
  elsif p_outcome = 'retry' and v_outbox.receipt_attempt_count < v_outbox.max_receipt_attempts then
    v_next_status := 'ticketed';
  elsif p_outcome = 'retry' then
    v_next_status := 'delivery_unknown';
  else
    raise exception 'invalid_push_receipt_outcome';
  end if;

  if v_next_status = 'invalid_token' then
    update public.mobile_push_devices
       set push_enabled = false,
           invalidated_at = coalesce(invalidated_at, now()),
           invalid_reason = left(coalesce(nullif(btrim(p_error_kind), ''), 'DeviceNotRegistered'), 200)
     where id = v_outbox.device_id;
  end if;

  update public.generation_push_outbox
     set status = v_next_status,
         available_at = case
           when v_next_status = 'ticketed' then now() + interval '5 minutes'
           else available_at
         end,
         lease_token = null,
         lease_expires_at = null,
         delivered_at = case when v_next_status = 'delivered' then now() else null end,
         terminal_at = case
           when v_next_status in ('delivered', 'invalid_token', 'dead_letter', 'delivery_unknown') then now()
           else null
         end,
         last_error_kind = case
           when v_next_status = 'delivered' then null
           else left(coalesce(nullif(btrim(p_error_kind), ''), 'receipt_pending'), 100)
         end,
         last_error = case
           when v_next_status = 'delivered' then null
           else left(coalesce(nullif(btrim(p_error_message), ''), 'Push receipt unavailable'), 1000)
         end
   where id = p_outbox_id;

  return v_next_status;
end;
$$;

revoke all on function public.register_mobile_push_device(text, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_mobile_push_device(text, uuid, text, text, text, text, text)
  to service_role;
revoke all on function public.revoke_mobile_push_device(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_mobile_push_device(text, uuid, text)
  to service_role;
revoke all on function public.enqueue_generation_push_notifications()
  from public, anon, authenticated;
revoke all on function public.claim_generation_push_notifications(integer, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_generation_push_notifications(integer, uuid, integer)
  to service_role;
revoke all on function public.finish_generation_push_ticket(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.finish_generation_push_ticket(uuid, uuid, text)
  to service_role;
revoke all on function public.retry_generation_push_notification(uuid, uuid, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.retry_generation_push_notification(uuid, uuid, text, text, boolean, boolean)
  to service_role;
revoke all on function public.claim_generation_push_receipts(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_generation_push_receipts(integer, integer)
  to service_role;
revoke all on function public.finish_generation_push_receipt(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_generation_push_receipt(uuid, uuid, text, text, text)
  to service_role;

comment on table public.mobile_push_devices is
  'Private native push registrations. Access is service-role only through authenticated mobile API routes.';
comment on table public.generation_push_outbox is
  'Device-scoped generation terminal push delivery. Email and in-app status remain independent fallbacks.';

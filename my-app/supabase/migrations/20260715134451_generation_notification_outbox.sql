-- Decouple terminal generation state from email delivery.
-- Provider calls happen outside database transactions; every state write after
-- a claim is fenced by a database-generated lease token.

create table public.generation_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null
    references public.generations(id) on delete cascade,
  user_id text not null
    references public.users(id) on delete cascade,
  event_type text not null default 'generation_terminal',
  channel text not null default 'email',
  terminal_kind text not null,
  status text not null default 'pending',
  event_payload jsonb not null default '{}'::jsonb,
  rendered_payload jsonb,
  recipient_email citext,
  recipient_display_name text,
  template_version text not null default 'generation-completed-v1',
  idempotency_key text not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  delivery_uncertain boolean not null default false,
  provider_attempt_lease_token uuid,
  first_provider_attempt_at timestamptz,
  provider_message_id text,
  last_error_kind text,
  last_error text,
  sent_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint generation_notification_outbox_event_type_check
    check (event_type = 'generation_terminal'),
  constraint generation_notification_outbox_channel_check
    check (channel = 'email'),
  constraint generation_notification_outbox_terminal_kind_check
    check (terminal_kind in ('completed', 'partial', 'failed')),
  constraint generation_notification_outbox_status_check
    check (
      status in (
        'pending',
        'sending',
        'retry_wait',
        'sent',
        'skipped',
        'dead_letter',
        'delivery_unknown'
      )
    ),
  constraint generation_notification_outbox_event_payload_check
    check (jsonb_typeof(event_payload) = 'object'),
  constraint generation_notification_outbox_rendered_payload_check
    check (rendered_payload is null or jsonb_typeof(rendered_payload) = 'object'),
  constraint generation_notification_outbox_attempt_count_check
    check (attempt_count >= 0),
  constraint generation_notification_outbox_max_attempts_check
    check (max_attempts between 1 and 100),
  constraint generation_notification_outbox_idempotency_key_check
    check (length(idempotency_key) between 1 and 256),
  constraint generation_notification_outbox_lease_check
    check (
      (
        status = 'sending'
        and lease_token is not null
        and lease_expires_at is not null
        and (
          provider_attempt_lease_token is null
          or provider_attempt_lease_token = lease_token
        )
        and terminal_at is null
      )
      or
      (
        status <> 'sending'
        and lease_token is null
        and lease_expires_at is null
        and provider_attempt_lease_token is null
      )
    ),
  constraint generation_notification_outbox_provider_attempt_check
    check (
      provider_attempt_lease_token is null
      or (
        status = 'sending'
        and provider_attempt_lease_token = lease_token
        and delivery_uncertain
        and first_provider_attempt_at is not null
      )
    ),
  constraint generation_notification_outbox_delivery_uncertain_check
    check (not delivery_uncertain or first_provider_attempt_at is not null),
  constraint generation_notification_outbox_terminal_check
    check (
      (status in ('sent', 'skipped', 'dead_letter', 'delivery_unknown'))
      = (terminal_at is not null)
    ),
  constraint generation_notification_outbox_sent_check
    check ((status = 'sent') = (sent_at is not null)),
  constraint generation_notification_outbox_generation_event_channel_key
    unique (generation_id, event_type, channel),
  constraint generation_notification_outbox_idempotency_key_key
    unique (idempotency_key)
);

alter table public.generation_notification_outbox enable row level security;
alter table public.generation_notification_outbox force row level security;

revoke all on table public.generation_notification_outbox from public;
revoke all on table public.generation_notification_outbox from anon, authenticated;
grant select, insert, update on table public.generation_notification_outbox to service_role;

create index if not exists idx_generation_notification_outbox_due
  on public.generation_notification_outbox (channel, available_at, created_at, id)
  where status in ('pending', 'retry_wait');

create index if not exists idx_generation_notification_outbox_expired_lease
  on public.generation_notification_outbox (channel, lease_expires_at, id)
  where status = 'sending';

create index if not exists idx_generation_notification_outbox_uncertain_deadline
  on public.generation_notification_outbox (first_provider_attempt_at, id)
  where delivery_uncertain and status in ('sending', 'retry_wait');

create index if not exists idx_generation_notification_outbox_user_created
  on public.generation_notification_outbox (user_id, created_at desc);

-- Keep a still-running legacy application from becoming a second consumer.
-- The generation row lock matches the enqueue lock order, so either the legacy
-- claim wins before enqueue or the outbox fence wins before legacy delivery.
create or replace function public.claim_generation_completion_notification(
  p_generation_id uuid
)
returns table (
  claimed_generation_id uuid,
  claimed_user_id text
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id text;
  v_generation_status public.generation_status;
  v_notification_status text;
  v_variants jsonb;
begin
  select
    generation.user_id,
    generation.status,
    generation.completion_notification_status,
    coalesce(generation.options -> 'recommendationSet' -> 'variants', '[]'::jsonb)
    into
      v_user_id,
      v_generation_status,
      v_notification_status,
      v_variants
    from public.generations as generation
   where generation.id = p_generation_id
   for update;

  if not found then
    raise exception 'Generation % not found', p_generation_id;
  end if;

  if exists (
    select 1
      from public.generation_notification_outbox as outbox
     where outbox.generation_id = p_generation_id
       and outbox.event_type = 'generation_terminal'
       and outbox.channel = 'email'
  ) then
    return;
  end if;

  if v_generation_status not in ('completed', 'failed') then
    return;
  end if;

  if jsonb_typeof(v_variants) <> 'array'
     or exists (
       select 1
         from jsonb_array_elements(v_variants) as variant(value)
        where variant.value ->> 'status' in ('queued', 'generating')
     ) then
    return;
  end if;

  if v_notification_status not in ('pending', 'failed', 'sending') then
    return;
  end if;

  update public.generations
     set completion_notification_status = 'sending',
         completion_notification_claimed_at = now(),
         completion_notification_error = null,
         completion_notification_attempts = completion_notification_attempts + 1,
         updated_at = now()
   where id = p_generation_id;

  return query
  select p_generation_id, v_user_id;
end;
$$;

create or replace function public.enqueue_generation_completion_notification_outbox(
  p_generation_id uuid,
  p_channel text default 'email'
)
returns table (
  outbox_id uuid,
  outbox_status text,
  outbox_generation_id uuid,
  outbox_user_id text,
  outbox_event_payload jsonb,
  outbox_rendered_payload jsonb,
  outbox_idempotency_key text,
  outbox_attempt_count integer,
  outbox_available_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_generation_status public.generation_status;
  v_notification_status text;
  v_notification_claimed_at timestamptz;
  v_notification_sent_at timestamptz;
  v_notification_attempts integer;
  v_user_id text;
  v_recipient_email citext;
  v_recipient_display_name text;
  v_variants jsonb;
  v_completed_count integer;
  v_failed_count integer;
  v_terminal_kind text;
  v_initial_status text;
  v_terminal_at timestamptz;
  v_event_payload jsonb;
  v_salon_context_mode text;
  v_salon_customer_id text;
  v_retry_path text;
begin
  if p_generation_id is null then
    raise exception 'p_generation_id is required';
  end if;
  if p_channel is distinct from 'email' then
    raise exception 'Unsupported generation notification channel: %', p_channel;
  end if;

  select
    generation.status,
    generation.completion_notification_status,
    generation.completion_notification_claimed_at,
    generation.completion_notification_sent_at,
    generation.completion_notification_attempts,
    generation.user_id,
    generation.options #>> '{salonContext,mode}',
    generation.options #>> '{salonContext,customerId}',
    case
      when jsonb_typeof(generation.options -> 'recommendationSet' -> 'variants') = 'array'
        then generation.options -> 'recommendationSet' -> 'variants'
      else '[]'::jsonb
    end
    into
      v_generation_status,
      v_notification_status,
      v_notification_claimed_at,
      v_notification_sent_at,
      v_notification_attempts,
      v_user_id,
      v_salon_context_mode,
      v_salon_customer_id,
      v_variants
    from public.generations as generation
   where generation.id = p_generation_id
   for update;

  if not found then
    raise exception 'Generation % not found', p_generation_id;
  end if;

  if v_generation_status not in ('completed', 'failed')
     or v_notification_status = 'not_requested'
     or (jsonb_array_length(v_variants) = 0 and v_generation_status <> 'failed')
     or exists (
       select 1
         from jsonb_array_elements(v_variants) as variant(value)
        where coalesce(variant.value ->> 'status', '') not in ('completed', 'failed')
     ) then
    return;
  end if;

  select
    count(*) filter (where variant.value ->> 'status' = 'completed')::integer,
    count(*) filter (where variant.value ->> 'status' = 'failed')::integer
    into v_completed_count, v_failed_count
    from jsonb_array_elements(v_variants) as variant(value);

  select app_user.email, app_user.display_name
    into v_recipient_email, v_recipient_display_name
    from public.users as app_user
   where app_user.id = v_user_id;

  v_terminal_kind := case
    when v_completed_count = 0 then 'failed'
    when v_failed_count > 0 then 'partial'
    else 'completed'
  end;

  v_retry_path := case
    when v_salon_context_mode = 'salon-crm-workspace'
      and v_salon_customer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then '/salon/customers/' || lower(v_salon_customer_id) || '/workspace'
    else '/generate'
  end;

  v_initial_status := case
    when v_notification_status = 'sent' then 'sent'
    when v_notification_status = 'skipped' then 'skipped'
    when v_notification_status in ('sending', 'failed')
      and coalesce(v_notification_attempts, 0) > 0
      and v_notification_claimed_at is not null
      and v_notification_claimed_at <= now() - interval '23 hours'
      then 'delivery_unknown'
    when coalesce(v_notification_attempts, 0) >= 12 then 'dead_letter'
    when v_notification_status in ('sending', 'failed')
      and coalesce(v_notification_attempts, 0) > 0
      and v_notification_claimed_at is not null
      then 'retry_wait'
    else 'pending'
  end;

  v_terminal_at := case
    when v_initial_status = 'sent' then coalesce(v_notification_sent_at, now())
    when v_initial_status in ('skipped', 'dead_letter', 'delivery_unknown') then now()
    else null
  end;

  v_event_payload := jsonb_build_object(
    'generationId', p_generation_id,
    'userId', v_user_id,
    'completedCount', v_completed_count,
    'failedCount', v_failed_count,
    'totalCount', v_completed_count + v_failed_count,
    'terminalKind', v_terminal_kind,
    'resultPath', '/generate/' || p_generation_id::text,
    'retryPath', v_retry_path,
    'templateVersion', 'generation-completed-v1'
  );

  insert into public.generation_notification_outbox (
    generation_id,
    user_id,
    event_type,
    channel,
    terminal_kind,
    status,
    event_payload,
    recipient_email,
    recipient_display_name,
    template_version,
    idempotency_key,
    attempt_count,
    max_attempts,
    available_at,
    delivery_uncertain,
    first_provider_attempt_at,
    sent_at,
    terminal_at,
    last_error_kind,
    last_error
  ) values (
    p_generation_id,
    v_user_id,
    'generation_terminal',
    p_channel,
    v_terminal_kind,
    v_initial_status,
    v_event_payload,
    v_recipient_email,
    v_recipient_display_name,
    'generation-completed-v1',
    'generation-completed/' || p_generation_id::text,
    greatest(coalesce(v_notification_attempts, 0), 0),
    least(100, greatest(12, coalesce(v_notification_attempts, 0))),
    case
      when v_initial_status = 'retry_wait' and v_notification_claimed_at is not null
        then greatest(now(), v_notification_claimed_at + interval '10 minutes')
      else now()
    end,
    v_initial_status in ('retry_wait', 'delivery_unknown'),
    case when coalesce(v_notification_attempts, 0) > 0 then v_notification_claimed_at else null end,
    case when v_initial_status = 'sent' then coalesce(v_notification_sent_at, now()) else null end,
    v_terminal_at,
    case
      when v_initial_status = 'delivery_unknown' then 'legacy_delivery_unknown'
      when v_initial_status = 'dead_letter' then 'legacy_attempts_exhausted'
      when v_initial_status = 'retry_wait' then 'legacy_delivery_retry'
      else null
    end,
    case
      when v_initial_status = 'delivery_unknown'
        then 'Legacy provider attempt is outside the Resend idempotency window'
      when v_initial_status = 'dead_letter'
        then 'Legacy notification attempts were already exhausted'
      when v_initial_status = 'retry_wait'
        then 'Legacy provider attempt will be retried inside the idempotency window'
      else null
    end
  )
  on conflict (generation_id, event_type, channel) do nothing;

  return query
  select
    outbox.id,
    outbox.status,
    outbox.generation_id,
    outbox.user_id,
    outbox.event_payload,
    outbox.rendered_payload,
    outbox.idempotency_key,
    outbox.attempt_count,
    outbox.available_at
  from public.generation_notification_outbox as outbox
  where outbox.generation_id = p_generation_id
    and outbox.event_type = 'generation_terminal'
    and outbox.channel = p_channel;
end;
$$;

create or replace function public.reconcile_generation_completion_notification_outbox(
  p_limit integer default 100
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_generation_id uuid;
  v_reconciled integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 100));
begin
  for v_generation_id in
    select generation.id
      from public.generations as generation
     where generation.status in ('completed', 'failed')
       and generation.completion_notification_status <> 'not_requested'
       and (
         generation.status = 'failed'
         or (
           jsonb_typeof(generation.options -> 'recommendationSet' -> 'variants') = 'array'
           and jsonb_array_length(generation.options -> 'recommendationSet' -> 'variants') > 0
         )
       )
       and not exists (
         select 1
           from jsonb_array_elements(
             case
               when jsonb_typeof(generation.options -> 'recommendationSet' -> 'variants') = 'array'
                 then generation.options -> 'recommendationSet' -> 'variants'
               else '[]'::jsonb
             end
           ) as variant(value)
          where coalesce(variant.value ->> 'status', '') not in ('completed', 'failed')
       )
       and not exists (
         select 1
           from public.generation_notification_outbox as outbox
          where outbox.generation_id = generation.id
            and outbox.event_type = 'generation_terminal'
            and outbox.channel = 'email'
       )
     order by generation.updated_at, generation.id
     limit v_limit
     for update of generation skip locked
  loop
    perform public.enqueue_generation_completion_notification_outbox(
      v_generation_id,
      'email'
    );
    if found then
      v_reconciled := v_reconciled + 1;
    end if;
  end loop;

  return v_reconciled;
end;
$$;

create or replace function public.claim_generation_completion_notification_outbox(
  p_limit integer default 25,
  p_generation_id uuid default null,
  p_lease_seconds integer default 600
)
returns table (
  outbox_id uuid,
  outbox_generation_id uuid,
  outbox_user_id text,
  outbox_channel text,
  outbox_terminal_kind text,
  outbox_event_payload jsonb,
  outbox_rendered_payload jsonb,
  outbox_recipient_email text,
  outbox_recipient_display_name text,
  outbox_template_version text,
  outbox_idempotency_key text,
  outbox_attempt_count integer,
  outbox_delivery_uncertain boolean,
  outbox_lease_token uuid,
  outbox_lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 600), 1800));
begin
  -- During a rolling cutover, a request handled by the legacy route can finish
  -- after an outbox row was created. Absorb that terminal acknowledgement
  -- before any new consumer can claim the row.
  with legacy_terminal as (
    select
      outbox.id,
      generation.completion_notification_status as notification_status,
      generation.completion_notification_sent_at as notification_sent_at
      from public.generation_notification_outbox as outbox
      join public.generations as generation on generation.id = outbox.generation_id
     where generation.completion_notification_status in ('sent', 'skipped')
       and outbox.status in ('pending', 'sending', 'retry_wait')
       and (p_generation_id is null or outbox.generation_id = p_generation_id)
     order by outbox.created_at, outbox.id
     limit v_limit
     for update of outbox skip locked
  )
  update public.generation_notification_outbox as outbox
     set status = generation.notification_status,
         available_at = now(),
         lease_token = null,
         lease_expires_at = null,
         provider_attempt_lease_token = null,
         delivery_uncertain = false,
         provider_message_id = null,
         sent_at = case
           when generation.notification_status = 'sent'
             then coalesce(generation.notification_sent_at, now())
           else null
         end,
         terminal_at = now(),
         last_error_kind = case
           when generation.notification_status = 'skipped'
             then 'legacy_recipient_unavailable'
           else null
         end,
         last_error = case
           when generation.notification_status = 'skipped'
             then 'Legacy notification route skipped delivery'
           else null
         end,
         updated_at = now()
    from legacy_terminal as generation
   where outbox.id = generation.id;

  -- A provider call is marked uncertain before the HTTP side effect. If its
  -- acknowledgement never returns, automatic replay stops before Resend's
  -- documented 24-hour idempotency window expires.
  with expired_uncertain as (
    select outbox.id
      from public.generation_notification_outbox as outbox
     where outbox.status in ('sending', 'retry_wait')
       and outbox.delivery_uncertain
       and outbox.first_provider_attempt_at is not null
       and outbox.first_provider_attempt_at <= now() - interval '23 hours'
       and (outbox.status <> 'sending' or outbox.lease_expires_at <= now())
       and (p_generation_id is null or outbox.generation_id = p_generation_id)
     order by outbox.first_provider_attempt_at, outbox.id
     limit v_limit
     for update of outbox skip locked
  )
  update public.generation_notification_outbox as outbox
     set status = 'delivery_unknown',
         terminal_at = now(),
         lease_token = null,
         lease_expires_at = null,
         provider_attempt_lease_token = null,
         available_at = now(),
         last_error_kind = 'idempotency_window_expired',
         last_error = 'Automatic resend stopped before the provider idempotency window expired',
         updated_at = now()
    from expired_uncertain
   where outbox.id = expired_uncertain.id;

  with exhausted as (
    select outbox.id
      from public.generation_notification_outbox as outbox
     where outbox.status in ('pending', 'retry_wait', 'sending')
       and outbox.attempt_count >= outbox.max_attempts
       and (
         outbox.status <> 'sending'
         or outbox.lease_expires_at is null
         or outbox.lease_expires_at <= now()
       )
       and (p_generation_id is null or outbox.generation_id = p_generation_id)
     order by outbox.updated_at, outbox.id
     limit v_limit
     for update of outbox skip locked
  )
  update public.generation_notification_outbox as outbox
     set status = case
           when outbox.delivery_uncertain then 'delivery_unknown'
           else 'dead_letter'
         end,
         terminal_at = now(),
         lease_token = null,
         lease_expires_at = null,
         provider_attempt_lease_token = null,
         available_at = now(),
         last_error_kind = case
           when outbox.delivery_uncertain then 'attempts_exhausted_delivery_unknown'
           else 'attempts_exhausted'
         end,
         last_error = coalesce(outbox.last_error, 'Notification attempts were exhausted'),
         updated_at = now()
    from exhausted
   where outbox.id = exhausted.id;

  return query
  with candidates as (
    select outbox.id
      from public.generation_notification_outbox as outbox
     where outbox.channel = 'email'
       and (p_generation_id is null or outbox.generation_id = p_generation_id)
       and outbox.attempt_count < outbox.max_attempts
       and not exists (
         select 1
           from public.generations as generation
          where generation.id = outbox.generation_id
            and generation.completion_notification_status in ('sent', 'skipped')
       )
       and not (
         outbox.delivery_uncertain
         and outbox.first_provider_attempt_at is not null
         and outbox.first_provider_attempt_at <= now() - interval '23 hours'
       )
       and (
         (
           outbox.status in ('pending', 'retry_wait')
           and outbox.available_at <= now()
         )
         or
         (
           outbox.status = 'sending'
           and outbox.lease_expires_at is not null
           and outbox.lease_expires_at <= now()
         )
       )
     order by
       case
         when outbox.status = 'sending' then outbox.lease_expires_at
         else outbox.available_at
       end,
       outbox.created_at,
       outbox.id
     limit v_limit
     for update of outbox skip locked
  ), claimed as (
    update public.generation_notification_outbox as outbox
       set status = 'sending',
           attempt_count = outbox.attempt_count + 1,
           lease_token = gen_random_uuid(),
           lease_expires_at = now() + make_interval(secs => v_lease_seconds),
           provider_attempt_lease_token = null,
           available_at = now() + make_interval(secs => v_lease_seconds),
           updated_at = now()
      from candidates
     where outbox.id = candidates.id
    returning outbox.*
  )
  select
    claimed.id,
    claimed.generation_id,
    claimed.user_id,
    claimed.channel,
    claimed.terminal_kind,
    claimed.event_payload,
    claimed.rendered_payload,
    claimed.recipient_email::text,
    claimed.recipient_display_name,
    claimed.template_version,
    claimed.idempotency_key,
    claimed.attempt_count,
    claimed.delivery_uncertain,
    claimed.lease_token,
    claimed.lease_expires_at
  from claimed;
end;
$$;

create or replace function public.prepare_generation_completion_notification_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_rendered_payload jsonb
)
returns table (
  outbox_status text,
  authoritative_rendered_payload jsonb,
  applied boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_status text;
  v_current_token uuid;
  v_lease_expires_at timestamptz;
  v_payload jsonb;
  v_idempotency_key text;
  v_recipient_email text;
  v_required_key text;
  v_applied boolean := false;
begin
  if p_rendered_payload is null or jsonb_typeof(p_rendered_payload) <> 'object' then
    raise exception 'p_rendered_payload must be a JSON object';
  end if;

  foreach v_required_key in array array[
    'to',
    'from',
    'subject',
    'html',
    'text',
    'source',
    'idempotencyKey'
  ]
  loop
    if jsonb_typeof(p_rendered_payload -> v_required_key) <> 'string'
      or btrim(coalesce(p_rendered_payload ->> v_required_key, '')) = '' then
      raise exception 'p_rendered_payload.% must be a non-empty string', v_required_key;
    end if;
  end loop;

  select
    outbox.status,
    outbox.lease_token,
    outbox.lease_expires_at,
    outbox.rendered_payload,
    outbox.idempotency_key,
    outbox.recipient_email::text
    into
      v_status,
      v_current_token,
      v_lease_expires_at,
      v_payload,
      v_idempotency_key,
      v_recipient_email
    from public.generation_notification_outbox as outbox
   where outbox.id = p_outbox_id
   for update;

  if not found then
    raise exception 'Generation notification outbox % not found', p_outbox_id;
  end if;

  if p_rendered_payload ->> 'idempotencyKey' <> v_idempotency_key then
    raise exception 'p_rendered_payload.idempotencyKey does not match the outbox key';
  end if;

  if v_recipient_email is null
    or lower(btrim(p_rendered_payload ->> 'to')) <> lower(btrim(v_recipient_email)) then
    raise exception 'p_rendered_payload.to does not match the outbox recipient';
  end if;

  if v_status = 'sending'
    and v_current_token = p_lease_token
    and v_lease_expires_at > now() then
    if v_payload is null then
      update public.generation_notification_outbox as outbox
         set rendered_payload = p_rendered_payload,
             updated_at = now()
       where outbox.id = p_outbox_id;
      v_payload := p_rendered_payload;
      v_applied := true;
    end if;
  end if;

  return query select v_status, v_payload, v_applied;
end;
$$;

create or replace function public.begin_generation_completion_notification_provider_attempt(
  p_outbox_id uuid,
  p_lease_token uuid
)
returns table (
  outbox_status text,
  applied boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_status text;
  v_current_token uuid;
  v_lease_expires_at timestamptz;
  v_payload jsonb;
  v_provider_attempt_token uuid;
  v_applied boolean := false;
begin
  select
    outbox.status,
    outbox.lease_token,
    outbox.lease_expires_at,
    outbox.rendered_payload,
    outbox.provider_attempt_lease_token
    into
      v_status,
      v_current_token,
      v_lease_expires_at,
      v_payload,
      v_provider_attempt_token
    from public.generation_notification_outbox as outbox
   where outbox.id = p_outbox_id
   for update;

  if not found then
    raise exception 'Generation notification outbox % not found', p_outbox_id;
  end if;

  if v_status = 'sending'
    and v_current_token = p_lease_token
    and v_lease_expires_at > now()
    and v_payload is not null
    and (v_provider_attempt_token is null or v_provider_attempt_token = p_lease_token) then
    if v_provider_attempt_token is null then
      update public.generation_notification_outbox as outbox
         set provider_attempt_lease_token = p_lease_token,
             first_provider_attempt_at = coalesce(outbox.first_provider_attempt_at, now()),
             delivery_uncertain = true,
             updated_at = now()
       where outbox.id = p_outbox_id;
    end if;
    v_applied := true;
  end if;

  return query select v_status, v_applied;
end;
$$;

create or replace function public.finish_generation_completion_notification_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_provider_message_id text default null
)
returns table (
  outbox_status text,
  applied boolean,
  outbox_attempt_count integer,
  outbox_available_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_status text;
  v_current_token uuid;
  v_provider_attempt_token uuid;
  v_attempt_count integer;
  v_available_at timestamptz;
  v_applied boolean := false;
begin
  select
    outbox.status,
    outbox.lease_token,
    outbox.provider_attempt_lease_token,
    outbox.attempt_count,
    outbox.available_at
    into
      v_status,
      v_current_token,
      v_provider_attempt_token,
      v_attempt_count,
      v_available_at
    from public.generation_notification_outbox as outbox
   where outbox.id = p_outbox_id
   for update;

  if not found then
    raise exception 'Generation notification outbox % not found', p_outbox_id;
  end if;

  if v_status = 'sent' then
    return query select v_status, false, v_attempt_count, v_available_at;
    return;
  end if;

  if v_status = 'sending'
    and v_current_token = p_lease_token
    and v_provider_attempt_token = p_lease_token then
    update public.generation_notification_outbox as outbox
       set status = 'sent',
           provider_message_id = nullif(left(coalesce(p_provider_message_id, ''), 500), ''),
           sent_at = now(),
           terminal_at = now(),
           lease_token = null,
           lease_expires_at = null,
           provider_attempt_lease_token = null,
           available_at = now(),
           delivery_uncertain = false,
           last_error_kind = null,
           last_error = null,
           updated_at = now()
     where outbox.id = p_outbox_id
     returning outbox.status, outbox.attempt_count, outbox.available_at
      into v_status, v_attempt_count, v_available_at;
    v_applied := true;

    update public.generations as generation
       set completion_notification_status = 'sent',
           completion_notification_sent_at = now(),
           completion_notification_error = null
      from public.generation_notification_outbox as outbox
     where outbox.id = p_outbox_id
       and generation.id = outbox.generation_id;
  end if;

  return query select v_status, v_applied, v_attempt_count, v_available_at;
end;
$$;

create or replace function public.skip_generation_completion_notification_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_reason text
)
returns table (
  outbox_status text,
  applied boolean,
  outbox_attempt_count integer,
  outbox_available_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_status text;
  v_current_token uuid;
  v_provider_attempt_token uuid;
  v_attempt_count integer;
  v_available_at timestamptz;
  v_applied boolean := false;
begin
  select
    outbox.status,
    outbox.lease_token,
    outbox.provider_attempt_lease_token,
    outbox.attempt_count,
    outbox.available_at
    into
      v_status,
      v_current_token,
      v_provider_attempt_token,
      v_attempt_count,
      v_available_at
    from public.generation_notification_outbox as outbox
   where outbox.id = p_outbox_id
   for update;

  if not found then
    raise exception 'Generation notification outbox % not found', p_outbox_id;
  end if;

  if v_status = 'sent' then
    return query select v_status, false, v_attempt_count, v_available_at;
    return;
  end if;

  if v_status = 'sending'
    and v_current_token = p_lease_token
    and v_provider_attempt_token is null then
    update public.generation_notification_outbox as outbox
       set status = 'skipped',
           terminal_at = now(),
           lease_token = null,
           lease_expires_at = null,
           provider_attempt_lease_token = null,
           available_at = now(),
           delivery_uncertain = false,
           last_error_kind = 'recipient_unavailable',
           last_error = left(coalesce(nullif(p_reason, ''), 'No deliverable account email'), 2000),
           updated_at = now()
     where outbox.id = p_outbox_id
     returning outbox.status, outbox.attempt_count, outbox.available_at
       into v_status, v_attempt_count, v_available_at;
    v_applied := true;

    update public.generations as generation
       set completion_notification_status = 'skipped',
           completion_notification_error = left(
             coalesce(nullif(p_reason, ''), 'No deliverable account email'),
             2000
           )
      from public.generation_notification_outbox as outbox
     where outbox.id = p_outbox_id
       and generation.id = outbox.generation_id;
  end if;

  return query select v_status, v_applied, v_attempt_count, v_available_at;
end;
$$;

create or replace function public.retry_generation_completion_notification_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_error_kind text,
  p_error_message text,
  p_delivery_uncertain boolean default false,
  p_permanent boolean default false
)
returns table (
  outbox_status text,
  applied boolean,
  outbox_attempt_count integer,
  outbox_available_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_status text;
  v_current_token uuid;
  v_attempt_count integer;
  v_max_attempts integer;
  v_first_provider_attempt_at timestamptz;
  v_available_at timestamptz;
  v_delay_seconds integer;
  v_next_status text;
  v_terminal_at timestamptz;
  v_applied boolean := false;
begin
  select
    outbox.status,
    outbox.lease_token,
    outbox.attempt_count,
    outbox.max_attempts,
    outbox.first_provider_attempt_at,
    outbox.available_at
    into
      v_status,
      v_current_token,
      v_attempt_count,
      v_max_attempts,
      v_first_provider_attempt_at,
      v_available_at
    from public.generation_notification_outbox as outbox
   where outbox.id = p_outbox_id
   for update;

  if not found then
    raise exception 'Generation notification outbox % not found', p_outbox_id;
  end if;

  if v_status in ('sent', 'skipped', 'dead_letter', 'delivery_unknown') then
    return query select v_status, false, v_attempt_count, v_available_at;
    return;
  end if;

  if v_status = 'sending' and v_current_token = p_lease_token then
    if coalesce(p_delivery_uncertain, false) and v_first_provider_attempt_at is null then
      raise exception 'p_delivery_uncertain requires a recorded provider attempt';
    end if;

    v_delay_seconds := least(
      3600,
      (30 * power(2::numeric, least(greatest(v_attempt_count - 1, 0), 7)))::integer
    );

    v_next_status := case
      when coalesce(p_delivery_uncertain, false)
        and v_first_provider_attempt_at is not null
        and v_first_provider_attempt_at <= now() - interval '23 hours'
        then 'delivery_unknown'
      when coalesce(p_permanent, false) and coalesce(p_delivery_uncertain, false)
        then 'delivery_unknown'
      when v_attempt_count >= v_max_attempts and coalesce(p_delivery_uncertain, false)
        then 'delivery_unknown'
      when coalesce(p_permanent, false) or v_attempt_count >= v_max_attempts
        then 'dead_letter'
      else 'retry_wait'
    end;

    v_terminal_at := case
      when v_next_status in ('dead_letter', 'delivery_unknown') then now()
      else null
    end;
    v_available_at := case
      when v_terminal_at is null then now() + make_interval(secs => v_delay_seconds)
      else now()
    end;

    update public.generation_notification_outbox as outbox
       set status = v_next_status,
           available_at = v_available_at,
           lease_token = null,
           lease_expires_at = null,
           provider_attempt_lease_token = null,
           delivery_uncertain = coalesce(p_delivery_uncertain, false),
           terminal_at = v_terminal_at,
           last_error_kind = left(coalesce(nullif(p_error_kind, ''), 'provider_error'), 100),
           last_error = left(coalesce(nullif(p_error_message, ''), 'Unknown provider error'), 2000),
           updated_at = now()
     where outbox.id = p_outbox_id
     returning outbox.status, outbox.attempt_count, outbox.available_at
      into v_status, v_attempt_count, v_available_at;
    v_applied := true;
  end if;

  return query select v_status, v_applied, v_attempt_count, v_available_at;
end;
$$;

revoke all on function public.enqueue_generation_completion_notification_outbox(uuid, text)
  from public, anon, authenticated;
revoke all on function public.claim_generation_completion_notification(uuid)
  from public, anon, authenticated;
revoke all on function public.reconcile_generation_completion_notification_outbox(integer)
  from public, anon, authenticated;
revoke all on function public.claim_generation_completion_notification_outbox(integer, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.prepare_generation_completion_notification_outbox(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.begin_generation_completion_notification_provider_attempt(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finish_generation_completion_notification_outbox(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.skip_generation_completion_notification_outbox(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.retry_generation_completion_notification_outbox(
  uuid, uuid, text, text, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.enqueue_generation_completion_notification_outbox(uuid, text)
  to service_role;
grant execute on function public.claim_generation_completion_notification(uuid)
  to service_role;
grant execute on function public.reconcile_generation_completion_notification_outbox(integer)
  to service_role;
grant execute on function public.claim_generation_completion_notification_outbox(integer, uuid, integer)
  to service_role;
grant execute on function public.prepare_generation_completion_notification_outbox(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.begin_generation_completion_notification_provider_attempt(uuid, uuid)
  to service_role;
grant execute on function public.finish_generation_completion_notification_outbox(uuid, uuid, text)
  to service_role;
grant execute on function public.skip_generation_completion_notification_outbox(uuid, uuid, text)
  to service_role;
grant execute on function public.retry_generation_completion_notification_outbox(
  uuid, uuid, text, text, boolean, boolean
) to service_role;

-- Backfill is intentionally deferred to the scheduled dispatcher. This keeps
-- a migration from creating a second consumer while a legacy app request is
-- still completing its provider acknowledgement during a rolling cutover.

-- Durable Fashion Styler execution and completion-email delivery.
-- A reserved credit attempt and its Workflow dispatch intent are committed in
-- the same database transaction. Terminal settlement enqueues one email event.

alter table public.styling_credit_attempts
  add column if not exists output_object_path text;

create or replace function public.enforce_styling_execution_lease_window()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
begin
  if new.state = 'reserved'
     and (
       tg_op = 'INSERT'
       or new.lease_token is distinct from old.lease_token
       or new.state is distinct from old.state
     ) then
    new.lease_expires_at := greatest(
      coalesce(new.lease_expires_at, now()),
      now() + interval '2 hours'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_styling_credit_attempts_lease_window
  on public.styling_credit_attempts;
create trigger trg_styling_credit_attempts_lease_window
before insert or update of lease_token, state on public.styling_credit_attempts
for each row execute procedure public.enforce_styling_execution_lease_window();

create table public.styling_workflow_outbox (
  id uuid primary key default gen_random_uuid(),
  styling_session_id uuid not null references public.styling_sessions(id) on delete cascade,
  styling_attempt_id uuid not null references public.styling_credit_attempts(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  attempt_lease_token uuid not null unique,
  dispatch_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  available_at timestamptz not null default now(),
  dispatch_lease_token uuid,
  dispatch_lease_expires_at timestamptz,
  workflow_instance_id text,
  last_error_kind text,
  last_error text,
  dispatched_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint styling_workflow_outbox_dispatch_key_check
    check (length(btrim(dispatch_key)) between 1 and 256),
  constraint styling_workflow_outbox_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint styling_workflow_outbox_status_check
    check (status in ('queued', 'dispatching', 'dispatched', 'retry', 'failed')),
  constraint styling_workflow_outbox_attempt_count_check
    check (attempt_count >= 0 and attempt_count <= max_attempts),
  constraint styling_workflow_outbox_max_attempts_check
    check (max_attempts between 1 and 100),
  constraint styling_workflow_outbox_state_check
    check (
      (
        status in ('queued', 'retry')
        and dispatch_lease_token is null
        and dispatch_lease_expires_at is null
        and workflow_instance_id is null
        and dispatched_at is null
        and terminal_at is null
      )
      or
      (
        status = 'dispatching'
        and dispatch_lease_token is not null
        and dispatch_lease_expires_at is not null
        and workflow_instance_id is null
        and dispatched_at is null
        and terminal_at is null
      )
      or
      (
        status = 'dispatched'
        and dispatch_lease_token is null
        and dispatch_lease_expires_at is null
        and workflow_instance_id is not null
        and dispatched_at is not null
        and terminal_at is not null
      )
      or
      (
        status = 'failed'
        and dispatch_lease_token is null
        and dispatch_lease_expires_at is null
        and workflow_instance_id is null
        and dispatched_at is null
        and terminal_at is not null
      )
    )
);

create index idx_styling_workflow_outbox_due
  on public.styling_workflow_outbox (available_at, created_at, id)
  where status in ('queued', 'retry');

create index idx_styling_workflow_outbox_expired_lease
  on public.styling_workflow_outbox (dispatch_lease_expires_at, id)
  where status = 'dispatching';

create index idx_styling_workflow_outbox_session
  on public.styling_workflow_outbox (styling_session_id, created_at desc);

alter table public.styling_workflow_outbox enable row level security;
alter table public.styling_workflow_outbox force row level security;
revoke all on table public.styling_workflow_outbox from public, anon, authenticated;
grant select, insert, update on table public.styling_workflow_outbox to service_role;

create or replace function public.enqueue_styling_workflow_outbox()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
begin
  if new.state = 'reserved'
     and (
       tg_op = 'INSERT'
       or new.lease_token is distinct from old.lease_token
       or new.state is distinct from old.state
     ) then
    insert into public.styling_workflow_outbox (
      styling_session_id,
      styling_attempt_id,
      user_id,
      attempt_lease_token,
      dispatch_key,
      payload
    ) values (
      new.styling_session_id,
      new.id,
      new.user_id,
      new.lease_token,
      'styling/' || new.id::text || '/' || new.lease_token::text,
      jsonb_build_object(
        'sessionId', new.styling_session_id,
        'attemptId', new.id,
        'leaseToken', new.lease_token
      )
    ) on conflict (attempt_lease_token) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_styling_credit_attempts_enqueue_workflow
  on public.styling_credit_attempts;
create trigger trg_styling_credit_attempts_enqueue_workflow
after insert or update of lease_token, state on public.styling_credit_attempts
for each row execute procedure public.enqueue_styling_workflow_outbox();

-- Preserve close-safe execution for a request that was active while this
-- migration was installed. Expired legacy attempts remain eligible for the
-- normal user-triggered re-lease path instead of being dispatched stale.
update public.styling_credit_attempts as attempt
   set lease_expires_at = greatest(attempt.lease_expires_at, now() + interval '2 hours')
  from public.styling_sessions as session
 where attempt.styling_session_id = session.id
   and attempt.state = 'reserved'
   and attempt.lease_expires_at > now()
   and session.status = 'generating';

insert into public.styling_workflow_outbox (
  styling_session_id,
  styling_attempt_id,
  user_id,
  attempt_lease_token,
  dispatch_key,
  payload
)
select
  attempt.styling_session_id,
  attempt.id,
  attempt.user_id,
  attempt.lease_token,
  'styling/' || attempt.id::text || '/' || attempt.lease_token::text,
  jsonb_build_object(
    'sessionId', attempt.styling_session_id,
    'attemptId', attempt.id,
    'leaseToken', attempt.lease_token
  )
from public.styling_credit_attempts as attempt
join public.styling_sessions as session on session.id = attempt.styling_session_id
where attempt.state = 'reserved'
  and attempt.lease_expires_at > now()
  and session.status = 'generating'
on conflict (attempt_lease_token) do nothing;

create or replace function public.claim_styling_workflow_outbox(
  p_limit integer,
  p_dispatch_lease_token uuid,
  p_lease_seconds integer
)
returns setof jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_failed record;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'p_limit must be between 1 and 100';
  end if;
  if p_dispatch_lease_token is null then
    raise exception 'p_dispatch_lease_token is required';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 1 and 3600 then
    raise exception 'p_lease_seconds must be between 1 and 3600';
  end if;

  for v_failed in
    with exhausted as (
      select outbox.id
        from public.styling_workflow_outbox as outbox
       where outbox.status = 'dispatching'
         and outbox.dispatch_lease_expires_at <= v_now
         and outbox.attempt_count >= outbox.max_attempts
       order by outbox.dispatch_lease_expires_at, outbox.id
       for update skip locked
    )
    update public.styling_workflow_outbox as outbox
       set status = 'failed',
           dispatch_lease_token = null,
           dispatch_lease_expires_at = null,
           last_error_kind = 'lease_expired',
           last_error = coalesce(outbox.last_error, 'Styling Workflow dispatch attempts were exhausted'),
           terminal_at = v_now,
           updated_at = v_now
      from exhausted
     where outbox.id = exhausted.id
    returning outbox.*
  loop
    if exists (
      select 1
        from public.styling_credit_attempts as attempt
       where attempt.id = v_failed.styling_attempt_id
         and attempt.state = 'reserved'
         and attempt.lease_token = v_failed.attempt_lease_token
    ) then
      perform public.settle_styling_execution(
        v_failed.styling_session_id,
        v_failed.user_id,
        v_failed.styling_attempt_id,
        v_failed.attempt_lease_token,
        'failure',
        null,
        '백그라운드 작업을 시작하지 못해 사용한 크레딧을 환불했습니다.',
        null,
        null
      );
    end if;
  end loop;

  return query
  with candidates as (
    select outbox.id
      from public.styling_workflow_outbox as outbox
     where (
       (outbox.status in ('queued', 'retry') and outbox.available_at <= v_now)
       or
       (outbox.status = 'dispatching' and outbox.dispatch_lease_expires_at <= v_now)
     )
       and outbox.attempt_count < outbox.max_attempts
     order by outbox.available_at, outbox.created_at, outbox.id
     limit p_limit
     for update skip locked
  ), claimed as (
    update public.styling_workflow_outbox as outbox
       set status = 'dispatching',
           attempt_count = outbox.attempt_count + 1,
           dispatch_lease_token = p_dispatch_lease_token,
           dispatch_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
           terminal_at = null,
           updated_at = v_now
      from candidates
     where outbox.id = candidates.id
    returning outbox.*
  )
  select jsonb_build_object(
    'outboxId', claimed.id,
    'sessionId', claimed.styling_session_id,
    'attemptId', claimed.styling_attempt_id,
    'userId', claimed.user_id,
    'attemptLeaseToken', claimed.attempt_lease_token,
    'dispatchKey', claimed.dispatch_key,
    'payload', claimed.payload,
    'status', claimed.status,
    'attemptCount', claimed.attempt_count,
    'maxAttempts', claimed.max_attempts,
    'dispatchLeaseToken', claimed.dispatch_lease_token,
    'dispatchLeaseExpiresAt', claimed.dispatch_lease_expires_at
  )
  from claimed;
end;
$$;

create or replace function public.finish_styling_workflow_outbox(
  p_outbox_id uuid,
  p_dispatch_lease_token uuid,
  p_workflow_instance_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_outbox public.styling_workflow_outbox%rowtype;
begin
  select outbox.* into v_outbox
    from public.styling_workflow_outbox as outbox
   where outbox.id = p_outbox_id
   for update;
  if not found then
    raise exception 'Styling Workflow outbox % not found', p_outbox_id;
  end if;
  if v_outbox.status = 'dispatched' then
    if v_outbox.workflow_instance_id <> btrim(p_workflow_instance_id) then
      raise exception 'Styling Workflow outbox is bound to another instance';
    end if;
    return jsonb_build_object('finished', false, 'idempotentReplay', true, 'status', v_outbox.status);
  end if;
  if v_outbox.status = 'failed' then
    return jsonb_build_object('finished', false, 'terminal', true, 'status', v_outbox.status);
  end if;
  if v_outbox.status <> 'dispatching'
     or v_outbox.dispatch_lease_token <> p_dispatch_lease_token
     or v_outbox.dispatch_lease_expires_at <= v_now then
    raise exception 'Stale Styling Workflow outbox lease for %', p_outbox_id;
  end if;

  update public.styling_workflow_outbox as outbox
     set status = 'dispatched',
         dispatch_lease_token = null,
         dispatch_lease_expires_at = null,
         workflow_instance_id = btrim(p_workflow_instance_id),
         last_error_kind = null,
         last_error = null,
         dispatched_at = v_now,
         terminal_at = v_now,
         updated_at = v_now
   where outbox.id = p_outbox_id
   returning * into v_outbox;

  return jsonb_build_object(
    'finished', true,
    'outboxId', v_outbox.id,
    'sessionId', v_outbox.styling_session_id,
    'status', v_outbox.status,
    'workflowInstanceId', v_outbox.workflow_instance_id,
    'dispatchedAt', v_outbox.dispatched_at
  );
end;
$$;

create or replace function public.retry_styling_workflow_outbox(
  p_outbox_id uuid,
  p_dispatch_lease_token uuid,
  p_error text,
  p_delay_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_outbox public.styling_workflow_outbox%rowtype;
begin
  if nullif(btrim(p_error), '') is null then
    raise exception 'p_error is required';
  end if;
  if p_delay_seconds is null or p_delay_seconds not between 0 and 86400 then
    raise exception 'p_delay_seconds must be between 0 and 86400';
  end if;

  select outbox.* into v_outbox
    from public.styling_workflow_outbox as outbox
   where outbox.id = p_outbox_id
   for update;
  if not found then
    raise exception 'Styling Workflow outbox % not found', p_outbox_id;
  end if;
  if v_outbox.status in ('dispatched', 'failed') then
    return jsonb_build_object('retried', false, 'terminal', true, 'status', v_outbox.status);
  end if;
  if v_outbox.status <> 'dispatching'
     or v_outbox.dispatch_lease_token <> p_dispatch_lease_token
     or v_outbox.dispatch_lease_expires_at <= v_now then
    raise exception 'Stale Styling Workflow outbox lease for %', p_outbox_id;
  end if;

  update public.styling_workflow_outbox as outbox
     set status = case when outbox.attempt_count >= outbox.max_attempts then 'failed' else 'retry' end,
         available_at = case
           when outbox.attempt_count >= outbox.max_attempts then outbox.available_at
           else v_now + make_interval(secs => p_delay_seconds)
         end,
         dispatch_lease_token = null,
         dispatch_lease_expires_at = null,
         last_error_kind = 'dispatch_error',
         last_error = left(btrim(p_error), 4000),
         terminal_at = case when outbox.attempt_count >= outbox.max_attempts then v_now else null end,
         updated_at = v_now
   where outbox.id = p_outbox_id
   returning * into v_outbox;

  if v_outbox.status = 'failed' and exists (
    select 1
      from public.styling_credit_attempts as attempt
     where attempt.id = v_outbox.styling_attempt_id
       and attempt.state = 'reserved'
       and attempt.lease_token = v_outbox.attempt_lease_token
  ) then
    perform public.settle_styling_execution(
      v_outbox.styling_session_id,
      v_outbox.user_id,
      v_outbox.styling_attempt_id,
      v_outbox.attempt_lease_token,
      'failure',
      null,
      '백그라운드 작업을 시작하지 못해 사용한 크레딧을 환불했습니다.',
      null,
      null
    );
  end if;

  return jsonb_build_object(
    'retried', v_outbox.status = 'retry',
    'outboxId', v_outbox.id,
    'sessionId', v_outbox.styling_session_id,
    'status', v_outbox.status,
    'attemptCount', v_outbox.attempt_count,
    'availableAt', v_outbox.available_at,
    'terminal', v_outbox.terminal_at is not null,
    'error', v_outbox.last_error
  );
end;
$$;

create table public.styling_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  styling_session_id uuid not null unique references public.styling_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  channel text not null default 'email',
  terminal_kind text not null,
  status text not null default 'pending',
  event_payload jsonb not null default '{}'::jsonb,
  rendered_payload jsonb,
  recipient_email citext,
  recipient_display_name text,
  template_version text not null default 'styling-completed-v1',
  idempotency_key text not null unique,
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_attempt_lease_token uuid,
  delivery_uncertain boolean not null default false,
  first_provider_attempt_at timestamptz,
  provider_message_id text,
  last_error_kind text,
  last_error text,
  sent_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint styling_notification_outbox_channel_check check (channel = 'email'),
  constraint styling_notification_outbox_terminal_kind_check check (terminal_kind in ('completed', 'failed')),
  constraint styling_notification_outbox_status_check
    check (status in ('pending', 'sending', 'retry_wait', 'sent', 'skipped', 'dead_letter', 'delivery_unknown')),
  constraint styling_notification_outbox_event_payload_check check (jsonb_typeof(event_payload) = 'object'),
  constraint styling_notification_outbox_rendered_payload_check
    check (rendered_payload is null or jsonb_typeof(rendered_payload) = 'object'),
  constraint styling_notification_outbox_attempt_count_check check (attempt_count >= 0 and attempt_count <= max_attempts),
  constraint styling_notification_outbox_max_attempts_check check (max_attempts between 1 and 100),
  constraint styling_notification_outbox_lease_check check (
    (status = 'sending' and lease_token is not null and lease_expires_at is not null and terminal_at is null)
    or
    (status <> 'sending' and lease_token is null and lease_expires_at is null and provider_attempt_lease_token is null)
  ),
  constraint styling_notification_outbox_provider_attempt_check check (
    provider_attempt_lease_token is null
    or (
      status = 'sending'
      and provider_attempt_lease_token = lease_token
      and delivery_uncertain
      and first_provider_attempt_at is not null
    )
  ),
  constraint styling_notification_outbox_terminal_check check (
    (status in ('sent', 'skipped', 'dead_letter', 'delivery_unknown')) = (terminal_at is not null)
  ),
  constraint styling_notification_outbox_sent_check check ((status = 'sent') = (sent_at is not null))
);

create index idx_styling_notification_outbox_due
  on public.styling_notification_outbox (available_at, created_at, id)
  where status in ('pending', 'retry_wait');

create index idx_styling_notification_outbox_expired_lease
  on public.styling_notification_outbox (lease_expires_at, id)
  where status = 'sending';

create index idx_styling_notification_outbox_user_created
  on public.styling_notification_outbox (user_id, created_at desc);

alter table public.styling_notification_outbox enable row level security;
alter table public.styling_notification_outbox force row level security;
revoke all on table public.styling_notification_outbox from public, anon, authenticated;
grant select, insert, update on table public.styling_notification_outbox to service_role;

create or replace function public.enqueue_styling_completion_notification()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_email citext;
  v_display_name text;
begin
  if old.state = 'reserved' and new.state in ('committed', 'released') then
    select app_user.email, app_user.display_name
      into v_email, v_display_name
      from public.users as app_user
     where app_user.id = new.user_id;

    insert into public.styling_notification_outbox (
      styling_session_id,
      user_id,
      terminal_kind,
      event_payload,
      recipient_email,
      recipient_display_name,
      idempotency_key
    ) values (
      new.styling_session_id,
      new.user_id,
      case when new.state = 'committed' then 'completed' else 'failed' end,
      jsonb_build_object(
        'sessionId', new.styling_session_id,
        'userId', new.user_id,
        'terminalKind', case when new.state = 'committed' then 'completed' else 'failed' end,
        'resultPath', '/styler/' || new.styling_session_id::text,
        'retryPath', '/styler/' || new.styling_session_id::text,
        'chargedCredits', case when new.state = 'committed' then new.amount else 0 end,
        'refundedCredits', case when new.state = 'released' then new.amount else 0 end,
        'templateVersion', 'styling-completed-v1'
      ),
      v_email,
      v_display_name,
      'styling-completed/' || new.styling_session_id::text
    ) on conflict (styling_session_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_styling_credit_attempts_enqueue_notification
  on public.styling_credit_attempts;
create trigger trg_styling_credit_attempts_enqueue_notification
after update of state on public.styling_credit_attempts
for each row execute procedure public.enqueue_styling_completion_notification();

create or replace function public.claim_styling_completion_notifications(
  p_limit integer default 25,
  p_styling_session_id uuid default null,
  p_lease_seconds integer default 600
)
returns setof jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 600), 1800));
begin
  update public.styling_notification_outbox as outbox
     set status = case when outbox.delivery_uncertain then 'delivery_unknown' else 'dead_letter' end,
         lease_token = null,
         lease_expires_at = null,
         provider_attempt_lease_token = null,
         terminal_at = now(),
         last_error_kind = case when outbox.delivery_uncertain then 'delivery_unknown' else 'attempts_exhausted' end,
         last_error = coalesce(outbox.last_error, 'Notification delivery attempts were exhausted'),
         updated_at = now()
   where outbox.status in ('pending', 'retry_wait', 'sending')
     and outbox.attempt_count >= outbox.max_attempts
     and (outbox.status <> 'sending' or outbox.lease_expires_at <= now())
     and (p_styling_session_id is null or outbox.styling_session_id = p_styling_session_id);

  update public.styling_notification_outbox as outbox
     set status = 'delivery_unknown',
         lease_token = null,
         lease_expires_at = null,
         provider_attempt_lease_token = null,
         terminal_at = now(),
         last_error_kind = 'idempotency_window_expired',
         last_error = 'Automatic resend stopped before the provider idempotency window expired',
         updated_at = now()
   where outbox.status in ('sending', 'retry_wait')
     and outbox.delivery_uncertain
     and outbox.first_provider_attempt_at <= now() - interval '23 hours'
     and (outbox.status <> 'sending' or outbox.lease_expires_at <= now())
     and (p_styling_session_id is null or outbox.styling_session_id = p_styling_session_id);

  return query
  with candidates as (
    select outbox.id
      from public.styling_notification_outbox as outbox
     where outbox.attempt_count < outbox.max_attempts
       and (p_styling_session_id is null or outbox.styling_session_id = p_styling_session_id)
       and not (
         outbox.delivery_uncertain
         and outbox.first_provider_attempt_at <= now() - interval '23 hours'
       )
       and (
         (outbox.status in ('pending', 'retry_wait') and outbox.available_at <= now())
         or
         (outbox.status = 'sending' and outbox.lease_expires_at <= now())
       )
     order by outbox.available_at, outbox.created_at, outbox.id
     limit v_limit
     for update skip locked
  ), claimed as (
    update public.styling_notification_outbox as outbox
       set status = 'sending',
           attempt_count = outbox.attempt_count + 1,
           lease_token = gen_random_uuid(),
           lease_expires_at = now() + make_interval(secs => v_lease_seconds),
           provider_attempt_lease_token = null,
           updated_at = now()
      from candidates
     where outbox.id = candidates.id
    returning outbox.*
  )
  select jsonb_build_object(
    'outboxId', claimed.id,
    'sessionId', claimed.styling_session_id,
    'userId', claimed.user_id,
    'terminalKind', claimed.terminal_kind,
    'eventPayload', claimed.event_payload,
    'renderedPayload', claimed.rendered_payload,
    'recipientEmail', claimed.recipient_email,
    'recipientDisplayName', claimed.recipient_display_name,
    'templateVersion', claimed.template_version,
    'idempotencyKey', claimed.idempotency_key,
    'attemptCount', claimed.attempt_count,
    'deliveryUncertain', claimed.delivery_uncertain,
    'leaseToken', claimed.lease_token,
    'leaseExpiresAt', claimed.lease_expires_at
  )
  from claimed;
end;
$$;

create or replace function public.prepare_styling_completion_notification(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_rendered_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_outbox public.styling_notification_outbox%rowtype;
begin
  if p_rendered_payload is null or jsonb_typeof(p_rendered_payload) <> 'object' then
    raise exception 'p_rendered_payload must be an object';
  end if;
  select outbox.* into v_outbox
    from public.styling_notification_outbox as outbox
   where outbox.id = p_outbox_id
   for update;
  if not found then
    raise exception 'Styling notification outbox % not found', p_outbox_id;
  end if;
  if v_outbox.status <> 'sending'
     or v_outbox.lease_token <> p_lease_token
     or v_outbox.lease_expires_at <= now() then
    raise exception 'Stale styling notification lease for %', p_outbox_id;
  end if;
  if v_outbox.rendered_payload is null then
    update public.styling_notification_outbox as outbox
       set rendered_payload = p_rendered_payload, updated_at = now()
     where outbox.id = p_outbox_id
     returning * into v_outbox;
  end if;
  return jsonb_build_object('status', v_outbox.status, 'renderedPayload', v_outbox.rendered_payload);
end;
$$;

create or replace function public.begin_styling_notification_provider_attempt(
  p_outbox_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_outbox public.styling_notification_outbox%rowtype;
begin
  select outbox.* into v_outbox
    from public.styling_notification_outbox as outbox
   where outbox.id = p_outbox_id
   for update;
  if not found then
    raise exception 'Styling notification outbox % not found', p_outbox_id;
  end if;
  if v_outbox.status <> 'sending'
     or v_outbox.lease_token <> p_lease_token
     or v_outbox.lease_expires_at <= now() then
    raise exception 'Stale styling notification lease for %', p_outbox_id;
  end if;
  update public.styling_notification_outbox as outbox
     set delivery_uncertain = true,
         first_provider_attempt_at = coalesce(outbox.first_provider_attempt_at, now()),
         provider_attempt_lease_token = p_lease_token,
         updated_at = now()
   where outbox.id = p_outbox_id
   returning * into v_outbox;
  return jsonb_build_object('status', v_outbox.status, 'providerAttemptStarted', true);
end;
$$;

create or replace function public.finish_styling_completion_notification(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_outbox public.styling_notification_outbox%rowtype;
begin
  if p_outcome not in ('sent', 'skipped') then
    raise exception 'p_outcome must be sent or skipped';
  end if;
  select outbox.* into v_outbox
    from public.styling_notification_outbox as outbox
   where outbox.id = p_outbox_id
   for update;
  if not found then
    raise exception 'Styling notification outbox % not found', p_outbox_id;
  end if;
  if v_outbox.status in ('sent', 'skipped') then
    return jsonb_build_object('finished', false, 'idempotentReplay', true, 'status', v_outbox.status);
  end if;
  if v_outbox.status <> 'sending'
     or v_outbox.lease_token <> p_lease_token
     or v_outbox.lease_expires_at <= now()
     or (p_outcome = 'sent' and v_outbox.provider_attempt_lease_token <> p_lease_token) then
    raise exception 'Stale styling notification lease for %', p_outbox_id;
  end if;
  update public.styling_notification_outbox as outbox
     set status = p_outcome,
         lease_token = null,
         lease_expires_at = null,
         provider_attempt_lease_token = null,
         delivery_uncertain = false,
         provider_message_id = case when p_outcome = 'sent' then nullif(btrim(p_provider_message_id), '') else null end,
         last_error_kind = case when p_outcome = 'skipped' then 'recipient_unavailable' else null end,
         last_error = case when p_outcome = 'skipped' then left(coalesce(nullif(btrim(p_reason), ''), 'Recipient unavailable'), 4000) else null end,
         sent_at = case when p_outcome = 'sent' then now() else null end,
         terminal_at = now(),
         updated_at = now()
   where outbox.id = p_outbox_id
   returning * into v_outbox;
  return jsonb_build_object('finished', true, 'status', v_outbox.status, 'sentAt', v_outbox.sent_at);
end;
$$;

create or replace function public.retry_styling_completion_notification(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_error_kind text,
  p_error text,
  p_delay_seconds integer,
  p_delivery_uncertain boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_outbox public.styling_notification_outbox%rowtype;
  v_terminal_status text;
begin
  if p_delay_seconds is null or p_delay_seconds not between 0 and 86400 then
    raise exception 'p_delay_seconds must be between 0 and 86400';
  end if;
  select outbox.* into v_outbox
    from public.styling_notification_outbox as outbox
   where outbox.id = p_outbox_id
   for update;
  if not found then
    raise exception 'Styling notification outbox % not found', p_outbox_id;
  end if;
  if v_outbox.status in ('sent', 'skipped', 'dead_letter', 'delivery_unknown') then
    return jsonb_build_object('retried', false, 'terminal', true, 'status', v_outbox.status);
  end if;
  if v_outbox.status <> 'sending'
     or v_outbox.lease_token <> p_lease_token
     or v_outbox.lease_expires_at <= now() then
    raise exception 'Stale styling notification lease for %', p_outbox_id;
  end if;

  v_terminal_status := case
    when v_outbox.attempt_count < v_outbox.max_attempts then null
    when v_outbox.delivery_uncertain or p_delivery_uncertain then 'delivery_unknown'
    else 'dead_letter'
  end;

  update public.styling_notification_outbox as outbox
     set status = coalesce(v_terminal_status, 'retry_wait'),
         available_at = case when v_terminal_status is null then now() + make_interval(secs => p_delay_seconds) else now() end,
         lease_token = null,
         lease_expires_at = null,
         provider_attempt_lease_token = null,
         delivery_uncertain = outbox.delivery_uncertain or p_delivery_uncertain,
         first_provider_attempt_at = case
           when p_delivery_uncertain then coalesce(outbox.first_provider_attempt_at, now())
           else outbox.first_provider_attempt_at
         end,
         last_error_kind = left(coalesce(nullif(btrim(p_error_kind), ''), 'delivery_error'), 128),
         last_error = left(coalesce(nullif(btrim(p_error), ''), 'Notification delivery failed'), 4000),
         terminal_at = case when v_terminal_status is null then null else now() end,
         updated_at = now()
   where outbox.id = p_outbox_id
   returning * into v_outbox;

  return jsonb_build_object(
    'retried', v_outbox.status = 'retry_wait',
    'status', v_outbox.status,
    'attemptCount', v_outbox.attempt_count,
    'availableAt', v_outbox.available_at,
    'terminal', v_outbox.terminal_at is not null
  );
end;
$$;

revoke all on function public.enforce_styling_execution_lease_window() from public, anon, authenticated;
revoke all on function public.enqueue_styling_workflow_outbox() from public, anon, authenticated;
revoke all on function public.enqueue_styling_completion_notification() from public, anon, authenticated;

revoke all on function public.claim_styling_workflow_outbox(integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_styling_workflow_outbox(integer, uuid, integer) to service_role;
revoke all on function public.finish_styling_workflow_outbox(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finish_styling_workflow_outbox(uuid, uuid, text) to service_role;
revoke all on function public.retry_styling_workflow_outbox(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.retry_styling_workflow_outbox(uuid, uuid, text, integer) to service_role;

revoke all on function public.claim_styling_completion_notifications(integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_styling_completion_notifications(integer, uuid, integer) to service_role;
revoke all on function public.prepare_styling_completion_notification(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_styling_completion_notification(uuid, uuid, jsonb) to service_role;
revoke all on function public.begin_styling_notification_provider_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_styling_notification_provider_attempt(uuid, uuid) to service_role;
revoke all on function public.finish_styling_completion_notification(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_styling_completion_notification(uuid, uuid, text, text, text) to service_role;
revoke all on function public.retry_styling_completion_notification(uuid, uuid, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.retry_styling_completion_notification(uuid, uuid, text, text, integer, boolean) to service_role;

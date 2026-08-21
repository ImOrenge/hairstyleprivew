-- Durable, per-service aftercare email delivery.
-- Provider calls happen outside transactions. Every post-claim write is fenced
-- by a lease token and ambiguous provider outcomes are never retried.

create extension if not exists citext with schema extensions;
create schema if not exists private;

create table public.aftercare_email_programs (
  id uuid primary key default gen_random_uuid(),
  actual_service_id uuid not null references public.actual_services_v2(id) on delete restrict,
  consultation_id uuid not null references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused')),
  source_program_version integer not null check (source_program_version > 0),
  paused_at timestamptz,
  resumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actual_service_id)
);

create table public.aftercare_email_outbox (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.aftercare_email_programs(id) on delete restrict,
  actual_service_id uuid references public.actual_services_v2(id) on delete restrict,
  legacy_care_content_id uuid references public.user_care_contents(id) on delete restrict,
  consultation_id uuid references public.consultation_sessions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  checkpoint text not null check (checkpoint in ('d1','d3','d7','d30','d45','d90')),
  source_program_version integer not null default 1 check (source_program_version > 0),
  template_version text not null default 'aftercare-email-v1',
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  subject text not null check (length(btrim(subject)) between 1 and 200),
  preheader text not null check (length(btrim(preheader)) between 1 and 300),
  html_body text not null,
  text_body text not null,
  recipient_email citext not null,
  scheduled_send_at timestamptz not null,
  status text not null default 'pending' check (status in (
    'pending','paused','held_for_review','claimed','provider_accepted','delivered',
    'retry_wait','delivery_unknown','bounced','dead_letter','cancelled'
  )),
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 256),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_attempted_at timestamptz,
  provider_message_id text,
  provider_last_event text,
  provider_last_event_at timestamptz,
  last_error_kind text,
  last_error text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((actual_service_id is not null and program_id is not null and legacy_care_content_id is null)
      or (actual_service_id is null and program_id is null and legacy_care_content_id is not null)),
  check ((status = 'claimed') = (lease_token is not null and lease_expires_at is not null))
);

create unique index aftercare_email_outbox_service_checkpoint_key
  on public.aftercare_email_outbox(actual_service_id, checkpoint)
  where actual_service_id is not null;
create unique index aftercare_email_outbox_legacy_key
  on public.aftercare_email_outbox(legacy_care_content_id)
  where legacy_care_content_id is not null;
create index aftercare_email_programs_user_idx
  on public.aftercare_email_programs(user_id, updated_at desc);
create index aftercare_email_outbox_program_idx
  on public.aftercare_email_outbox(program_id, scheduled_send_at);
create index aftercare_email_outbox_user_idx
  on public.aftercare_email_outbox(user_id, scheduled_send_at desc);
create index aftercare_email_outbox_due_idx
  on public.aftercare_email_outbox(available_at, scheduled_send_at)
  where status in ('pending', 'retry_wait');
create index aftercare_email_outbox_provider_message_idx
  on public.aftercare_email_outbox(provider_message_id)
  where provider_message_id is not null;

create table public.aftercare_email_webhook_events (
  svix_id text primary key,
  event_type text not null,
  provider_message_id text,
  provider_created_at timestamptz,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now()
);
create index aftercare_email_webhook_provider_idx
  on public.aftercare_email_webhook_events(provider_message_id, received_at desc);

create table public.aftercare_email_legacy_review (
  legacy_care_content_id uuid primary key references public.user_care_contents(id) on delete restrict,
  user_id text not null references public.users(id) on delete cascade,
  status text not null default 'held_for_review' check (status in ('held_for_review','released','cancelled')),
  original_scheduled_send_at timestamptz not null,
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  reviewed_by text,
  reviewed_at timestamptz,
  released_outbox_id uuid references public.aftercare_email_outbox(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index aftercare_email_legacy_review_status_idx
  on public.aftercare_email_legacy_review(status, original_scheduled_send_at);

alter table public.aftercare_email_programs enable row level security;
alter table public.aftercare_email_programs force row level security;
alter table public.aftercare_email_outbox enable row level security;
alter table public.aftercare_email_outbox force row level security;
alter table public.aftercare_email_webhook_events enable row level security;
alter table public.aftercare_email_webhook_events force row level security;
alter table public.aftercare_email_legacy_review enable row level security;
alter table public.aftercare_email_legacy_review force row level security;

revoke all on table public.aftercare_email_programs from public, anon, authenticated;
revoke all on table public.aftercare_email_outbox from public, anon, authenticated;
revoke all on table public.aftercare_email_webhook_events from public, anon, authenticated;
revoke all on table public.aftercare_email_legacy_review from public, anon, authenticated;
grant select, insert, update on table public.aftercare_email_programs to service_role;
grant select, insert, update on table public.aftercare_email_outbox to service_role;
grant select, insert on table public.aftercare_email_webhook_events to service_role;
grant select, insert, update on table public.aftercare_email_legacy_review to service_role;

create or replace function public.enqueue_aftercare_email_program(
  p_actual_service_id uuid,
  p_source_program_version integer,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actual public.actual_services_v2%rowtype;
  v_program_id uuid;
  v_item jsonb;
  v_checkpoint text;
  v_scheduled timestamptz;
  v_seen text[] := '{}';
begin
  if p_source_program_version < 1 or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> 6 then
    raise exception 'exactly six aftercare email items are required';
  end if;

  select * into v_actual
    from public.actual_services_v2
   where id = p_actual_service_id;
  if not found then raise exception 'actual service not found'; end if;

  insert into public.aftercare_email_programs (
    actual_service_id, consultation_id, user_id, source_program_version
  ) values (
    v_actual.id, v_actual.consultation_id, v_actual.user_id, p_source_program_version
  )
  on conflict (actual_service_id) do update
    set source_program_version = greatest(aftercare_email_programs.source_program_version, excluded.source_program_version),
        updated_at = now()
  returning id into v_program_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_checkpoint := v_item ->> 'checkpoint';
    v_scheduled := (v_item ->> 'scheduledSendAt')::timestamptz;
    if v_checkpoint not in ('d1','d3','d7','d30','d45','d90')
      or v_checkpoint = any(v_seen)
      or extract(hour from v_scheduled at time zone 'Asia/Seoul') <> 9
      or extract(minute from v_scheduled at time zone 'Asia/Seoul') <> 0
      or jsonb_typeof(v_item -> 'content') <> 'object'
      or btrim(coalesce(v_item ->> 'subject', '')) = ''
      or btrim(coalesce(v_item ->> 'html', '')) = ''
      or btrim(coalesce(v_item ->> 'text', '')) = '' then
      raise exception 'invalid aftercare email item for checkpoint %', v_checkpoint;
    end if;
    v_seen := array_append(v_seen, v_checkpoint);

    insert into public.aftercare_email_outbox (
      program_id, actual_service_id, consultation_id, user_id, checkpoint,
      source_program_version, template_version, content, subject, preheader,
      html_body, text_body, recipient_email, scheduled_send_at, status,
      idempotency_key, available_at
    )
    select
      v_program_id, v_actual.id, v_actual.consultation_id, v_actual.user_id, v_checkpoint,
      p_source_program_version, coalesce(nullif(v_item ->> 'templateVersion',''), 'aftercare-email-v1'),
      v_item -> 'content', v_item ->> 'subject', v_item ->> 'preheader',
      v_item ->> 'html', v_item ->> 'text', users.email, v_scheduled,
      case when programs.status = 'paused' then 'paused' else 'pending' end,
      'aftercare:' || v_actual.id::text || ':' || v_checkpoint,
      greatest(v_scheduled, now())
    from public.users as users
    join public.aftercare_email_programs as programs on programs.id = v_program_id
    where users.id = v_actual.user_id
    on conflict (actual_service_id, checkpoint) where actual_service_id is not null
    do update set
      source_program_version = excluded.source_program_version,
      template_version = excluded.template_version,
      content = excluded.content,
      subject = excluded.subject,
      preheader = excluded.preheader,
      html_body = excluded.html_body,
      text_body = excluded.text_body,
      recipient_email = excluded.recipient_email,
      scheduled_send_at = excluded.scheduled_send_at,
      available_at = greatest(excluded.scheduled_send_at, now()),
      updated_at = now()
    where aftercare_email_outbox.scheduled_send_at > now()
      and aftercare_email_outbox.status in ('pending','paused','retry_wait');
  end loop;

  return v_program_id;
end;
$$;

create or replace function public.set_aftercare_email_program_status(
  p_user_id text,
  p_actual_service_id uuid,
  p_status text
)
returns table (program_status text, affected_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_program_id uuid;
  v_count integer := 0;
begin
  if p_status not in ('active','paused') then raise exception 'invalid program status'; end if;
  update public.aftercare_email_programs
     set status = p_status,
         paused_at = case when p_status = 'paused' then now() else paused_at end,
         resumed_at = case when p_status = 'active' then now() else resumed_at end,
         updated_at = now()
   where actual_service_id = p_actual_service_id and user_id = p_user_id
  returning id into v_program_id;
  if v_program_id is null then raise exception 'aftercare email program not found'; end if;

  if p_status = 'paused' then
    update public.aftercare_email_outbox set status = 'paused', updated_at = now()
     where program_id = v_program_id and status in ('pending','retry_wait');
  else
    update public.aftercare_email_outbox
       set status = case when scheduled_send_at > now() then 'pending' else 'cancelled' end,
           available_at = case when scheduled_send_at > now() then greatest(scheduled_send_at, now()) else available_at end,
           terminal_at = case when scheduled_send_at <= now() then now() else null end,
           updated_at = now()
     where program_id = v_program_id and status = 'paused';
  end if;
  get diagnostics v_count = row_count;
  return query select p_status, v_count;
end;
$$;

create or replace function public.claim_aftercare_email_outbox(
  p_limit integer default 25,
  p_lease_seconds integer default 300,
  p_recipient_email text default null
)
returns table (
  outbox_id uuid, recipient_email text, subject text, html_body text, text_body text,
  idempotency_key text, attempt_count integer, lease_token uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_lease integer := greatest(60, least(coalesce(p_lease_seconds, 300), 900));
begin
  update public.aftercare_email_outbox
     set status = case when provider_attempted_at is null then 'retry_wait' else 'delivery_unknown' end,
         available_at = now(),
         terminal_at = case when provider_attempted_at is null then null else now() end,
         last_error_kind = case when provider_attempted_at is null then 'lease_expired_before_provider' else 'lease_expired_after_provider' end,
         lease_token = null, lease_expires_at = null, updated_at = now()
   where status = 'claimed' and lease_expires_at <= now();

  return query
  with candidates as (
    select outbox.id
      from public.aftercare_email_outbox as outbox
     where outbox.status in ('pending','retry_wait')
       and outbox.scheduled_send_at <= now()
       and outbox.available_at <= now()
       and (p_recipient_email is null or outbox.recipient_email = p_recipient_email::citext)
     order by outbox.scheduled_send_at, outbox.id
     limit v_limit
     for update skip locked
  ), claimed as (
    update public.aftercare_email_outbox as outbox
       set status = 'claimed', attempt_count = outbox.attempt_count + 1,
           lease_token = gen_random_uuid(),
           lease_expires_at = now() + make_interval(secs => v_lease),
           provider_attempted_at = null, updated_at = now()
      from candidates where outbox.id = candidates.id
    returning outbox.*
  )
  select claimed.id, claimed.recipient_email::text, claimed.subject,
         claimed.html_body, claimed.text_body, claimed.idempotency_key,
         claimed.attempt_count, claimed.lease_token
    from claimed;
end;
$$;

create or replace function public.begin_aftercare_email_provider_attempt(p_outbox_id uuid, p_lease_token uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with changed as (
    update public.aftercare_email_outbox
       set provider_attempted_at = now(), updated_at = now()
     where id = p_outbox_id and status = 'claimed'
       and lease_token = p_lease_token and lease_expires_at > now()
    returning 1
  ) select exists(select 1 from changed);
$$;

create or replace function public.complete_aftercare_email_provider_attempt(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_provider_message_id text default null,
  p_error_kind text default null,
  p_error text default null,
  p_retryable boolean default false,
  p_delivery_unknown boolean default false
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.aftercare_email_outbox%rowtype; v_status text;
begin
  select * into v_row from public.aftercare_email_outbox
   where id = p_outbox_id for update;
  if not found or v_row.status <> 'claimed' or v_row.lease_token <> p_lease_token
     or v_row.lease_expires_at <= now() then return 'stale_lease'; end if;

  if p_provider_message_id is not null then
    v_status := 'provider_accepted';
  elsif p_delivery_unknown then
    v_status := 'delivery_unknown';
  elsif p_retryable and v_row.attempt_count < v_row.max_attempts then
    v_status := 'retry_wait';
  else
    v_status := 'dead_letter';
  end if;

  update public.aftercare_email_outbox
     set status = v_status,
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         provider_last_event = case when p_provider_message_id is not null then 'email.accepted' else provider_last_event end,
         provider_last_event_at = case when p_provider_message_id is not null then now() else provider_last_event_at end,
         accepted_at = case when p_provider_message_id is not null then now() else accepted_at end,
         available_at = case when v_status = 'retry_wait'
           then now() + make_interval(secs => least(21600, 60 * power(2, greatest(0, v_row.attempt_count - 1))::integer))
           else available_at end,
         last_error_kind = p_error_kind, last_error = left(p_error, 2000),
         lease_token = null, lease_expires_at = null,
         terminal_at = case when v_status in ('delivery_unknown','dead_letter') then now() else null end,
         updated_at = now()
   where id = p_outbox_id;
  if p_provider_message_id is not null then
    update public.aftercare_email_outbox as outbox
       set status = case
             when exists (select 1 from public.aftercare_email_webhook_events e where e.provider_message_id=p_provider_message_id and e.event_type='email.delivered') then 'delivered'
             when exists (select 1 from public.aftercare_email_webhook_events e where e.provider_message_id=p_provider_message_id and e.event_type in ('email.bounced','email.failed','email.suppressed')) then 'bounced'
             else outbox.status end,
           delivered_at = coalesce((select max(coalesce(e.provider_created_at,e.received_at)) from public.aftercare_email_webhook_events e where e.provider_message_id=p_provider_message_id and e.event_type='email.delivered'), outbox.delivered_at),
           terminal_at = case
             when exists (select 1 from public.aftercare_email_webhook_events e where e.provider_message_id=p_provider_message_id and e.event_type in ('email.delivered','email.bounced','email.failed','email.suppressed'))
             then coalesce((select max(coalesce(e.provider_created_at,e.received_at)) from public.aftercare_email_webhook_events e where e.provider_message_id=p_provider_message_id and e.event_type in ('email.delivered','email.bounced','email.failed','email.suppressed')), now())
             else outbox.terminal_at end,
           updated_at = now()
     where outbox.id=p_outbox_id;
  end if;
  select status into v_status from public.aftercare_email_outbox where id=p_outbox_id;
  return v_status;
end;
$$;

create or replace function public.record_aftercare_email_webhook(
  p_svix_id text,
  p_event_type text,
  p_provider_message_id text,
  p_provider_created_at timestamptz,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_inserted integer; v_event_at timestamptz := coalesce(p_provider_created_at, now());
begin
  insert into public.aftercare_email_webhook_events(svix_id,event_type,provider_message_id,provider_created_at,payload)
  values (p_svix_id,p_event_type,p_provider_message_id,p_provider_created_at,p_payload)
  on conflict (svix_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return false; end if;

  update public.aftercare_email_outbox
     set provider_last_event = case when provider_last_event_at is null or v_event_at >= provider_last_event_at then p_event_type else provider_last_event end,
         provider_last_event_at = greatest(coalesce(provider_last_event_at, '-infinity'::timestamptz), v_event_at),
         status = case
           when p_event_type = 'email.delivered' then 'delivered'
           when p_event_type in ('email.bounced','email.failed','email.suppressed') and status <> 'delivered' then 'bounced'
           when p_event_type in ('email.accepted','email.delayed') and status in ('provider_accepted','claimed') then 'provider_accepted'
           else status end,
         delivered_at = case when p_event_type = 'email.delivered' then v_event_at else delivered_at end,
         terminal_at = case
           when p_event_type = 'email.delivered' then v_event_at
           when p_event_type in ('email.bounced','email.failed','email.suppressed') and status <> 'delivered' then v_event_at
           else terminal_at end,
         lease_token = case when status = 'claimed' then null else lease_token end,
         lease_expires_at = case when status = 'claimed' then null else lease_expires_at end,
         updated_at = now()
   where provider_message_id = p_provider_message_id;
  return true;
end;
$$;

create or replace function public.admin_aftercare_email_action(
  p_outbox_id uuid,
  p_action text,
  p_scheduled_send_at timestamptz default null,
  p_actor text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_status text;
begin
  select status into v_status from public.aftercare_email_outbox where id = p_outbox_id for update;
  if not found then raise exception 'outbox not found'; end if;
  if p_action = 'cancel' and v_status not in ('delivered','provider_accepted') then
    update public.aftercare_email_outbox set status='cancelled', terminal_at=now(), lease_token=null, lease_expires_at=null, updated_at=now() where id=p_outbox_id;
  elsif p_action = 'release' and v_status = 'held_for_review' and p_scheduled_send_at > now() then
    update public.aftercare_email_outbox set status='pending', scheduled_send_at=p_scheduled_send_at,
      available_at=p_scheduled_send_at, terminal_at=null, updated_at=now() where id=p_outbox_id;
  elsif p_action = 'retry' and v_status in ('dead_letter','delivery_unknown','bounced') then
    update public.aftercare_email_outbox set status='pending', available_at=now(), terminal_at=null,
      provider_attempted_at=null, last_error_kind='operator_retry', updated_at=now() where id=p_outbox_id;
  else
    raise exception 'action % is not allowed for status %', p_action, v_status;
  end if;
  select status into v_status from public.aftercare_email_outbox where id=p_outbox_id;
  return v_status;
end;
$$;

create or replace function public.release_legacy_aftercare_email(
  p_legacy_care_content_id uuid,
  p_scheduled_send_at timestamptz,
  p_item jsonb,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare v_review public.aftercare_email_legacy_review%rowtype; v_outbox_id uuid;
begin
  if p_scheduled_send_at <= now() or jsonb_typeof(p_item) <> 'object' then raise exception 'future rendered item is required'; end if;
  select * into v_review from public.aftercare_email_legacy_review
   where legacy_care_content_id=p_legacy_care_content_id for update;
  if not found or v_review.status <> 'held_for_review' then raise exception 'legacy item is not held for review'; end if;
  insert into public.aftercare_email_outbox(
    legacy_care_content_id,user_id,checkpoint,content,subject,preheader,html_body,text_body,
    recipient_email,scheduled_send_at,status,idempotency_key,available_at
  )
  select p_legacy_care_content_id,v_review.user_id,p_item->>'checkpoint',p_item->'content',
    p_item->>'subject',p_item->>'preheader',p_item->>'html',p_item->>'text',users.email,
    p_scheduled_send_at,'pending','aftercare:legacy:'||p_legacy_care_content_id::text,p_scheduled_send_at
  from public.users as users where users.id=v_review.user_id
  returning id into v_outbox_id;
  update public.aftercare_email_legacy_review set status='released',reviewed_by=p_actor,
    reviewed_at=now(),released_outbox_id=v_outbox_id where legacy_care_content_id=p_legacy_care_content_id;
  return v_outbox_id;
end;
$$;

create or replace function public.cancel_legacy_aftercare_email(p_legacy_care_content_id uuid,p_actor text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with changed as (
    update public.aftercare_email_legacy_review set status='cancelled',reviewed_by=p_actor,reviewed_at=now()
     where legacy_care_content_id=p_legacy_care_content_id and status='held_for_review' returning 1
  ) select exists(select 1 from changed);
$$;

-- Preserve every unsent legacy row for explicit review. The old HTML is kept
-- only as audit evidence and is never read by the new dispatcher.
insert into public.aftercare_email_legacy_review (
  legacy_care_content_id, user_id, original_scheduled_send_at, source_snapshot
)
select content.id, content.user_id, content.scheduled_send_at,
  jsonb_build_object(
    'contentType', content.content_type,
    'dayOffset', content.day_offset,
    'subject', content.subject,
    'bodyHtml', content.body_html,
    'hairRecordId', content.hair_record_id,
    'wasOverdueAtMigration', content.scheduled_send_at <= now()
  )
from public.user_care_contents as content
where content.sent_at is null
on conflict (legacy_care_content_id) do nothing;

revoke all on function public.enqueue_aftercare_email_program(uuid,integer,jsonb) from public, anon, authenticated;
revoke all on function public.set_aftercare_email_program_status(text,uuid,text) from public, anon, authenticated;
revoke all on function public.claim_aftercare_email_outbox(integer,integer,text) from public, anon, authenticated;
revoke all on function public.begin_aftercare_email_provider_attempt(uuid,uuid) from public, anon, authenticated;
revoke all on function public.complete_aftercare_email_provider_attempt(uuid,uuid,text,text,text,boolean,boolean) from public, anon, authenticated;
revoke all on function public.record_aftercare_email_webhook(text,text,text,timestamptz,jsonb) from public, anon, authenticated;
revoke all on function public.admin_aftercare_email_action(uuid,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.release_legacy_aftercare_email(uuid,timestamptz,jsonb,text) from public, anon, authenticated;
revoke all on function public.cancel_legacy_aftercare_email(uuid,text) from public, anon, authenticated;
grant execute on function public.enqueue_aftercare_email_program(uuid,integer,jsonb) to service_role;
grant execute on function public.set_aftercare_email_program_status(text,uuid,text) to service_role;
grant execute on function public.claim_aftercare_email_outbox(integer,integer,text) to service_role;
grant execute on function public.begin_aftercare_email_provider_attempt(uuid,uuid) to service_role;
grant execute on function public.complete_aftercare_email_provider_attempt(uuid,uuid,text,text,text,boolean,boolean) to service_role;
grant execute on function public.record_aftercare_email_webhook(text,text,text,timestamptz,jsonb) to service_role;
grant execute on function public.admin_aftercare_email_action(uuid,text,timestamptz,text) to service_role;
grant execute on function public.release_legacy_aftercare_email(uuid,timestamptz,jsonb,text) to service_role;
grant execute on function public.cancel_legacy_aftercare_email(uuid,text) to service_role;

create or replace function public.authorize_aftercare_cron_request(p_bearer text)
returns boolean
language sql
security definer
set search_path = pg_catalog, vault
as $$
  select exists(
    select 1 from vault.decrypted_secrets
     where name='aftercare_dispatch_bearer'
       and length(coalesce(p_bearer,'')) >= 32
       and decrypted_secret=p_bearer
  );
$$;
revoke all on function public.authorize_aftercare_cron_request(text) from public, anon, authenticated;
grant execute on function public.authorize_aftercare_cron_request(text) to service_role;

-- Called only after Vault contains aftercare_dispatch_url and
-- aftercare_dispatch_bearer. Keeping cron creation explicit makes schema-first,
-- delivery-OFF rollout safe and repeatable.
create or replace function public.configure_aftercare_email_cron()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, cron, vault
as $$
declare v_url text; v_bearer text; v_job_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='aftercare_dispatch_url';
  select decrypted_secret into v_bearer from vault.decrypted_secrets where name='aftercare_dispatch_bearer';
  if nullif(v_url,'') is null or nullif(v_bearer,'') is null then raise exception 'aftercare cron Vault secrets are missing'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname='cron-care-emails';
  select cron.schedule(
    'cron-care-emails', '*/5 * * * *',
    format($job$select net.http_post(url := %L, headers := jsonb_build_object('Authorization', %L, 'Content-Type','application/json'), body := '{}'::jsonb);$job$, v_url, 'Bearer ' || v_bearer)
  ) into v_job_id;
  return v_job_id;
end;
$$;
revoke all on function public.configure_aftercare_email_cron() from public, anon, authenticated;
grant execute on function public.configure_aftercare_email_cron() to service_role;

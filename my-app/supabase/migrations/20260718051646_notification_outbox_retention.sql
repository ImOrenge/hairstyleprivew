-- Minimize completed email notification data without weakening delivery retries.
-- Active rows keep their frozen provider payload. Terminal rows are redacted
-- after the support window and the remaining idempotency metadata is deleted
-- after one year.

alter table public.generation_notification_outbox
  add column payload_redacted_at timestamptz;

alter table public.styling_notification_outbox
  add column payload_redacted_at timestamptz;

alter table public.generation_notification_outbox
  add constraint generation_notification_outbox_payload_redaction_check
  check (
    payload_redacted_at is null
    or (
      terminal_at is not null
      and event_payload = '{}'::jsonb
      and rendered_payload is null
      and recipient_email is null
      and recipient_display_name is null
      and last_error is null
    )
  );

alter table public.styling_notification_outbox
  add constraint styling_notification_outbox_payload_redaction_check
  check (
    payload_redacted_at is null
    or (
      terminal_at is not null
      and event_payload = '{}'::jsonb
      and rendered_payload is null
      and recipient_email is null
      and recipient_display_name is null
      and last_error is null
    )
  );

comment on column public.generation_notification_outbox.payload_redacted_at is
  'Set after terminal email content, recipient fields, event payload, and error detail are removed.';
comment on column public.styling_notification_outbox.payload_redacted_at is
  'Set after terminal email content, recipient fields, event payload, and error detail are removed.';

create index idx_generation_notification_outbox_retention_due
  on public.generation_notification_outbox (terminal_at, id)
  where terminal_at is not null and payload_redacted_at is null;

create index idx_generation_notification_outbox_metadata_expiry
  on public.generation_notification_outbox (terminal_at, id)
  where terminal_at is not null and payload_redacted_at is not null;

create index idx_styling_notification_outbox_retention_due
  on public.styling_notification_outbox (terminal_at, id)
  where terminal_at is not null and payload_redacted_at is null;

create index idx_styling_notification_outbox_metadata_expiry
  on public.styling_notification_outbox (terminal_at, id)
  where terminal_at is not null and payload_redacted_at is not null;

create schema if not exists private;
revoke all on schema private from public;
revoke usage on schema private from anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.apply_notification_outbox_retention(
  p_limit integer default 500,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_generation_redacted integer := 0;
  v_styling_redacted integer := 0;
  v_generation_deleted integer := 0;
  v_styling_deleted integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception 'p_limit must be between 1 and 5000';
  end if;
  if p_now is null then
    raise exception 'p_now is required';
  end if;

  with candidates as (
    select outbox.id
      from public.generation_notification_outbox as outbox
     where outbox.terminal_at is not null
       and outbox.payload_redacted_at is null
       and outbox.terminal_at <= p_now - case
         when outbox.status in ('dead_letter', 'delivery_unknown') then interval '90 days'
         else interval '30 days'
       end
     order by outbox.terminal_at, outbox.id
     limit p_limit
     for update skip locked
  )
  update public.generation_notification_outbox as outbox
     set event_payload = '{}'::jsonb,
         rendered_payload = null,
         recipient_email = null,
         recipient_display_name = null,
         last_error = null,
         payload_redacted_at = p_now,
         updated_at = greatest(outbox.updated_at, p_now)
    from candidates
   where outbox.id = candidates.id;
  get diagnostics v_generation_redacted = row_count;

  with candidates as (
    select outbox.id
      from public.styling_notification_outbox as outbox
     where outbox.terminal_at is not null
       and outbox.payload_redacted_at is null
       and outbox.terminal_at <= p_now - case
         when outbox.status in ('dead_letter', 'delivery_unknown') then interval '90 days'
         else interval '30 days'
       end
     order by outbox.terminal_at, outbox.id
     limit p_limit
     for update skip locked
  )
  update public.styling_notification_outbox as outbox
     set event_payload = '{}'::jsonb,
         rendered_payload = null,
         recipient_email = null,
         recipient_display_name = null,
         last_error = null,
         payload_redacted_at = p_now,
         updated_at = greatest(outbox.updated_at, p_now)
    from candidates
   where outbox.id = candidates.id;
  get diagnostics v_styling_redacted = row_count;

  with candidates as (
    select outbox.id
      from public.generation_notification_outbox as outbox
     where outbox.terminal_at <= p_now - interval '365 days'
       and outbox.payload_redacted_at is not null
     order by outbox.terminal_at, outbox.id
     limit p_limit
     for update skip locked
  )
  delete from public.generation_notification_outbox as outbox
   using candidates
   where outbox.id = candidates.id;
  get diagnostics v_generation_deleted = row_count;

  with candidates as (
    select outbox.id
      from public.styling_notification_outbox as outbox
     where outbox.terminal_at <= p_now - interval '365 days'
       and outbox.payload_redacted_at is not null
     order by outbox.terminal_at, outbox.id
     limit p_limit
     for update skip locked
  )
  delete from public.styling_notification_outbox as outbox
   using candidates
   where outbox.id = candidates.id;
  get diagnostics v_styling_deleted = row_count;

  return jsonb_build_object(
    'generationRedacted', v_generation_redacted,
    'stylingRedacted', v_styling_redacted,
    'generationDeleted', v_generation_deleted,
    'stylingDeleted', v_styling_deleted,
    'completedRetentionDays', 30,
    'manualReviewRetentionDays', 90,
    'metadataRetentionDays', 365
  );
end;
$$;

comment on function private.apply_notification_outbox_retention(integer, timestamptz) is
  'Redacts terminal email payloads after 30 days, or 90 days for manual-review states, then deletes redacted outbox metadata after 365 days.';

revoke all on function private.apply_notification_outbox_retention(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function private.apply_notification_outbox_retention(integer, timestamptz)
  to service_role;

create or replace function public.apply_notification_outbox_retention(
  p_limit integer default 500,
  p_now timestamptz default now()
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.apply_notification_outbox_retention(p_limit, p_now);
$$;

comment on function public.apply_notification_outbox_retention(integer, timestamptz) is
  'Service-role entrypoint for the private notification outbox retention worker.';

revoke all on function public.apply_notification_outbox_retention(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_notification_outbox_retention(integer, timestamptz)
  to service_role;

-- Register a daily database-local cleanup when pg_cron is available. The
-- retention function is also callable by the service role for explicit drains.
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
      'notification-outbox-retention-daily'
    );
    execute format(
      'select %1$I.schedule(%2$L, %3$L, %4$L)',
      v_cron_schema,
      'notification-outbox-retention-daily',
      '23 17 * * *',
      'select public.apply_notification_outbox_retention(1000, now());'
    );
  end if;
end;
$$;

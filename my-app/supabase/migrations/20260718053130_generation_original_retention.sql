-- Give partial/failed generation originals a bounded retry window and move
-- every Storage deletion behind a durable database outbox. The database owns
-- the retry-abandonment/expiry decision; the App removes the object through
-- the Supabase Storage API and then acknowledges the fenced outbox lease.

alter table public.generations
  add column original_retention_expires_at timestamptz,
  add column original_cleanup_status text not null default 'retained',
  add column original_cleanup_reason text,
  add column original_cleanup_requested_at timestamptz,
  add column original_deleted_at timestamptz,
  add column retry_abandoned_at timestamptz;

alter table public.generation_upload_drafts
  add column cleanup_requested_at timestamptz,
  add column deleted_at timestamptz;

update public.generations
   set original_retention_expires_at = coalesce(accepted_at, created_at) + interval '24 hours'
 where original_image_path like 'originals/%'
   and original_retention_expires_at is null;

update public.generations
   set original_cleanup_status = 'deleted',
       original_cleanup_reason = 'legacy_cleanup',
       original_cleanup_requested_at = coalesce(updated_at, created_at),
       original_deleted_at = coalesce(updated_at, created_at),
       original_retention_expires_at = null
 where original_image_path like 'deleted-original://%';

alter table public.generations
  add constraint generations_original_cleanup_status_check
    check (original_cleanup_status in ('retained', 'cleanup_queued', 'deleted')),
  add constraint generations_original_cleanup_reason_check
    check (
      original_cleanup_reason is null
      or original_cleanup_reason in (
        'all_variants_completed',
        'retry_abandoned',
        'retention_expired',
        'legacy_cleanup'
      )
    ),
  add constraint generations_original_cleanup_shape_check
    check (
      (
        original_cleanup_status = 'retained'
        and original_cleanup_reason is null
        and original_cleanup_requested_at is null
        and original_deleted_at is null
      )
      or
      (
        original_cleanup_status = 'cleanup_queued'
        and original_cleanup_reason is not null
        and original_cleanup_requested_at is not null
        and original_deleted_at is null
      )
      or
      (
        original_cleanup_status = 'deleted'
        and original_cleanup_reason is not null
        and original_cleanup_requested_at is not null
        and original_deleted_at is not null
      )
    ),
  add constraint generations_retry_abandoned_terminal_check
    check (retry_abandoned_at is null or status in ('completed', 'failed'));

create index idx_generations_original_retention_due
  on public.generations (original_retention_expires_at, id)
  where original_cleanup_status = 'retained'
    and original_retention_expires_at is not null
    and original_image_path like 'originals/%';

create table public.generation_original_cleanup_outbox (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid,
  draft_id uuid,
  user_id text not null,
  object_path text not null unique,
  cleanup_reason text not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  deleted_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint generation_original_cleanup_outbox_source_check
    check ((generation_id is not null) <> (draft_id is not null)),
  constraint generation_original_cleanup_outbox_user_check
    check (length(btrim(user_id)) between 1 and 256),
  constraint generation_original_cleanup_outbox_path_check
    check (object_path like 'originals/%' and length(object_path) <= 1024),
  constraint generation_original_cleanup_outbox_reason_check
    check (cleanup_reason in ('all_variants_completed', 'retry_abandoned', 'retention_expired', 'draft_expired')),
  constraint generation_original_cleanup_outbox_status_check
    check (status in ('queued', 'deleting', 'retry', 'deleted', 'dead_letter')),
  constraint generation_original_cleanup_outbox_attempt_check
    check (attempt_count between 0 and max_attempts),
  constraint generation_original_cleanup_outbox_max_attempts_check
    check (max_attempts between 1 and 100),
  constraint generation_original_cleanup_outbox_lease_check
    check (
      (
        status = 'deleting'
        and lease_token is not null
        and lease_expires_at is not null
        and terminal_at is null
      )
      or
      (
        status <> 'deleting'
        and lease_token is null
        and lease_expires_at is null
      )
    ),
  constraint generation_original_cleanup_outbox_terminal_check
    check ((status in ('deleted', 'dead_letter')) = (terminal_at is not null)),
  constraint generation_original_cleanup_outbox_deleted_check
    check ((status = 'deleted') = (deleted_at is not null))
);

create index idx_generation_original_cleanup_outbox_due
  on public.generation_original_cleanup_outbox (available_at, created_at, id)
  where status in ('queued', 'retry');

create index idx_generation_original_cleanup_outbox_expired_lease
  on public.generation_original_cleanup_outbox (lease_expires_at, id)
  where status = 'deleting';

alter table public.generation_original_cleanup_outbox enable row level security;
alter table public.generation_original_cleanup_outbox force row level security;
revoke all on table public.generation_original_cleanup_outbox from public, anon, authenticated;
grant select, insert, update on table public.generation_original_cleanup_outbox to service_role;

create or replace function public.set_generation_original_retention_defaults()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role')
     and new.accepted_at is not null
     and new.original_image_path like 'originals/%'
     and new.original_retention_expires_at is null then
    new.original_retention_expires_at := new.accepted_at + interval '24 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_generations_set_original_retention_defaults on public.generations;
create trigger trg_generations_set_original_retention_defaults
before insert or update of accepted_at, original_image_path on public.generations
for each row execute procedure public.set_generation_original_retention_defaults();

create or replace function public.guard_generation_original_retention_columns()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.original_retention_expires_at is not null
       or new.original_cleanup_status <> 'retained'
       or new.original_cleanup_reason is not null
       or new.original_cleanup_requested_at is not null
       or new.original_deleted_at is not null
       or new.retry_abandoned_at is not null then
      raise exception using errcode = '42501', message = 'Generation original retention is service-role managed';
    end if;
  elsif new.original_retention_expires_at is distinct from old.original_retention_expires_at
     or new.original_cleanup_status is distinct from old.original_cleanup_status
     or new.original_cleanup_reason is distinct from old.original_cleanup_reason
     or new.original_cleanup_requested_at is distinct from old.original_cleanup_requested_at
     or new.original_deleted_at is distinct from old.original_deleted_at
     or new.retry_abandoned_at is distinct from old.retry_abandoned_at then
    raise exception using errcode = '42501', message = 'Generation original retention is service-role managed';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_generations_guard_original_retention on public.generations;
create trigger trg_generations_guard_original_retention
before insert or update on public.generations
for each row execute procedure public.guard_generation_original_retention_columns();

create or replace function public.prevent_generation_retry_after_original_cleanup()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
begin
  if old.original_cleanup_status <> 'retained'
     and new.options is distinct from old.options
     and exists (
       select 1
         from jsonb_array_elements(
           case
             when jsonb_typeof(new.options #> '{recommendationSet,variants}') = 'array'
               then new.options #> '{recommendationSet,variants}'
             else '[]'::jsonb
           end
         ) as variant(value)
        where variant.value ->> 'status' = 'generating'
     ) then
    raise exception using
      errcode = '55000',
      message = 'Generation original retry is unavailable after cleanup was requested';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_generations_prevent_retry_after_original_cleanup on public.generations;
create trigger trg_generations_prevent_retry_after_original_cleanup
before update of options on public.generations
for each row execute procedure public.prevent_generation_retry_after_original_cleanup();

create or replace function public.request_generation_original_cleanup(
  p_generation_id uuid,
  p_user_id text,
  p_reason text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_generation public.generations%rowtype;
  v_variants jsonb;
  v_failed_count integer := 0;
  v_completed_count integer := 0;
  v_total_count integer := 0;
  v_outbox public.generation_original_cleanup_outbox%rowtype;
begin
  if p_generation_id is null then raise exception 'p_generation_id is required'; end if;
  if nullif(btrim(p_user_id), '') is null then raise exception 'p_user_id is required'; end if;
  if p_reason not in ('all_variants_completed', 'retry_abandoned', 'retention_expired') then
    raise exception 'invalid original cleanup reason';
  end if;
  if p_now is null then raise exception 'p_now is required'; end if;

  select generation.* into v_generation
    from public.generations as generation
   where generation.id = p_generation_id
     and generation.user_id = p_user_id
   for update;
  if not found then raise exception 'Generation % was not found for this user', p_generation_id; end if;

  if v_generation.original_cleanup_status = 'deleted'
     or v_generation.original_image_path like 'deleted-original://%' then
    return jsonb_build_object(
      'generationId', v_generation.id,
      'cleanupStatus', 'deleted',
      'retryAvailable', false,
      'idempotentReplay', true
    );
  end if;

  if v_generation.status not in ('completed', 'failed') then
    raise exception 'Generation % is not terminal', p_generation_id;
  end if;

  v_variants := v_generation.options #> '{recommendationSet,variants}';
  if jsonb_typeof(v_variants) = 'array' then
    select
      count(*)::integer,
      count(*) filter (where variant.value ->> 'status' = 'completed')::integer,
      count(*) filter (where variant.value ->> 'status' = 'failed')::integer
      into v_total_count, v_completed_count, v_failed_count
      from jsonb_array_elements(v_variants) as variant(value);
  end if;

  if p_reason = 'all_variants_completed'
     and not (v_total_count > 0 and v_completed_count = v_total_count) then
    raise exception 'Generation % still requires its original for retry', p_generation_id;
  end if;
  if p_reason = 'retry_abandoned'
     and not (v_generation.status = 'failed' or v_failed_count > 0) then
    raise exception 'Generation % has no failed result to abandon', p_generation_id;
  end if;
  if p_reason = 'retention_expired'
     and (
       v_generation.original_retention_expires_at is null
       or v_generation.original_retention_expires_at > p_now
     ) then
    raise exception 'Generation % original retention has not expired', p_generation_id;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(case when jsonb_typeof(v_variants) = 'array' then v_variants else '[]'::jsonb end) as variant(value)
     where variant.value ->> 'status' = 'generating'
  ) then
    raise exception 'Generation % has an active variant attempt', p_generation_id;
  end if;

  if v_generation.original_cleanup_status = 'cleanup_queued' then
    if p_reason = 'retry_abandoned' and v_generation.retry_abandoned_at is null then
      update public.generations
         set retry_abandoned_at = p_now,
             updated_at = greatest(updated_at, p_now)
       where id = v_generation.id;
    end if;
    select outbox.* into v_outbox
      from public.generation_original_cleanup_outbox as outbox
     where outbox.generation_id = v_generation.id
     order by outbox.created_at desc
     limit 1;
    return jsonb_build_object(
      'generationId', v_generation.id,
      'cleanupId', v_outbox.id,
      'cleanupStatus', coalesce(v_outbox.status, 'queued'),
      'retryAvailable', false,
      'idempotentReplay', true
    );
  end if;

  if v_generation.original_image_path not like 'originals/%' then
    raise exception 'Generation % original is not available', p_generation_id;
  end if;

  insert into public.generation_original_cleanup_outbox (
    generation_id,
    user_id,
    object_path,
    cleanup_reason
  ) values (
    v_generation.id,
    v_generation.user_id,
    v_generation.original_image_path,
    p_reason
  )
  on conflict (object_path) do nothing
  returning * into v_outbox;

  if v_outbox.id is null then
    select outbox.* into v_outbox
      from public.generation_original_cleanup_outbox as outbox
     where outbox.object_path = v_generation.original_image_path
     for update;

    if v_outbox.generation_id is distinct from v_generation.id
       or v_outbox.draft_id is not null
       or v_outbox.status in ('deleted', 'dead_letter') then
      raise exception 'Original cleanup path is already owned by another or terminal cleanup';
    end if;
  end if;

  update public.generations as generation
     set original_cleanup_status = 'cleanup_queued',
         original_cleanup_reason = p_reason,
         original_cleanup_requested_at = p_now,
         retry_abandoned_at = case
           when p_reason = 'retry_abandoned' then coalesce(generation.retry_abandoned_at, p_now)
           else generation.retry_abandoned_at
         end,
         updated_at = greatest(generation.updated_at, p_now)
   where generation.id = v_generation.id;

  update public.generation_upload_drafts as draft
     set cleanup_requested_at = coalesce(draft.cleanup_requested_at, p_now),
         updated_at = greatest(draft.updated_at, p_now)
   where draft.generation_id = v_generation.id
     and draft.original_image_path = v_generation.original_image_path;

  return jsonb_build_object(
    'generationId', v_generation.id,
    'cleanupId', v_outbox.id,
    'cleanupStatus', v_outbox.status,
    'retryAvailable', false,
    'retentionExpiresAt', v_generation.original_retention_expires_at,
    'retryAbandonedAt', case when p_reason = 'retry_abandoned' then p_now else v_generation.retry_abandoned_at end,
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.abandon_generation_retry(
  p_generation_id uuid,
  p_user_id text,
  p_now timestamptz default now()
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, extensions
as $$
  select public.request_generation_original_cleanup(
    p_generation_id,
    p_user_id,
    'retry_abandoned',
    p_now
  );
$$;

create or replace function public.queue_expired_generation_originals(
  p_limit integer default 100,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_candidate record;
  v_queued integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'p_limit must be between 1 and 1000'; end if;
  if p_now is null then raise exception 'p_now is required'; end if;

  for v_candidate in
    select generation.id, generation.user_id
      from public.generations as generation
     where generation.original_cleanup_status = 'retained'
       and generation.original_image_path like 'originals/%'
       and generation.original_retention_expires_at <= p_now
       and generation.status in ('completed', 'failed')
     order by generation.original_retention_expires_at, generation.id
     limit p_limit
     for update skip locked
  loop
    perform public.request_generation_original_cleanup(
      v_candidate.id,
      v_candidate.user_id,
      'retention_expired',
      p_now
    );
    v_queued := v_queued + 1;
  end loop;

  return jsonb_build_object('queuedCount', v_queued, 'cutoff', p_now);
end;
$$;

create or replace function public.expire_generation_upload_drafts(
  p_limit integer default 100,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_expired integer := 0;
  v_enqueued integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'p_limit must be between 1 and 1000'; end if;
  if p_now is null then raise exception 'p_now is required'; end if;

  with candidates as (
    select draft.id
      from public.generation_upload_drafts as draft
     where draft.state = 'ready'
       and draft.expires_at <= p_now
     order by draft.expires_at, draft.id
     limit p_limit
     for update skip locked
  ), expired as (
    update public.generation_upload_drafts as draft
       set state = 'expired',
           cleanup_requested_at = coalesce(draft.cleanup_requested_at, p_now),
           updated_at = greatest(draft.updated_at, p_now)
      from candidates
     where draft.id = candidates.id
    returning draft.*
  ), enqueued as (
    insert into public.generation_original_cleanup_outbox (
      draft_id,
      user_id,
      object_path,
      cleanup_reason
    )
    select expired.id, expired.user_id, expired.original_image_path, 'draft_expired'
      from expired
     where expired.original_image_path like 'originals/%'
    on conflict (object_path) do nothing
    returning id
  )
  select
    (select count(*)::integer from expired),
    (select count(*)::integer from enqueued)
    into v_expired, v_enqueued;

  return jsonb_build_object(
    'expiredCount', v_expired,
    'enqueuedCount', v_enqueued,
    'cutoff', p_now
  );
end;
$$;

create or replace function public.claim_generation_original_cleanups(
  p_limit integer default 25,
  p_cleanup_id uuid default null,
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
  update public.generation_original_cleanup_outbox as outbox
     set status = 'dead_letter',
         lease_token = null,
         lease_expires_at = null,
         terminal_at = now(),
         last_error = coalesce(outbox.last_error, 'Original cleanup attempts were exhausted'),
         updated_at = now()
   where outbox.status = 'deleting'
     and outbox.lease_expires_at <= now()
     and outbox.attempt_count >= outbox.max_attempts
     and (p_cleanup_id is null or outbox.id = p_cleanup_id);

  return query
  with candidates as (
    select outbox.id
      from public.generation_original_cleanup_outbox as outbox
     where outbox.attempt_count < outbox.max_attempts
       and (p_cleanup_id is null or outbox.id = p_cleanup_id)
       and (
         (outbox.status in ('queued', 'retry') and outbox.available_at <= now())
         or
         (outbox.status = 'deleting' and outbox.lease_expires_at <= now())
       )
     order by outbox.available_at, outbox.created_at, outbox.id
     limit v_limit
     for update skip locked
  ), claimed as (
    update public.generation_original_cleanup_outbox as outbox
       set status = 'deleting',
           attempt_count = outbox.attempt_count + 1,
           lease_token = gen_random_uuid(),
           lease_expires_at = now() + make_interval(secs => v_lease_seconds),
           updated_at = now()
      from candidates
     where outbox.id = candidates.id
    returning outbox.*
  )
  select jsonb_build_object(
    'cleanupId', claimed.id,
    'generationId', claimed.generation_id,
    'draftId', claimed.draft_id,
    'userId', claimed.user_id,
    'objectPath', claimed.object_path,
    'cleanupReason', claimed.cleanup_reason,
    'attemptCount', claimed.attempt_count,
    'leaseToken', claimed.lease_token,
    'leaseExpiresAt', claimed.lease_expires_at
  )
  from claimed;
end;
$$;

create or replace function public.finish_generation_original_cleanup(
  p_cleanup_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_outbox public.generation_original_cleanup_outbox%rowtype;
  v_now timestamptz := now();
begin
  select outbox.* into v_outbox
    from public.generation_original_cleanup_outbox as outbox
   where outbox.id = p_cleanup_id
   for update;
  if not found then raise exception 'Original cleanup % not found', p_cleanup_id; end if;
  if v_outbox.status = 'deleted' then
    return jsonb_build_object('finished', false, 'idempotentReplay', true, 'status', 'deleted');
  end if;
  if v_outbox.status <> 'deleting'
     or v_outbox.lease_token <> p_lease_token
     or v_outbox.lease_expires_at <= v_now then
    raise exception 'Stale original cleanup lease for %', p_cleanup_id;
  end if;

  update public.generation_original_cleanup_outbox as outbox
     set status = 'deleted',
         lease_token = null,
         lease_expires_at = null,
         deleted_at = v_now,
         terminal_at = v_now,
         last_error = null,
         updated_at = v_now
   where outbox.id = v_outbox.id
   returning * into v_outbox;

  if v_outbox.generation_id is not null then
    update public.generations as generation
       set original_image_path = 'deleted-original://' || generation.id::text,
           original_cleanup_status = 'deleted',
           original_deleted_at = v_now,
           updated_at = v_now
     where generation.id = v_outbox.generation_id
       and generation.original_cleanup_status = 'cleanup_queued'
       and generation.original_image_path = v_outbox.object_path;

    update public.generation_upload_drafts as draft
       set original_image_path = 'deleted-original://' || v_outbox.generation_id::text,
           deleted_at = v_now,
           updated_at = v_now
     where draft.generation_id = v_outbox.generation_id
       and draft.original_image_path = v_outbox.object_path;
  else
    update public.generation_upload_drafts as draft
       set original_image_path = 'deleted-draft://' || draft.id::text,
           deleted_at = v_now,
           updated_at = v_now
     where draft.id = v_outbox.draft_id
       and draft.state in ('expired', 'cancelled')
       and draft.original_image_path = v_outbox.object_path;
  end if;

  return jsonb_build_object(
    'finished', true,
    'cleanupId', v_outbox.id,
    'generationId', v_outbox.generation_id,
    'draftId', v_outbox.draft_id,
    'status', v_outbox.status,
    'deletedAt', v_outbox.deleted_at
  );
end;
$$;

create or replace function public.retry_generation_original_cleanup(
  p_cleanup_id uuid,
  p_lease_token uuid,
  p_error text,
  p_delay_seconds integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_outbox public.generation_original_cleanup_outbox%rowtype;
  v_terminal boolean;
begin
  if p_delay_seconds is null or p_delay_seconds not between 0 and 86400 then
    raise exception 'p_delay_seconds must be between 0 and 86400';
  end if;
  select outbox.* into v_outbox
    from public.generation_original_cleanup_outbox as outbox
   where outbox.id = p_cleanup_id
   for update;
  if not found then raise exception 'Original cleanup % not found', p_cleanup_id; end if;
  if v_outbox.status in ('deleted', 'dead_letter') then
    return jsonb_build_object('retried', false, 'terminal', true, 'status', v_outbox.status);
  end if;
  if v_outbox.status <> 'deleting'
     or v_outbox.lease_token <> p_lease_token
     or v_outbox.lease_expires_at <= now() then
    raise exception 'Stale original cleanup lease for %', p_cleanup_id;
  end if;

  v_terminal := v_outbox.attempt_count >= v_outbox.max_attempts;
  update public.generation_original_cleanup_outbox as outbox
     set status = case when v_terminal then 'dead_letter' else 'retry' end,
         available_at = case when v_terminal then now() else now() + make_interval(secs => p_delay_seconds) end,
         lease_token = null,
         lease_expires_at = null,
         last_error = left(coalesce(nullif(btrim(p_error), ''), 'Storage deletion failed'), 2000),
         terminal_at = case when v_terminal then now() else null end,
         updated_at = now()
   where outbox.id = v_outbox.id
   returning * into v_outbox;

  return jsonb_build_object(
    'retried', v_outbox.status = 'retry',
    'terminal', v_outbox.terminal_at is not null,
    'status', v_outbox.status,
    'availableAt', v_outbox.available_at
  );
end;
$$;

revoke all on function public.set_generation_original_retention_defaults() from public, anon, authenticated;
revoke all on function public.guard_generation_original_retention_columns() from public, anon, authenticated;
revoke all on function public.prevent_generation_retry_after_original_cleanup() from public, anon, authenticated;
revoke all on function public.request_generation_original_cleanup(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.abandon_generation_retry(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.queue_expired_generation_originals(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.expire_generation_upload_drafts(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_generation_original_cleanups(integer, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_generation_original_cleanup(uuid, uuid) from public, anon, authenticated;
revoke all on function public.retry_generation_original_cleanup(uuid, uuid, text, integer) from public, anon, authenticated;

grant execute on function public.request_generation_original_cleanup(uuid, text, text, timestamptz) to service_role;
grant execute on function public.abandon_generation_retry(uuid, text, timestamptz) to service_role;
grant execute on function public.queue_expired_generation_originals(integer, timestamptz) to service_role;
grant execute on function public.expire_generation_upload_drafts(integer, timestamptz) to service_role;
grant execute on function public.claim_generation_original_cleanups(integer, uuid, integer) to service_role;
grant execute on function public.finish_generation_original_cleanup(uuid, uuid) to service_role;
grant execute on function public.retry_generation_original_cleanup(uuid, uuid, text, integer) to service_role;

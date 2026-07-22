-- Make the first generation acceptance close-safe. The upload draft, generation,
-- and Workflow dispatch intent are committed together; every worker write after
-- that boundary is protected by a lease token.

alter table public.generations
  add column if not exists accepted_at timestamptz,
  add column if not exists generated_assets_expires_at timestamptz,
  add column if not exists preparation_status text not null default 'ready',
  add column if not exists preparation_attempt_count integer not null default 0,
  add column if not exists preparation_max_attempts integer not null default 5,
  add column if not exists preparation_available_at timestamptz,
  add column if not exists preparation_lease_token uuid,
  add column if not exists preparation_lease_expires_at timestamptz,
  add column if not exists preparation_started_at timestamptz,
  add column if not exists prepared_at timestamptz,
  add column if not exists preparation_error text;

alter table public.generations
  add constraint generations_preparation_status_check
    check (preparation_status in ('queued', 'preparing', 'retry', 'ready', 'failed')),
  add constraint generations_preparation_attempt_count_check
    check (
      preparation_attempt_count >= 0
      and preparation_attempt_count <= preparation_max_attempts
    ),
  add constraint generations_preparation_max_attempts_check
    check (preparation_max_attempts between 1 and 20),
  add constraint generations_preparation_available_at_check
    check (
      (preparation_status in ('queued', 'retry')) = (preparation_available_at is not null)
    ),
  add constraint generations_preparation_lease_check
    check (
      (
        preparation_status = 'preparing'
        and preparation_lease_token is not null
        and preparation_lease_expires_at is not null
        and preparation_started_at is not null
      )
      or
      (
        preparation_status <> 'preparing'
        and preparation_lease_token is null
        and preparation_lease_expires_at is null
      )
    );

create index if not exists idx_generations_preparation_due
  on public.generations (preparation_available_at, created_at, id)
  where preparation_status in ('queued', 'retry');

create index if not exists idx_generations_preparation_expired_lease
  on public.generations (preparation_lease_expires_at, id)
  where preparation_status = 'preparing';

create index if not exists idx_generations_generated_assets_expires_at
  on public.generations (generated_assets_expires_at)
  where generated_assets_expires_at is not null;

create table public.generation_upload_drafts (
  id uuid primary key,
  user_id text not null references public.users(id) on delete cascade,
  client_request_id uuid not null,
  original_image_path text not null,
  content_type text not null,
  byte_size integer not null,
  checksum_sha256 text not null,
  state text not null default 'ready',
  generation_id uuid unique references public.generations(id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint generation_upload_drafts_user_request_key
    unique (user_id, client_request_id),
  constraint generation_upload_drafts_original_image_path_check
    check (length(btrim(original_image_path)) between 1 and 1024),
  constraint generation_upload_drafts_content_type_check
    check (
      content_type in ('image/jpeg', 'image/png', 'image/webp')
    ),
  constraint generation_upload_drafts_byte_size_check
    check (byte_size between 1 and 8388608),
  constraint generation_upload_drafts_checksum_sha256_check
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint generation_upload_drafts_state_check
    check (state in ('ready', 'accepted', 'expired', 'cancelled')),
  constraint generation_upload_drafts_expiry_check
    check (expires_at > uploaded_at),
  constraint generation_upload_drafts_acceptance_check
    check (
      (
        state = 'accepted'
        and generation_id is not null
        and accepted_at is not null
      )
      or
      (
        state <> 'accepted'
        and generation_id is null
        and accepted_at is null
      )
    )
);

create index idx_generation_upload_drafts_expiring
  on public.generation_upload_drafts (expires_at, id)
  where state = 'ready';

create index idx_generation_upload_drafts_user_created
  on public.generation_upload_drafts (user_id, created_at desc);

create table public.generation_workflow_outbox (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null unique
    references public.generations(id) on delete cascade,
  dispatch_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  workflow_instance_id text,
  last_error_kind text,
  last_error text,
  dispatched_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint generation_workflow_outbox_dispatch_key_check
    check (length(btrim(dispatch_key)) between 1 and 256),
  constraint generation_workflow_outbox_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint generation_workflow_outbox_status_check
    check (status in ('queued', 'dispatching', 'dispatched', 'retry', 'failed')),
  constraint generation_workflow_outbox_attempt_count_check
    check (attempt_count >= 0 and attempt_count <= max_attempts),
  constraint generation_workflow_outbox_max_attempts_check
    check (max_attempts between 1 and 100),
  constraint generation_workflow_outbox_state_check
    check (
      (
        status in ('queued', 'retry')
        and lease_token is null
        and lease_expires_at is null
        and workflow_instance_id is null
        and dispatched_at is null
        and terminal_at is null
      )
      or
      (
        status = 'dispatching'
        and lease_token is not null
        and lease_expires_at is not null
        and workflow_instance_id is null
        and dispatched_at is null
        and terminal_at is null
      )
      or
      (
        status = 'dispatched'
        and lease_token is null
        and lease_expires_at is null
        and workflow_instance_id is not null
        and length(btrim(workflow_instance_id)) > 0
        and dispatched_at is not null
        and terminal_at is not null
      )
      or
      (
        status = 'failed'
        and lease_token is null
        and lease_expires_at is null
        and workflow_instance_id is null
        and dispatched_at is null
        and terminal_at is not null
      )
    )
);

create index idx_generation_workflow_outbox_due
  on public.generation_workflow_outbox (available_at, created_at, id)
  where status in ('queued', 'retry');

create index idx_generation_workflow_outbox_expired_lease
  on public.generation_workflow_outbox (lease_expires_at, id)
  where status = 'dispatching';

create or replace function public.guard_generation_durable_columns()
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
    if new.accepted_at is not null
       or new.preparation_status <> 'ready'
       or new.preparation_attempt_count <> 0
       or new.preparation_max_attempts <> 5
       or new.preparation_available_at is not null
       or new.preparation_lease_token is not null
       or new.preparation_lease_expires_at is not null
       or new.preparation_started_at is not null
       or new.prepared_at is not null
       or new.preparation_error is not null then
      raise exception using
        errcode = '42501',
        message = 'Durable generation state is service-role managed';
    end if;
  elsif new.accepted_at is distinct from old.accepted_at
     or new.preparation_status is distinct from old.preparation_status
     or new.preparation_attempt_count is distinct from old.preparation_attempt_count
     or new.preparation_max_attempts is distinct from old.preparation_max_attempts
     or new.preparation_available_at is distinct from old.preparation_available_at
     or new.preparation_lease_token is distinct from old.preparation_lease_token
     or new.preparation_lease_expires_at is distinct from old.preparation_lease_expires_at
     or new.preparation_started_at is distinct from old.preparation_started_at
     or new.prepared_at is distinct from old.prepared_at
     or new.preparation_error is distinct from old.preparation_error then
    raise exception using
      errcode = '42501',
      message = 'Durable generation state is service-role managed';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_generations_guard_durable_columns on public.generations;
create trigger trg_generations_guard_durable_columns
before insert or update on public.generations
for each row
execute procedure public.guard_generation_durable_columns();

drop trigger if exists trg_generation_upload_drafts_set_updated_at
  on public.generation_upload_drafts;
create trigger trg_generation_upload_drafts_set_updated_at
before update on public.generation_upload_drafts
for each row
execute procedure public.set_updated_at();

drop trigger if exists trg_generation_workflow_outbox_set_updated_at
  on public.generation_workflow_outbox;
create trigger trg_generation_workflow_outbox_set_updated_at
before update on public.generation_workflow_outbox
for each row
execute procedure public.set_updated_at();

alter table public.generation_upload_drafts enable row level security;
alter table public.generation_upload_drafts force row level security;
alter table public.generation_workflow_outbox enable row level security;
alter table public.generation_workflow_outbox force row level security;

revoke all on table public.generation_upload_drafts from public;
revoke all on table public.generation_upload_drafts from anon, authenticated;
grant select, insert, update on table public.generation_upload_drafts to service_role;

revoke all on table public.generation_workflow_outbox from public;
revoke all on table public.generation_workflow_outbox from anon, authenticated;
grant select, insert, update on table public.generation_workflow_outbox to service_role;
grant select, insert, update on table public.generations to service_role;

revoke all on function public.guard_generation_durable_columns() from public;
revoke all on function public.guard_generation_durable_columns() from anon, authenticated;
grant execute on function public.guard_generation_durable_columns() to service_role;

create or replace function public.register_generation_upload_draft(
  p_draft_id uuid,
  p_user_id text,
  p_client_request_id uuid,
  p_original_image_path text,
  p_content_type text,
  p_byte_size integer,
  p_checksum_sha256 text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_content_type text := lower(btrim(p_content_type));
  v_checksum text := lower(btrim(p_checksum_sha256));
  v_path text := btrim(p_original_image_path);
  v_by_id public.generation_upload_drafts%rowtype;
  v_by_request public.generation_upload_drafts%rowtype;
  v_draft public.generation_upload_drafts%rowtype;
begin
  if p_draft_id is null then
    raise exception 'p_draft_id is required';
  end if;
  if nullif(btrim(p_user_id), '') is null then
    raise exception 'p_user_id is required';
  end if;
  if p_client_request_id is null then
    raise exception 'p_client_request_id is required';
  end if;
  if nullif(v_path, '') is null then
    raise exception 'p_original_image_path is required';
  end if;
  if v_content_type is null
     or v_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Unsupported image content type: %', p_content_type;
  end if;
  if p_byte_size is null or p_byte_size not between 1 and 8388608 then
    raise exception 'p_byte_size must be between 1 and 8388608';
  end if;
  if v_checksum is null or v_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'p_checksum_sha256 must be a lowercase or uppercase SHA-256 hex digest';
  end if;
  if p_expires_at is null or p_expires_at <= v_now then
    raise exception 'p_expires_at must be in the future';
  end if;

  insert into public.generation_upload_drafts (
    id,
    user_id,
    client_request_id,
    original_image_path,
    content_type,
    byte_size,
    checksum_sha256,
    state,
    uploaded_at,
    expires_at
  )
  values (
    p_draft_id,
    p_user_id,
    p_client_request_id,
    v_path,
    v_content_type,
    p_byte_size,
    v_checksum,
    'ready',
    v_now,
    p_expires_at
  )
  on conflict do nothing;

  select draft.*
    into v_by_id
    from public.generation_upload_drafts as draft
   where draft.id = p_draft_id
   for update;

  select draft.*
    into v_by_request
    from public.generation_upload_drafts as draft
   where draft.user_id = p_user_id
     and draft.client_request_id = p_client_request_id
   for update;

  if v_by_id.id is null and v_by_request.id is null then
    raise exception 'Upload draft registration could not be reconciled';
  end if;

  if v_by_id.id is not null
     and v_by_request.id is not null
     and v_by_id.id <> v_by_request.id then
    raise exception 'Draft id and client request id belong to different uploads';
  end if;

  if v_by_request.id is not null then
    v_draft := v_by_request;
  else
    v_draft := v_by_id;
  end if;

  if v_draft.id <> p_draft_id
     or v_draft.user_id <> p_user_id
     or v_draft.client_request_id <> p_client_request_id then
    raise exception 'Upload draft idempotency key conflicts with an existing upload';
  end if;

  if v_draft.original_image_path <> v_path
     or v_draft.content_type <> v_content_type
     or v_draft.byte_size <> p_byte_size
     or v_draft.checksum_sha256 <> v_checksum
     or v_draft.expires_at <> p_expires_at then
    raise exception 'Upload draft replay does not match the originally registered upload';
  end if;

  if v_draft.state = 'ready' and v_draft.expires_at <= v_now then
    update public.generation_upload_drafts as draft
       set state = 'expired',
           updated_at = v_now
     where draft.id = v_draft.id
     returning draft.* into v_draft;
  end if;

  return jsonb_build_object(
    'draftId', v_draft.id,
    'userId', v_draft.user_id,
    'clientRequestId', v_draft.client_request_id,
    'originalImagePath', v_draft.original_image_path,
    'contentType', v_draft.content_type,
    'byteSize', v_draft.byte_size,
    'checksumSha256', v_draft.checksum_sha256,
    'state', v_draft.state,
    'generationId', v_draft.generation_id,
    'uploadedAt', v_draft.uploaded_at,
    'expiresAt', v_draft.expires_at,
    'acceptedAt', v_draft.accepted_at
  );
end;
$$;

create or replace function public.claim_generation_preparation(
  p_generation_id uuid,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_lease_token uuid;
  v_generation public.generations%rowtype;
begin
  if p_generation_id is null then
    raise exception 'p_generation_id is required';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 1 and 3600 then
    raise exception 'p_lease_seconds must be between 1 and 3600';
  end if;

  select generation.*
    into v_generation
    from public.generations as generation
   where generation.id = p_generation_id
   for update;

  if not found then
    raise exception 'Generation % not found', p_generation_id;
  end if;

  if v_generation.preparation_status in ('ready', 'failed') then
    return jsonb_build_object(
      'claimed', false,
      'state', v_generation.preparation_status,
      'generationId', v_generation.id,
      'preparationStatus', v_generation.preparation_status,
      'variantCount', case
        when v_generation.preparation_status = 'ready'
          and jsonb_typeof(v_generation.options #> '{recommendationSet,variants}') = 'array'
        then jsonb_array_length(v_generation.options #> '{recommendationSet,variants}')
        else 0
      end,
      'terminal', true
    );
  end if;

  if v_generation.status in ('completed', 'failed') then
    return jsonb_build_object(
      'claimed', false,
      'state', 'failed',
      'generationId', v_generation.id,
      'preparationStatus', v_generation.preparation_status,
      'generationStatus', v_generation.status,
      'terminal', true
    );
  end if;

  if v_generation.preparation_status = 'preparing'
     and v_generation.preparation_lease_expires_at > v_now then
    return jsonb_build_object(
      'claimed', false,
      'state', 'busy',
      'generationId', v_generation.id,
      'preparationStatus', v_generation.preparation_status,
      'leaseExpiresAt', v_generation.preparation_lease_expires_at,
      'reason', 'lease_active'
    );
  end if;

  if v_generation.preparation_status in ('queued', 'retry')
     and v_generation.preparation_available_at > v_now then
    return jsonb_build_object(
      'claimed', false,
      'state', 'busy',
      'generationId', v_generation.id,
      'preparationStatus', v_generation.preparation_status,
      'availableAt', v_generation.preparation_available_at,
      'reason', 'not_due'
    );
  end if;

  if v_generation.preparation_attempt_count >= v_generation.preparation_max_attempts then
    update public.generations as generation
       set status = 'failed',
           error_message = coalesce(
             nullif(generation.preparation_error, ''),
             'Generation preparation exhausted its retry budget'
           ),
           preparation_status = 'failed',
           preparation_available_at = null,
           preparation_lease_token = null,
           preparation_lease_expires_at = null,
           preparation_error = coalesce(
             nullif(generation.preparation_error, ''),
             'Generation preparation exhausted its retry budget'
           ),
           completion_notification_status = 'pending',
           updated_at = v_now
     where generation.id = p_generation_id
     returning * into v_generation;

    return jsonb_build_object(
      'claimed', false,
      'state', 'failed',
      'generationId', v_generation.id,
      'preparationStatus', v_generation.preparation_status,
      'generationStatus', v_generation.status,
      'terminal', true,
      'error', v_generation.preparation_error
    );
  end if;

  v_lease_token := gen_random_uuid();

  update public.generations as generation
     set status = 'processing',
         error_message = null,
         preparation_status = 'preparing',
         preparation_attempt_count = generation.preparation_attempt_count + 1,
         preparation_available_at = null,
         preparation_lease_token = v_lease_token,
         preparation_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
         preparation_started_at = v_now,
         preparation_error = null,
         updated_at = v_now
   where generation.id = p_generation_id
   returning * into v_generation;

  return jsonb_build_object(
    'claimed', true,
    'state', 'claimed',
    'generationId', v_generation.id,
    'userId', v_generation.user_id,
    'originalImagePath', v_generation.original_image_path,
    'styleTarget', v_generation.options ->> 'styleTarget',
    'options', v_generation.options,
    'creditsUsed', v_generation.credits_used,
    'generatedAssetsExpiresAt', v_generation.generated_assets_expires_at,
    'preparationStatus', v_generation.preparation_status,
    'attemptCount', v_generation.preparation_attempt_count,
    'leaseToken', v_generation.preparation_lease_token,
    'leaseExpiresAt', v_generation.preparation_lease_expires_at
  );
end;
$$;

create or replace function public.finish_generation_preparation(
  p_generation_id uuid,
  p_lease_token uuid,
  p_options_patch jsonb,
  p_prompt_used text,
  p_model_provider text,
  p_model_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_generation public.generations%rowtype;
begin
  if p_generation_id is null then
    raise exception 'p_generation_id is required';
  end if;
  if p_lease_token is null then
    raise exception 'p_lease_token is required';
  end if;
  if p_options_patch is null or jsonb_typeof(p_options_patch) <> 'object' then
    raise exception 'p_options_patch must be a JSON object';
  end if;
  if nullif(btrim(p_prompt_used), '') is null then
    raise exception 'p_prompt_used is required';
  end if;
  if nullif(btrim(p_model_provider), '') is null then
    raise exception 'p_model_provider is required';
  end if;

  select generation.*
    into v_generation
    from public.generations as generation
   where generation.id = p_generation_id
   for update;

  if not found then
    raise exception 'Generation % not found', p_generation_id;
  end if;

  if v_generation.preparation_status = 'ready' then
    return jsonb_build_object(
      'finished', false,
      'state', 'ready',
      'idempotentReplay', true,
      'generationId', v_generation.id,
      'preparationStatus', v_generation.preparation_status,
      'variantCount', case
        when jsonb_typeof(v_generation.options #> '{recommendationSet,variants}') = 'array'
        then jsonb_array_length(v_generation.options #> '{recommendationSet,variants}')
        else 0
      end,
      'preparedAt', v_generation.prepared_at
    );
  end if;

  if v_generation.preparation_status = 'failed' then
    return jsonb_build_object(
      'finished', false,
      'state', 'failed',
      'generationId', v_generation.id,
      'preparationStatus', v_generation.preparation_status,
      'terminal', true
    );
  end if;

  if v_generation.preparation_status <> 'preparing'
     or v_generation.preparation_lease_token <> p_lease_token
     or v_generation.preparation_lease_expires_at <= v_now then
    raise exception 'Stale generation preparation lease for %', p_generation_id;
  end if;

  update public.generations as generation
     set status = 'processing',
         error_message = null,
         options = generation.options || p_options_patch,
         prompt_used = btrim(p_prompt_used),
         model_provider = btrim(p_model_provider),
         model_name = nullif(btrim(p_model_name), ''),
         preparation_status = 'ready',
         preparation_available_at = null,
         preparation_lease_token = null,
         preparation_lease_expires_at = null,
         prepared_at = v_now,
         preparation_error = null,
         updated_at = v_now
   where generation.id = p_generation_id
   returning * into v_generation;

  return jsonb_build_object(
    'finished', true,
    'state', 'ready',
    'generationId', v_generation.id,
    'generationStatus', v_generation.status,
    'preparationStatus', v_generation.preparation_status,
    'variantCount', case
      when jsonb_typeof(v_generation.options #> '{recommendationSet,variants}') = 'array'
      then jsonb_array_length(v_generation.options #> '{recommendationSet,variants}')
      else 0
    end,
    'preparedAt', v_generation.prepared_at
  );
end;
$$;

create or replace function public.retry_generation_preparation(
  p_generation_id uuid,
  p_lease_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_delay_seconds integer;
  v_generation public.generations%rowtype;
begin
  if p_generation_id is null then
    raise exception 'p_generation_id is required';
  end if;
  if p_lease_token is null then
    raise exception 'p_lease_token is required';
  end if;
  if nullif(btrim(p_error), '') is null then
    raise exception 'p_error is required';
  end if;

  select generation.*
    into v_generation
    from public.generations as generation
   where generation.id = p_generation_id
   for update;

  if not found then
    raise exception 'Generation % not found', p_generation_id;
  end if;

  if v_generation.preparation_status in ('ready', 'failed') then
    return jsonb_build_object(
      'retried', false,
      'state', v_generation.preparation_status,
      'generationId', v_generation.id,
      'preparationStatus', v_generation.preparation_status,
      'terminal', true
    );
  end if;

  if v_generation.preparation_status <> 'preparing'
     or v_generation.preparation_lease_token <> p_lease_token
     or v_generation.preparation_lease_expires_at <= v_now then
    raise exception 'Stale generation preparation lease for %', p_generation_id;
  end if;

  if v_generation.preparation_attempt_count >= v_generation.preparation_max_attempts then
    update public.generations as generation
       set status = 'failed',
           error_message = left(btrim(p_error), 4000),
           preparation_status = 'failed',
           preparation_available_at = null,
           preparation_lease_token = null,
           preparation_lease_expires_at = null,
           preparation_error = left(btrim(p_error), 4000),
           completion_notification_status = 'pending',
           updated_at = v_now
     where generation.id = p_generation_id
     returning * into v_generation;

    return jsonb_build_object(
      'retried', false,
      'state', 'failed',
      'generationId', v_generation.id,
      'generationStatus', v_generation.status,
      'preparationStatus', v_generation.preparation_status,
      'terminal', true,
      'error', v_generation.preparation_error
    );
  end if;

  v_delay_seconds := least(
    900,
    (30 * power(2::numeric, greatest(v_generation.preparation_attempt_count - 1, 0)))::integer
  );

  update public.generations as generation
     set status = 'queued',
         error_message = null,
         preparation_status = 'retry',
         preparation_available_at = v_now + make_interval(secs => v_delay_seconds),
         preparation_lease_token = null,
         preparation_lease_expires_at = null,
         preparation_error = left(btrim(p_error), 4000),
         updated_at = v_now
   where generation.id = p_generation_id
   returning * into v_generation;

  return jsonb_build_object(
    'retried', true,
    'state', 'retry',
    'generationId', v_generation.id,
    'generationStatus', v_generation.status,
    'preparationStatus', v_generation.preparation_status,
    'attemptCount', v_generation.preparation_attempt_count,
    'availableAt', v_generation.preparation_available_at,
    'error', v_generation.preparation_error
  );
end;
$$;

create or replace function public.fail_generation_preparation(
  p_generation_id uuid,
  p_lease_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_generation public.generations%rowtype;
begin
  if p_generation_id is null then
    raise exception 'p_generation_id is required';
  end if;
  if p_lease_token is null then
    raise exception 'p_lease_token is required';
  end if;
  if nullif(btrim(p_error), '') is null then
    raise exception 'p_error is required';
  end if;

  select generation.*
    into v_generation
    from public.generations as generation
   where generation.id = p_generation_id
   for update;

  if not found then
    raise exception 'Generation % not found', p_generation_id;
  end if;

  if v_generation.preparation_status in ('ready', 'failed') then
    return jsonb_build_object(
      'failed', false,
      'state', v_generation.preparation_status,
      'generationId', v_generation.id,
      'preparationStatus', v_generation.preparation_status,
      'terminal', true
    );
  end if;

  if v_generation.preparation_status <> 'preparing'
     or v_generation.preparation_lease_token <> p_lease_token
     or v_generation.preparation_lease_expires_at <= v_now then
    raise exception 'Stale generation preparation lease for %', p_generation_id;
  end if;

  update public.generations as generation
     set status = 'failed',
         error_message = left(btrim(p_error), 4000),
         preparation_status = 'failed',
         preparation_available_at = null,
         preparation_lease_token = null,
         preparation_lease_expires_at = null,
         preparation_error = left(btrim(p_error), 4000),
         completion_notification_status = 'pending',
         updated_at = v_now
   where generation.id = p_generation_id
   returning * into v_generation;

  return jsonb_build_object(
    'failed', true,
    'state', 'failed',
    'generationId', v_generation.id,
    'generationStatus', v_generation.status,
    'preparationStatus', v_generation.preparation_status,
    'error', v_generation.preparation_error
  );
end;
$$;

create or replace function public.claim_generation_workflow_outbox(
  p_limit integer,
  p_lease_token uuid,
  p_lease_seconds integer
)
returns setof jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'p_limit must be between 1 and 100';
  end if;
  if p_lease_token is null then
    raise exception 'p_lease_token is required';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 1 and 3600 then
    raise exception 'p_lease_seconds must be between 1 and 3600';
  end if;

  with failed_outbox as (
    update public.generation_workflow_outbox as outbox
       set status = 'failed',
           lease_token = null,
           lease_expires_at = null,
           last_error_kind = 'lease_expired',
           last_error = coalesce(
             nullif(outbox.last_error, ''),
             'Workflow dispatch lease expired after the retry budget was exhausted'
           ),
           terminal_at = v_now,
           updated_at = v_now
     where outbox.status = 'dispatching'
       and outbox.lease_expires_at <= v_now
       and outbox.attempt_count >= outbox.max_attempts
     returning outbox.generation_id, outbox.last_error
  )
  update public.generations as generation
     set status = 'failed',
         error_message = failed_outbox.last_error,
         preparation_status = 'failed',
         preparation_available_at = null,
         preparation_lease_token = null,
         preparation_lease_expires_at = null,
         preparation_error = failed_outbox.last_error,
         completion_notification_status = 'pending',
         updated_at = v_now
    from failed_outbox
   where generation.id = failed_outbox.generation_id
     and generation.status not in ('completed', 'failed');

  return query
  with candidates as (
    select outbox.id
      from public.generation_workflow_outbox as outbox
     where (
       (
         outbox.status in ('queued', 'retry')
         and outbox.available_at <= v_now
       )
       or
       (
         outbox.status = 'dispatching'
         and outbox.lease_expires_at <= v_now
       )
     )
       and outbox.attempt_count < outbox.max_attempts
     order by outbox.available_at, outbox.created_at, outbox.id
     for update skip locked
     limit p_limit
  ), claimed as (
    update public.generation_workflow_outbox as outbox
       set status = 'dispatching',
           attempt_count = outbox.attempt_count + 1,
           lease_token = p_lease_token,
           lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
           terminal_at = null,
           updated_at = v_now
      from candidates
     where outbox.id = candidates.id
     returning outbox.*
  )
  select jsonb_build_object(
    'outboxId', claimed.id,
    'generationId', claimed.generation_id,
    'dispatchKey', claimed.dispatch_key,
    'payload', claimed.payload,
    'status', claimed.status,
    'attemptCount', claimed.attempt_count,
    'maxAttempts', claimed.max_attempts,
    'leaseToken', claimed.lease_token,
    'leaseExpiresAt', claimed.lease_expires_at
  )
  from claimed;
end;
$$;

create or replace function public.finish_generation_workflow_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_workflow_instance_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_outbox public.generation_workflow_outbox%rowtype;
begin
  if p_outbox_id is null then
    raise exception 'p_outbox_id is required';
  end if;
  if p_lease_token is null then
    raise exception 'p_lease_token is required';
  end if;
  if nullif(btrim(p_workflow_instance_id), '') is null then
    raise exception 'p_workflow_instance_id is required';
  end if;

  select outbox.*
    into v_outbox
    from public.generation_workflow_outbox as outbox
   where outbox.id = p_outbox_id
   for update;

  if not found then
    raise exception 'Generation Workflow outbox % not found', p_outbox_id;
  end if;

  if v_outbox.status = 'dispatched' then
    if v_outbox.workflow_instance_id <> btrim(p_workflow_instance_id) then
      raise exception 'Workflow outbox % is already bound to a different instance', p_outbox_id;
    end if;

    return jsonb_build_object(
      'finished', false,
      'idempotentReplay', true,
      'outboxId', v_outbox.id,
      'generationId', v_outbox.generation_id,
      'status', v_outbox.status,
      'workflowInstanceId', v_outbox.workflow_instance_id,
      'dispatchedAt', v_outbox.dispatched_at
    );
  end if;

  if v_outbox.status = 'failed' then
    return jsonb_build_object(
      'finished', false,
      'outboxId', v_outbox.id,
      'generationId', v_outbox.generation_id,
      'status', v_outbox.status,
      'terminal', true
    );
  end if;

  if v_outbox.status <> 'dispatching'
     or v_outbox.lease_token <> p_lease_token
     or v_outbox.lease_expires_at <= v_now then
    raise exception 'Stale generation Workflow outbox lease for %', p_outbox_id;
  end if;

  update public.generation_workflow_outbox as outbox
     set status = 'dispatched',
         lease_token = null,
         lease_expires_at = null,
         workflow_instance_id = btrim(p_workflow_instance_id),
         last_error_kind = null,
         last_error = null,
         dispatched_at = v_now,
         terminal_at = v_now,
         updated_at = v_now
   where outbox.id = p_outbox_id
   returning * into v_outbox;

  update public.generations as generation
     set workflow_instance_id = v_outbox.workflow_instance_id,
         workflow_started_at = coalesce(generation.workflow_started_at, v_now),
         completion_notification_status = 'pending',
         updated_at = v_now
   where generation.id = v_outbox.generation_id;

  return jsonb_build_object(
    'finished', true,
    'outboxId', v_outbox.id,
    'generationId', v_outbox.generation_id,
    'status', v_outbox.status,
    'workflowInstanceId', v_outbox.workflow_instance_id,
    'dispatchedAt', v_outbox.dispatched_at
  );
end;
$$;

create or replace function public.retry_generation_workflow_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
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
  v_outbox public.generation_workflow_outbox%rowtype;
begin
  if p_outbox_id is null then
    raise exception 'p_outbox_id is required';
  end if;
  if p_lease_token is null then
    raise exception 'p_lease_token is required';
  end if;
  if nullif(btrim(p_error), '') is null then
    raise exception 'p_error is required';
  end if;
  if p_delay_seconds is null or p_delay_seconds not between 0 and 86400 then
    raise exception 'p_delay_seconds must be between 0 and 86400';
  end if;

  select outbox.*
    into v_outbox
    from public.generation_workflow_outbox as outbox
   where outbox.id = p_outbox_id
   for update;

  if not found then
    raise exception 'Generation Workflow outbox % not found', p_outbox_id;
  end if;

  if v_outbox.status in ('dispatched', 'failed') then
    return jsonb_build_object(
      'retried', false,
      'outboxId', v_outbox.id,
      'generationId', v_outbox.generation_id,
      'status', v_outbox.status,
      'terminal', true
    );
  end if;

  if v_outbox.status <> 'dispatching'
     or v_outbox.lease_token <> p_lease_token
     or v_outbox.lease_expires_at <= v_now then
    raise exception 'Stale generation Workflow outbox lease for %', p_outbox_id;
  end if;

  if v_outbox.attempt_count >= v_outbox.max_attempts then
    update public.generation_workflow_outbox as outbox
       set status = 'failed',
           lease_token = null,
           lease_expires_at = null,
           last_error_kind = 'dispatch_error',
           last_error = left(btrim(p_error), 4000),
           terminal_at = v_now,
           updated_at = v_now
     where outbox.id = p_outbox_id
     returning * into v_outbox;
  else
    update public.generation_workflow_outbox as outbox
       set status = 'retry',
           available_at = v_now + make_interval(secs => p_delay_seconds),
           lease_token = null,
           lease_expires_at = null,
           last_error_kind = 'dispatch_error',
           last_error = left(btrim(p_error), 4000),
           terminal_at = null,
           updated_at = v_now
     where outbox.id = p_outbox_id
     returning * into v_outbox;
  end if;

  if v_outbox.status = 'failed' then
    update public.generations as generation
       set status = 'failed',
           error_message = v_outbox.last_error,
           preparation_status = 'failed',
           preparation_available_at = null,
           preparation_lease_token = null,
           preparation_lease_expires_at = null,
           preparation_error = v_outbox.last_error,
           completion_notification_status = 'pending',
           updated_at = v_now
     where generation.id = v_outbox.generation_id
       and generation.status not in ('completed', 'failed');
  end if;

  return jsonb_build_object(
    'retried', v_outbox.status = 'retry',
    'outboxId', v_outbox.id,
    'generationId', v_outbox.generation_id,
    'status', v_outbox.status,
    'attemptCount', v_outbox.attempt_count,
    'availableAt', v_outbox.available_at,
    'terminal', v_outbox.terminal_at is not null,
    'error', v_outbox.last_error
  );
end;
$$;

revoke all on function public.register_generation_upload_draft(
  uuid, text, uuid, text, text, integer, text, timestamptz
) from public;
revoke all on function public.register_generation_upload_draft(
  uuid, text, uuid, text, text, integer, text, timestamptz
) from anon, authenticated;
grant execute on function public.register_generation_upload_draft(
  uuid, text, uuid, text, text, integer, text, timestamptz
) to service_role;

revoke all on function public.claim_generation_preparation(uuid, integer) from public;
revoke all on function public.claim_generation_preparation(uuid, integer)
  from anon, authenticated;
grant execute on function public.claim_generation_preparation(uuid, integer)
  to service_role;

revoke all on function public.finish_generation_preparation(
  uuid, uuid, jsonb, text, text, text
) from public;
revoke all on function public.finish_generation_preparation(
  uuid, uuid, jsonb, text, text, text
) from anon, authenticated;
grant execute on function public.finish_generation_preparation(
  uuid, uuid, jsonb, text, text, text
) to service_role;

revoke all on function public.retry_generation_preparation(uuid, uuid, text) from public;
revoke all on function public.retry_generation_preparation(uuid, uuid, text)
  from anon, authenticated;
grant execute on function public.retry_generation_preparation(uuid, uuid, text)
  to service_role;

revoke all on function public.fail_generation_preparation(uuid, uuid, text) from public;
revoke all on function public.fail_generation_preparation(uuid, uuid, text)
  from anon, authenticated;
grant execute on function public.fail_generation_preparation(uuid, uuid, text)
  to service_role;

revoke all on function public.claim_generation_workflow_outbox(integer, uuid, integer)
  from public;
revoke all on function public.claim_generation_workflow_outbox(integer, uuid, integer)
  from anon, authenticated;
grant execute on function public.claim_generation_workflow_outbox(integer, uuid, integer)
  to service_role;

revoke all on function public.finish_generation_workflow_outbox(uuid, uuid, text)
  from public;
revoke all on function public.finish_generation_workflow_outbox(uuid, uuid, text)
  from anon, authenticated;
grant execute on function public.finish_generation_workflow_outbox(uuid, uuid, text)
  to service_role;

revoke all on function public.retry_generation_workflow_outbox(uuid, uuid, text, integer)
  from public;
revoke all on function public.retry_generation_workflow_outbox(uuid, uuid, text, integer)
  from anon, authenticated;
grant execute on function public.retry_generation_workflow_outbox(uuid, uuid, text, integer)
  to service_role;

create or replace function public.accept_generation_upload_draft(
  p_draft_id uuid,
  p_user_id text,
  p_style_target text,
  p_options jsonb,
  p_credits_used integer,
  p_generated_assets_expires_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := now();
  v_draft public.generation_upload_drafts%rowtype;
  v_generation public.generations%rowtype;
  v_outbox public.generation_workflow_outbox%rowtype;
  v_options jsonb;
begin
  if p_draft_id is null then
    raise exception 'p_draft_id is required';
  end if;
  if nullif(btrim(p_user_id), '') is null then
    raise exception 'p_user_id is required';
  end if;
  if p_style_target is null or p_style_target not in ('male', 'female') then
    raise exception 'p_style_target must be male or female';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'object' then
    raise exception 'p_options must be a JSON object';
  end if;
  if p_credits_used is null or p_credits_used < 0 then
    raise exception 'p_credits_used must be non-negative';
  end if;
  if p_generated_assets_expires_at is not null
     and p_generated_assets_expires_at <= v_now then
    raise exception 'p_generated_assets_expires_at must be in the future';
  end if;

  select draft.*
    into v_draft
    from public.generation_upload_drafts as draft
   where draft.id = p_draft_id
     and draft.user_id = p_user_id
   for update;

  if not found then
    raise exception 'Upload draft % was not found for this user', p_draft_id;
  end if;

  if v_draft.state = 'accepted' then
    select generation.*
      into v_generation
      from public.generations as generation
     where generation.id = v_draft.generation_id;

    select outbox.*
      into v_outbox
      from public.generation_workflow_outbox as outbox
     where outbox.generation_id = v_draft.generation_id;

    if v_generation.id is null
       or v_outbox.id is null
       or v_generation.user_id <> p_user_id
       or v_generation.accepted_at is null then
      raise exception 'Accepted upload draft % has an incomplete durable receipt', p_draft_id;
    end if;

    return jsonb_build_object(
      'draftId', v_draft.id,
      'generationId', v_generation.id,
      'acceptedAt', v_generation.accepted_at,
      'preparationStatus', v_generation.preparation_status,
      'workflowOutboxId', v_outbox.id,
      'workflowDispatchStatus', v_outbox.status,
      'idempotentReplay', true
    );
  end if;

  if v_draft.state = 'expired' or v_draft.expires_at <= v_now then
    raise exception 'Upload draft % has expired', p_draft_id;
  end if;
  if v_draft.state <> 'ready' then
    raise exception 'Upload draft % cannot be accepted from state %', p_draft_id, v_draft.state;
  end if;

  v_options := p_options || jsonb_build_object(
    'styleTarget', p_style_target,
    'uploadDraftId', p_draft_id
  );

  insert into public.generations (
    id,
    user_id,
    original_image_path,
    prompt_used,
    options,
    status,
    error_message,
    credits_used,
    model_provider,
    model_name,
    accepted_at,
    generated_assets_expires_at,
    preparation_status,
    preparation_attempt_count,
    preparation_available_at,
    preparation_error,
    completion_notification_status,
    created_at,
    updated_at
  )
  values (
    p_draft_id,
    p_user_id,
    v_draft.original_image_path,
    '',
    v_options,
    'queued',
    null,
    p_credits_used,
    'gemini',
    null,
    v_now,
    p_generated_assets_expires_at,
    'queued',
    0,
    v_now,
    null,
    'pending',
    v_now,
    v_now
  )
  returning * into v_generation;

  insert into public.generation_workflow_outbox (
    generation_id,
    dispatch_key,
    payload,
    status,
    available_at
  )
  values (
    v_generation.id,
    'generation-workflow:' || v_generation.id::text,
    jsonb_build_object(
      'generationId', v_generation.id,
      'draftId', v_draft.id,
      'userId', v_generation.user_id,
      'acceptedAt', v_generation.accepted_at
    ),
    'queued',
    v_now
  )
  returning * into v_outbox;

  update public.generation_upload_drafts as draft
     set state = 'accepted',
         generation_id = v_generation.id,
         accepted_at = v_generation.accepted_at,
         updated_at = v_now
   where draft.id = v_draft.id;

  return jsonb_build_object(
    'draftId', v_draft.id,
    'generationId', v_generation.id,
    'acceptedAt', v_generation.accepted_at,
    'preparationStatus', v_generation.preparation_status,
    'workflowOutboxId', v_outbox.id,
    'workflowDispatchStatus', v_outbox.status,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.accept_generation_upload_draft(
  uuid, text, text, jsonb, integer, timestamptz
) from public;
revoke all on function public.accept_generation_upload_draft(
  uuid, text, text, jsonb, integer, timestamptz
) from anon, authenticated;
grant execute on function public.accept_generation_upload_draft(
  uuid, text, text, jsonb, integer, timestamptz
) to service_role;

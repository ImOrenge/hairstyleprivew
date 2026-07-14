-- Make generation execution resumable and completion email delivery idempotent.

alter table public.generations
  add column if not exists workflow_instance_id text,
  add column if not exists workflow_started_at timestamptz,
  add column if not exists completion_notification_status text not null default 'not_requested',
  add column if not exists completion_notification_claimed_at timestamptz,
  add column if not exists completion_notification_sent_at timestamptz,
  add column if not exists completion_notification_error text,
  add column if not exists completion_notification_attempts integer not null default 0;

alter table public.generations
  drop constraint if exists generations_completion_notification_status_check;

alter table public.generations
  add constraint generations_completion_notification_status_check
  check (
    completion_notification_status in (
      'not_requested',
      'pending',
      'sending',
      'sent',
      'failed',
      'skipped'
    )
  );

alter table public.generations
  drop constraint if exists generations_completion_notification_attempts_check;

alter table public.generations
  add constraint generations_completion_notification_attempts_check
  check (completion_notification_attempts >= 0);

create index if not exists idx_generations_completion_notification_pending
  on public.generations (completion_notification_status, updated_at)
  where completion_notification_status in ('pending', 'failed', 'sending');

create or replace function public.claim_generation_completion_notification(
  p_generation_id uuid
)
returns table (
  claimed_generation_id uuid,
  claimed_user_id text
)
language plpgsql
security invoker
set search_path = public
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

  -- A retry may reclaim `sending`: the provider request uses a deterministic
  -- idempotency key, so a lost HTTP/DB acknowledgement can be repaired safely.
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

revoke all on function public.claim_generation_completion_notification(uuid) from public;
grant execute on function public.claim_generation_completion_notification(uuid) to service_role;

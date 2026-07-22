-- Canonical generation funnel analytics.
-- Generation and draft state transitions are recorded at the database boundary so
-- web and mobile cannot drift or lose accepted/terminal events on close.

create table if not exists public.generation_funnel_events (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null,
  user_id text not null references public.users(id) on delete cascade,
  event_name text not null,
  source text not null default 'database',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint generation_funnel_events_event_name_check
    check (event_name in ('draft_started', 'accepted', 'terminal', 'result_opened')),
  constraint generation_funnel_events_source_check
    check (source in ('database', 'web', 'mobile', 'server', 'legacy')),
  constraint generation_funnel_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint generation_funnel_events_stage_unique
    unique (generation_id, user_id, event_name)
);

create index if not exists generation_funnel_events_user_occurred_idx
  on public.generation_funnel_events (user_id, occurred_at desc);

create index if not exists generation_funnel_events_name_occurred_idx
  on public.generation_funnel_events (event_name, occurred_at desc);

alter table public.generation_funnel_events enable row level security;
alter table public.generation_funnel_events force row level security;

revoke all on table public.generation_funnel_events from public, anon, authenticated;
grant select, insert, update on table public.generation_funnel_events to service_role;

create or replace function public.record_generation_funnel_event(
  p_generation_id uuid,
  p_user_id text,
  p_event_name text,
  p_source text default 'server',
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
begin
  if p_event_name not in ('draft_started', 'accepted', 'terminal', 'result_opened') then
    raise exception 'Unsupported generation funnel event: %', p_event_name;
  end if;

  if p_source not in ('database', 'web', 'mobile', 'server', 'legacy') then
    raise exception 'Unsupported generation funnel source: %', p_source;
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Generation funnel metadata must be an object';
  end if;

  if not exists (
    select 1
      from public.generations
     where id = p_generation_id
       and user_id = p_user_id
  ) and not exists (
    select 1
      from public.generation_upload_drafts
     where id = p_generation_id
       and user_id = p_user_id
  ) then
    raise exception 'Generation funnel owner mismatch';
  end if;

  insert into public.generation_funnel_events (
    generation_id,
    user_id,
    event_name,
    source,
    metadata,
    occurred_at
  )
  values (
    p_generation_id,
    p_user_id,
    p_event_name,
    p_source,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_occurred_at, now())
  )
  on conflict (generation_id, user_id, event_name)
  do update
    set occurred_at = least(
          public.generation_funnel_events.occurred_at,
          excluded.occurred_at
        ),
        metadata = public.generation_funnel_events.metadata || excluded.metadata
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.record_generation_funnel_event(
  uuid,
  text,
  text,
  text,
  jsonb,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.record_generation_funnel_event(
  uuid,
  text,
  text,
  text,
  jsonb,
  timestamptz
) to service_role;

create or replace function public.capture_generation_draft_started()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.record_generation_funnel_event(
    new.id,
    new.user_id,
    'draft_started',
    'database',
    jsonb_build_object('state', new.state),
    coalesce(new.uploaded_at, now())
  );
  return new;
end;
$$;

create or replace function public.capture_generation_state_funnel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.accepted_at is not null
     and (tg_op = 'INSERT' or old.accepted_at is null) then
    perform public.record_generation_funnel_event(
      new.id,
      new.user_id,
      'accepted',
      'database',
      jsonb_build_object('status', new.status),
      new.accepted_at
    );
  end if;

  if new.status in ('completed', 'failed')
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
     ) then
    perform public.record_generation_funnel_event(
      new.id,
      new.user_id,
      'terminal',
      'database',
      jsonb_build_object('status', new.status),
      coalesce(new.updated_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists generation_draft_started_funnel_trigger
  on public.generation_upload_drafts;
create trigger generation_draft_started_funnel_trigger
after insert on public.generation_upload_drafts
for each row execute function public.capture_generation_draft_started();

drop trigger if exists generation_state_funnel_trigger
  on public.generations;
create trigger generation_state_funnel_trigger
after insert or update of accepted_at, status on public.generations
for each row execute function public.capture_generation_state_funnel();

revoke all on function public.capture_generation_draft_started() from public, anon, authenticated;
revoke all on function public.capture_generation_state_funnel() from public, anon, authenticated;

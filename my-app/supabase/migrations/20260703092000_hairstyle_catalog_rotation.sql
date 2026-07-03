-- Hairstyle catalog rotation foundation.
-- Separates runtime active state from catalog cycle snapshots.

alter table public.hairstyle_catalog
  drop constraint if exists hairstyle_catalog_slug_key;

create unique index if not exists idx_hairstyle_catalog_cycle_slug
  on public.hairstyle_catalog (source_cycle_id, slug);

create index if not exists idx_hairstyle_catalog_market_status_score
  on public.hairstyle_catalog (market, status, trend_score desc, freshness_score desc);

create table if not exists public.hairstyle_catalog_active_cycles (
  market text primary key,
  active_cycle_id uuid not null references public.hairstyle_catalog_cycles(cycle_id) on delete restrict,
  previous_cycle_id uuid references public.hairstyle_catalog_cycles(cycle_id) on delete set null,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  rotation_period text not null,
  rotation_seed text not null,
  last_rebuild_cycle_id uuid references public.hairstyle_catalog_cycles(cycle_id) on delete set null,
  last_rebuild_status text not null default 'unknown',
  last_error_log text,
  source_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hairstyle_catalog_active_cycles_expiry_check check (expires_at > activated_at)
);

create index if not exists idx_hairstyle_catalog_active_cycles_expires_at
  on public.hairstyle_catalog_active_cycles (expires_at);

drop trigger if exists trg_hairstyle_catalog_active_cycles_updated_at on public.hairstyle_catalog_active_cycles;
create trigger trg_hairstyle_catalog_active_cycles_updated_at
  before update on public.hairstyle_catalog_active_cycles
  for each row execute procedure public.set_updated_at();

create table if not exists public.hairstyle_catalog_lineups (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.hairstyle_catalog_cycles(cycle_id) on delete cascade,
  market text not null default 'kr',
  style_target text not null check (style_target in ('male', 'female')),
  slot_key text not null check (slot_key in ('trend', 'face_fit', 'evergreen', 'experimental')),
  rank integer not null check (rank > 0),
  catalog_item_id uuid not null references public.hairstyle_catalog(id) on delete cascade,
  rotation_score numeric(7,2) not null default 0,
  selection_reason text not null default '',
  created_at timestamptz not null default now(),
  constraint hairstyle_catalog_lineups_cycle_target_rank_key unique (cycle_id, style_target, rank),
  constraint hairstyle_catalog_lineups_cycle_target_item_key unique (cycle_id, style_target, catalog_item_id)
);

create index if not exists idx_hairstyle_catalog_lineups_market_target
  on public.hairstyle_catalog_lineups (market, style_target, rank);

create table if not exists public.hairstyle_catalog_rotation_events (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'kr',
  cycle_id uuid references public.hairstyle_catalog_cycles(cycle_id) on delete set null,
  event_type text not null,
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_hairstyle_catalog_rotation_events_market_created
  on public.hairstyle_catalog_rotation_events (market, created_at desc);

create index if not exists idx_hairstyle_catalog_rotation_events_cycle_created
  on public.hairstyle_catalog_rotation_events (cycle_id, created_at desc);

alter table public.trend_alerts
  add column if not exists catalog_cycle_id uuid references public.hairstyle_catalog_cycles(cycle_id) on delete set null,
  add column if not exists alert_type text not null default 'manual',
  add column if not exists source_summary jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'trend_alerts_alert_type_check'
       and conrelid = 'public.trend_alerts'::regclass
  ) then
    alter table public.trend_alerts
      add constraint trend_alerts_alert_type_check
      check (alert_type in ('manual', 'catalog_rotation'));
  end if;
end
$$;

create unique index if not exists idx_trend_alerts_catalog_cycle_alert_type
  on public.trend_alerts (catalog_cycle_id, alert_type)
  where catalog_cycle_id is not null;

create index if not exists idx_trend_alerts_alert_type_pending_send
  on public.trend_alerts (alert_type, scheduled_send_at)
  where sent_at is null;

create or replace function public.get_active_hairstyle_catalog(p_market text default 'kr')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'market', active.market,
        'activeCycleId', active.active_cycle_id,
        'previousCycleId', active.previous_cycle_id,
        'activatedAt', active.activated_at,
        'expiresAt', active.expires_at,
        'rotationPeriod', active.rotation_period,
        'rotationSeed', active.rotation_seed,
        'lastRebuildCycleId', active.last_rebuild_cycle_id,
        'lastRebuildStatus', active.last_rebuild_status,
        'lastErrorLog', active.last_error_log,
        'sourceSummary', active.source_summary,
        'cycle', to_jsonb(cycle_row),
        'items', coalesce(
          (
            select jsonb_agg(to_jsonb(item_row) order by item_row.trend_score desc, item_row.freshness_score desc, item_row.slug)
              from (
                select
                  id,
                  slug,
                  name_ko,
                  description,
                  market,
                  length_bucket,
                  silhouette,
                  texture,
                  bang_type,
                  volume_focus_tags,
                  face_shape_fit_tags,
                  avoid_tags,
                  trend_score,
                  freshness_score,
                  prompt_template,
                  negative_prompt,
                  prompt_template_version,
                  style_targets,
                  status,
                  source_cycle_id,
                  created_at,
                  updated_at
                from public.hairstyle_catalog
                where source_cycle_id = active.active_cycle_id
                  and market = active.market
                  and status = 'active'
              ) as item_row
          ),
          '[]'::jsonb
        ),
        'lineups', coalesce(
          (
            select jsonb_agg(to_jsonb(lineup_row) order by lineup_row.style_target, lineup_row.rank)
              from (
                select
                  lineup.id,
                  lineup.cycle_id,
                  lineup.market,
                  lineup.style_target,
                  lineup.slot_key,
                  lineup.rank,
                  lineup.catalog_item_id,
                  item.slug,
                  item.name_ko,
                  lineup.rotation_score,
                  lineup.selection_reason,
                  lineup.created_at
                from public.hairstyle_catalog_lineups as lineup
                join public.hairstyle_catalog as item
                  on item.id = lineup.catalog_item_id
                where lineup.cycle_id = active.active_cycle_id
                  and lineup.market = active.market
              ) as lineup_row
          ),
          '[]'::jsonb
        )
      )
      from public.hairstyle_catalog_active_cycles as active
      join public.hairstyle_catalog_cycles as cycle_row
        on cycle_row.cycle_id = active.active_cycle_id
      where active.market = p_market
      limit 1
    ),
    jsonb_build_object(
      'market', p_market,
      'activeCycleId', null,
      'items', '[]'::jsonb,
      'lineups', '[]'::jsonb
    )
  );
$$;

create or replace function public.activate_hairstyle_catalog_cycle(
  p_market text,
  p_cycle_id uuid,
  p_expires_at timestamptz default null,
  p_rotation_period text default null,
  p_rotation_seed text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market text := nullif(btrim(p_market), '');
  v_now timestamptz := now();
  v_cycle record;
  v_row_count integer;
  v_male_lineup_count integer;
  v_female_lineup_count integer;
  v_previous_cycle_id uuid;
  v_expires_at timestamptz;
  v_rotation_period text;
  v_rotation_seed text;
begin
  if v_market is null then
    raise exception 'p_market is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('hairstyle_catalog_rotation:' || v_market));

  select *
    into v_cycle
    from public.hairstyle_catalog_cycles
   where cycle_id = p_cycle_id
     and market = v_market
   for update;

  if not found then
    raise exception 'hairstyle catalog cycle not found for market %: %', v_market, p_cycle_id;
  end if;

  if v_cycle.status = 'failed' then
    raise exception 'failed cycle cannot be activated: %', p_cycle_id;
  end if;

  select count(*)
    into v_row_count
    from public.hairstyle_catalog
   where source_cycle_id = p_cycle_id
     and market = v_market
     and status = 'active';

  if v_row_count <= 0 then
    raise exception 'cycle % has no active catalog rows', p_cycle_id;
  end if;

  select
    count(*) filter (where style_target = 'male'),
    count(*) filter (where style_target = 'female')
    into v_male_lineup_count, v_female_lineup_count
    from public.hairstyle_catalog_lineups
   where cycle_id = p_cycle_id
     and market = v_market;

  if coalesce(v_male_lineup_count, 0) < 9 or coalesce(v_female_lineup_count, 0) < 9 then
    raise exception 'cycle % has insufficient lineups: male %, female %',
      p_cycle_id,
      coalesce(v_male_lineup_count, 0),
      coalesce(v_female_lineup_count, 0);
  end if;

  v_expires_at := coalesce(p_expires_at, v_now + interval '7 days');
  if v_expires_at <= v_now then
    raise exception 'p_expires_at must be in the future';
  end if;

  v_rotation_period := coalesce(nullif(btrim(p_rotation_period), ''), to_char(v_now, 'IYYY-"W"IW'));
  v_rotation_seed := coalesce(
    nullif(btrim(p_rotation_seed), ''),
    v_market || ':' || v_rotation_period || ':' || p_cycle_id::text
  );

  select active_cycle_id
    into v_previous_cycle_id
    from public.hairstyle_catalog_active_cycles
   where market = v_market
   for update;

  update public.hairstyle_catalog_cycles
     set status = 'succeeded',
         finished_at = coalesce(finished_at, v_now),
         item_count = v_row_count,
         error_log = null
   where cycle_id = p_cycle_id;

  insert into public.hairstyle_catalog_active_cycles (
    market,
    active_cycle_id,
    previous_cycle_id,
    activated_at,
    expires_at,
    rotation_period,
    rotation_seed,
    last_rebuild_cycle_id,
    last_rebuild_status,
    last_error_log,
    source_summary,
    updated_at
  )
  values (
    v_market,
    p_cycle_id,
    v_previous_cycle_id,
    v_now,
    v_expires_at,
    v_rotation_period,
    v_rotation_seed,
    p_cycle_id,
    'succeeded',
    null,
    coalesce(v_cycle.source_summary, '{}'::jsonb),
    v_now
  )
  on conflict (market) do update
     set previous_cycle_id = case
           when public.hairstyle_catalog_active_cycles.active_cycle_id is distinct from excluded.active_cycle_id
             then public.hairstyle_catalog_active_cycles.active_cycle_id
           else public.hairstyle_catalog_active_cycles.previous_cycle_id
         end,
         active_cycle_id = excluded.active_cycle_id,
         activated_at = excluded.activated_at,
         expires_at = excluded.expires_at,
         rotation_period = excluded.rotation_period,
         rotation_seed = excluded.rotation_seed,
         last_rebuild_cycle_id = excluded.last_rebuild_cycle_id,
         last_rebuild_status = excluded.last_rebuild_status,
         last_error_log = excluded.last_error_log,
         source_summary = excluded.source_summary,
         updated_at = excluded.updated_at;

  insert into public.hairstyle_catalog_rotation_events (
    market,
    cycle_id,
    event_type,
    message,
    metadata
  )
  values (
    v_market,
    p_cycle_id,
    'activated',
    'Activated hairstyle catalog cycle.',
    jsonb_build_object(
      'itemCount', v_row_count,
      'previousCycleId', v_previous_cycle_id,
      'expiresAt', v_expires_at,
      'rotationPeriod', v_rotation_period,
      'rotationSeed', v_rotation_seed
    )
  );

  return public.get_active_hairstyle_catalog(v_market);
end;
$$;

create or replace function public.fail_hairstyle_catalog_cycle(
  p_cycle_id uuid,
  p_error_log text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market text;
  v_status public.hairstyle_catalog_cycle_status;
  v_message text := coalesce(nullif(btrim(p_error_log), ''), 'Hairstyle catalog cycle failed.');
begin
  select market, status
    into v_market, v_status
    from public.hairstyle_catalog_cycles
   where cycle_id = p_cycle_id
   for update;

  if not found then
    raise exception 'hairstyle catalog cycle not found: %', p_cycle_id;
  end if;

  if v_status = 'succeeded' then
    raise exception 'succeeded cycle cannot be marked failed: %', p_cycle_id;
  end if;

  update public.hairstyle_catalog_cycles
     set status = 'failed',
         finished_at = coalesce(finished_at, now()),
         error_log = v_message
   where cycle_id = p_cycle_id;

  update public.hairstyle_catalog_active_cycles
     set last_rebuild_cycle_id = p_cycle_id,
         last_rebuild_status = 'failed',
         last_error_log = v_message,
         updated_at = now()
   where market = v_market;

  insert into public.hairstyle_catalog_rotation_events (
    market,
    cycle_id,
    event_type,
    message,
    metadata
  )
  values (
    v_market,
    p_cycle_id,
    'failed',
    v_message,
    jsonb_build_object('errorLog', v_message)
  );
end;
$$;

create or replace function public.mark_stale_running_hairstyle_cycles_failed(
  p_market text default 'kr',
  p_timeout_minutes integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market text := nullif(btrim(p_market), '');
  v_timeout_minutes integer := greatest(coalesce(p_timeout_minutes, 30), 1);
  v_count integer := 0;
begin
  if v_market is null then
    raise exception 'p_market is required';
  end if;

  with failed_cycles as (
    update public.hairstyle_catalog_cycles
       set status = 'failed',
           finished_at = now(),
           error_log = 'Marked failed after stale running timeout.'
     where market = v_market
       and status = 'running'
       and started_at < now() - make_interval(mins => v_timeout_minutes)
     returning cycle_id, market
  ),
  inserted_events as (
    insert into public.hairstyle_catalog_rotation_events (
      market,
      cycle_id,
      event_type,
      message,
      metadata
    )
    select
      market,
      cycle_id,
      'stale_failed',
      'Marked stale running hairstyle catalog cycle as failed.',
      jsonb_build_object('timeoutMinutes', v_timeout_minutes)
    from failed_cycles
    returning id
  )
  select count(*) into v_count from inserted_events;

  if v_count > 0 then
    update public.hairstyle_catalog_active_cycles
       set last_rebuild_status = 'failed',
           last_error_log = 'Marked stale running hairstyle catalog cycle as failed.',
           updated_at = now()
     where market = v_market;
  end if;

  return v_count;
end;
$$;

create or replace function public.record_hairstyle_catalog_rotation_attempt(
  p_market text,
  p_status text,
  p_cycle_id uuid default null,
  p_error_log text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market text := nullif(btrim(p_market), '');
  v_status text := nullif(btrim(p_status), '');
begin
  if v_market is null then
    raise exception 'p_market is required';
  end if;

  if v_status is null then
    raise exception 'p_status is required';
  end if;

  insert into public.hairstyle_catalog_rotation_events (
    market,
    cycle_id,
    event_type,
    message,
    metadata
  )
  values (
    v_market,
    p_cycle_id,
    v_status,
    coalesce(nullif(btrim(p_error_log), ''), 'Recorded hairstyle catalog rotation attempt.'),
    jsonb_build_object('status', v_status, 'errorLog', p_error_log)
  );

  update public.hairstyle_catalog_active_cycles
     set last_rebuild_cycle_id = coalesce(p_cycle_id, last_rebuild_cycle_id),
         last_rebuild_status = v_status,
         last_error_log = p_error_log,
         updated_at = now()
   where market = v_market;
end;
$$;

create or replace function public.enqueue_catalog_rotation_trend_alert(
  p_market text,
  p_cycle_id uuid,
  p_scheduled_send_at timestamptz,
  p_target_plans text[] default array['standard', 'pro', 'salon']::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market text := nullif(btrim(p_market), '');
  v_active public.hairstyle_catalog_active_cycles%rowtype;
  v_cycle public.hairstyle_catalog_cycles%rowtype;
  v_style_tags text[];
  v_alert_id uuid;
  v_rotation_period text;
begin
  if v_market is null then
    raise exception 'p_market is required';
  end if;

  if p_scheduled_send_at is null then
    raise exception 'p_scheduled_send_at is required';
  end if;

  select *
    into v_active
    from public.hairstyle_catalog_active_cycles
   where market = v_market
     and active_cycle_id = p_cycle_id;

  if not found then
    raise exception 'cycle % is not the active cycle for market %', p_cycle_id, v_market;
  end if;

  select *
    into v_cycle
    from public.hairstyle_catalog_cycles
   where cycle_id = p_cycle_id
     and market = v_market
     and status = 'succeeded';

  if not found then
    raise exception 'active cycle is not succeeded for market %: %', v_market, p_cycle_id;
  end if;

  select coalesce(array_agg(slug), '{}'::text[])
    into v_style_tags
    from (
      select slug
        from public.hairstyle_catalog
       where source_cycle_id = p_cycle_id
         and market = v_market
         and status = 'active'
       order by trend_score desc, freshness_score desc, slug
       limit 8
    ) as ranked_styles;

  v_rotation_period := coalesce(nullif(v_active.rotation_period, ''), to_char(v_active.activated_at, 'IYYY-"W"IW'));

  insert into public.trend_alerts (
    season,
    target_plans,
    title,
    body_html,
    style_tags,
    scheduled_send_at,
    catalog_cycle_id,
    alert_type,
    source_summary
  )
  values (
    v_rotation_period,
    coalesce(p_target_plans, array['standard', 'pro', 'salon']::text[]),
    '이번 주 헤어스타일 트렌드가 업데이트됐어요',
    '<p>새로운 헤어스타일 추천 카탈로그가 업데이트되었습니다.</p><p>HairFit에서 이번 주 얼굴형과 분위기에 맞춘 스타일 후보를 확인해 보세요.</p>',
    v_style_tags,
    p_scheduled_send_at,
    p_cycle_id,
    'catalog_rotation',
    coalesce(v_cycle.source_summary, '{}'::jsonb)
      || jsonb_build_object(
        'market', v_market,
        'cycleId', p_cycle_id,
        'rotationPeriod', v_rotation_period,
        'rotationSeed', v_active.rotation_seed
      )
  )
  on conflict (catalog_cycle_id, alert_type)
  where catalog_cycle_id is not null
  do update
     set target_plans = case
           when public.trend_alerts.sent_at is null then excluded.target_plans
           else public.trend_alerts.target_plans
         end,
         scheduled_send_at = case
           when public.trend_alerts.sent_at is null then excluded.scheduled_send_at
           else public.trend_alerts.scheduled_send_at
         end,
         source_summary = excluded.source_summary,
         style_tags = excluded.style_tags
  returning id into v_alert_id;

  insert into public.hairstyle_catalog_rotation_events (
    market,
    cycle_id,
    event_type,
    message,
    metadata
  )
  values (
    v_market,
    p_cycle_id,
    'alert_enqueued',
    'Enqueued catalog rotation trend alert.',
    jsonb_build_object('alertId', v_alert_id, 'scheduledSendAt', p_scheduled_send_at)
  );

  return v_alert_id;
end;
$$;

with ranked_succeeded_cycles as (
  select
    cycle_id,
    market,
    coalesce(finished_at, started_at, now()) as activated_at,
    source_summary,
    row_number() over (
      partition by market
      order by coalesce(finished_at, started_at) desc, started_at desc, cycle_id desc
    ) as cycle_rank
  from public.hairstyle_catalog_cycles as cycles
  where status = 'succeeded'
    and exists (
      select 1
        from public.hairstyle_catalog as catalog
       where catalog.source_cycle_id = cycles.cycle_id
         and catalog.market = cycles.market
         and catalog.status = 'active'
    )
)
insert into public.hairstyle_catalog_active_cycles (
  market,
  active_cycle_id,
  previous_cycle_id,
  activated_at,
  expires_at,
  rotation_period,
  rotation_seed,
  last_rebuild_cycle_id,
  last_rebuild_status,
  last_error_log,
  source_summary
)
select
  market,
  cycle_id,
  null::uuid,
  activated_at,
  activated_at + interval '7 days',
  to_char(activated_at, 'IYYY-"W"IW'),
  market || ':' || to_char(activated_at, 'IYYY-"W"IW') || ':' || cycle_id::text,
  cycle_id,
  'succeeded',
  null,
  coalesce(source_summary, '{}'::jsonb)
from ranked_succeeded_cycles
where cycle_rank = 1
on conflict (market) do nothing;

alter table public.hairstyle_catalog_active_cycles enable row level security;
alter table public.hairstyle_catalog_lineups enable row level security;
alter table public.hairstyle_catalog_rotation_events enable row level security;

revoke all on table public.hairstyle_catalog_active_cycles from anon, authenticated;
revoke all on table public.hairstyle_catalog_lineups from anon, authenticated;
revoke all on table public.hairstyle_catalog_rotation_events from anon, authenticated;

grant select on public.hairstyle_catalog_active_cycles to authenticated;
grant select on public.hairstyle_catalog_lineups to authenticated;

grant select, insert, update, delete on public.hairstyle_catalog_active_cycles to service_role;
grant select, insert, update, delete on public.hairstyle_catalog_lineups to service_role;
grant select, insert, update, delete on public.hairstyle_catalog_rotation_events to service_role;

drop policy if exists "hairstyle_catalog_active_cycles_select_authenticated" on public.hairstyle_catalog_active_cycles;
create policy "hairstyle_catalog_active_cycles_select_authenticated"
  on public.hairstyle_catalog_active_cycles
  for select
  to authenticated
  using (true);

drop policy if exists "hairstyle_catalog_lineups_select_authenticated" on public.hairstyle_catalog_lineups;
create policy "hairstyle_catalog_lineups_select_authenticated"
  on public.hairstyle_catalog_lineups
  for select
  to authenticated
  using (true);

revoke all on function public.get_active_hairstyle_catalog(text) from public;
revoke all on function public.activate_hairstyle_catalog_cycle(text, uuid, timestamptz, text, text) from public;
revoke all on function public.fail_hairstyle_catalog_cycle(uuid, text) from public;
revoke all on function public.mark_stale_running_hairstyle_cycles_failed(text, integer) from public;
revoke all on function public.record_hairstyle_catalog_rotation_attempt(text, text, uuid, text) from public;
revoke all on function public.enqueue_catalog_rotation_trend_alert(text, uuid, timestamptz, text[]) from public;

grant execute on function public.get_active_hairstyle_catalog(text) to authenticated, service_role;
grant execute on function public.activate_hairstyle_catalog_cycle(text, uuid, timestamptz, text, text) to service_role;
grant execute on function public.fail_hairstyle_catalog_cycle(uuid, text) to service_role;
grant execute on function public.mark_stale_running_hairstyle_cycles_failed(text, integer) to service_role;
grant execute on function public.record_hairstyle_catalog_rotation_attempt(text, text, uuid, text) to service_role;
grant execute on function public.enqueue_catalog_rotation_trend_alert(text, uuid, timestamptz, text[]) to service_role;

-- Extend the rotating hairstyle catalog with blueprint v4 compatibility metadata.

alter table public.hairstyle_catalog
  add column if not exists style_family text not null default '',
  add column if not exists variant_key text not null default '',
  add column if not exists primary_texture text not null default 'straight',
  add column if not exists compatible_texture_tags text[] not null default array['straight', 'wavy_curly', 'tight_curly_frizzy']::text[],
  add column if not exists avoid_texture_tags text[] not null default '{}'::text[],
  add column if not exists primary_strand_thickness text not null default 'medium',
  add column if not exists compatible_strand_thickness_tags text[] not null default array['fine', 'medium', 'coarse']::text[],
  add column if not exists avoid_strand_thickness_tags text[] not null default '{}'::text[],
  add column if not exists primary_condition text not null default 'untreated',
  add column if not exists compatible_condition_tags text[] not null default array['untreated', 'damaged', 'bleached', 'colored', 'permed']::text[],
  add column if not exists avoid_condition_tags text[] not null default '{}'::text[],
  add column if not exists required_services text[] not null default array['cut']::text[],
  add column if not exists service_constraints text[] not null default array['professional_assessment']::text[],
  add column if not exists maintenance_level text not null default 'medium',
  add column if not exists introduced_in text not null default 'legacy-32';

update public.hairstyle_catalog
set
  style_family = case when btrim(style_family) = '' then slug else style_family end,
  variant_key = case when btrim(variant_key) = '' then 'legacy-' || slug else variant_key end
where btrim(style_family) = '' or btrim(variant_key) = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hairstyle_catalog_blueprint_v4_identity_check'
      and conrelid = 'public.hairstyle_catalog'::regclass
  ) then
    alter table public.hairstyle_catalog
      add constraint hairstyle_catalog_blueprint_v4_identity_check
      check (btrim(style_family) <> '' and btrim(variant_key) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'hairstyle_catalog_primary_texture_check'
      and conrelid = 'public.hairstyle_catalog'::regclass
  ) then
    alter table public.hairstyle_catalog
      add constraint hairstyle_catalog_primary_texture_check
      check (primary_texture in ('straight', 'wavy_curly', 'tight_curly_frizzy'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'hairstyle_catalog_strand_thickness_check'
      and conrelid = 'public.hairstyle_catalog'::regclass
  ) then
    alter table public.hairstyle_catalog
      add constraint hairstyle_catalog_strand_thickness_check
      check (primary_strand_thickness in ('fine', 'medium', 'coarse'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'hairstyle_catalog_primary_condition_check'
      and conrelid = 'public.hairstyle_catalog'::regclass
  ) then
    alter table public.hairstyle_catalog
      add constraint hairstyle_catalog_primary_condition_check
      check (primary_condition in ('untreated', 'damaged', 'bleached', 'colored'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'hairstyle_catalog_maintenance_level_check'
      and conrelid = 'public.hairstyle_catalog'::regclass
  ) then
    alter table public.hairstyle_catalog
      add constraint hairstyle_catalog_maintenance_level_check
      check (maintenance_level in ('low', 'medium', 'high'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'hairstyle_catalog_introduced_in_check'
      and conrelid = 'public.hairstyle_catalog'::regclass
  ) then
    alter table public.hairstyle_catalog
      add constraint hairstyle_catalog_introduced_in_check
      check (introduced_in in ('legacy-32', 'expansion-a', 'expansion-b', 'expansion-c'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'hairstyle_catalog_compatibility_arrays_check'
      and conrelid = 'public.hairstyle_catalog'::regclass
  ) then
    alter table public.hairstyle_catalog
      add constraint hairstyle_catalog_compatibility_arrays_check
      check (
        cardinality(compatible_texture_tags) > 0
        and cardinality(compatible_strand_thickness_tags) > 0
        and cardinality(compatible_condition_tags) > 0
        and cardinality(required_services) > 0
      );
  end if;
end
$$;

create or replace function public.get_active_hairstyle_catalog(p_market text default 'kr')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
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
                id, slug, name_ko, description, market, length_bucket, silhouette, texture, bang_type,
                volume_focus_tags, face_shape_fit_tags, avoid_tags, trend_score, freshness_score,
                prompt_template, negative_prompt, prompt_template_version, style_targets,
                style_family, variant_key, primary_texture, compatible_texture_tags, avoid_texture_tags,
                primary_strand_thickness, compatible_strand_thickness_tags, avoid_strand_thickness_tags,
                primary_condition, compatible_condition_tags, avoid_condition_tags, required_services,
                service_constraints, maintenance_level, introduced_in, status, source_cycle_id,
                created_at, updated_at
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
                lineup.id, lineup.cycle_id, lineup.market, lineup.style_target, lineup.slot_key,
                lineup.rank, lineup.catalog_item_id, item.slug, item.name_ko,
                lineup.rotation_score, lineup.selection_reason, lineup.created_at
              from public.hairstyle_catalog_lineups as lineup
              join public.hairstyle_catalog as item on item.id = lineup.catalog_item_id
              where lineup.cycle_id = active.active_cycle_id
                and lineup.market = active.market
            ) as lineup_row
          ),
          '[]'::jsonb
        )
      )
      from public.hairstyle_catalog_active_cycles as active
      join public.hairstyle_catalog_cycles as cycle_row on cycle_row.cycle_id = active.active_cycle_id
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

revoke execute on function public.get_active_hairstyle_catalog(text) from public, anon, authenticated;
grant execute on function public.get_active_hairstyle_catalog(text) to authenticated, service_role;

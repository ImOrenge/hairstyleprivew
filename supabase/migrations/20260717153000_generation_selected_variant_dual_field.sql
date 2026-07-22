-- Additive selected-variant field for the generation API.
-- Keep the legacy options.recommendationSet.selectedVariantId path in sync for
-- at least two compatible releases and until 30-day mismatch telemetry is zero.

alter table public.generations
  add column if not exists selected_variant_id text;

update public.generations
   set selected_variant_id = nullif(
     btrim(options #>> '{recommendationSet,selectedVariantId}'),
     ''
   )
 where selected_variant_id is null
   and nullif(btrim(options #>> '{recommendationSet,selectedVariantId}'), '') is not null;

create or replace function public.sync_generation_selected_variant_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old_json_selected text;
  v_new_json_selected text;
  v_selected text;
  v_column_changed boolean;
  v_json_changed boolean;
  v_recommendation_set jsonb;
  v_variants jsonb;
begin
  v_new_json_selected := nullif(
    btrim(new.options #>> '{recommendationSet,selectedVariantId}'),
    ''
  );

  if tg_op = 'INSERT' then
    if new.selected_variant_id is not null
       and v_new_json_selected is not null
       and new.selected_variant_id <> v_new_json_selected then
      raise exception 'generation_selected_variant_conflict';
    end if;
    v_selected := coalesce(nullif(btrim(new.selected_variant_id), ''), v_new_json_selected);
  else
    v_old_json_selected := nullif(
      btrim(old.options #>> '{recommendationSet,selectedVariantId}'),
      ''
    );
    v_column_changed :=
      nullif(btrim(new.selected_variant_id), '')
      is distinct from
      nullif(btrim(old.selected_variant_id), '');
    v_json_changed := v_new_json_selected is distinct from v_old_json_selected;

    if v_column_changed and v_json_changed
       and nullif(btrim(new.selected_variant_id), '') is distinct from v_new_json_selected then
      raise exception 'generation_selected_variant_conflict';
    end if;

    if v_column_changed then
      v_selected := nullif(btrim(new.selected_variant_id), '');
    elsif v_json_changed then
      v_selected := v_new_json_selected;
    else
      v_selected := coalesce(
        nullif(btrim(new.selected_variant_id), ''),
        v_new_json_selected
      );
    end if;
  end if;

  v_recommendation_set := case
    when jsonb_typeof(new.options -> 'recommendationSet') = 'object'
      then new.options -> 'recommendationSet'
    else '{}'::jsonb
  end;
  v_variants := v_recommendation_set -> 'variants';

  if v_selected is not null then
    if jsonb_typeof(v_variants) <> 'array'
       or not exists (
         select 1
           from jsonb_array_elements(v_variants) as variant(value)
          where variant.value ->> 'id' = v_selected
       ) then
      raise exception 'generation_selected_variant_not_found';
    end if;
  end if;

  new.selected_variant_id := v_selected;
  new.options := jsonb_set(
    coalesce(new.options, '{}'::jsonb),
    '{recommendationSet}',
    v_recommendation_set || jsonb_build_object('selectedVariantId', v_selected),
    true
  );

  return new;
end;
$$;

drop trigger if exists generation_selected_variant_dual_write_trigger
  on public.generations;
create trigger generation_selected_variant_dual_write_trigger
before insert or update of selected_variant_id, options on public.generations
for each row execute function public.sync_generation_selected_variant_fields();

alter table public.generations
  drop constraint if exists generations_selected_variant_fields_match;
alter table public.generations
  add constraint generations_selected_variant_fields_match
  check (
    nullif(btrim(selected_variant_id), '')
    is not distinct from
    nullif(btrim(options #>> '{recommendationSet,selectedVariantId}'), '')
  ) not valid;
alter table public.generations
  validate constraint generations_selected_variant_fields_match;

create index if not exists generations_selected_variant_id_idx
  on public.generations (selected_variant_id)
  where selected_variant_id is not null;

comment on column public.generations.selected_variant_id is
  'Additive public selection field. Dual-written with options.recommendationSet.selectedVariantId until two compatible releases and 30 days of zero mismatch telemetry.';

revoke all on function public.sync_generation_selected_variant_fields()
  from public, anon, authenticated;
grant execute on function public.sync_generation_selected_variant_fields()
  to service_role;

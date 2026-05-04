create unique index if not exists idx_credit_ledger_unique_recommendation_grid_usage
  on public.credit_ledger (generation_id, reason)
  where generation_id is not null
    and entry_type = 'usage'
    and reason = 'recommendation_grid_usage';

create or replace function public.merge_generation_recommendation_variant(
  p_generation_id uuid,
  p_variant_id text,
  p_variant_patch jsonb,
  p_error_message text default null,
  p_prompt_used text default null,
  p_model_provider text default null,
  p_model_name text default null,
  p_credits_used integer default null,
  p_catalog_cycle_id text default null,
  p_analysis jsonb default null,
  p_credit_charged_at text default null,
  p_credit_charge_amount integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_options jsonb;
  v_recommendation_set jsonb;
  v_variants jsonb;
  v_next_variants jsonb;
  v_next_recommendation_set jsonb;
  v_next_status public.generation_status;
  v_primary_variant jsonb;
  v_variant_found boolean := false;
begin
  if p_generation_id is null then
    raise exception 'p_generation_id is required';
  end if;

  if coalesce(p_variant_id, '') = '' then
    raise exception 'p_variant_id is required';
  end if;

  if p_variant_patch is null or jsonb_typeof(p_variant_patch) <> 'object' then
    raise exception 'p_variant_patch must be a JSON object';
  end if;

  select coalesce(options, '{}'::jsonb)
    into v_options
    from public.generations
   where id = p_generation_id
   for update;

  if not found then
    raise exception 'Generation % not found', p_generation_id;
  end if;

  v_recommendation_set := v_options -> 'recommendationSet';
  if v_recommendation_set is null or jsonb_typeof(v_recommendation_set) <> 'object' then
    raise exception 'Recommendation set not found';
  end if;

  v_variants := v_recommendation_set -> 'variants';
  if v_variants is null or jsonb_typeof(v_variants) <> 'array' then
    raise exception 'Recommendation variants not found';
  end if;

  select
    coalesce(
      jsonb_agg(
        case
          when item.value ->> 'id' = p_variant_id then item.value || p_variant_patch
          else item.value
        end
        order by item.ordinality
      ),
      '[]'::jsonb
    ),
    coalesce(bool_or(item.value ->> 'id' = p_variant_id), false)
    into v_next_variants, v_variant_found
    from jsonb_array_elements(v_variants) with ordinality as item(value, ordinality);

  if not v_variant_found then
    raise exception 'Recommendation variant % not found', p_variant_id;
  end if;

  v_next_recommendation_set := jsonb_set(v_recommendation_set, '{variants}', v_next_variants, false);

  if p_catalog_cycle_id is not null then
    v_next_recommendation_set := jsonb_set(
      v_next_recommendation_set,
      '{catalogCycleId}',
      to_jsonb(p_catalog_cycle_id),
      true
    );
    v_options := jsonb_set(v_options, '{catalogCycleId}', to_jsonb(p_catalog_cycle_id), true);
  end if;

  if p_analysis is not null then
    v_next_recommendation_set := jsonb_set(v_next_recommendation_set, '{analysis}', p_analysis, true);
    v_options := jsonb_set(v_options, '{analysis}', p_analysis, true);
  end if;

  if p_credit_charged_at is not null and v_next_recommendation_set ->> 'creditChargedAt' is null then
    v_next_recommendation_set := jsonb_set(
      v_next_recommendation_set,
      '{creditChargedAt}',
      to_jsonb(p_credit_charged_at),
      true
    );
  end if;

  if p_credit_charge_amount is not null and v_next_recommendation_set -> 'creditChargeAmount' is null then
    v_next_recommendation_set := jsonb_set(
      v_next_recommendation_set,
      '{creditChargeAmount}',
      to_jsonb(p_credit_charge_amount),
      true
    );
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_next_variants) as variant(value)
     where variant.value ->> 'status' in ('queued', 'generating')
  ) then
    v_next_status := 'processing';
  elsif exists (
    select 1
      from jsonb_array_elements(v_next_variants) as variant(value)
     where variant.value ->> 'status' = 'completed'
  ) then
    v_next_status := 'completed';
  else
    v_next_status := 'failed';
  end if;

  select selected.value
    into v_primary_variant
    from jsonb_array_elements(v_next_variants) as selected(value)
   where selected.value ->> 'id' = v_next_recommendation_set ->> 'selectedVariantId'
     and coalesce(selected.value ->> 'generatedImagePath', '') <> ''
   limit 1;

  if v_primary_variant is null then
    select selected.value
      into v_primary_variant
      from jsonb_array_elements(v_next_variants) with ordinality as selected(value, ordinality)
     where coalesce(selected.value ->> 'generatedImagePath', '') <> ''
     order by selected.ordinality
     limit 1;
  end if;

  v_options := jsonb_set(v_options, '{recommendationSet}', v_next_recommendation_set, true);

  update public.generations
     set status = v_next_status,
         error_message = p_error_message,
         generated_image_path = coalesce(v_primary_variant ->> 'generatedImagePath', generated_image_path),
         prompt_used = coalesce(v_primary_variant ->> 'prompt', p_prompt_used, prompt_used),
         model_provider = coalesce(p_model_provider, model_provider),
         model_name = coalesce(p_model_name, model_name),
         credits_used = coalesce(p_credits_used, credits_used),
         options = v_options,
         updated_at = now()
   where id = p_generation_id;

  return v_next_recommendation_set;
end;
$$;

revoke all on function public.merge_generation_recommendation_variant(
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  text,
  integer
) from public;

revoke all on function public.merge_generation_recommendation_variant(
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  text,
  integer
) from anon, authenticated;

grant execute on function public.merge_generation_recommendation_variant(
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  text,
  integer
) to service_role;

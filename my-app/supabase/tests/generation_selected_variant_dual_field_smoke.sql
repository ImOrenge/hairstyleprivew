\set ON_ERROR_STOP on

begin;

do $$
declare
  v_generation_id uuid := gen_random_uuid();
  v_selected text;
begin
  insert into public.users (id, email)
  values ('selected_variant_smoke_user', 'selected-variant-smoke@example.test');

  -- Legacy clients write only the JSON path; the public column must follow.
  insert into public.generations (
    id,
    user_id,
    original_image_path,
    prompt_used,
    options,
    status,
    model_provider
  ) values (
    v_generation_id,
    'selected_variant_smoke_user',
    'original/selected-variant-smoke.webp',
    'selected variant smoke prompt',
    jsonb_build_object(
      'recommendationSet', jsonb_build_object(
        'selectedVariantId', 'legacy-v1',
        'variants', jsonb_build_array(
          jsonb_build_object('id', 'legacy-v1'),
          jsonb_build_object('id', 'public-v2'),
          jsonb_build_object('id', 'conflict-v3')
        )
      )
    ),
    'completed',
    'test'
  );

  select selected_variant_id
    into v_selected
    from public.generations
   where id = v_generation_id;
  if v_selected <> 'legacy-v1' then
    raise exception 'legacy JSON write did not populate selected_variant_id: %', v_selected;
  end if;

  -- New clients write only the public field; the legacy JSON path must follow.
  update public.generations
     set selected_variant_id = 'public-v2'
   where id = v_generation_id;

  select options #>> '{recommendationSet,selectedVariantId}'
    into v_selected
    from public.generations
   where id = v_generation_id;
  if v_selected <> 'public-v2' then
    raise exception 'public field write did not populate legacy JSON: %', v_selected;
  end if;

  -- A request changing both fields to different values must fail loudly.
  begin
    update public.generations
       set selected_variant_id = 'legacy-v1',
           options = jsonb_set(
             options,
             '{recommendationSet,selectedVariantId}',
             '"conflict-v3"'::jsonb
           )
     where id = v_generation_id;
    raise exception 'conflicting dual write unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%generation_selected_variant_conflict%' then
        raise;
      end if;
  end;

  -- A public value that is not present in the recommendation variants is invalid.
  begin
    update public.generations
       set selected_variant_id = 'missing-variant'
     where id = v_generation_id;
    raise exception 'unknown selected variant unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%generation_selected_variant_not_found%' then
        raise;
      end if;
  end;

  select selected_variant_id
    into v_selected
    from public.generations
   where id = v_generation_id;
  if v_selected <> 'public-v2' then
    raise exception 'failed writes changed the durable selection: %', v_selected;
  end if;
end;
$$;

select 'generation_selected_variant_dual_field_smoke_ok' as result;

rollback;

create or replace function public.claim_generation_recommendation_variant(
  p_generation_id uuid,
  p_variant_id text,
  p_attempt_id text,
  p_lease_seconds integer default 1200
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
  v_variant jsonb;
  v_next_variants jsonb;
  v_next_recommendation_set jsonb;
  v_patch jsonb;
  v_lease_until timestamptz;
  v_next_lease_until timestamptz;
  v_lease_seconds integer;
  v_attempt_token text;
begin
  if p_generation_id is null then
    raise exception 'p_generation_id is required';
  end if;
  if coalesce(p_variant_id, '') = '' then
    raise exception 'p_variant_id is required';
  end if;
  if coalesce(p_attempt_id, '') = '' or length(p_attempt_id) > 200 then
    raise exception 'p_attempt_id must be between 1 and 200 characters';
  end if;

  v_lease_seconds := greatest(60, least(coalesce(p_lease_seconds, 1200), 3600));

  select coalesce(options, '{}'::jsonb)
    into v_options
    from public.generations
   where id = p_generation_id
   for update;

  if not found then
    raise exception 'Generation % not found', p_generation_id;
  end if;

  v_recommendation_set := v_options -> 'recommendationSet';
  v_variants := v_recommendation_set -> 'variants';
  if v_recommendation_set is null
     or jsonb_typeof(v_recommendation_set) <> 'object'
     or v_variants is null
     or jsonb_typeof(v_variants) <> 'array' then
    raise exception 'Recommendation variants not found';
  end if;

  select item.value
    into v_variant
    from jsonb_array_elements(v_variants) as item(value)
   where item.value ->> 'id' = p_variant_id
   limit 1;

  if v_variant is null then
    raise exception 'Recommendation variant % not found', p_variant_id;
  end if;

  if v_variant ->> 'status' = 'completed'
     and coalesce(v_variant ->> 'generatedImagePath', '') <> '' then
    return jsonb_build_object('state', 'completed', 'variant', v_variant);
  end if;

  begin
    v_lease_until := nullif(v_variant ->> 'generationLeaseUntil', '')::timestamptz;
  exception when others then
    v_lease_until := null;
  end;

  if v_variant ->> 'status' = 'generating'
     and v_lease_until is not null
     and v_lease_until > now() then
    return jsonb_build_object(
      'state', 'busy',
      'leaseUntil', v_lease_until,
      'requestMatches', v_variant ->> 'generationAttemptRequestId' = p_attempt_id
    );
  end if;

  -- The caller supplies only an operation/request id. Postgres creates the
  -- fencing token so an expired request id can never revive an old writer.
  v_attempt_token := gen_random_uuid()::text;
  v_next_lease_until := now() + make_interval(secs => v_lease_seconds);
  v_patch := jsonb_build_object(
    'status', 'generating',
    'error', null,
    'generationAttemptId', v_attempt_token,
    'generationAttemptRequestId', p_attempt_id,
    'generationLeaseUntil', v_next_lease_until,
    'generationStartedAt', coalesce(v_variant ->> 'generationStartedAt', now()::text)
  );

  select coalesce(
    jsonb_agg(
      case
        when item.value ->> 'id' = p_variant_id then item.value || v_patch
        else item.value
      end
      order by item.ordinality
    ),
    '[]'::jsonb
  )
    into v_next_variants
    from jsonb_array_elements(v_variants) with ordinality as item(value, ordinality);

  v_next_recommendation_set := jsonb_set(
    v_recommendation_set,
    '{variants}',
    v_next_variants,
    false
  );
  v_options := jsonb_set(
    v_options,
    '{recommendationSet}',
    v_next_recommendation_set,
    true
  );

  update public.generations
     set status = 'processing',
         error_message = null,
         options = v_options,
         updated_at = now()
   where id = p_generation_id;

  return jsonb_build_object(
    'state', 'claimed',
    'attemptId', v_attempt_token,
    'requestId', p_attempt_id,
    'leaseUntil', v_next_lease_until
  );
end;
$$;

create or replace function public.finish_generation_recommendation_variant_attempt(
  p_generation_id uuid,
  p_variant_id text,
  p_attempt_id text,
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
  v_variant jsonb;
  v_patch jsonb;
  v_result jsonb;
begin
  if coalesce(p_attempt_id, '') = '' then
    raise exception 'p_attempt_id is required';
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
  select item.value
    into v_variant
    from jsonb_array_elements(v_recommendation_set -> 'variants') as item(value)
   where item.value ->> 'id' = p_variant_id
   limit 1;

  if v_variant is null then
    raise exception 'Recommendation variant % not found', p_variant_id;
  end if;

  -- Completion is absorbing. A route may lose the RPC response after this
  -- transaction commits and then retry its failure path; that must not erase
  -- an already-authoritative image.
  if v_variant ->> 'status' = 'completed'
     and coalesce(v_variant ->> 'generatedImagePath', '') <> '' then
    return jsonb_build_object('state', 'completed', 'variant', v_variant);
  end if;

  if v_variant ->> 'generationAttemptId' is distinct from p_attempt_id then
    return jsonb_build_object(
      'state', 'stale',
      'currentAttemptId', v_variant ->> 'generationAttemptId',
      'variant', v_variant
    );
  end if;

  v_patch := p_variant_patch || jsonb_build_object('generationLeaseUntil', null);

  select public.merge_generation_recommendation_variant(
    p_generation_id,
    p_variant_id,
    v_patch,
    p_error_message,
    p_prompt_used,
    p_model_provider,
    p_model_name,
    p_credits_used,
    p_catalog_cycle_id,
    p_analysis,
    p_credit_charged_at,
    p_credit_charge_amount
  )
    into v_result;

  select item.value
    into v_variant
    from jsonb_array_elements(v_result -> 'variants') as item(value)
   where item.value ->> 'id' = p_variant_id
   limit 1;

  return jsonb_build_object(
    'state', 'applied',
    'variant', v_variant,
    'recommendationSet', v_result
  );
end;
$$;

create or replace function public.read_generation_recommendation_variant_attempt(
  p_generation_id uuid,
  p_variant_id text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_options jsonb;
  v_recommendation_set jsonb;
  v_variant jsonb;
  v_lease_until timestamptz;
  v_state text := 'idle';
begin
  select coalesce(options, '{}'::jsonb)
    into v_options
    from public.generations
   where id = p_generation_id;

  if not found then
    raise exception 'Generation % not found', p_generation_id;
  end if;

  v_recommendation_set := v_options -> 'recommendationSet';
  select item.value
    into v_variant
    from jsonb_array_elements(v_recommendation_set -> 'variants') as item(value)
   where item.value ->> 'id' = p_variant_id
   limit 1;

  if v_variant is null then
    raise exception 'Recommendation variant % not found', p_variant_id;
  end if;

  if v_variant ->> 'status' = 'completed'
     and coalesce(v_variant ->> 'generatedImagePath', '') <> '' then
    v_state := 'completed';
  else
    begin
      v_lease_until := nullif(v_variant ->> 'generationLeaseUntil', '')::timestamptz;
    exception when others then
      v_lease_until := null;
    end;

    if v_variant ->> 'status' = 'generating'
       and v_lease_until is not null
       and v_lease_until > now() then
      v_state := 'active';
    end if;
  end if;

  return jsonb_build_object('state', v_state, 'variant', v_variant);
end;
$$;

create or replace function public.fail_generation_recommendation_variant_after_lease(
  p_generation_id uuid,
  p_variant_id text,
  p_failure_token text,
  p_failure_message text,
  p_catalog_cycle_id text default null,
  p_analysis jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_options jsonb;
  v_recommendation_set jsonb;
  v_variant jsonb;
  v_lease_until timestamptz;
  v_patch jsonb;
  v_result jsonb;
begin
  if coalesce(p_failure_token, '') = '' then
    raise exception 'p_failure_token is required';
  end if;
  if coalesce(p_failure_message, '') = '' then
    raise exception 'p_failure_message is required';
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
  select item.value
    into v_variant
    from jsonb_array_elements(v_recommendation_set -> 'variants') as item(value)
   where item.value ->> 'id' = p_variant_id
   limit 1;

  if v_variant is null then
    raise exception 'Recommendation variant % not found', p_variant_id;
  end if;

  if v_variant ->> 'status' = 'completed'
     and coalesce(v_variant ->> 'generatedImagePath', '') <> '' then
    return jsonb_build_object('state', 'completed', 'variant', v_variant);
  end if;

  begin
    v_lease_until := nullif(v_variant ->> 'generationLeaseUntil', '')::timestamptz;
  exception when others then
    v_lease_until := null;
  end;

  if v_variant ->> 'status' = 'generating'
     and v_lease_until is not null
     and v_lease_until > now() then
    return jsonb_build_object('state', 'active', 'leaseUntil', v_lease_until);
  end if;

  v_patch := jsonb_build_object(
    'status', 'failed',
    'error', p_failure_message,
    'outputUrl', null,
    'generatedImagePath', null,
    'evaluation', null,
    'generatedAt', null,
    'generationAttemptId', p_failure_token,
    'generationLeaseUntil', null
  );

  select public.merge_generation_recommendation_variant(
    p_generation_id,
    p_variant_id,
    v_patch,
    p_failure_message,
    null,
    null,
    null,
    null,
    p_catalog_cycle_id,
    p_analysis,
    null,
    null
  )
    into v_result;

  return jsonb_build_object('state', 'applied', 'recommendationSet', v_result);
end;
$$;

revoke all on function public.claim_generation_recommendation_variant(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_generation_recommendation_variant_attempt(
  uuid, text, text, jsonb, text, text, text, text, integer, text, jsonb, text, integer
) from public, anon, authenticated;
revoke all on function public.read_generation_recommendation_variant_attempt(uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_generation_recommendation_variant_after_lease(
  uuid, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.claim_generation_recommendation_variant(uuid, text, text, integer)
  to service_role;
grant execute on function public.finish_generation_recommendation_variant_attempt(
  uuid, text, text, jsonb, text, text, text, text, integer, text, jsonb, text, integer
) to service_role;
grant execute on function public.read_generation_recommendation_variant_attempt(uuid, text)
  to service_role;
grant execute on function public.fail_generation_recommendation_variant_after_lease(
  uuid, text, text, text, text, jsonb
) to service_role;

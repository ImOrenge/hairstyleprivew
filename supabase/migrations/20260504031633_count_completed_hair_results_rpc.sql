create or replace function public.count_user_completed_hair_results(p_user_id text)
returns integer
language sql
security invoker
set search_path = public
stable
as $$
  select coalesce(
    sum(
      case
        when jsonb_typeof(coalesce(options, '{}'::jsonb) -> 'recommendationSet' -> 'variants') = 'array' then (
          select count(*)::integer
            from jsonb_array_elements(coalesce(options, '{}'::jsonb) -> 'recommendationSet' -> 'variants') as variant(value)
           where variant.value ->> 'status' = 'completed'
             and coalesce(variant.value ->> 'outputUrl', variant.value ->> 'generatedImagePath', '') <> ''
        )
        when status = 'completed' then 1
        else 0
      end
    ),
    0
  )::integer
    from public.generations
   where user_id = p_user_id;
$$;

revoke all on function public.count_user_completed_hair_results(text) from public;
revoke all on function public.count_user_completed_hair_results(text) from anon, authenticated;
grant execute on function public.count_user_completed_hair_results(text) to service_role;

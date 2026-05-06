-- Keep cron schedule registration callable on projects where pg_cron is enabled,
-- while avoiding schema-lint failures on projects without the cron schema.

create or replace function public.register_app_cron_schedules(
  p_edge_function_base_url text,
  p_service_role_key text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_cron_schema name := 'cron';
  v_care_sql text;
  v_trend_sql text;
  v_renewal_sql text;
begin
  if nullif(p_edge_function_base_url, '') is null then
    raise exception 'p_edge_function_base_url is required';
  end if;

  if nullif(p_service_role_key, '') is null then
    raise exception 'p_service_role_key is required';
  end if;

  if not exists (select 1 from pg_namespace where nspname = v_cron_schema) then
    raise exception 'pg_cron is not available on this project';
  end if;

  v_care_sql := format(
    $sql$
      select net.http_post(
        url     := %L,
        headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
        body    := '{}'::jsonb
      ) as request_id;
    $sql$,
    p_edge_function_base_url || '/cron-care-emails',
    p_service_role_key
  );

  v_trend_sql := format(
    $sql$
      select net.http_post(
        url     := %L,
        headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
        body    := '{}'::jsonb
      ) as request_id;
    $sql$,
    p_edge_function_base_url || '/cron-trend-emails',
    p_service_role_key
  );

  v_renewal_sql := format(
    $sql$
      select net.http_post(
        url     := %L,
        headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
        body    := '{}'::jsonb
      ) as request_id;
    $sql$,
    p_edge_function_base_url || '/cron-subscription-renewal',
    p_service_role_key
  );

  execute format(
    'select %1$I.unschedule(%2$L) where exists (select 1 from %1$I.job where jobname = %2$L)',
    v_cron_schema,
    'cron-care-emails'
  );
  execute format(
    'select %1$I.unschedule(%2$L) where exists (select 1 from %1$I.job where jobname = %2$L)',
    v_cron_schema,
    'cron-trend-emails'
  );
  execute format(
    'select %1$I.unschedule(%2$L) where exists (select 1 from %1$I.job where jobname = %2$L)',
    v_cron_schema,
    'cron-subscription-renewal'
  );

  execute format('select %I.schedule(%L, %L, %L)', v_cron_schema, 'cron-care-emails', '0 0 * * *', v_care_sql);
  execute format('select %I.schedule(%L, %L, %L)', v_cron_schema, 'cron-trend-emails', '15 0 * * *', v_trend_sql);
  execute format('select %I.schedule(%L, %L, %L)', v_cron_schema, 'cron-subscription-renewal', '0 17 * * *', v_renewal_sql);
end;
$$;

revoke all on function public.register_app_cron_schedules(text, text) from public;

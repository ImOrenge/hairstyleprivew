-- Re-runnable helper for registering app cron schedules after Edge Functions
-- are deployed. This avoids a silent no-op when app.* settings were not set
-- during an earlier migration run.

create or replace function public.register_app_cron_schedules(
  p_edge_function_base_url text,
  p_service_role_key text
)
returns void
language plpgsql
set search_path = public
as $$
declare
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

  if not exists (select 1 from pg_namespace where nspname = 'cron') then
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

  execute $sql$select cron.unschedule('cron-care-emails') where exists (select 1 from cron.job where jobname = 'cron-care-emails')$sql$;
  execute $sql$select cron.unschedule('cron-trend-emails') where exists (select 1 from cron.job where jobname = 'cron-trend-emails')$sql$;
  execute $sql$select cron.unschedule('cron-subscription-renewal') where exists (select 1 from cron.job where jobname = 'cron-subscription-renewal')$sql$;

  execute format('select cron.schedule(%L, %L, %L)', 'cron-care-emails', '0 0 * * *', v_care_sql);
  execute format('select cron.schedule(%L, %L, %L)', 'cron-trend-emails', '15 0 * * *', v_trend_sql);
  execute format('select cron.schedule(%L, %L, %L)', 'cron-subscription-renewal', '0 17 * * *', v_renewal_sql);
end;
$$;

revoke all on function public.register_app_cron_schedules(text, text) from public;

do $$
declare
  edge_function_base_url text := nullif(current_setting('app.edge_function_base_url', true), '');
  service_role_key text := nullif(current_setting('app.service_role_key', true), '');
begin
  if edge_function_base_url is not null and service_role_key is not null then
    perform public.register_app_cron_schedules(edge_function_base_url, service_role_key);
  else
    raise notice 'Cron schedules not registered. Run public.register_app_cron_schedules(edge_function_base_url, service_role_key) after deploying functions.';
  end if;
end
$$;

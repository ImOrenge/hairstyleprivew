-- Register hairstyle catalog rotation cron jobs without changing the existing
-- care/trend/subscription renewal schedule helper.

create or replace function public.register_hairstyle_catalog_rotation_cron(
  p_web_app_base_url text,
  p_admin_secret text,
  p_edge_function_base_url text,
  p_service_role_key text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_cron_schema name;
  v_rotation_sql text;
  v_post_rotation_mail_sql text;
begin
  if nullif(p_web_app_base_url, '') is null then
    raise exception 'p_web_app_base_url is required';
  end if;

  if nullif(p_admin_secret, '') is null then
    raise exception 'p_admin_secret is required';
  end if;

  if nullif(p_edge_function_base_url, '') is null then
    raise exception 'p_edge_function_base_url is required';
  end if;

  if nullif(p_service_role_key, '') is null then
    raise exception 'p_service_role_key is required';
  end if;

  select nspname
    into v_cron_schema
    from pg_namespace
   where nspname = 'cron';

  if v_cron_schema is null then
    raise exception 'pg_cron is not available on this project';
  end if;

  v_rotation_sql := format(
    $sql$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-admin-secret', %L
        ),
        body    := jsonb_build_object(
          'mode', 'auto',
          'reason', 'rotation-check',
          'activate', true,
          'onlyIfDue', true,
          'notify', true,
          'notifyDelayMinutes', 10
        )
      ) as request_id;
    $sql$,
    rtrim(p_web_app_base_url, '/') || '/api/admin/hairstyles/rebuild',
    p_admin_secret
  );

  v_post_rotation_mail_sql := format(
    $sql$
      select net.http_post(
        url     := %L,
        headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
        body    := '{}'::jsonb
      ) as request_id;
    $sql$,
    rtrim(p_edge_function_base_url, '/') || '/cron-trend-emails',
    p_service_role_key
  );

  execute format(
    'select %1$I.unschedule(%2$L) where exists (select 1 from %1$I.job where jobname = %2$L)',
    v_cron_schema,
    'cron-hairstyle-catalog-rotation-check'
  );
  execute format(
    'select %1$I.unschedule(%2$L) where exists (select 1 from %1$I.job where jobname = %2$L)',
    v_cron_schema,
    'cron-trend-emails-post-rotation'
  );

  execute format(
    'select %I.schedule(%L, %L, %L)',
    v_cron_schema,
    'cron-hairstyle-catalog-rotation-check',
    '20 0 * * *',
    v_rotation_sql
  );
  execute format(
    'select %I.schedule(%L, %L, %L)',
    v_cron_schema,
    'cron-trend-emails-post-rotation',
    '40 0 * * *',
    v_post_rotation_mail_sql
  );
end;
$$;

revoke all on function public.register_hairstyle_catalog_rotation_cron(text, text, text, text) from public;
grant execute on function public.register_hairstyle_catalog_rotation_cron(text, text, text, text) to service_role;

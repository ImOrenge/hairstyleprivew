-- ============================================================
-- Cron Job 스케줄 등록 (pg_cron + pg_net)
--
-- 적용 전 필요한 작업:
--   supabase secrets set PORTONE_V2_API_SECRET=...
--   supabase secrets set RESEND_API_KEY=...
--   supabase secrets set NEXT_PUBLIC_APP_URL=https://haristyle.app
--
-- Edge Function 배포:
--   supabase functions deploy cron-care-emails
--   supabase functions deploy cron-trend-emails
--   supabase functions deploy cron-subscription-renewal
-- ============================================================

-- pg_net 확장 활성화 (Supabase에서 기본 제공)
create extension if not exists pg_net schema extensions;

-- ============================================================
-- pg_cron이 활성화된 프로젝트에서만 스케줄 등록
-- ============================================================
do $$
declare
  edge_function_base_url text := nullif(current_setting('app.edge_function_base_url', true), '');
  service_role_key text := nullif(current_setting('app.service_role_key', true), '');
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'Skipping cron schedules because pg_cron schema is not available.';
  elsif edge_function_base_url is null or service_role_key is null then
    raise notice 'Skipping cron schedules because app.edge_function_base_url or app.service_role_key is not set.';
  else
    -- 기존 스케줄이 있으면 먼저 제거 (idempotent)
    perform cron.unschedule('cron-care-emails')
      where exists (
        select 1 from cron.job where jobname = 'cron-care-emails'
      );

    perform cron.unschedule('cron-subscription-renewal')
      where exists (
        select 1 from cron.job where jobname = 'cron-subscription-renewal'
      );

    perform cron.unschedule('cron-trend-emails')
      where exists (
        select 1 from cron.job where jobname = 'cron-trend-emails'
      );

    -- 1. cron-care-emails: 매일 09:00 KST = 00:00 UTC
    perform cron.schedule(
      'cron-care-emails',
      '0 0 * * *',
      format(
        $sql$
          select net.http_post(
            url     := %L,
            headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
            body    := '{}'::jsonb
          ) as request_id;
        $sql$,
        edge_function_base_url || '/cron-care-emails',
        service_role_key
      )
    );

    -- 2. cron-trend-emails: 매일 09:15 KST = 00:15 UTC
    perform cron.schedule(
      'cron-trend-emails',
      '15 0 * * *',
      format(
        $sql$
          select net.http_post(
            url     := %L,
            headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
            body    := '{}'::jsonb
          ) as request_id;
        $sql$,
        edge_function_base_url || '/cron-trend-emails',
        service_role_key
      )
    );

    -- 3. cron-subscription-renewal: 매일 02:00 KST = 17:00 UTC (전날)
    perform cron.schedule(
      'cron-subscription-renewal',
      '0 17 * * *',
      format(
        $sql$
          select net.http_post(
            url     := %L,
            headers := '{"Content-Type":"application/json","Authorization":"Bearer %s"}'::jsonb,
            body    := '{}'::jsonb
          ) as request_id;
        $sql$,
        edge_function_base_url || '/cron-subscription-renewal',
        service_role_key
      )
    );
  end if;
end
$$;

-- ============================================================
-- app.* 설정값 주입 (마이그레이션 적용 시 직접 지정)
-- 아래 값을 실제 프로젝트 값으로 교체 후 실행하거나,
-- Supabase Dashboard > SQL Editor에서 SET 후 마이그레이션 실행
--
--   set app.edge_function_base_url = 'https://<ref>.supabase.co/functions/v1';
--   set app.service_role_key = '<service_role_key>';
-- ============================================================

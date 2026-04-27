-- ============================================================
-- Cron Job 스케줄 등록 (pg_cron + Supabase Edge Function)
--
-- pg_cron은 Supabase에서 기본 활성화되어 있습니다.
-- Edge Function을 호출하려면 pg_net 확장이 필요합니다.
-- ============================================================

-- pg_net 확장 활성화 (이미 활성화된 경우 무시)
create extension if not exists pg_net schema extensions;

-- ============================================================
-- 1. cron-care-emails: 매일 09:00 KST = 00:00 UTC
-- ============================================================
select cron.schedule(
  'cron-care-emails',          -- 작업 이름 (unique)
  '0 0 * * *',                 -- cron 표현식: 매일 00:00 UTC
  $$
    select net.http_post(
      url     := (select value from vault.decrypted_secrets where name = 'SUPABASE_EDGE_FUNCTION_BASE_URL') || '/cron-care-emails',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'Authorization',  'Bearer ' || (select value from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ============================================================
-- 2. cron-subscription-renewal: 매일 02:00 KST = 17:00 UTC (전날)
-- ============================================================
select cron.schedule(
  'cron-subscription-renewal', -- 작업 이름 (unique)
  '0 17 * * *',                -- cron 표현식: 매일 17:00 UTC = 02:00 KST
  $$
    select net.http_post(
      url     := (select value from vault.decrypted_secrets where name = 'SUPABASE_EDGE_FUNCTION_BASE_URL') || '/cron-subscription-renewal',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'Authorization',  'Bearer ' || (select value from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ============================================================
-- Vault 시크릿 등록 안내 (SQL 마이그레이션에서 직접 삽입 불가)
-- Supabase Dashboard > Project Settings > Vault 에서 등록:
--
--   SUPABASE_EDGE_FUNCTION_BASE_URL
--     → https://<project-ref>.supabase.co/functions/v1
--
--   SUPABASE_SERVICE_ROLE_KEY
--     → 프로젝트 Settings > API > service_role 키
-- ============================================================

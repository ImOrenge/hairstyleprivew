# Supabase Runtime Smoke Runbook

작성일: 2026-07-03
상태: Supabase linked dry-run 완료, runtime env 필요

## 목적

로컬/정적 검증 이후 실제 Supabase 프로젝트와 배포된 앱에서 남은 런타임 경로를 확인한다. 이 문서는 P1-P7 구현 완료 후 배포 전 또는 staging 환경에서 실행할 smoke 절차다.

## 사전 조건

| 항목 | 필요값 | 비고 |
| --- | --- | --- |
| Supabase link | `supabase link --project-ref dpzdhxlqnogfpubpslbf --workdir my-app` | 2026-07-03 격리 worktree에서 link 완료. `SUPABASE_URL`은 linked project ref에서 자동 유도 가능 |
| 앱 URL | `NEXT_PUBLIC_APP_URL` 또는 배포 URL | admin API 호출 대상 |
| admin secret | `INTERNAL_API_SECRET` | `x-admin-secret` header와 일치 |
| service role key | Supabase service role key | cron helper 등록 시 사용 |
| edge function base URL | Supabase functions base URL | post-rotation mail cron 대상 |
| edge function headers | `Authorization`, `apikey` | post-rotation mail cron이 service role key를 두 header에 모두 넣어 호출한다. |
| edge function auth | `verify_jwt=false` + service-key 내부 검증 | 새 API key 형식과 pg_cron 호출을 모두 견디되, header 없이는 401로 차단한다. |
| remote check timeout | `HAIRSTYLE_CATALOG_REMOTE_CHECK_TIMEOUT_MS=120000` | Supabase CLI 지연 시 guard가 명확히 실패하도록 조정 가능 |
| remote check lock | `my-app/supabase/.temp/hairstyle-catalog-remote-check.lock` | 같은 worktree에서 dry-run guard를 동시에 실행하지 않는다. |
| runtime smoke target confirmation | `--confirmAppUrl=<app-url>` 또는 `HAIRSTYLE_CATALOG_RUNTIME_SMOKE_CONFIRM_APP_URL` | active 변경 가능 호출은 대상 URL 확인 없이는 실행하지 않는다. |
| runtime smoke force | `--forceRuntimeSmoke` | launch readiness에서 prerequisite가 실패해도 원시 runtime smoke 실패를 수집할 때만 사용한다. |
| readiness summary JSON | `--summaryJson=<path>` | launch readiness 최종 판정, 요청한 증거, remote readiness, `blockingMigrationDetails`, missing evidence, external blocker를 JSON 파일로 남긴다. |
| local env files | `my-app/.env.local`, `my-app/.env.assets` | 격리 worktree에는 메인 worktree의 ignored env 파일을 복사해서 사용한다. |
| Cloudflare secret names | `npm run hairstyle:catalog:cloudflare:secrets -- --verify` | Worker에 등록된 secret 이름만 확인한다. 값은 조회하거나 출력하지 않는다. |

## 실행 순서

| 순서 | 검증 | 명령 또는 호출 | 합격 기준 |
| ---: | --- | --- | --- |
| 1 | migration dry-run | `supabase db push --dry-run --workdir my-app` | 새 migration이 충돌 없이 적용 계획을 만든다. |
| 2 | runtime env preflight | `npm run hairstyle:catalog:env:check` | admin API, cron 등록, trend mail function에 필요한 env가 준비되어 있다. |
| 3 | remote write guard | `npm run hairstyle:catalog:remote:check -- --strict` | unrelated pending migration이 없을 때만 통과한다. |
| 4 | migration 적용 | `npm run hairstyle:catalog:remote:check -- --write` | active pointer, lineup, event RPC, cron helper가 생성된다. |
| 5 | trend mail function deploy dry-run | `npm run hairstyle:catalog:trend-mail:deploy` | `verify_jwt=false`, `--no-verify-jwt`, 함수 내부 service-key auth, Deno check, deploy command를 원격 변경 없이 확인한다. |
| 6 | trend mail function deploy | `npm run hairstyle:catalog:trend-mail:deploy -- --write` | `HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_ALLOW_WRITE=1`과 project ref 확인 env가 있을 때만 `cron-trend-emails`를 배포한다. |
| 7 | launch readiness summary | `npm run hairstyle:catalog:launch:check -- --allowMissingExternal --summaryJson=my-app/supabase/.temp/hairstyle-launch-summary.json` | 로컬 감사, remote readiness, env, Cloudflare secret, trend mail deploy dry-run을 한 번에 실행하고 남은 외부 blocker를 확인한다. Runtime smoke는 `--runReadOnlyRuntimeSmoke`, admin dry-run POST는 `--runAdminDryRunSmoke`로 분리하고, prerequisite 실패 시 실행을 skip한다. 특정 cycle 검증은 `--cycleId=<id> --market=kr --expectAlert`를 함께 넘긴다. |
| 8 | cron 등록 | `select public.register_hairstyle_catalog_rotation_cron('<web-url>', '<admin-secret>', '<edge-base-url>', '<service-role-key>');` | `cron.job`에 rotation check와 post-rotation mail job이 존재한다. |
| 9 | cron DB state | `npm run hairstyle:catalog:runtime:smoke -- --mode=cron-db` | rotation check와 post-rotation mail job의 schedule, active 상태, 호출 대상 fragment를 DB에서 확인한다. |
| 10 | active DB state | `npm run hairstyle:catalog:runtime:smoke -- --mode=active-db` | active RPC, 32개 row, 남/녀 후보 18개 이상, 남/녀 lineup 정확히 9개와 슬롯 구성, alert/delivery 중복 방지를 확인한다. |
| 11 | admin latest | `npm run hairstyle:catalog:runtime:smoke -- --mode=status` | active cycle, expiry, lineup count, next attempt가 반환된다. |
| 12 | not-due skip | `npm run hairstyle:catalog:runtime:smoke -- --mode=rotation-check --write --confirmAppUrl=<app-url>` | TTL이 남아 있으면 `status:"skipped"`, `skipReason:"not_due"`를 반환한다. 만료 상태면 실제 rebuild가 진행된다. |
| 13 | dry-run | `npm run hairstyle:catalog:runtime:smoke -- --mode=dry-run` | validation은 반환하지만 active pointer와 alert가 바뀌지 않는다. |
| 14 | forced rebuild | `npm run hairstyle:catalog:runtime:smoke -- --mode=force-rebuild --write --allowForceRebuild --confirmAppUrl=<app-url>` | 새 cycle이 검증을 통과하면 active pointer가 교체된다. |
| 15 | recommendation smoke | 남성/여성 사용자 추천 생성 | 각 target에서 active cycle 기반 9개 lineup을 반환한다. |
| 16 | alert idempotency | `npm run hairstyle:catalog:runtime:smoke -- --mode=alert-idempotency --expectAlert` | `catalog_rotation` alert가 cycle당 1개만 존재한다. |
| 17 | failure fallback | 강제 실패 조건에서 rebuild 호출 | failed cycle만 기록되고 기존 active cycle은 유지된다. |
| 18 | post-rotation mail | `npm run hairstyle:catalog:runtime:smoke -- --mode=trend-mail-function` | 기본은 due alert가 있으면 실제 메일 발송 방지를 위해 거부한다. 의도한 live smoke는 `--allowPendingAlerts --expectPendingCatalogAlert`를 붙이고, `processedAlerts`/`catalogRotationProcessed`와 delivery 중복 방지를 함께 확인한다. |

## SQL 확인

| 목적 | SQL |
| --- | --- |
| active pointer | `select * from public.hairstyle_catalog_active_cycles where market = 'kr';` |
| lineup count | `select style_target, count(*) from public.hairstyle_catalog_lineups where cycle_id = '<cycle-id>' group by style_target;` |
| cron job | `select jobname, schedule, active from cron.job where jobname in ('cron-hairstyle-catalog-rotation-check', 'cron-trend-emails-post-rotation');` |
| alert idempotency | `select catalog_cycle_id, alert_type, count(*) from public.trend_alerts where alert_type = 'catalog_rotation' group by catalog_cycle_id, alert_type;` |
| overlap warning | `select * from public.hairstyle_catalog_rotation_events where event_type = 'overlap_warning' order by created_at desc limit 5;` |

## Dry-run Evidence

| 항목 | 결과 |
| --- | --- |
| project ref | `dpzdhxlqnogfpubpslbf` (`hair-fit-seoul`) |
| `supabase db push --dry-run --workdir my-app` | 통과 |
| `npm run hairstyle:catalog:env:check` | 스크립트 추가. 실제 runtime env 값 필요 |
| `npm run hairstyle:catalog:runtime:smoke -- --mode=readonly` | 스크립트 추가. 실제 배포 앱 URL과 admin secret 필요 |
| `npm run hairstyle:catalog:runtime:smoke -- --mode=active-db` | 스크립트 보강. 실제 Supabase service role과 migration 적용 필요 |
| `npm run hairstyle:catalog:runtime:smoke -- --mode=cron-db` | 스크립트 보강. 실제 Supabase service role과 cron status RPC 적용 필요 |
| `npm run hairstyle:catalog:runtime:smoke -- --mode=trend-mail-function` | 스크립트 보강. `catalog_rotation` due alert 처리 증거와 delivery 중복을 확인한다. 실제 Supabase service role과 함수 URL 필요 |
| `npm run hairstyle:catalog:trend-mail:deploy` | dry-run 통과. `cron-trend-emails` Deno check와 배포 guard 확인 |
| `npm run hairstyle:catalog:remote:check` | 통과. `readyForWrite:false` |
| `npm run hairstyle:catalog:remote:check` blocker detail | `blockingMigrationDetails`가 `202607030001_plan_credit_policy_aftercare.sql`의 local operations를 보여준다. 이 migration은 credit/aftercare 정책 쪽 변경이므로 헤어 migration write 전에 별도 적용 판단이 필요하다. |
| `npm run hairstyle:catalog:env:check -- --appUrl=https://hairfit.beauty` | 메인 worktree env 복사 후 Supabase service role/Resend/public URL 통과. `INTERNAL_API_SECRET`는 placeholder라 admin/API smoke blocker |
| `npm run hairstyle:catalog:cloudflare:secrets` | local `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 통과. local `INTERNAL_API_SECRET`는 placeholder라 blocker |
| `npm run hairstyle:catalog:cloudflare:secrets -- --verify --only=INTERNAL_API_SECRET,SUPABASE_SERVICE_ROLE_KEY,NEXT_PUBLIC_SUPABASE_URL` | Cloudflare API token 인증 실패 `9106`. deployed secret name 확인에는 유효한 `CLOUDFLARE_API_TOKEN` 필요 |
| `npm run hairstyle:catalog:runtime:smoke -- --mode=cron-db` | remote RPC 미적용으로 `PGRST202`. pending migration 적용 전 정상 blocker |
| `npm run hairstyle:catalog:runtime:smoke -- --mode=active-db` | remote RPC 미적용으로 `PGRST202`. pending migration 적용 전 정상 blocker |
| `npm run hairstyle:catalog:runtime:smoke -- --mode=trend-mail-function` | remote `trend_alerts.catalog_cycle_id` 미적용으로 `42703`. pending migration 적용 전 정상 blocker |
| `npm run hairstyle:catalog:launch:check -- --allowMissingExternal` | 통과. remote pending migration, 앱 URL/admin secret 누락, Cloudflare deployed secret 미검증, read-only/admin dry-run runtime smoke 미실행을 blocker로 보고 |
| `npm run hairstyle:catalog:launch:check -- --allowMissingExternal --summaryJson=my-app/supabase/.temp/hairstyle-launch-summary.json` | 통과. 사람이 읽는 blocker 로그와 별도로 `ok`, `requestedEvidence`, `checks`, `remoteReadiness.blockingMigrationDetails`, `missingEvidence`, `externalBlockers` JSON을 생성 |
| `npm run hairstyle:catalog:launch:check -- --allowMissingExternal --runReadOnlyRuntimeSmoke --runAdminDryRunSmoke` | known prerequisite 실패 때문에 runtime smoke를 skip하고, `--forceRuntimeSmoke` 사용 시에만 원시 smoke 실패를 수집한다. |
| `npm run hairstyle:catalog:launch:check -- --runReadOnlyRuntimeSmoke --runTrendMailSmoke --cycleId=<cycle-id> --market=kr --expectAlert --allowPendingAlerts --expectPendingCatalogAlert` | migration/env 준비 후 특정 cycle의 alert idempotency와 의도한 live `catalog_rotation` mail smoke를 한 번에 검증한다. due alert가 있으면 실제 메일 전송 가능성이 있으므로 운영 승인 후에만 `--allowPendingAlerts`를 사용한다. |
| remote pending migrations | `202607030001_plan_credit_policy_aftercare.sql`, `20260703092000_hairstyle_catalog_rotation.sql`, `20260703093000_hairstyle_catalog_rotation_cron.sql`, `20260703094000_hairstyle_catalog_rotation_event_rpc.sql`, `20260703124648_hairstyle_catalog_cron_status.sql` |
| 주의 | 실제 `supabase db push`는 선행 pending migration `202607030001_plan_credit_policy_aftercare.sql`도 함께 적용한다. |
| timeout guard | `HAIRSTYLE_CATALOG_REMOTE_CHECK_TIMEOUT_MS` 기본값은 120000ms이며, CLI 지연 시 timeout 오류로 실패한다. |
| 동시 실행 주의 | `hairstyle:catalog:remote:check`는 local lock으로 같은 worktree의 중복 실행을 차단한다. |

## 판정

| 결과 | 판정 |
| --- | --- |
| 1-17 전체 통과 | 배포 전 runtime smoke 완료 |
| 1-4 실패 | migration blocker |
| 5-13 실패 | Edge Function deploy, cron 등록, active pointer 또는 rebuild API blocker |
| 14-17 실패 | recommendation, trend alert, fallback 또는 mail delivery blocker |

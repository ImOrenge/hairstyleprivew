# Supabase Runtime Smoke Runbook

작성일: 2026-07-03
상태: Supabase linked dry-run 완료, runtime env 필요

## 목적

로컬/정적 검증 이후 실제 Supabase 프로젝트와 배포된 앱에서 남은 런타임 경로를 확인한다. 이 문서는 P1-P7 구현 완료 후 배포 전 또는 staging 환경에서 실행할 smoke 절차다.

## 사전 조건

| 항목 | 필요값 | 비고 |
| --- | --- | --- |
| Supabase link | `supabase link --project-ref dpzdhxlqnogfpubpslbf --workdir my-app` | 2026-07-03 격리 worktree에서 link 완료 |
| 앱 URL | `NEXT_PUBLIC_APP_URL` 또는 배포 URL | admin API 호출 대상 |
| admin secret | `INTERNAL_API_SECRET` | `x-admin-secret` header와 일치 |
| service role key | Supabase service role key | cron helper 등록 시 사용 |
| edge function base URL | Supabase functions base URL | post-rotation mail cron 대상 |
| remote check timeout | `HAIRSTYLE_CATALOG_REMOTE_CHECK_TIMEOUT_MS=120000` | Supabase CLI 지연 시 guard가 명확히 실패하도록 조정 가능 |
| remote check lock | `my-app/supabase/.temp/hairstyle-catalog-remote-check.lock` | 같은 worktree에서 dry-run guard를 동시에 실행하지 않는다. |
| runtime smoke target confirmation | `--confirmAppUrl=<app-url>` 또는 `HAIRSTYLE_CATALOG_RUNTIME_SMOKE_CONFIRM_APP_URL` | active 변경 가능 호출은 대상 URL 확인 없이는 실행하지 않는다. |

## 실행 순서

| 순서 | 검증 | 명령 또는 호출 | 합격 기준 |
| ---: | --- | --- | --- |
| 1 | migration dry-run | `supabase db push --dry-run --workdir my-app` | 새 migration이 충돌 없이 적용 계획을 만든다. |
| 2 | runtime env preflight | `npm run hairstyle:catalog:env:check` | admin API, cron 등록, trend mail function에 필요한 env가 준비되어 있다. |
| 3 | remote write guard | `npm run hairstyle:catalog:remote:check -- --strict` | unrelated pending migration이 없을 때만 통과한다. |
| 4 | migration 적용 | `npm run hairstyle:catalog:remote:check -- --write` | active pointer, lineup, event RPC, cron helper가 생성된다. |
| 5 | cron 등록 | `select public.register_hairstyle_catalog_rotation_cron('<web-url>', '<admin-secret>', '<edge-base-url>', '<service-role-key>');` | `cron.job`에 rotation check와 post-rotation mail job이 존재한다. |
| 6 | admin latest | `npm run hairstyle:catalog:runtime:smoke -- --mode=status` | active cycle, expiry, lineup count, next attempt가 반환된다. |
| 7 | not-due skip | `npm run hairstyle:catalog:runtime:smoke -- --mode=rotation-check --write --confirmAppUrl=<app-url>` | TTL이 남아 있으면 `status:"skipped"`, `skipReason:"not_due"`를 반환한다. 만료 상태면 실제 rebuild가 진행된다. |
| 8 | dry-run | `npm run hairstyle:catalog:runtime:smoke -- --mode=dry-run` | validation은 반환하지만 active pointer와 alert가 바뀌지 않는다. |
| 9 | forced rebuild | `npm run hairstyle:catalog:runtime:smoke -- --mode=force-rebuild --write --allowForceRebuild --confirmAppUrl=<app-url>` | 새 cycle이 검증을 통과하면 active pointer가 교체된다. |
| 10 | recommendation smoke | 남성/여성 사용자 추천 생성 | 각 target에서 active cycle 기반 9개 lineup을 반환한다. |
| 11 | alert idempotency | `npm run hairstyle:catalog:runtime:smoke -- --mode=alert-idempotency --expectAlert` | `catalog_rotation` alert가 cycle당 1개만 존재한다. |
| 12 | failure fallback | 강제 실패 조건에서 rebuild 호출 | failed cycle만 기록되고 기존 active cycle은 유지된다. |
| 13 | post-rotation mail | `cron-trend-emails-post-rotation` 실행 또는 함수 수동 호출 | due alert delivery가 중복 없이 기록된다. |

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
| `npm run hairstyle:catalog:remote:check` | 통과. `readyForWrite:false` |
| remote pending migrations | `202607030001_plan_credit_policy_aftercare.sql`, `20260703092000_hairstyle_catalog_rotation.sql`, `20260703093000_hairstyle_catalog_rotation_cron.sql`, `20260703094000_hairstyle_catalog_rotation_event_rpc.sql` |
| 주의 | 실제 `supabase db push`는 선행 pending migration `202607030001_plan_credit_policy_aftercare.sql`도 함께 적용한다. |
| timeout guard | `HAIRSTYLE_CATALOG_REMOTE_CHECK_TIMEOUT_MS` 기본값은 120000ms이며, CLI 지연 시 timeout 오류로 실패한다. |
| 동시 실행 주의 | `hairstyle:catalog:remote:check`는 local lock으로 같은 worktree의 중복 실행을 차단한다. |

## 판정

| 결과 | 판정 |
| --- | --- |
| 1-13 전체 통과 | 배포 전 runtime smoke 완료 |
| 1-4 실패 | migration/cron 등록 blocker |
| 5-9 실패 | active pointer 또는 rebuild API blocker |
| 10-13 실패 | trend alert 또는 mail delivery blocker |

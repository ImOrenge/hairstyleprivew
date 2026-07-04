# 헤어스타일 카탈로그 순환 구현 태스크

작성일: 2026-07-03
상태: 구현 완료, Supabase runtime smoke 대기

## 목적

`docs/hairstyle-catalog-rotation-architecture.md`의 아키텍처를 구현 가능한 Phase 단위로 쪼개고, 각 Phase의 산출물과 검증 상태를 독립 파일로 관리한다. 2026-07-03 기준 P1-P7 구현과 로컬/정적/임시 Postgres/Supabase linked dry-run 검증은 완료했고, Supabase runtime/API smoke만 남아 있다.

## Phase 목록

| Phase | 파일 | 핵심 산출물 | 선행 조건 |
| --- | --- | --- | --- |
| P1. DB 기반 | [phase-01-db-foundation.md](phase-01-db-foundation.md) | active pointer, lineup, event log, RPC, cycle-scoped row | 기존 hairstyle catalog migration |
| P2. 서비스 리팩터 | [phase-02-service-active-catalog.md](phase-02-service-active-catalog.md) | active catalog 조회와 추천 경로 전환 | P1 |
| P3. 리빌드 API | [phase-03-rebuild-api.md](phase-03-rebuild-api.md) | `onlyIfDue`, validation, dry-run, force API | P1, P2 |
| P4. 트렌드 알림 enqueue | [phase-04-trend-alert-enqueue.md](phase-04-trend-alert-enqueue.md) | active 교체 후 `catalog_rotation` alert 생성 | P1, P3 |
| P5. 자동 rotation cron | [phase-05-auto-rotation-cron.md](phase-05-auto-rotation-cron.md) | 매일 due checker와 post-rotation mail cron | P3, P4 |
| P6. 회전 품질 | [phase-06-rotation-quality.md](phase-06-rotation-quality.md) | 32개 blueprint, slot lineup, overlap warning | P2, P3 |
| P7. 운영 검증 | [phase-07-validation-ops.md](phase-07-validation-ops.md) | audit, smoke, admin status, 배포 전 검증 | P1-P6 |

## 검증 상태 요약

| 구분 | 상태 | 근거 |
| --- | --- | --- |
| 구현 태스크 | 완료 | P1-P7 작업 체크리스트 `[x]` 처리 |
| 로컬 앱 검증 | 완료 | `npm run lint`, `npm run build` 통과 |
| 정적 카탈로그 감사 | 완료 | `npm run hairstyle:catalog:audit` 통과 |
| 라인업 회전 감사 | 완료 | `npm run hairstyle:catalog:lineup:audit` 통과 |
| Runtime env preflight | 완료 | synthetic env로 `npm run hairstyle:catalog:env:check` 통과 |
| Runtime API smoke runner | 완료 | `npm run hairstyle:catalog:runtime:smoke -- --help` 통과. 실제 배포 URL과 admin secret 필요 |
| Deno 함수 문법 | 완료 | `deno check --no-lock my-app/supabase/functions/cron-trend-emails/index.ts` 통과 |
| Trend mail function deploy guard | 완료 | `npm run hairstyle:catalog:trend-mail:deploy` dry-run 통과. 실제 배포는 확인 env와 `--write` 필요 |
| DB migration smoke | 완료 | 임시 Postgres에서 P1/P5/P6 event RPC/P7 cron status RPC migration smoke 통과 |
| Supabase linked dry-run | 완료 | `supabase link --project-ref dpzdhxlqnogfpubpslbf --workdir my-app` 후 `supabase db push --dry-run --workdir my-app` 통과 |
| Remote write guard | 완료 | `npm run hairstyle:catalog:remote:check`가 unrelated pending migration을 감지하고 `blockingMigrationDetails`로 로컬 migration 요약을 보고한다. |
| Supabase runtime/API smoke | 대기 | runtime env와 배포 대상이 필요하며 [runtime-smoke-runbook.md](runtime-smoke-runbook.md)에 절차 정리. active DB smoke는 9개 lineup 초과/미달과 슬롯 구성까지 검사 |
| Launch readiness guard | 완료 | `npm run hairstyle:catalog:launch:check -- --allowMissingExternal`가 로컬 audit, remote readiness, env, Cloudflare secret, trend mail deploy dry-run을 묶고 남은 외부 blocker를 보고한다. runtime smoke는 read-only와 admin dry-run POST 옵션을 분리하고, prerequisite 실패 시 실행을 skip한다. 특정 cycle/market과 live mail smoke 옵션은 하위 smoke로 전달한다. |

## 전체 완료 기준

| 항목 | 완료 기준 |
| --- | --- |
| 자동 회전 | `cron-hairstyle-catalog-rotation-check`가 매일 실행되고, 만료 시 새 active cycle로 교체한다. |
| 실패 fallback | 수집/검증 실패 시 기존 active cycle이 유지된다. |
| 데이터 규모 | 전체 blueprint 32개, 남성/여성 후보 각각 18개 이상이다. |
| 추천 노출 | 사용자 추천 보드는 남성/여성 각각 9개 lineup을 반환한다. |
| 트렌드 알림 | active 교체 성공 시 cycle당 `catalog_rotation` alert가 최대 1개 생성된다. |
| freshness | 기본 60일 수집, 부족 시 120일 fallback, fallback cycle은 기본 알림 제외다. |
| 회귀 검증 | lint/build/audit/smoke가 통과한다. |

## 전체 검증 순서

| 순서 | 검증 | 명령 또는 기준 | 현재 상태 |
| ---: | --- | --- | --- |
| 1 | 정적 타입/문법 | `npm run lint` | 통과 |
| 2 | 앱 빌드 | `npm run build` | 통과 |
| 3 | 카탈로그 감사 | `npm run hairstyle:catalog:audit` | 통과 |
| 4 | 라인업 회전 감사 | `npm run hairstyle:catalog:lineup:audit` | 통과 |
| 5 | runtime env preflight | `npm run hairstyle:catalog:env:check` | synthetic env 통과. 실제 runtime env 필요 |
| 6 | runtime API smoke command | `npm run hairstyle:catalog:runtime:smoke -- --help` | 통과. 실제 runtime smoke는 배포 URL과 admin secret 필요 |
| 7 | migration dry-run | `supabase db push --dry-run --workdir my-app` | 통과. remote pending 목록에 `202607030001_plan_credit_policy_aftercare.sql`와 헤어 카탈로그 4개 migration 포함 |
| 8 | remote write guard | `npm run hairstyle:catalog:remote:check` | 통과. `readyForWrite:false`, `blockingPending:["202607030001_plan_credit_policy_aftercare.sql"]`, `blockingMigrationDetails` 포함 |
| 9 | trend mail function check | `deno check --no-lock my-app/supabase/functions/cron-trend-emails/index.ts` | 통과 |
| 10 | trend mail deploy dry-run | `npm run hairstyle:catalog:trend-mail:deploy` | 통과. 실제 배포는 확인 env와 `--write` 필요 |
| 11 | launch readiness summary | `npm run hairstyle:catalog:launch:check -- --allowMissingExternal` | 통과. 실제 launch는 migration 적용, deployed secret 확인, runtime smoke가 추가로 필요. 특정 cycle 검증은 `--cycleId=<id> --market=kr --expectAlert`를 추가 |
| 12 | cron DB smoke | `npm run hairstyle:catalog:runtime:smoke -- --mode=cron-db` | Supabase runtime env와 cron status RPC 적용 필요 |
| 13 | active DB smoke | `npm run hairstyle:catalog:runtime:smoke -- --mode=active-db` | Supabase runtime env와 migration 적용 필요 |
| 14 | admin latest smoke | `npm run hairstyle:catalog:runtime:smoke -- --mode=status` | Supabase runtime env 필요 |
| 15 | due checker smoke | `npm run hairstyle:catalog:runtime:smoke -- --mode=rotation-check --write --confirmAppUrl=<app-url>` | Supabase runtime env 필요 |
| 16 | forced rebuild smoke | `npm run hairstyle:catalog:runtime:smoke -- --mode=force-rebuild --write --allowForceRebuild --confirmAppUrl=<app-url>` | Supabase runtime env 필요 |
| 17 | failure fallback smoke | 강제 실패 조건에서 active cycle 유지 확인 | Supabase runtime env 필요 |
| 18 | trend alert smoke | `npm run hairstyle:catalog:runtime:smoke -- --mode=alert-idempotency --expectAlert` | Supabase runtime env 필요 |
| 19 | post-rotation mail smoke | `npm run hairstyle:catalog:runtime:smoke -- --mode=trend-mail-function` | Supabase runtime env 필요. 실제 발송은 `--allowPendingAlerts --expectPendingCatalogAlert` 필요 |

## 구현 순서 규칙

| 규칙 | 이유 |
| --- | --- |
| P1 없이 P2를 시작하지 않는다. | active pointer와 cycle-scoped row가 없으면 추천 경로를 안전하게 바꿀 수 없다. |
| P3 없이 P5를 등록하지 않는다. | cron이 호출할 `onlyIfDue` API 계약이 먼저 필요하다. |
| P4 없이 P5 post-rotation mail을 등록하지 않는다. | due alert가 없으면 후속 메일 cron이 의미가 없다. |
| P6은 P2/P3 이후에 붙인다. | active 조회와 validation 응답이 있어야 32개 pool과 lineup을 검증할 수 있다. |
| P7은 마지막에 실행한다. | audit와 smoke는 전체 연결 후에 의미가 있다. |

# P7. 운영 검증

## 목표

카탈로그 자동 회전이 배포 가능한 상태인지 정적 감사, 로컬 빌드, DB smoke, API smoke, 메일 발송 smoke로 확인한다.

## 변경 범위

| 영역 | 작업 |
| --- | --- |
| audit | `hairstyle:catalog:audit` 스크립트 추가 |
| package scripts | root와 `my-app` 실행 경로 연결 |
| admin status | active/stale/next attempt/last failed 상태 노출 확인 |
| smoke | rebuild, fallback, alert, mail delivery 경로 확인 |
| runbook | 운영 절차와 장애 대응 기록 |
| env preflight | runtime smoke 전 필요한 env 준비 상태 확인 |
| runtime smoke runner | admin latest, cron DB state, dry-run, rotation-check, force rebuild, alert idempotency 명령화 |

## 작업 체크리스트

| 상태 | 작업 | 파일/대상 |
| --- | --- | --- |
| [x] | `my-app/scripts/audit-hairstyle-catalog.mjs` 추가 | script |
| [x] | root `package.json`에 `hairstyle:catalog:audit` 추가 | package |
| [x] | `my-app/package.json`에 audit script 추가 | package |
| [x] | audit가 blueprint count, gender pool, lookback, cron names 검사 | script |
| [x] | audit가 `ensureCatalogAvailable` 사용자 rebuild 제거 여부 검사 | script |
| [x] | audit가 trend alert idempotency schema 검사 | script |
| [x] | audit가 자동 `rotation-check`의 lowFreshness alert 차단 검사 | script |
| [x] | audit가 activation RPC의 남/녀 lineup guard 검사 | script |
| [x] | audit가 추천 경로의 active lineup snapshot 사용 여부 검사 | script |
| [x] | audit가 `auto` rebuild의 seeded fallback 자동 활성화 금지 여부 검사 | script |
| [x] | `/api/admin/hairstyles/cycles/latest` smoke 절차 작성 | P5/P7 운영 메모 |
| [x] | forced rebuild smoke 절차 작성 | Phase 검증 체크리스트 |
| [x] | failure fallback smoke 절차 작성 | Phase 검증 체크리스트 |
| [x] | trend alert smoke 절차 작성 | Phase 검증 체크리스트 |
| [x] | cron function deployment 주의사항 작성 | P5 운영 메모 |
| [x] | runtime env preflight 스크립트 추가 | `my-app/scripts/check-hairstyle-catalog-runtime-env.mjs` |
| [x] | runtime API smoke runner 스크립트 추가 | `my-app/scripts/smoke-hairstyle-catalog-runtime.mjs` |
| [x] | cron DB smoke 명령이 rotation/post-rotation mail cron 등록 상태를 검사 | `my-app/scripts/smoke-hairstyle-catalog-runtime.mjs` |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| lint | `npm run lint` 통과 |
| build | `npm run build` 통과 |
| audit | `npm run hairstyle:catalog:audit` 통과. blueprint, lookback, active-only 추천, alert idempotency, lineup, overlap warning, cron names 포함 |
| migration | `supabase db push --dry-run --workdir my-app` 통과 |
| remote guard | `npm run hairstyle:catalog:remote:check`가 unrelated pending migration을 감지 |
| env preflight | `npm run hairstyle:catalog:env:check`가 admin API, cron helper, trend mail function env를 점검 |
| runtime smoke runner | `npm run hairstyle:catalog:runtime:smoke`가 read-only와 guarded write smoke를 제공 |
| cron DB smoke | `npm run hairstyle:catalog:runtime:smoke -- --mode=cron-db`가 rotation/post-rotation mail cron 등록 상태를 점검 |
| trend mail | `deno check --no-lock my-app/supabase/functions/cron-trend-emails/index.ts` 통과 |
| trend mail deploy | `npm run hairstyle:catalog:trend-mail:deploy` dry-run 통과 |
| trend mail evidence | live mail smoke에서 `catalog_rotation` alert 처리 요약과 delivery 중복 방지를 확인 |
| trend mail auth | `cron-trend-emails`가 service-key header 없이는 실행되지 않음 |
| admin latest | active 상태, stale 상태, next attempt, last failed 정보 확인 |
| smoke | due checker, forced rebuild, fallback, alert, mail 중복 방지 확인 |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [x] | `npm run lint` |
| [x] | `npm run build` |
| [x] | `npm run hairstyle:catalog:audit` |
| [x] | `npm run hairstyle:catalog:lineup:audit` |
| [x] | synthetic env로 `npm run hairstyle:catalog:env:check` 통과 |
| [x] | `npm run hairstyle:catalog:runtime:smoke -- --help` |
| [x] | active DB smoke 명령이 active RPC, 32개 row, 후보 pool, 정확히 9개 lineup과 슬롯 구성, alert/delivery 중복을 검사 |
| [x] | cron DB smoke 명령이 rotation/post-rotation mail cron 등록 상태를 검사 |
| [x] | 임시 Postgres에서 cron status RPC unavailable/healthy 응답 smoke 통과 |
| [x] | trend mail function smoke 명령이 due alert 기본 거부와 delivery 중복 검사를 제공 |
| [x] | trend mail function smoke 명령이 `catalog_rotation` 처리 증거를 검증 |
| [x] | trend mail function의 `verify_jwt=false` + service-key 내부 검증 guard를 정적 audit에 포함 |
| [x] | trend mail function deploy guard dry-run |
| [x] | `supabase db push --dry-run --workdir my-app` 통과. remote pending 목록에 `202607030001_plan_credit_policy_aftercare.sql`와 헤어 카탈로그 4개 migration 포함 |
| [x] | `npm run hairstyle:catalog:remote:check` 통과. `readyForWrite:false`, blocker `202607030001_plan_credit_policy_aftercare.sql` 확인 |
| [x] | `deno check --no-lock my-app/supabase/functions/cron-trend-emails/index.ts` |
| [ ] | admin latest smoke. Supabase runtime env 필요 |
| [ ] | `onlyIfDue:true` not-due smoke. Supabase runtime env 필요 |
| [ ] | `force:true` rebuild smoke. Supabase runtime env 필요 |
| [ ] | failure fallback smoke. Supabase runtime env 필요 |
| [ ] | trend alert idempotency smoke. Supabase runtime env 필요 |
| [ ] | post-rotation mail smoke. Supabase runtime env 필요 |

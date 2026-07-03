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

## 작업 체크리스트

| 상태 | 작업 | 파일/대상 |
| --- | --- | --- |
| [ ] | `my-app/scripts/audit-hairstyle-catalog.mjs` 추가 | script |
| [ ] | root `package.json`에 `hairstyle:catalog:audit` 추가 | package |
| [ ] | `my-app/package.json`에 audit script 추가 | package |
| [ ] | audit가 blueprint count, gender pool, lookback, cron names 검사 | script |
| [ ] | audit가 `ensureCatalogAvailable` 사용자 rebuild 제거 여부 검사 | script |
| [ ] | audit가 trend alert idempotency schema 검사 | script |
| [ ] | `/api/admin/hairstyles/cycles/latest` smoke 절차 작성 | docs/runbook |
| [ ] | forced rebuild smoke 절차 작성 | docs/runbook |
| [ ] | failure fallback smoke 절차 작성 | docs/runbook |
| [ ] | trend alert smoke 절차 작성 | docs/runbook |
| [ ] | cron function deployment 주의사항 작성 | docs/runbook |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| lint | `npm run lint` 통과 |
| build | `npm run build` 통과 |
| audit | `npm run hairstyle:catalog:audit` 통과 |
| migration | `supabase db push --dry-run --workdir my-app` 통과 |
| trend mail | `deno check --no-lock my-app/supabase/functions/cron-trend-emails/index.ts` 통과 |
| admin latest | active 상태, stale 상태, next attempt, last failed 정보 확인 |
| smoke | due checker, forced rebuild, fallback, alert, mail 중복 방지 확인 |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [ ] | `npm run lint` |
| [ ] | `npm run build` |
| [ ] | `npm run hairstyle:catalog:audit` |
| [ ] | `supabase db push --dry-run --workdir my-app` |
| [ ] | `deno check --no-lock my-app/supabase/functions/cron-trend-emails/index.ts` |
| [ ] | admin latest smoke |
| [ ] | `onlyIfDue:true` not-due smoke |
| [ ] | `force:true` rebuild smoke |
| [ ] | failure fallback smoke |
| [ ] | trend alert idempotency smoke |
| [ ] | post-rotation mail smoke |

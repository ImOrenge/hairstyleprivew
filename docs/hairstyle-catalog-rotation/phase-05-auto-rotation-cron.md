# P5. 자동 Rotation Cron

## 목표

운영자가 누르지 않아도 매일 due checker가 active 만료를 확인하고, 7일이 지났으면 자동으로 수집/검증/active 교체/알림 enqueue까지 진행한다.

## 변경 범위

| 영역 | 작업 |
| --- | --- |
| pg_cron | `cron-hairstyle-catalog-rotation-check` 매일 09:20 KST 등록 |
| pg_cron | `cron-trend-emails-post-rotation` 매일 09:40 KST 등록 |
| schedule helper | `register_app_cron_schedules` 확장 |
| auth | admin API 호출용 `x-admin-secret` 사용 |
| retry | 실패 후 다음 due checker에서 자동 재시도 |

## 작업 체크리스트

| 상태 | 작업 | 파일/대상 |
| --- | --- | --- |
| [x] | `register_app_cron_schedules`에 web app base URL/admin secret 인자 추가 또는 별도 helper 추가 | `register_hairstyle_catalog_rotation_cron(...)` |
| [x] | `cron-hairstyle-catalog-rotation-check` 등록 | migration |
| [x] | `cron-trend-emails-post-rotation` 등록 | migration |
| [x] | 기존 `cron-trend-emails` daily job 유지 | 별도 helper로 분리 |
| [x] | `rotation-check` body에 `onlyIfDue:true`, `notify:true` 포함 | migration |
| [x] | `pg_net` 호출 header에 `x-admin-secret` 포함 | migration |
| [x] | post-rotation Edge Function 호출 header에 `Authorization`과 `apikey` 포함 | migration |
| [x] | `cron-trend-emails`를 `verify_jwt=false`와 함수 내부 service-key 검증으로 구성 | `supabase/config.toml`, Edge Function |
| [x] | running cycle 30분 초과 복구 경로 연결 | P3 service |
| [x] | rotation attempt event 기록 | service/RPC |
| [x] | cron 등록 문서와 운영 명령 추가 | 아래 운영 메모 |
| [x] | Supabase Edge Function 배포 단위와 main app deploy 분리 주의사항 반영 | 아래 운영 메모 |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| daily checker | 매일 09:20 KST에 due 여부 확인 |
| no-op | TTL이 남으면 수집 없이 skip |
| due | TTL 만료 시 자동 active 교체 시도 |
| retry | 실패 후 다음 날 자동 재시도 |
| post mail | active 교체로 생성된 due alert를 09:40 KST에 발송 시도 |
| mail priority | due alert backlog가 있어도 `catalog_rotation` alert를 post-rotation batch에서 우선 처리 |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [x] | 임시 Postgres에 cron helper migration 적용 smoke 통과 |
| [ ] | `cron.job`에 `cron-hairstyle-catalog-rotation-check` 존재. Supabase pg_cron runtime 필요 |
| [ ] | `cron.job`에 `cron-trend-emails-post-rotation` 존재. Supabase pg_cron runtime 필요 |
| [ ] | not-due 상태에서 cron body 호출이 `skipped:not_due` 반환. Supabase runtime env 필요 |
| [ ] | expired 상태에서 cron body 호출이 rebuild 경로 진입. Supabase runtime env 필요 |
| [ ] | 실패 기록 후 다음 `onlyIfDue` 호출이 재시도 경로 진입. Supabase runtime env 필요 |
| [x] | `deno check --no-lock my-app/supabase/functions/cron-trend-emails/index.ts` 통과 |
| [x] | post-rotation mail 함수가 `catalog_rotation` due alert를 batch 우선 처리하고 처리 요약을 반환. 정적 audit 확인 |
| [x] | post-rotation mail 함수가 service role header 없이 401을 반환하도록 정적 audit 확인 |

## 운영 메모

| 항목 | 내용 |
| --- | --- |
| 등록 함수 | `select public.register_hairstyle_catalog_rotation_cron('<web-app-url>', '<internal-admin-secret>', '<edge-function-base-url>', '<service-role-key>');` |
| rotation check | `cron-hairstyle-catalog-rotation-check`, `20 0 * * *`, 한국시간 09:20 |
| post rotation mail | `cron-trend-emails-post-rotation`, `40 0 * * *`, 한국시간 09:40 |
| Edge Function 배포 | `cron-trend-emails`는 Supabase Edge Function 배포 단위다. main app 배포만으로 함수 코드가 갱신되지 않는다. |
| Edge Function auth | `verify_jwt=false`로 배포하고, 함수 내부에서 `Authorization` 또는 `apikey`의 service role key를 검증한다. |

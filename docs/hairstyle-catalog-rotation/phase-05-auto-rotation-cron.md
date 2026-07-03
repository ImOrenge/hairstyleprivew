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
| [ ] | `register_app_cron_schedules`에 web app base URL/admin secret 인자 추가 또는 별도 helper 추가 | migration |
| [ ] | `cron-hairstyle-catalog-rotation-check` 등록 | migration |
| [ ] | `cron-trend-emails-post-rotation` 등록 | migration |
| [ ] | 기존 `cron-trend-emails` daily job 유지 | migration |
| [ ] | `rotation-check` body에 `onlyIfDue:true`, `notify:true` 포함 | migration |
| [ ] | `pg_net` 호출 header에 `x-admin-secret` 포함 | migration |
| [ ] | running cycle 30분 초과 복구 경로 연결 | P3 service |
| [ ] | rotation attempt event 기록 | service/RPC |
| [ ] | cron 등록 문서와 운영 명령 추가 | docs/runbook 또는 architecture |
| [ ] | Supabase Edge Function 배포 단위와 main app deploy 분리 주의사항 반영 | docs |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| daily checker | 매일 09:20 KST에 due 여부 확인 |
| no-op | TTL이 남으면 수집 없이 skip |
| due | TTL 만료 시 자동 active 교체 시도 |
| retry | 실패 후 다음 날 자동 재시도 |
| post mail | active 교체로 생성된 due alert를 09:40 KST에 발송 시도 |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [ ] | `cron.job`에 `cron-hairstyle-catalog-rotation-check` 존재 |
| [ ] | `cron.job`에 `cron-trend-emails-post-rotation` 존재 |
| [ ] | not-due 상태에서 cron body 호출이 `skipped:not_due` 반환 |
| [ ] | expired 상태에서 cron body 호출이 rebuild 경로 진입 |
| [ ] | 실패 기록 후 다음 `onlyIfDue` 호출이 재시도 경로 진입 |
| [ ] | `deno check --no-lock my-app/supabase/functions/cron-trend-emails/index.ts` 통과 |

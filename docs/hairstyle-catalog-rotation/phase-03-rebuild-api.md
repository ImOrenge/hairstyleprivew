# P3. 리빌드 API

## 목표

관리자 리빌드 API를 자동 rotation checker가 호출할 수 있는 계약으로 확장한다. 만료 전 자동 호출은 skip하고, 만료 또는 force 호출만 수집/검증/활성화를 수행한다.

## 변경 범위

| 영역 | 작업 |
| --- | --- |
| request | `force`, `onlyIfDue`, `activate`, `dryRun`, `reason`, `notify` 지원 |
| due 판단 | `expires_at` 기준 skip 또는 진행 |
| validation | 문서 수, 32개 pool, 남/녀 후보, lineup 검증 |
| response | active, validation, alert, skip reason, next attempt 포함 |

## 작업 체크리스트

| 상태 | 작업 | 파일/대상 |
| --- | --- | --- |
| [x] | request schema 확장 | `my-app/app/api/admin/hairstyles/rebuild/route.ts` |
| [x] | `onlyIfDue` skip 로직 추가 | route/service |
| [x] | `force`가 TTL을 우회하도록 구현 | route/service |
| [x] | `dryRun`이 DB activation과 alert enqueue를 생략하도록 구현 | route/service |
| [x] | market 단위 advisory lock 적용 | activation RPC와 running cycle guard |
| [x] | stale running 30분 초과 복구 호출 | service |
| [x] | 60일 primary, 120일 fallback 수집 호출 계약 연결 | service |
| [x] | `auto` 수집 실패 시 seeded catalog로 자동 active 교체하지 않도록 보장 | service/audit |
| [x] | validation 결과 구조화 | service |
| [x] | response에 `skipReason`, `trendAlertId`, `expiresAt`, `nextAutomaticAttemptAt` 포함 | route |
| [x] | 실패 시 `fail_hairstyle_catalog_cycle`와 rotation event 기록 | service/RPC |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| not due | `onlyIfDue=true`이고 TTL 남음이면 수집 없이 `skipped:not_due` |
| due | TTL 만료 시 researched 수집과 active 교체 시도 |
| dry-run | 수집/검증 결과는 반환하지만 active pointer와 alert는 변경하지 않음 |
| force | TTL이 남아도 수집/검증/활성화 가능 |
| failure | 실패해도 기존 active pointer 유지 |
| no seeded auto fallback | seeded catalog는 명시적 `mode:"seeded"` 호출에서만 active 후보가 된다. |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [ ] | `POST /api/admin/hairstyles/rebuild {"mode":"auto","onlyIfDue":true}` not due smoke. Supabase runtime env 필요 |
| [ ] | `POST /api/admin/hairstyles/rebuild {"mode":"auto","force":true}` forced rebuild smoke. Supabase runtime env 필요 |
| [ ] | `dryRun:true` 실행 후 active pointer 불변 확인. Supabase runtime env 필요 |
| [ ] | 강제 실패 조건에서 기존 active cycle 유지 확인. Supabase runtime env 필요 |
| [x] | 정적 audit로 `auto` rebuild가 seeded fallback을 자동 실행하지 않는지 확인 |
| [x] | response에 validation과 freshness warning 포함 확인 |
| [x] | `npm run lint` 통과 |
| [x] | `npm run build` 통과 |

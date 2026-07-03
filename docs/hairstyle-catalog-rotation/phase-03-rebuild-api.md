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
| [ ] | request schema 확장 | `my-app/app/api/admin/hairstyles/rebuild/route.ts` |
| [ ] | `onlyIfDue` skip 로직 추가 | route/service |
| [ ] | `force`가 TTL을 우회하도록 구현 | route/service |
| [ ] | `dryRun`이 DB activation과 alert enqueue를 생략하도록 구현 | route/service |
| [ ] | market 단위 advisory lock 적용 | `my-app/lib/hairstyle-catalog.ts` |
| [ ] | stale running 30분 초과 복구 호출 | service |
| [ ] | 60일 primary, 120일 fallback 수집 호출 계약 연결 | service |
| [ ] | validation 결과 구조화 | service |
| [ ] | response에 `skipReason`, `trendAlertId`, `expiresAt`, `nextAutomaticAttemptAt` 포함 | route |
| [ ] | 실패 시 `fail_hairstyle_catalog_cycle`와 rotation event 기록 | service/RPC |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| not due | `onlyIfDue=true`이고 TTL 남음이면 수집 없이 `skipped:not_due` |
| due | TTL 만료 시 researched 수집과 active 교체 시도 |
| dry-run | 수집/검증 결과는 반환하지만 active pointer와 alert는 변경하지 않음 |
| force | TTL이 남아도 수집/검증/활성화 가능 |
| failure | 실패해도 기존 active pointer 유지 |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [ ] | `POST /api/admin/hairstyles/rebuild {"mode":"auto","onlyIfDue":true}` not due smoke |
| [ ] | `POST /api/admin/hairstyles/rebuild {"mode":"auto","force":true}` forced rebuild smoke |
| [ ] | `dryRun:true` 실행 후 active pointer 불변 확인 |
| [ ] | 강제 실패 조건에서 기존 active cycle 유지 확인 |
| [ ] | response에 validation과 freshness warning 포함 확인 |

# P1. DB 기반

## 목표

헤어 카탈로그 cycle을 서비스 active 상태와 분리하고, cycle별 snapshot을 보존할 수 있는 DB 기반을 만든다.

## 변경 범위

| 영역 | 작업 |
| --- | --- |
| migration | active pointer, lineup, event log, trend alert 확장 컬럼 추가 |
| constraints | `hairstyle_catalog.slug` global unique 제거, `(source_cycle_id, slug)` unique 추가 |
| RPC | activation, failure, active 조회, stale running 복구, rotation attempt 기록 |
| bootstrap | 기존 latest succeeded cycle을 initial active로 등록 |

## 작업 체크리스트

| 상태 | 작업 | 파일/대상 |
| --- | --- | --- |
| [x] | `hairstyle_catalog_active_cycles` 테이블 추가 | `my-app/supabase/migrations/20260703092000_hairstyle_catalog_rotation.sql` |
| [x] | `hairstyle_catalog_lineups` 테이블 추가 | migration |
| [x] | `hairstyle_catalog_rotation_events` 테이블 추가 | migration |
| [x] | `trend_alerts.catalog_cycle_id`, `alert_type`, `source_summary` 추가 | migration |
| [x] | `trend_alerts` cycle별 중복 방지 partial unique 추가 | migration |
| [x] | `hairstyle_catalog.slug` global unique를 cycle-scoped unique로 전환 | migration |
| [x] | `activate_hairstyle_catalog_cycle(...)` RPC 추가 | migration |
| [x] | activation RPC에서 남/녀 lineup 각각 9개 이상 최종 검증 | migration |
| [x] | `fail_hairstyle_catalog_cycle(...)` RPC 추가 | migration |
| [x] | `get_active_hairstyle_catalog(...)` RPC 추가 | migration |
| [x] | `mark_stale_running_hairstyle_cycles_failed(...)` RPC 추가 | migration |
| [x] | `record_hairstyle_catalog_rotation_attempt(...)` RPC 추가 | migration |
| [x] | 기존 latest succeeded cycle을 initial active로 backfill | migration |
| [x] | service role 권한과 authenticated read 정책 점검 | migration |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| active pointer | market `kr`에 active cycle을 1개만 가리킬 수 있다. |
| row snapshot | 같은 slug가 다른 cycle에 공존할 수 있다. |
| activation | validation 이후 한 transaction으로 active pointer가 교체된다. |
| lineup guard | 남/녀 lineup이 각각 9개 미만인 cycle은 active가 될 수 없다. |
| fallback | failed cycle이 active pointer를 바꾸지 않는다. |
| trend alert 중복 | 같은 `catalog_cycle_id`의 `catalog_rotation` alert가 2개 생기지 않는다. |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [x] | `supabase db push --dry-run --workdir my-app` 통과. remote pending 목록에 `202607030001_plan_credit_policy_aftercare.sql`와 헤어 카탈로그 4개 migration 포함 |
| [x] | 임시 Postgres에 migration 적용 smoke 통과 |
| [x] | `select public.get_active_hairstyle_catalog('kr')` RPC smoke 통과 |
| [x] | latest succeeded cycle initial active 등록 SQL 확인 |
| [x] | 같은 slug를 다른 cycle에 insert할 수 있는지 확인 |
| [x] | 같은 cycle 안 slug 중복 insert가 실패하는지 확인 |
| [x] | `enqueue_catalog_rotation_trend_alert(...)` idempotency smoke 통과 |

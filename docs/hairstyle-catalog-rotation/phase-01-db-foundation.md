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
| [ ] | `hairstyle_catalog_active_cycles` 테이블 추가 | `my-app/supabase/migrations/*_hairstyle_catalog_rotation.sql` |
| [ ] | `hairstyle_catalog_lineups` 테이블 추가 | migration |
| [ ] | `hairstyle_catalog_rotation_events` 테이블 추가 | migration |
| [ ] | `trend_alerts.catalog_cycle_id`, `alert_type`, `source_summary` 추가 | migration |
| [ ] | `trend_alerts` cycle별 중복 방지 partial unique 추가 | migration |
| [ ] | `hairstyle_catalog.slug` global unique를 cycle-scoped unique로 전환 | migration |
| [ ] | `activate_hairstyle_catalog_cycle(...)` RPC 추가 | migration |
| [ ] | `fail_hairstyle_catalog_cycle(...)` RPC 추가 | migration |
| [ ] | `get_active_hairstyle_catalog(...)` RPC 추가 | migration |
| [ ] | `mark_stale_running_hairstyle_cycles_failed(...)` RPC 추가 | migration |
| [ ] | `record_hairstyle_catalog_rotation_attempt(...)` RPC 추가 | migration |
| [ ] | 기존 latest succeeded cycle을 initial active로 backfill | migration |
| [ ] | service role 권한과 authenticated read 정책 점검 | migration |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| active pointer | market `kr`에 active cycle을 1개만 가리킬 수 있다. |
| row snapshot | 같은 slug가 다른 cycle에 공존할 수 있다. |
| activation | validation 이후 한 transaction으로 active pointer가 교체된다. |
| fallback | failed cycle이 active pointer를 바꾸지 않는다. |
| trend alert 중복 | 같은 `catalog_cycle_id`의 `catalog_rotation` alert가 2개 생기지 않는다. |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [ ] | `supabase db push --dry-run --workdir my-app` 통과 |
| [ ] | `select public.get_active_hairstyle_catalog('kr')` RPC smoke 통과 |
| [ ] | latest succeeded cycle initial active 등록 확인 |
| [ ] | 같은 slug를 다른 cycle에 insert할 수 있는지 확인 |
| [ ] | 같은 cycle 안 slug 중복 insert가 실패하는지 확인 |

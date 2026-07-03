# P4. 트렌드 알림 Enqueue

## 목표

새 카탈로그 cycle이 active로 교체된 직후, 유료 사용자 대상 트렌드 알림 캠페인을 중복 없이 생성한다.

## 변경 범위

| 영역 | 작업 |
| --- | --- |
| DB/RPC | `enqueue_catalog_rotation_trend_alert(...)` 구현 |
| API | rebuild response에 alert 생성 결과 포함 |
| content | active cycle source summary와 top style signals 기반 제목/본문 생성 |
| idempotency | cycle당 `catalog_rotation` alert 1개 제한 |
| policy | lowFreshness/seeded/dryRun/skipped/failed는 기본 알림 제외 |

## 작업 체크리스트

| 상태 | 작업 | 파일/대상 |
| --- | --- | --- |
| [ ] | `enqueue_catalog_rotation_trend_alert(...)` RPC 구현 | migration |
| [ ] | alert title/body template 정의 | `my-app/lib/hairstyle-catalog.ts` 또는 전용 helper |
| [ ] | `target_plans` 기본값 `standard`, `pro`, `salon` 적용 | service/RPC |
| [ ] | `notify`, `notifyPlans`, `notifyDelayMinutes` 옵션 반영 | rebuild route |
| [ ] | `lowFreshness=true`이면 기본 알림 생성 제외 | service |
| [ ] | `seeded` mode는 기본 알림 생성 제외 | service |
| [ ] | active 교체가 실제로 발생한 경우에만 enqueue | service |
| [ ] | 같은 cycle 재호출 시 기존 alert ID 반환 또는 no-op | RPC/service |
| [ ] | alert 생성 실패가 active 교체를 rollback하지 않도록 처리 | service |
| [ ] | rebuild response에 `trendAlertId`, `trendAlertScheduledSendAt` 포함 | route |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| researched primary | active 교체 후 `catalog_rotation` alert 1개 생성 |
| low freshness | active 교체 가능, 기본 alert 없음 |
| seeded | 명시적 `notify:true` 없이는 alert 없음 |
| idempotent | 같은 cycle에 alert 중복 없음 |
| isolation | alert enqueue 실패가 추천용 active 교체를 깨지 않음 |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [ ] | active 교체 후 `trend_alerts.alert_type='catalog_rotation'` 1건 확인 |
| [ ] | 같은 cycle로 rebuild 재호출 시 alert 중복 없음 |
| [ ] | `notify:false`에서 alert 생성 없음 |
| [ ] | `lowFreshness=true` cycle에서 기본 alert 생성 없음 |
| [ ] | alert 생성 실패 simulation 시 active pointer 유지 |

# 헤어스타일 카탈로그 순환 구현 태스크

작성일: 2026-07-03
상태: 구현 태스크 분해, 미구현

## 목적

`docs/hairstyle-catalog-rotation-architecture.md`의 아키텍처를 구현 가능한 Phase 단위로 쪼갠다. 각 Phase는 독립 파일로 관리하고, 완료 여부는 체크리스트와 검증 명령으로 판단한다.

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

| 순서 | 검증 | 명령 또는 기준 |
| ---: | --- | --- |
| 1 | 정적 타입/문법 | `npm run lint` |
| 2 | 앱 빌드 | `npm run build` |
| 3 | 카탈로그 감사 | `npm run hairstyle:catalog:audit` |
| 4 | migration dry-run | `supabase db push --dry-run --workdir my-app` |
| 5 | trend mail function check | `deno check --no-lock my-app/supabase/functions/cron-trend-emails/index.ts` |
| 6 | admin latest smoke | `GET /api/admin/hairstyles/cycles/latest` |
| 7 | due checker smoke | `POST /api/admin/hairstyles/rebuild {"mode":"auto","onlyIfDue":true}` |
| 8 | forced rebuild smoke | `POST /api/admin/hairstyles/rebuild {"mode":"auto","force":true}` |
| 9 | failure fallback smoke | 강제 실패 조건에서 active cycle 유지 확인 |
| 10 | trend alert smoke | active 교체 후 `trend_alerts.alert_type='catalog_rotation'` 1건 확인 |

## 구현 순서 규칙

| 규칙 | 이유 |
| --- | --- |
| P1 없이 P2를 시작하지 않는다. | active pointer와 cycle-scoped row가 없으면 추천 경로를 안전하게 바꿀 수 없다. |
| P3 없이 P5를 등록하지 않는다. | cron이 호출할 `onlyIfDue` API 계약이 먼저 필요하다. |
| P4 없이 P5 post-rotation mail을 등록하지 않는다. | due alert가 없으면 후속 메일 cron이 의미가 없다. |
| P6은 P2/P3 이후에 붙인다. | active 조회와 validation 응답이 있어야 32개 pool과 lineup을 검증할 수 있다. |
| P7은 마지막에 실행한다. | audit와 smoke는 전체 연결 후에 의미가 있다. |

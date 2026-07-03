# P6. 회전 품질

## 목표

저장 blueprint 풀을 32개로 늘리고, 매주 같은 9개가 반복 노출되지 않도록 slot lineup과 rotation seed를 적용한다.

## 변경 범위

| 영역 | 작업 |
| --- | --- |
| seed data | 기존 18개 slug 유지, 신규 blueprint 14개 추가 |
| distribution | 여성 전용 14개, 남성 전용 14개, 공용 4개 목표 |
| scoring | trend/freshness/face/length/rotation bias 반영 |
| lineup | 남성/여성 각각 9개 slot lineup 생성 |
| warnings | 이전 active top 9 overlap warning 기록 |

## 작업 체크리스트

| 상태 | 작업 | 파일/대상 |
| --- | --- | --- |
| [x] | 기존 18개 slug 유지 여부 확인 | `my-app/lib/hairstyle-catalog-seed.ts` |
| [x] | 신규 여성 전용 blueprint 6개 추가 | seed |
| [x] | 신규 남성 전용 blueprint 6개 추가 | seed |
| [x] | 신규 공용 blueprint 2개 추가 | seed |
| [x] | 전체 blueprint 32개 검증 helper 추가 | `my-app/scripts/audit-hairstyle-catalog-blueprints.mjs` |
| [x] | 남성/여성 후보 각각 18개 이상 검증 | audit/script |
| [x] | style target별 short/medium/long 각각 4개 이상 검증 | audit/script |
| [x] | `rotationSeed` 기반 deterministic bias 구현 | `my-app/lib/hairstyle-catalog.ts` |
| [x] | `trend`, `face_fit`, `evergreen`, `experimental` slot builder 구현 | service |
| [x] | 저장된 slot lineup을 추천 노출 순서에 우선 반영 | service |
| [x] | 이전 active top 9 overlap 계산과 warning 이벤트 기록 | service/RPC |
| [x] | `hairstyle_catalog_lineups` insert 구현 | service/RPC |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| pool size | 전체 active row 32개 이상 |
| gender pool | 남성/여성 후보 각각 18개 이상 |
| lineup | 남성/여성 각각 9개 |
| diversity | 각 style target에서 short/medium/long 분산 유지 |
| rotation | 같은 cycle과 같은 사용자 조건에서는 재현 가능, cycle이 바뀌면 tie-breaker 변경 |
| overlap | 이전 top 9와 7개 이상 겹치면 warning 이벤트 |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [x] | blueprint count 32 확인 |
| [x] | 여성 후보 18개 이상 확인 |
| [x] | 남성 후보 18개 이상 확인 |
| [x] | 남성/여성 lineup 각각 9개 생성 경로 typecheck 확인 |
| [x] | 정적 audit로 추천 경로가 active lineup snapshot을 사용하는지 확인 |
| [ ] | 같은 seed에서 lineup 순서 재현 확인. Supabase runtime env 필요 |
| [ ] | 다른 seed에서 near-tie lineup 순서 변화 확인. Supabase runtime env 필요 |
| [x] | overlap warning 이벤트 기록 경로 정적 감사 확인 |
| [x] | 임시 Postgres에서 `record_hairstyle_catalog_rotation_event(...)` overlap warning insert smoke 통과 |
| [x] | `node my-app/scripts/audit-hairstyle-catalog-blueprints.mjs` 통과 |
| [x] | `npm run lint` 통과 |
| [x] | `npm run build` 통과 |

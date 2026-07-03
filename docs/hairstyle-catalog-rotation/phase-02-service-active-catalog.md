# P2. 서비스 리팩터

## 목표

추천 생성 경로가 latest succeeded cycle이 아니라 active pointer를 기준으로 카탈로그를 읽게 한다. 사용자 요청 중 live research를 수행하지 않는다.

## 변경 범위

| 영역 | 작업 |
| --- | --- |
| 타입 | active pointer, lineup, extended source summary 타입 추가 |
| 조회 | `getActiveCatalogCycle`, `loadActiveCatalogRows`, `loadActiveLineups` 추가 |
| 추천 | `generateCatalogBackedRecommendationSet`이 active cycle만 사용 |
| fallback | active 없음/row 부족/stale 상태를 명시적으로 반환 또는 오류 처리 |

## 작업 체크리스트

| 상태 | 작업 | 파일/대상 |
| --- | --- | --- |
| [x] | `HairstyleCatalogActiveCycle` 타입 추가 | `my-app/lib/recommendation-types.ts` |
| [x] | `HairstyleCatalogLineupRow` 타입 추가 | `my-app/lib/recommendation-types.ts` |
| [x] | `HairstyleCatalogSourceSummary`에 lookback/freshness 필드 추가 | `my-app/lib/recommendation-types.ts` |
| [x] | `getActiveCatalogCycle()` 구현 | `my-app/lib/hairstyle-catalog.ts` |
| [x] | `loadActiveCatalogRows()` 구현 | `my-app/lib/hairstyle-catalog.ts` |
| [x] | `loadActiveLineups()` 구현 | `my-app/lib/hairstyle-catalog.ts` |
| [x] | `ensureCatalogAvailable()`의 사용자 요청 중 rebuild 제거 | `my-app/lib/hairstyle-catalog.ts` |
| [x] | active 없음, row 부족, stale 상태의 오류 메시지 정리 | `my-app/lib/hairstyle-catalog.ts` |
| [x] | 추천 후보가 active cycle ID를 그대로 기록하는지 확인 | `my-app/lib/hairstyle-catalog.ts` |

## 완료 기준

| 기준 | 기대값 |
| --- | --- |
| active 기준 | 추천 생성은 active pointer의 cycle만 사용한다. |
| no live research | 일반 추천 요청에서 Google News RSS 수집이 실행되지 않는다. |
| stale 분리 | stale 상태는 운영 API/cron 대상이지 사용자 요청의 rebuild trigger가 아니다. |
| generation 기록 | generation options에 active `catalogCycleId`가 저장된다. |

## 검증 체크리스트

| 상태 | 검증 |
| --- | --- |
| [x] | `npm run lint` 통과 |
| [x] | `npm run build` 통과 |
| [ ] | active cycle이 있을 때 남성/여성 추천 각각 9개 반환. Supabase runtime env 필요 |
| [ ] | active pointer가 없을 때 명확한 서버 오류 반환. Supabase runtime env 필요 |
| [ ] | active row가 부족할 때 rebuild 없이 운영 오류 반환. Supabase runtime env 필요 |
| [x] | 정적 검색으로 사용자 추천 경로에서 `rebuildWeeklyHairstyleCatalog()` 미호출 확인 |

# HairFit 헤어스타일 카탈로그 순환 아키텍처

작성일: 2026-07-03
상태: 구현 완료, Supabase runtime smoke 대기

## 1. 목적

헤어 추천에 쓰이는 카탈로그가 한 번 생성된 뒤 계속 고정되는 문제를 해결한다. 목표는 7일마다 한국 헤어스타일 트렌드 데이터를 수집하고, 검증을 통과한 새 카탈로그만 실제 추천에 반영하는 것이다.

이 문서는 구현된 카탈로그 순환 구조의 목표 아키텍처와 운영 기준이다. 2026-07-03 기준 P1-P7 구현과 로컬/정적/임시 Postgres/Supabase linked dry-run 검증은 완료했고, Supabase runtime/API smoke 검증만 남아 있다.

구현 태스크는 [hairstyle-catalog-rotation/README.md](hairstyle-catalog-rotation/README.md)에서 Phase별 체크리스트로 관리한다.

## 2. 구현 전 상태 요약

| 영역 | 기존 구현 | 문제 |
| --- | --- | --- |
| 수집 함수 | `collectKoreanHairstyleTrendResearch()`가 Google News RSS를 수집 | 함수는 있으나 주기 실행자가 없음 |
| 리빌드 함수 | `rebuildWeeklyHairstyleCatalog()` | 이름은 weekly지만 7일 TTL 판단 없음 |
| 추천 진입점 | `ensureCatalogAvailable()` | 최신 성공 cycle이 있으면 날짜와 무관하게 계속 재사용 |
| 수동 리빌드 | `POST /api/admin/hairstyles/rebuild` | 관리자 수동 호출에 의존 |
| Supabase cron | `cron-trend-emails` 매일 09:15 KST | 트렌드 알림 메일 발송용이며 카탈로그 수집이 아님 |
| row 저장 방식 | `hairstyle_catalog.slug` global unique + upsert | 새 cycle row가 이전 cycle snapshot을 덮어쓸 수 있음 |
| active 기준 | latest successful cycle | 실패한 새 빌드와 실제 서비스 cycle을 분리하기 어려움 |

## 3. 목표 원칙

| 원칙 | 기준 |
| --- | --- |
| 사용자 요청 비차단 | 일반 추천 생성 요청에서 live research를 수행하지 않는다. |
| 성공본만 교체 | 새 수집이 실패하면 기존 active 카탈로그를 계속 사용한다. |
| cycle snapshot 보존 | cycle별 카탈로그 row를 보존해 rollback과 비교가 가능해야 한다. |
| 7일 회전 | active cycle은 `activated_at + 7 days`를 기본 만료로 둔다. |
| 자동 회전 | 사용자가 요청하거나 관리자가 누르지 않아도 cron due checker가 만료를 감지하고 교체까지 진행한다. |
| 자동 재시도 | 자동 수집/검증 실패 후에도 기존 active를 유지하고 다음 due checker에서 재시도한다. |
| 수동 override | 관리자는 `force` 리빌드와 seeded fallback을 명시적으로 실행할 수 있다. |
| 회전 품질 | 같은 데이터가 반복 상위 노출되지 않도록 주간 seed와 slot 정책을 둔다. |
| 운영 가시성 | active 나이, 다음 회전 시각, 마지막 실패 사유를 API로 확인할 수 있어야 한다. |

## 4. 목표 컴포넌트

| 컴포넌트 | 위치 | 역할 |
| --- | --- | --- |
| 카탈로그 수집기 | `my-app/lib/hairstyle-trend-research.ts` | Google News RSS 수집, 문서 필터링, trend signal 계산 |
| 카탈로그 빌더 | `my-app/lib/hairstyle-catalog.ts` | cycle 생성, row snapshot 생성, 검증, 활성화 호출 |
| active pointer | DB `hairstyle_catalog_active_cycles` | 현재 서비스에 쓰는 cycle을 명시적으로 저장 |
| lineup snapshot | DB `hairstyle_catalog_lineups` | 주간 회전 seed와 slot별 대표 row를 저장 |
| 자동 rotation checker | Supabase `pg_cron` + `pg_net` | 매일 active 만료 여부를 확인하고 due일 때 `/api/admin/hairstyles/rebuild` 호출 |
| 관리자 API | `my-app/app/api/admin/hairstyles/*` | 수동 리빌드, active 상태 조회, 실패 확인 |
| 추천 API | `my-app/app/api/prompts/generate/route.ts` | active cycle의 row만 읽고 추천 세트 생성 |
| 트렌드 알림 캠페인 | DB `trend_alerts`, `trend_alert_deliveries` | 새 active cycle 기준 알림 메일 생성과 발송 추적 |
| 트렌드 메일 발송기 | `my-app/supabase/functions/cron-trend-emails/index.ts` | due trend alert를 유료 사용자에게 idempotent 발송 |
| 정적 audit | `my-app/scripts/audit-hairstyle-catalog.mjs` | cron, TTL, active pointer, row count 회귀 점검 |

## 5. 데이터 모델

### 5.1 기존 테이블 변경

| 테이블 | 현재 | 변경 |
| --- | --- | --- |
| `hairstyle_catalog_cycles` | `running`, `succeeded`, `failed` cycle 기록 | 유지. 서비스 active 여부는 별도 pointer로 분리 |
| `hairstyle_catalog` | `slug` global unique | `slug` global unique 제거, `(source_cycle_id, slug)` unique 추가 |
| `hairstyle_catalog.status` | row 활성 여부 | cycle 내부 row 사용 가능 여부로만 사용 |
| `hairstyle_catalog.source_cycle_id` | cycle FK | active pointer 조회의 필수 필터로 사용 |

### 5.2 신규 active pointer

| 컬럼 | 타입 | 기준 |
| --- | --- | --- |
| `market` | `text primary key` | 기본 `kr` |
| `active_cycle_id` | `uuid not null` | 현재 추천에 사용하는 succeeded cycle |
| `previous_cycle_id` | `uuid null` | 직전 active cycle, rollback 용도 |
| `activated_at` | `timestamptz not null` | active 교체 시각 |
| `expires_at` | `timestamptz not null` | 기본 `activated_at + interval '7 days'` |
| `rotation_period` | `text not null` | 예: `2026-W27` |
| `rotation_seed` | `text not null` | 추천 순위 tie-breaker용 seed |
| `last_rebuild_cycle_id` | `uuid null` | 마지막 시도 cycle |
| `last_rebuild_status` | `text not null` | `succeeded`, `failed`, `skipped` |
| `last_error_log` | `text null` | 마지막 실패 요약 |
| `updated_at` | `timestamptz not null` | pointer 갱신 시각 |

### 5.3 신규 lineup snapshot

| 컬럼 | 타입 | 기준 |
| --- | --- | --- |
| `id` | `uuid primary key` | lineup row ID |
| `cycle_id` | `uuid not null` | `hairstyle_catalog_cycles.cycle_id` |
| `market` | `text not null` | 기본 `kr` |
| `style_target` | `text not null` | `male`, `female` |
| `slot_key` | `text not null` | `trend`, `face_fit`, `evergreen`, `experimental` |
| `rank` | `integer not null` | style target 내 1부터 시작 |
| `catalog_item_id` | `uuid not null` | cycle snapshot row |
| `rotation_score` | `numeric(7,2) not null` | seed 반영 후 점수 |
| `selection_reason` | `text not null` | 운영 확인용 |
| `created_at` | `timestamptz not null` | 생성 시각 |

| 제약 | 목적 |
| --- | --- |
| `unique (cycle_id, style_target, rank)` | 한 cycle 안에서 순위 중복 방지 |
| `unique (cycle_id, style_target, catalog_item_id)` | 같은 스타일 중복 노출 방지 |
| `check (style_target in ('male', 'female'))` | 회원 성별 타깃과 일치 |
| `check (slot_key in ('trend', 'face_fit', 'evergreen', 'experimental'))` | slot 정책 고정 |

### 5.4 운영 이벤트 로그

| 컬럼 | 타입 | 기준 |
| --- | --- | --- |
| `id` | `uuid primary key` | 이벤트 ID |
| `market` | `text not null` | 기본 `kr` |
| `cycle_id` | `uuid null` | 관련 cycle |
| `event_type` | `text not null` | `scheduled`, `skipped`, `started`, `validated`, `activated`, `failed`, `rolled_back` |
| `message` | `text not null` | 짧은 운영 로그 |
| `metadata` | `jsonb not null` | 문서 수, row 수, overlap 등 |
| `created_at` | `timestamptz not null` | 이벤트 시각 |

### 5.5 트렌드 알림 캠페인 확장

기존 `trend_alerts`와 `trend_alert_deliveries`를 재사용하되, 카탈로그 cycle과의 연결 컬럼을 추가한다. 알림은 카탈로그가 `succeeded` 된 시점이 아니라 새 active cycle로 교체된 시점에만 생성한다.

| 테이블 | 변경 | 기준 |
| --- | --- | --- |
| `trend_alerts` | `catalog_cycle_id uuid null` 추가 | 어떤 카탈로그 업데이트에서 생성된 알림인지 추적 |
| `trend_alerts` | `alert_type text not null default 'manual'` 추가 | `catalog_rotation`, `manual` 구분 |
| `trend_alerts` | `source_summary jsonb not null default '{}'::jsonb` 추가 | top style signal, source count, rotation period 저장 |
| `trend_alerts` | `unique (catalog_cycle_id, alert_type)` partial unique | 같은 cycle 알림 중복 생성 방지 |
| `trend_alert_deliveries` | 기존 unique `alert_id,user_id` 유지 | 재시도와 중복 발송 방지 |

| 알림 생성 조건 | 결과 |
| --- | --- |
| 새 researched cycle이 active로 교체됨 | `catalog_rotation` alert 생성 |
| researched cycle이 120일 fallback으로만 성립됨 | active 교체는 가능하지만 기본 알림 생성 안 함 |
| 새 seeded cycle이 emergency bootstrap으로 active 교체됨 | 기본 생성 안 함, 요청 body에서 `notify:true`일 때만 생성 |
| 리빌드가 skipped | 알림 생성 안 함 |
| 리빌드가 failed | 알림 생성 안 함 |
| active pointer가 같은 cycle을 다시 가리킴 | 알림 생성 안 함 |

## 6. 자동 스케줄

| Job | 주기 | KST | UTC cron | 대상 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `cron-hairstyle-catalog-rotation-check` | 매일 | 09:20 | `20 0 * * *` | `/api/admin/hairstyles/rebuild` | active 만료 확인. due일 때만 수집/검증/활성화 |
| `cron-trend-emails` | 매일 | 09:15 | `15 0 * * *` | `/cron-trend-emails` | 기존 due trend alert 발송 |
| `cron-trend-emails-post-rotation` | 매일 | 09:40 | `40 0 * * *` | `/cron-trend-emails` | 당일 카탈로그 교체로 생성된 alert 후속 발송 |
| `cron-care-emails` | 매일 | 09:00 | `0 0 * * *` | `/cron-care-emails` | 에프터케어 메일 |
| `cron-subscription-renewal` | 매일 | 02:00 | `0 17 * * *` | `/cron-subscription-renewal` | 구독 갱신 |

### 6.1 cron 호출 계약

| 항목 | 값 |
| --- | --- |
| Method | `POST` |
| URL | `${NEXT_PUBLIC_APP_URL}/api/admin/hairstyles/rebuild` |
| Header | `x-admin-secret: <INTERNAL_API_SECRET>` |
| Body | `{"mode":"auto","reason":"rotation-check","activate":true,"onlyIfDue":true,"notify":true}` |
| 성공 응답 | `200`, `status: "succeeded"` 또는 `status: "skipped"` |
| 실패 응답 | `409` running 중복, `500` 수집/검증 실패 |

### 6.2 자동 회전 계약

| 조건 | 자동 동작 |
| --- | --- |
| `expires_at > now()` | `skipped:not_due` 반환, 수집하지 않음 |
| `expires_at <= now()` | researched 수집, 검증, lineup 생성, active pointer 교체 시도 |
| 직전 자동 시도 실패 | 다음 날 09:20 KST에 다시 자동 시도 |
| running cycle이 30분 초과 | stale running을 failed 처리하고 새 자동 시도 허용 |
| active가 24시간 이상 만료 | `isStale=true`, 계속 자동 재시도, 관리자 API에 경고 노출 |
| active가 14일 이상 만료 | 서비스는 기존 active 유지, `critical_stale` 이벤트 기록, 운영 알림 대상 |
| active pointer 없음 | initial bootstrap으로 `auto` 실행, 실패 시 seeded bootstrap은 명시적 운영 액션 필요 |

자동 회전은 사용자의 추천 생성 요청에서 실행하지 않는다. 추천 생성 요청은 active catalog만 읽고, 만료/실패 상태는 운영 API와 cron이 처리한다.

## 7. 리빌드 상태 전이

| 단계 | 입력 상태 | 처리 | 성공 상태 | 실패 상태 |
| --- | --- | --- | --- | --- |
| due 판단 | active pointer 있음 | `onlyIfDue=true`이고 `expires_at <= now()`이면 진행 | `started` | `skipped:not_due` |
| cycle 생성 | no running cycle | `hairstyle_catalog_cycles.running` 생성 | `running` | 기존 running 있으면 `409` |
| 수집 | running | Google News RSS 수집 | documents 확보 | cycle `failed` |
| row 생성 | documents 확보 | cycle별 row snapshot insert | rows 생성 | cycle `failed` |
| 검증 | rows 생성 | 최소 수량, 성별, 버전, 문서 수 확인 | valid | cycle `failed` |
| lineup 생성 | valid | rotation seed와 slot 정책 반영 | lineups 생성 | cycle `failed` |
| activation | lineups 생성 | active pointer atomic swap | active 교체 | 기존 active 유지 |
| trend alert enqueue | active 교체 | 새 cycle 기반 `trend_alerts` row 생성 | due alert 생성 | active 유지, alert error 기록 |
| cleanup | active 교체 후 | 오래된 cycle 보관/정리 | 완료 | 운영 로그만 남김 |

## 8. 리빌드 알고리즘

| 순서 | 함수/계층 | 동작 |
| ---: | --- | --- |
| 1 | API route | `mode`, `force`, `activate`, `reason` 파싱 |
| 2 | service | active pointer 조회 |
| 3 | service | `force=false`이고 `expires_at > now()`이면 skip |
| 4 | DB/RPC | market 단위 advisory lock 획득 |
| 5 | service | `createHairstyleCatalogCycleForMode("researched-weekly")` |
| 6 | research | `collectKoreanHairstyleTrendResearch(referenceDate)` |
| 7 | builder | `buildCatalogRowsForCycle(cycleId, nowIso, trendSignals)` |
| 8 | DB | cycle-scoped catalog rows insert |
| 9 | validator | active 교체 가능 여부 검증 |
| 10 | lineup | style target별 slot lineup 생성 |
| 11 | DB/RPC | `activate_hairstyle_catalog_cycle(...)` atomic swap |
| 12 | alert | active 교체가 발생했으면 `enqueueCatalogRotationTrendAlert(...)` 실행 |
| 13 | API route | active 상태, 알림 enqueue 결과, 다음 회전 시각 반환 |

### 8.1 수집 기간 정책

현재 구현의 `RESEARCH_LOOKBACK_DAYS = 240`은 주간 트렌드 회전에는 너무 길다. 목표 구조에서는 기본 수집 기간과 fallback 기간을 분리한다.

| 항목 | 기준 | 설명 |
| --- | ---: | --- |
| `primaryLookbackDays` | 60일 | 기본 trend signal 계산 기간 |
| `freshSignalDays` | 30일 | freshness score에 강하게 반영하는 최신 기간 |
| `fallbackLookbackDays` | 120일 | primary 문서가 부족할 때만 보조로 확장 |
| `fallbackEnabled` | `auto` mode만 허용 | `researched` 강제 실행에서는 부족하면 실패 처리 |
| `maxItemsPerQuery` | 10개 | 현재 query당 RSS item 상한 유지 |
| `weeklyQueries` | 11개 이상 | 현재 query set 유지, 이후 확장 가능 |

| 수집 결과 | 처리 |
| --- | --- |
| 60일 이내 `documentsUsed >= 6` | 정상 researched cycle |
| 60일 이내 부족, 120일 fallback 후 `documentsUsed >= 6` | active 교체는 가능하지만 `lowFreshness=true` warning 기록 |
| 120일 fallback도 부족 | researched 실패, 기존 active 유지 |
| fallback cycle | 기본적으로 트렌드 알림 메일 자동 생성 안 함 |

`sourceSummary`에는 실제 사용한 lookback을 저장한다.

| sourceSummary 필드 | 예 |
| --- | --- |
| `primaryLookbackDays` | `60` |
| `fallbackLookbackDays` | `120` |
| `usedLookbackDays` | `60` 또는 `120` |
| `lowFreshness` | `true` 또는 `false` |
| `freshDocumentsUsed` | 30일 이내 사용 문서 수 |

### 8.2 블루프린트 풀 규모

현재 18개 blueprint는 남성/여성별 추천 후보가 각각 10개 수준이라 주간 회전 폭이 좁다. 목표 구조에서는 저장되는 헤어스타일 blueprint 풀을 32개로 늘리고, 사용자에게 한 번에 노출되는 추천 lineup은 기존 9개를 유지한다.

| 항목 | 현재 | 목표 | 설명 |
| --- | ---: | ---: | --- |
| 전체 blueprint | 18개 | 32개 | trend signal을 반영할 저장 풀 |
| 여성 전용 blueprint | 8개 | 14개 | 여성 추천 후보의 기본 폭 |
| 남성 전용 blueprint | 8개 | 14개 | 남성 추천 후보의 기본 폭 |
| 공용 blueprint | 2개 | 4개 | 남녀 모두에 들어가는 중립 스타일 |
| 여성 추천 가능 row | 10개 | 18개 | 여성 전용 14 + 공용 4 |
| 남성 추천 가능 row | 10개 | 18개 | 남성 전용 14 + 공용 4 |
| 사용자 노출 lineup | 9개 | 9개 | UI 추천 보드 크기는 유지 |

| 운영 기준 | 값 |
| --- | --- |
| 신규 blueprint 추가량 | 14개 |
| 최소 길이 분산 | style target별 short/medium/long 각각 4개 이상 |
| 최소 실험 슬롯 후보 | style target별 experimental 후보 3개 이상 |
| 기존 slug 유지 | 기존 18개 slug는 가능한 한 유지해 과거 generation 참조를 깨지 않는다. |

## 9. 검증 기준

| 검증 | 기준 | 실패 시 |
| --- | --- | --- |
| 문서 수집 | 60일 primary 기준 `documentsCollected >= 12` | auto면 120일 fallback, researched면 실패 |
| 문서 사용 | 60일 primary 기준 `documentsUsed >= 6` | auto면 120일 fallback, researched면 실패 |
| 최신 문서 사용 | 30일 이내 `freshDocumentsUsed >= 2` | 실패 아님, freshness warning |
| provider | `google-news-rss` 포함 | 실패 |
| blueprint 수 | 전체 active row 32개 이상 | 실패 |
| 남성 후보 풀 | `style_targets`에 `male` 포함 row 18개 이상 | 실패 |
| 여성 후보 풀 | `style_targets`에 `female` 포함 row 18개 이상 | 실패 |
| prompt 버전 | 모든 row가 최신 `HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION` | 실패 |
| slug 중복 | 같은 cycle 안에서 slug 중복 없음 | 실패 |
| lineup 수 | 남성/여성 각각 9개 | 실패. 저장 풀 32개와 노출 lineup 9개는 별도 기준 |
| 이전 active fallback | 기존 active pointer가 있으면 새 실패가 pointer를 바꾸지 않음 | 실패 cycle만 기록 |
| overlap | 이전 active와 top 9 overlap 7개 이상 | 실패 아님, warning 이벤트 |
| fallback freshness | `usedLookbackDays > 60` | active 가능, trend alert 자동 생성 안 함 |

## 10. 추천 회전 정책

### 10.1 slot 구성

| Slot | 개수 | 선택 기준 | 목적 |
| --- | ---: | --- | --- |
| `trend` | 3 | trend score, freshness score, recent signal 우선 | 주간 트렌드 반영 |
| `face_fit` | 3 | 사용자 얼굴형/볼륨 태그 매칭 우선 | 개인화 품질 유지 |
| `evergreen` | 2 | 안정적인 기본 스타일, 길이 다양성 | 결과 품질 안정화 |
| `experimental` | 1 | freshness와 rotation seed 우선 | 매주 체감 변화 제공 |

### 10.2 점수 구성

| 점수 항목 | 가중치 | 설명 |
| --- | ---: | --- |
| `trendScore` | 0.35 | 수집 문서와 키워드 signal 기반 |
| `freshnessScore` | 0.25 | 최근 문서 가중치 기반 |
| `faceMatchScore` | 0.20 | 얼굴형, 볼륨, 파팅 매칭 |
| `lengthDiversityScore` | 0.10 | short, medium, long 분산 |
| `rotationBias` | 0.10 | `rotation_seed + style_target + slug` hash 기반 |

### 10.3 rotation seed

| 항목 | 기준 |
| --- | --- |
| seed 입력 | `${market}:${rotation_period}:${active_cycle_id}` |
| seed 저장 | `hairstyle_catalog_active_cycles.rotation_seed` |
| 적용 범위 | 동점 또는 근접 점수 row 순서 조정 |
| 제한 | 얼굴 적합도와 safety rule을 뒤집을 만큼 크게 주지 않음 |
| 재현성 | 같은 cycle과 같은 사용자 조건에서는 같은 추천 순서를 반환 |

## 11. API 계약

### 11.1 `POST /api/admin/hairstyles/rebuild`

| 필드 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `mode` | `"auto" | "researched" | "seeded"` | `"auto"` | 수집 방식 |
| `force` | `boolean` | `false` | TTL이 남아도 리빌드 |
| `onlyIfDue` | `boolean` | `false` | cron에서는 `true`. 만료 전이면 자동 skip |
| `activate` | `boolean` | `true` | 성공 시 active pointer 교체 |
| `dryRun` | `boolean` | `false` | 수집/검증만 수행하고 DB 활성화 생략 |
| `reason` | `string` | `"manual"` | `rotation-check`, `manual`, `bootstrap` 등 |

| 응답 필드 | 설명 |
| --- | --- |
| `status` | `succeeded`, `failed`, `skipped`, `running` |
| `skipReason` | `not_due`, `running`, `dry_run` 등 skip 사유 |
| `cycleId` | 새로 생성했거나 재사용한 cycle |
| `activeCycleId` | 현재 active cycle |
| `activated` | 이번 호출에서 active 교체 여부 |
| `trendAlertId` | 이번 active 교체로 생성된 trend alert |
| `trendAlertScheduledSendAt` | 알림 발송 예정 시각 |
| `activatedAt` | active 교체 시각 |
| `expiresAt` | 다음 회전 만료 시각 |
| `resolvedMode` | 실제 사용된 mode |
| `validation` | 검증 결과와 warning |
| `lineupCounts` | style target별 lineup 개수 |
| `sourceSummary` | 수집 query, provider, 문서 수, `usedLookbackDays`, `lowFreshness` |

### 11.2 `GET /api/admin/hairstyles/cycles/latest`

| 응답 필드 | 설명 |
| --- | --- |
| `activeCycle` | active pointer가 가리키는 cycle |
| `latestSucceededCycle` | 가장 최근 succeeded cycle |
| `lastFailedCycle` | 가장 최근 failed cycle |
| `activeAgeDays` | active 경과 일수 |
| `expiresAt` | active 만료 시각 |
| `nextRotationAt` | 다음 cron 기준 회전 예정 시각 |
| `isExpired` | `expires_at <= now()` |
| `isStale` | `expires_at + 24 hours <= now()` |
| `lineupCounts` | 남성/여성 lineup 수 |
| `warnings` | overlap, 문서 부족 등 운영 경고 |
| `lastAutomaticAttemptAt` | 마지막 자동 rotation checker 실행 시각 |
| `nextAutomaticAttemptAt` | 다음 자동 rotation checker 예정 시각 |

### 11.3 `POST /api/admin/hairstyles/rebuild` 알림 옵션

| 필드 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `notify` | `boolean` | `true` | active 교체 성공 시 트렌드 알림 생성 |
| `notifyPlans` | `string[]` | `["standard","pro","salon"]` | 알림 대상 플랜 |
| `notifyDelayMinutes` | `number` | `10` | active 교체 후 발송 대기 시간 |

| mode | notify 기본 동작 |
| --- | --- |
| `auto` | 60일 primary researched active 교체 성공 시 알림 생성 |
| `researched` | 60일 primary active 교체 성공 시 알림 생성 |
| `seeded` | 기본 알림 생성 안 함. `notify:true` 명시 시 생성 |
| `dryRun:true` | 알림 생성 안 함 |
| `lowFreshness:true` | 기본 알림 생성 안 함. `notify:true` 명시 시에도 response warning 포함 |

### 11.4 추천 생성 내부 계약

| 현재 | 변경 |
| --- | --- |
| `getLatestSuccessfulCatalogCycle()` 조회 | `getActiveCatalogCycle()` 조회 |
| latest succeeded row 로딩 | `active_cycle_id` 기준 row 로딩 |
| row 부족 시 즉시 리빌드 | 사용자 요청에서는 리빌드하지 않고 오류 또는 운영 fallback |
| `needsStyleTargetCatalogRefresh()`가 직접 리빌드 | stale/invalid 상태를 반환하고 admin/cron이 해결 |

## 12. 실패 및 fallback 정책

| 상황 | 사용자 추천 | 운영 처리 |
| --- | --- | --- |
| 자동 수집 성공 | 새 active cycle 사용 | 이전 cycle은 `previous_cycle_id`로 보존 |
| 자동 수집 실패 | 기존 active cycle 계속 사용 | failed cycle과 error log 기록, 다음날 자동 재시도 |
| 새 cycle 검증 실패 | 기존 active cycle 계속 사용 | validation failure 이벤트 기록 |
| active 만료 후 cron 실패 | stale active 계속 사용 | `isStale=true`, 매일 자동 재시도 |
| active pointer 없음, succeeded cycle 있음 | latest succeeded를 임시 fallback으로 사용 | bootstrap active pointer 생성 필요 |
| active pointer 없음, cycle 없음 | seeded bootstrap만 허용 | 운영 배포 전 bootstrap 필수 |
| running cycle 30분 초과 | 기존 active 계속 사용 | stale running을 failed 처리 후 재시도 가능 |
| trend alert 생성 실패 | 새 active cycle은 유지 | alert error 이벤트 기록 후 운영 재시도 |
| trend alert 발송 일부 실패 | 추천 영향 없음 | `trend_alert_deliveries.failed`로 남기고 다음 cron에서 재시도 |

## 13. 동시성 제어

| 위험 | 방지책 |
| --- | --- |
| cron과 수동 rebuild 동시 실행 | market 단위 advisory lock |
| running cycle 중복 | 기존 `idx_hairstyle_catalog_cycles_one_running_per_market` 유지 |
| 새 row가 이전 active row를 덮어씀 | cycle-scoped unique로 upsert 제거 |
| activation 중 일부 row만 보임 | DB RPC에서 succeeded 처리, lineup 생성, pointer swap을 한 transaction으로 처리 |
| 실패 cycle이 active가 됨 | `activate_hairstyle_catalog_cycle`에서 validation 통과 flag 요구 |

## 14. DB RPC

| RPC | 역할 |
| --- | --- |
| `activate_hairstyle_catalog_cycle(p_market, p_cycle_id, p_expires_at, p_rotation_period, p_rotation_seed)` | cycle succeeded 처리와 active pointer swap을 atomic하게 실행 |
| `fail_hairstyle_catalog_cycle(p_cycle_id, p_error_log)` | cycle 실패 처리와 active pointer error 기록 |
| `get_active_hairstyle_catalog(p_market)` | active cycle, rows, lineups 조회 |
| `mark_stale_running_hairstyle_cycles_failed(p_market, p_timeout_minutes)` | 오래 걸린 running cycle 복구 |
| `enqueue_catalog_rotation_trend_alert(p_market, p_cycle_id, p_scheduled_send_at, p_target_plans)` | active cycle 기반 trend alert를 중복 없이 생성 |
| `record_hairstyle_catalog_rotation_attempt(p_market, p_status, p_cycle_id, p_error_log)` | 자동 due checker 시도와 재시도 상태 기록 |

## 15. 구현 파일 영향도

| 파일 | 변경 |
| --- | --- |
| `my-app/lib/hairstyle-catalog.ts` | active pointer 조회, cycle-scoped insert, validation, activation flow 추가 |
| `my-app/lib/hairstyle-trend-research.ts` | 240일 단일 lookback 제거, 60일 primary/120일 fallback과 freshness metadata 추가 |
| `my-app/lib/recommendation-generator.ts` | active catalog 기반 추천 export 유지 |
| `my-app/app/api/admin/hairstyles/rebuild/route.ts` | `force`, `activate`, `dryRun`, `reason` 지원 |
| `my-app/app/api/admin/hairstyles/cycles/latest/route.ts` | active 상태와 next rotation 응답 추가 |
| `my-app/supabase/functions/cron-trend-emails/index.ts` | `catalog_rotation` alert 재시도와 cycle metadata 치환 지원 |
| `my-app/supabase/migrations/*_hairstyle_catalog_rotation.sql` | active pointer, lineup, RPC, cron 등록 |
| `my-app/scripts/audit-hairstyle-catalog.mjs` | TTL, cron, DB schema, 코드 경로 정적 점검 |
| `package.json`, `my-app/package.json` | `hairstyle:catalog:audit` script 추가 |

## 16. 단계별 구현 계획

| Phase | 범위 | 산출물 | 완료 기준 |
| --- | --- | --- | --- |
| [P1. DB 기반](hairstyle-catalog-rotation/phase-01-db-foundation.md) | cycle-scoped row, active pointer, lineup table, RPC | migration | old active fallback 가능한 schema |
| [P2. 서비스 리팩터](hairstyle-catalog-rotation/phase-02-service-active-catalog.md) | `latest succeeded`에서 `active pointer`로 추천 경로 변경 | TS 코드 | 추천 생성이 active cycle만 사용 |
| [P3. 리빌드 API](hairstyle-catalog-rotation/phase-03-rebuild-api.md) | `force`, `dryRun`, validation, activation 응답 | admin API | 수동 리빌드 결과가 active 상태를 반환 |
| [P4. 트렌드 알림 enqueue](hairstyle-catalog-rotation/phase-04-trend-alert-enqueue.md) | active 교체 후 `trend_alerts` 생성 | DB/RPC/API | 새 active cycle당 알림 1개만 생성 |
| [P5. 자동 rotation cron](hairstyle-catalog-rotation/phase-05-auto-rotation-cron.md) | 매일 due checker와 post-rotation mail cron 등록 | migration/helper | 매일 09:20 KST due 확인, 성공 시 09:40 KST 발송 |
| [P6. 회전 품질](hairstyle-catalog-rotation/phase-06-rotation-quality.md) | 32개 blueprint 풀, rotation seed, slot lineup, overlap warning | seed/lineup builder | 남/녀 후보 18개 이상, 노출 lineup 9개 안정 생성 |
| [P7. 운영 검증](hairstyle-catalog-rotation/phase-07-validation-ops.md) | audit/smoke/admin latest 보강 | scripts/docs | 회귀 점검 command 통과 |

## 17. 수동 운영 절차

| 목적 | 호출 |
| --- | --- |
| 현재 active 확인 | `GET /api/admin/hairstyles/cycles/latest` |
| 자동 due checker와 같은 실행 | `POST /api/admin/hairstyles/rebuild {"mode":"auto","onlyIfDue":true,"reason":"manual-rotation-check"}` |
| TTL 무시 강제 리빌드 | `POST /api/admin/hairstyles/rebuild {"mode":"auto","force":true}` |
| live research만 강제 | `POST /api/admin/hairstyles/rebuild {"mode":"researched","force":true}` |
| seed 기반 emergency bootstrap | `POST /api/admin/hairstyles/rebuild {"mode":"seeded","force":true}` |
| 검증만 수행 | `POST /api/admin/hairstyles/rebuild {"mode":"auto","dryRun":true}` |
| 알림 없이 강제 리빌드 | `POST /api/admin/hairstyles/rebuild {"mode":"auto","force":true,"notify":false}` |

## 18. 배포 전 체크리스트

| 체크 | 기준 |
| --- | --- |
| migration 적용 | active pointer, lineup, RPC 존재 |
| 기존 데이터 migration | latest succeeded cycle을 initial active로 등록 |
| cron 등록 | `cron-hairstyle-catalog-rotation-check`가 `20 0 * * *`로 등록 |
| 트렌드 알림 후속 cron | `cron-trend-emails-post-rotation`이 `40 0 * * *`로 등록 |
| admin secret | cron 호출에 쓰는 `INTERNAL_API_SECRET`와 앱 secret 일치 |
| 첫 active | `GET /api/admin/hairstyles/cycles/latest`에서 `activeCycle` 존재 |
| blueprint 풀 | 전체 32개, 남성/여성 후보 각각 18개 이상 |
| 알림 smoke | 새 active 교체 후 `catalog_rotation` trend alert 1개 생성 |
| 추천 smoke | 남성/여성 사용자 각각 9개 추천 반환 |
| 실패 smoke | 강제 실패 시 기존 active cycle 유지 |
| 자동 retry smoke | 실패 기록 후 다음 `onlyIfDue` 호출이 재시도 경로로 진입 |
| 메일 smoke | due alert 발송 후 `trend_alert_deliveries` 중복 없음 |
| audit | `npm run hairstyle:catalog:audit` 통과 |

## 19. MVP 결정

| 질문 | 결정 |
| --- | --- |
| 7일마다 새 데이터를 저장하는가 | 예. 매일 자동 due checker가 `expires_at`을 확인하고 7일 만료 시 새 cycle snapshot을 저장한다. |
| 로테이션은 자동으로 진행되는가 | 예. `cron-hairstyle-catalog-rotation-check`가 수집, 검증, active 교체, 알림 enqueue까지 수행한다. |
| 트렌드 수집 기간은 몇 일인가 | 기본 60일, 부족할 때만 120일 fallback을 쓴다. 240일은 사용하지 않는다. |
| 헤어 blueprint는 몇 개인가 | 총 32개로 늘린다. 여성 전용 14개, 남성 전용 14개, 공용 4개를 목표로 한다. |
| 새 cycle 실패 시 추천이 멈추는가 | 아니오. 기존 active를 계속 사용한다. |
| 추천 요청이 직접 수집하는가 | 아니오. 추천 요청은 active cycle만 읽는다. |
| 이전 cycle row를 보존하는가 | 예. slug unique를 cycle scoped로 바꾼다. |
| 카탈로그 업데이트 시 트렌드 메일을 보내는가 | 예. active 교체 성공 시 `trend_alerts`를 만들고 후속 `cron-trend-emails`가 발송한다. |
| 트렌드 메일 cron을 카탈로그 수집에 재사용하는가 | 아니오. 수집은 별도 `cron-hairstyle-catalog-rotation-check`, 발송은 `cron-trend-emails`가 담당한다. |
| seeded fallback을 자동 active로 쓰는가 | 초기 bootstrap 또는 명시적 emergency에서만 허용한다. |

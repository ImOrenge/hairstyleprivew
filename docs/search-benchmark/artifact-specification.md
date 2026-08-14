# HairFit 검색·전환 벤치마킹 아티팩트 정의서

- 작성일: 2026-07-15
- 최근 구현 대조일: 2026-08-14
- 상태: Proposed — current implementation aligned
- 상위 설계: [architecture.md](./architecture.md)

현재 구현의 재사용 가능 범위와 검색 전용 gap은 [컨설팅·프리미엄 랜딩 구현 대조 보고서](./current-implementation-alignment-2026-08-14.md)를 기준으로 판정한다. feature branch 구현은 검색 아티팩트의 `accepted` 상태를 자동 부여하지 않는다.

## 1. 목적

이 문서는 벤치마킹을 일회성 아이디어 목록으로 끝내지 않고, 구현·검증·운영에 필요한 산출물을 식별자, 경로, 스키마, 책임자, 입력, 완료 조건으로 고정한다.

아티팩트가 존재한다는 사실만으로 Phase가 완료되지 않는다. 각 아티팩트는 `Evidence`, `Acceptance`, `Owner`, `Status`를 가져야 하며 관련 게이트를 통과해야 한다.

## 2. 공통 상태 모델

```text
proposed -> drafted -> reviewed -> approved -> implemented -> verified
                                      |             |
                                      v             v
                                   rejected      retired
```

| 상태 | 의미 |
| --- | --- |
| `proposed` | 필요성이 식별됨 |
| `drafted` | 초안이 있으나 근거·승인 미완료 |
| `reviewed` | 담당 검토가 끝났고 수정 사항이 기록됨 |
| `approved` | 구현 입력으로 사용 가능 |
| `implemented` | 코드·데이터·콘텐츠에 반영됨 |
| `verified` | 브라우저·정적 감사·데이터로 완료가 증명됨 |
| `rejected` | 채택하지 않으며 이유가 남음 |
| `retired` | 과거에는 사용했으나 현재 비활성 |

## 3. 아티팩트 ID 규칙

| Prefix | 범주 |
| --- | --- |
| `B-*` | Benchmark·Baseline |
| `A-*` | Architecture·Decision |
| `C-*` | Content·Copy·Asset |
| `S-*` | SEO·Search Surface |
| `T-*` | Telemetry·Data |
| `E-*` | Experiment |
| `Q-*` | Quality·Verification |
| `O-*` | Operations·Runbook |

모든 아티팩트는 문서 또는 파일 상단에 다음 메타데이터를 가진다.

```yaml
artifact_id: B-01
title: competitor-snapshot-2026-07-15
status: approved
owner_role: product-strategy
reviewer_role: seo-and-legal
source_refs: []
created_at: 2026-07-15
updated_at: 2026-07-15
decision_refs: []
```

## 4. 마스터 아티팩트 카탈로그

| ID | 아티팩트 | 목표 경로 | Owner | Phase | 완료 조건 |
| --- | --- | --- | --- | --- | --- |
| B-00 | 현재 검색·퍼널 기준선 패킷 | `docs/search-benchmark/evidence/baseline-YYYY-MM-DD.md` | Product Analytics | P0 | 기간·출처·누락·필터가 기록됨 |
| B-01 | 경쟁사 공개 표면 snapshot | `docs/search-benchmark/evidence/competitor-snapshot-YYYY-MM-DD.yaml` | Product Strategy | P0 | observed/claimed/inferred가 분리됨 |
| B-02 | 키워드·검색 의도 맵 | `docs/search-benchmark/evidence/intent-map.yaml` | SEO | P0 | 한 intent당 canonical page가 하나 |
| A-01 | 적용 아키텍처 | `docs/search-benchmark/architecture.md` | Architecture | P0 | 구현 경로·데이터·게이트가 연결됨 |
| A-02 | 아티팩트 정의 | `docs/search-benchmark/artifact-specification.md` | Delivery | P0 | 모든 Phase 입력·출력·DoD 정의 |
| A-03 | Architecture Decision Records | `docs/search-benchmark/decisions/ADR-*.md` | Architecture | 전체 | 대안·결정·영향·rollback 기록 |
| C-01 | Discovery page registry | `my-app/lib/discovery/discovery-pages.ts` | Content Engineering | P1 | published page만 빌드·sitemap 포함 |
| C-02 | 페이지 message map | `docs/search-benchmark/content/message-map.yaml` | Product Marketing | P1 | 문제·약속·증거·CTA가 일관됨 |
| C-03 | 샘플 자산 manifest | `my-app/lib/discovery/sample-manifests.ts` | Design/Legal | P2 | 9개 이미지·권리·alt·승인 상태 완비 |
| C-04 | Marketing evidence registry | `my-app/lib/discovery/evidence-registry.ts` | Product/Legal | P2 | 모든 주장에 verified source 존재 |
| C-05 | Trust policy snapshot | `my-app/lib/trust/*` | Privacy/Product | P3 | 랜딩·업로드·정책 문구 버전 일치 |
| S-01 | Discovery hub·slug routes | `my-app/app/(marketing)/discover/*` | Web | P1 | 정적 생성, 미등록 404, canonical 통과 |
| S-02 | metadata·JSON-LD builder | `my-app/lib/discovery/metadata.ts`, `json-ld.ts` | Web/SEO | P1 | 화면과 구조화 데이터 불일치 0건 |
| S-03 | sitemap·robots inventory | `my-app/app/sitemap.ts`, `robots.ts` | Web/SEO | P1 | published만 indexable, 정확한 lastModified |
| S-04 | 내부 링크 그래프 | `docs/search-benchmark/evidence/internal-link-map.md` | SEO | P2/P4 | orphan page 0개, 링크 목적 기록 |
| T-01 | 이벤트 taxonomy | `packages/shared/src/analytics/discovery-event.ts` | Analytics | P3 | allowlist·PII 금지·버전 정의 |
| T-02 | Event ingestion API | `my-app/app/api/analytics/events/route.ts` | Backend | P3 | schema·rate limit·dedupe 검증 |
| T-03 | Funnel DB migration | `my-app/supabase/migrations/*_discovery_funnel_events.sql` | Data | P3 | RLS·보존·집계·rollback 정의 |
| T-04 | Funnel scorecard | `docs/search-benchmark/evidence/funnel-scorecard-YYYY-MM.md` | Analytics | P3+ | 분모·기간·표본·보호지표 포함 |
| E-01 | 실험 brief | `docs/search-benchmark/experiments/EXP-*.md` | Product | P5 | 가설·표본·지표·중단조건 정의 |
| E-02 | 실험 assignment manifest | `my-app/lib/experiments/discovery-experiments.ts` | Web/Analytics | P5 | bot control, sticky assignment, exposure 기록 |
| E-03 | 실험 decision record | `docs/search-benchmark/experiments/EXP-*-decision.md` | Product Analytics | P5 | win/lose/inconclusive와 근거 기록 |
| Q-01 | 정적 discovery audit | `my-app/scripts/audit-search-discovery.mjs` | QA/SEO | P1 | schema·metadata·evidence·link 검사 통과 |
| Q-02 | 브라우저 검증 보고서 | `artifacts/search-discovery/browser-report.md` | Browser QA | P2+ | viewport·키보드·console·network 증거 |
| Q-03 | 성능 보고서 | `artifacts/search-discovery/performance-report.md` | Web Perf | P2+ | LCP·CLS·JS·이미지 budget 기록 |
| Q-04 | 출시 승인 패킷 | `docs/search-benchmark/releases/release-readiness-*.md` | Delivery | 각 출시 | P0/P1 blocker 0 또는 명시적 승인 |
| O-01 | 콘텐츠 운영 runbook | `docs/search-benchmark/runbooks/content-operations.md` | Content Ops | P4 | publish·retire·rollback 절차 검증 |
| O-02 | 계측 운영 runbook | `docs/search-benchmark/runbooks/analytics-operations.md` | Data Ops | P3 | 누락·중복·지연·보존 대응 정의 |
| O-03 | 분기 벤치마크 보고서 | `docs/search-benchmark/evidence/quarterly-benchmark-YYYY-QN.md` | Strategy | 운영 | 경쟁 변화·채택/거절 결정 기록 |

## 5. Phase별 아티팩트 계약

## [P0. Evidence Baseline](./implementation-plan/phase-00-evidence-baseline.md)

### 입력

- Google Search Console 페이지·쿼리·기기 export
- 현재 HairFit 공개 URL inventory
- 현재 홈·업로드 퍼널 로그 또는 로그 부재 기록
- 경쟁사 공개 페이지 snapshot

### 필수 출력

- B-00 기준선 패킷
- B-01 경쟁사 snapshot
- B-02 intent map
- A-03 ADR-001: `/discover` URL namespace 결정

### B-00 기준선 패킷 스키마

```yaml
period:
  from: YYYY-MM-DD
  to: YYYY-MM-DD
search_console:
  property: https://hairfit.beauty/
  filters:
    country: KOR
    search_type: web
  totals:
    impressions: null
    clicks: null
    ctr: null
  non_brand_definition: []
product_funnel:
  availability: missing | partial | complete
  landing_views: null
  cta_clicks: null
  upload_starts: null
  board_views: null
known_gaps: []
source_files: []
```

### B-01 경쟁 snapshot 스키마

```yaml
snapshot_id: competitor-2026-07-15
observed_at: 2026-07-15T00:00:00+09:00
services:
  - id: COMP-01
    name: YouCam Online Editor
    url: https://yce.perfectcorp.com/ko/ai-hairstyle-generator
    locale: ko-KR
    observed:
      h1: AI 헤어스타일 시뮬레이션
      above_fold_upload: true
      example_try: true
      sections: []
      faq_topics: []
      internal_links: []
    claimed:
      free_credits: 5
      style_count: 150
    inferred: []
    evidence_refs: []
```

### P0 완료 기준

- [ ] 데이터 기간과 timezone이 명시됨
- [ ] 브랜드/비브랜드 query 분류 규칙이 있음
- [ ] 데이터가 없는 값은 `0`이 아니라 `missing`으로 기록됨
- [ ] 경쟁사 수치는 `claimed`로 분리됨
- [ ] Page ID와 primary intent가 1:1임
- [ ] 다음 행동이 P1 한 개로 지정됨

## [P1. Search Surface Foundation](./implementation-plan/phase-01-search-surface-foundation.md)

### 입력

- 승인된 B-02 intent map
- ADR-001 URL namespace
- 기존 `home-content.ts`, `HeroSection.tsx`, `PremiumConsultingShowcases.tsx`, `sitemap.ts`, `robots.ts`
- `/consulting/new` auth·feature flag·`ConsultationSnapshot` 진입 계약
- [검색 유입 페이지 구현 가이드](./search-entry-page-implementation-guide.md)의 PR-1 파일·카피·검증 계약

### 필수 출력

- C-01 Discovery page registry
- C-02 message map
- S-01 route skeleton
- S-02 metadata·JSON-LD builder
- S-03 sitemap·robots inventory
- Q-01 정적 audit
- `D-AI-SIM`을 실제 공개할 경우 C-03/C-04의 canary 승인 subset

### C-02 message map 스키마

```yaml
page_id: D-AI-SIM
audience: 미용실 방문 전 여러 헤어 후보를 비교하려는 사용자
job_to_be_done: 내 사진에서 어울리는 방향을 한눈에 비교한다
problem: 머리를 자르기 전 한 스타일만 보고 결정하기 어렵다
core_promise: 사진 한 장으로 9개 후보를 같은 기준에서 비교한다
proof:
  - evidence_id: product-strategic-nine-preview-v2
primary_cta:
  label: 프라이빗 AI 컨설팅 시작
  href: /consulting/new
objections:
  - id: photo-privacy
  - id: real-world-variance
forbidden_claims:
  - 실제 시술과 완벽히 동일
  - 실패 없는 변신
```

### Q-01 필수 검사

- registry slug·ID unique
- published page에 title, description, H1, canonical 존재
- title·H1 완전 중복 경고
- FAQ 화면 데이터와 JSON-LD 동일
- evidence ID가 verified 상태
- sample asset 1개 이상과 9개 grid image 존재
- related page가 published이며 자기 자신을 링크하지 않음
- published orphan page 0개
- draft/review는 sitemap에서 제외
- `updatedAt`이 유효한 ISO date
- CTA href가 primary allowlist(`/consulting/new`)에 포함
- legacy `/workspace`는 feature-flag rollback 경로로만 참조
- 금지 주장 문자열 탐지

### P1 완료 기준

- [ ] `/discover` hub와 최소 1개 pilot slug가 정적 빌드됨
- [ ] 미등록 slug는 404
- [ ] view-source에서 핵심 본문·canonical·JSON-LD 확인 가능
- [ ] sitemap에는 published만 포함
- [ ] Q-01 통과
- [ ] 기존 홈·업로드·생성 route에 동작 변화 없음

## [P2. Pilot Content and Sample Experience](./implementation-plan/phase-02-pilot-content-sample-experience.md)

### 대상 페이지

- D-AI-SIM
- D-FACE
- D-MEN
- D-WOMEN

### 필수 출력

- C-03 sample asset manifest
- C-04 marketing evidence registry
- S-04 internal link map
- Q-02 browser report
- Q-03 performance report
- Q-04 pilot release readiness

### C-03 자산 승인 체크

- [ ] `sourceType`이 allowlist에 있음
- [ ] license 또는 consent reference가 실제 문서로 연결됨
- [ ] 원본 1개와 grid 9개가 있음
- [ ] 모든 이미지에 고유 alt가 있음
- [ ] 얼굴·스타일·의상 샘플이 제공 기능을 과장하지 않음
- [ ] 모바일 crop과 1200×630 share crop이 검토됨
- [ ] 만료 자산에 fallback이 있음

### Q-02 Browser Gate matrix

| 환경 | 필수 확인 |
| --- | --- |
| 360×800 | H1, CTA, 다음 섹션 힌트, sticky CTA 겹침 없음 |
| 390×844 | 전략 탭·9-preview sample 조작, 가로 overflow 없음 |
| 768×1024 | 내부 링크·FAQ keyboard 동작 |
| 1440×900 | Hero hierarchy, demo와 본문 연결 |
| JS disabled 또는 hydration 실패 | 핵심 카피·링크·샘플 이미지 접근 가능 |
| 이미지 실패 | 레이아웃 붕괴 없음, alt 제공 |

### Q-03 Performance budget

| 항목 | 목표 |
| --- | ---: |
| Mobile LCP | 2.5초 이하 목표 |
| CLS | 0.1 이하 |
| INP | 200ms 이하 목표 |
| Discovery client JS | 구현 전 승인한 budget 이내, 증가분 기록 |
| Hero priority image | viewport별 1개 원칙 |
| 9-preview image | viewport 밖 lazy load, 명시적 sizes |

### P2 완료 기준

- [ ] 4페이지가 고유 message map과 evidence를 가짐
- [ ] 공용 컴포넌트가 페이지별 카피를 덮어쓰지 않음
- [ ] Browser Gate matrix 통과
- [ ] P0/P1 결함 0건
- [ ] 성능 budget 초과 시 승인된 예외 기록
- [ ] 기존 제품 CTA 목적지까지 source ID가 전달됨

## [P3. Trust and Funnel Measurement](./implementation-plan/phase-03-trust-funnel-measurement.md)

### 필수 출력

- C-05 trust policy snapshot
- T-01 event taxonomy
- T-02 ingestion API
- T-03 DB migration
- T-04 첫 funnel scorecard
- O-02 analytics runbook

### T-01 이벤트 dictionary

각 이벤트는 다음 형식으로 문서화한다.

```yaml
event_name: cta_clicked
schema_version: 1
trigger: 사용자가 discovery CTA를 활성화했을 때
required:
  - eventId
  - occurredAt
  - anonymousSessionId
  - landingId
  - ctaId
  - path
optional:
  - intentId
  - sampleId
  - experimentAssignments
forbidden:
  - imageUrl
  - email
  - prompt
dedupe_key: eventId
owner: web-growth
downstream_metrics:
  - landing_to_cta_rate
```

### T-03 DB 최소 계약

```sql
product_funnel_events(
  event_id uuid primary key,
  event_name text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  anonymous_session_id_hash text not null,
  user_id_hash text null,
  landing_id text null,
  intent_id text null,
  sample_id text null,
  cta_id text null,
  experiment_assignments jsonb not null default '{}'::jsonb,
  path text not null,
  referrer_host text null,
  device_class text null,
  schema_version integer not null
)
```

DB 게이트:

- service-role insert만 허용
- client direct insert 금지
- 자유형 metadata 컬럼 금지 또는 엄격한 크기 제한
- 이벤트명·device class check constraint
- event ID idempotency
- 보존 purge 함수와 운영 dry-run
- migration down/rollback 전략 문서화
- 일별 집계 view는 raw PII 없이 생성

### P3 완료 기준

- [ ] 샘플 이벤트에 금지 필드가 없음
- [ ] 잘못된 event name과 큰 payload가 4xx
- [ ] 동일 event ID 중복이 집계되지 않음
- [ ] landing→CTA→upload→board를 같은 landing ID로 집계 가능
- [ ] 정책·업로드·랜딩의 사진 보존 문구가 동일 버전
- [ ] 데이터 누락 알림과 purge runbook 검증

## [P4. Content Expansion and Operations](./implementation-plan/phase-04-content-expansion-operations.md)

### 대상 페이지

- D-BANGS
- D-BOB
- D-SALON

### 필수 출력

- 확장된 C-01 registry
- 업데이트된 S-04 내부 링크 그래프
- O-01 content operations runbook
- 카탈로그 후보 보고서
- 7페이지 Q-02/Q-03 회귀 보고서

### 카탈로그 후보 레코드

```yaml
candidate_id: style-bangs-2026-W29
source_cycle_id: uuid
market: kr
rotation_period: 2026-W29
style_slug: see-through-bang
style_targets: [female]
slot_keys: [trend, face_fit]
freshness:
  used_lookback_days: 60
  low_freshness: false
proposed_page_id: D-BANGS
decision: proposed | approved | rejected
decision_reason: null
reviewer: null
```

### O-01 운영 절차

1. 후보 생성
2. 검색 수요·제품 지원 범위 확인
3. copy·evidence·asset 작성
4. SEO·privacy·product review
5. registry status를 `published`로 변경
6. build·audit·browser 검증
7. sitemap 확인과 Search Console 기록
8. 성과 관찰
9. 유지·수정·retire 결정

Retire 시 URL을 즉시 삭제하지 않는다. 대체 페이지가 있으면 영구 redirect, 없고 가치가 사라졌으면 noindex와 sitemap 제외를 거쳐 제거한다. 결정은 ADR 또는 content decision record에 남긴다.

### P4 완료 기준

- [ ] 7개 published 페이지에 orphan 0개
- [ ] 같은 primary intent를 가진 canonical 중복 0개
- [ ] 카탈로그 low-freshness 후보가 자동 공개되지 않음
- [ ] B2C와 B2B CTA 이벤트가 분리됨
- [ ] retire·rollback 절차 dry-run 완료

## [P5. Experiment and Optimization](./implementation-plan/phase-05-experiment-optimization.md)

### 필수 출력

- E-01 experiment brief
- E-02 assignment manifest
- E-03 decision record
- 월별 T-04 scorecard
- 분기 O-03 benchmark report

### E-01 실험 brief 템플릿

```yaml
experiment_id: EXP-DISCOVERY-001
title: Hero sample-first vs CTA-first
hypothesis: 샘플을 CTA보다 먼저 이해하면 qualified CTA rate가 증가한다
population:
  pages: [D-AI-SIM, D-MEN, D-WOMEN]
  devices: [mobile]
variants:
  control: current-order
  treatment: sample-first
primary_metric: preview_board_views_per_landing_view
guardrails:
  - upload_validation_failure_rate
  - mobile_lcp
  - generation_failure_rate
minimum_sample: pending-baseline
maximum_duration_days: 42
stop_conditions:
  - privacy incident
  - P0 rendering defect
  - LCP regression above approved threshold
seo_controls:
  metadata_constant: true
  canonical_constant: true
  bot_variant: control
rollback: disable manifest entry
```

### E-03 decision record 필수값

- 실제 기간과 포함·제외 조건
- variant별 표본
- primary metric과 confidence interval
- guardrail 결과
- instrumentation anomaly
- `winner`, `loser`, `inconclusive` 중 하나
- ship·rollback·repeat 결정
- 코드·registry 반영 commit

### P5 완료 기준

- [ ] exposure 이벤트 없이 outcome만 기록되는 세션 0 또는 허용 사유 기록
- [ ] bot은 control만 받음
- [ ] canonical·metadata가 variant별로 달라지지 않음
- [ ] 결과가 inconclusive여도 의사결정 기록 존재
- [ ] 종료된 실험 코드를 제거하거나 만료일을 둠

## 6. Architecture Decision Record 목록

| ADR | 결정 | 필수 대안 |
| --- | --- | --- |
| ADR-001 | `/discover/[slug]` namespace | top-level route, blog route, CMS route |
| ADR-002 | code registry 기반 콘텐츠 SSoT | Supabase CMS, MDX, 외부 CMS |
| ADR-003 | 샘플 우선, 실제 업로드는 기존 flow | Hero inline upload, iframe/tool embed |
| ADR-004 | 카탈로그 후보→사람 승인→정적 공개 | active catalog 자동 공개 |
| ADR-005 | Supabase 초기 event sink | GA4 only, Cloudflare Analytics Engine, PostHog |
| ADR-006 | verified evidence registry | 자유형 마케팅 문구 |

ADR 템플릿:

```markdown
# ADR-XXX: 결정 제목

- Status: proposed | accepted | superseded | rejected
- Date:
- Owners:
- Related artifacts:

## Context
## Decision
## Alternatives
## Consequences
## Risks
## Rollback
## Evidence
```

## 7. 출시 승인 패킷

Q-04는 매 출시마다 다음 표를 포함한다.

| Gate | Evidence | Status | Blocker Owner |
| --- | --- | --- | --- |
| Architecture | route·registry·event sequence 검토 | pending | Architecture |
| Copy | message map·forbidden claims audit | pending | Product Marketing |
| Evidence | verified evidence registry | pending | Product/Legal |
| SEO | metadata·canonical·sitemap·links | pending | SEO |
| Privacy | sample rights·event PII·photo policy | pending | Privacy |
| Browser | viewport·keyboard·console·network | pending | QA |
| Performance | CWV·JS·image budget | pending | Web |
| Funnel | landing ID continuity·dedupe | pending | Analytics |
| Operations | rollback·retire·incident path | pending | Delivery |

승인 규칙:

- P0/P1 미해결이면 출시 불가
- P2는 소유자·완화책·기한이 있을 때만 예외 승인
- P3는 후속 polish로 남길 수 있음
- 외부 검색 노출은 sitemap 존재만으로 완료 처리하지 않음
- Search Console 접근 또는 제출이 막히면 `external-blocked`로 명시

## 8. 문서 간 추적성

| 요구사항 | Architecture | 구현 아티팩트 | 검증 아티팩트 |
| --- | --- | --- | --- |
| 의도별 정적 랜딩 | 5장 | C-01, S-01 | Q-01, Q-02 |
| 9-preview 샘플 체험 | 6장 | C-03, discovery components | Q-02, Q-03 |
| 카탈로그 안전 활용 | 7장 | candidate report, C-01 | O-01, Q-01 |
| metadata·sitemap | 8장 | S-02, S-03 | Q-01 |
| 신뢰·정책 | 9장 | C-04, C-05 | Q-04 |
| 퍼널 계측 | 10장 | T-01~T-03 | T-04, O-02 |
| 실험 | 11장 | E-01, E-02 | E-03 |

## 9. 구현 시작 전 최종 체크리스트

- [ ] B2C/B2B 1차 KPI 결정
- [ ] Search Console property와 기준 기간 확정
- [ ] 샘플 자산 권리 확인
- [ ] `/consulting/new` 로그인·세션 생성에서 source/resume context 보존
- [ ] feature flag OFF의 `/workspace` return boundary까지 source ID 유지, 미저장 시 `not-recorded-legacy` 판정
- [ ] 현재 크레딧·무료 범위 SSoT 재확인
- [ ] 사진 원본 보존·삭제 정책의 현재 구현 검증
- [ ] 이벤트 보존기간과 개인정보 검토
- [ ] P1 pilot page ID와 담당자 확정
- [ ] 기존 진행 중 frontend UI/UX 브랜치와 파일 충돌 확인
- [ ] 구현 브랜치와 integration target을 git preflight로 다시 고정

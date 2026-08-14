# P0. Evidence Baseline 상세 구현 계획

- 상태: planned — source inventory refreshed, Search Console·funnel baseline 미생성
- 선행조건: Search Console 및 공개 URL에 대한 읽기 권한 확인
- 입력: 현재 서비스 URL, 공개 경쟁 서비스, 사용 가능한 퍼널 로그
- 출력: B-00, B-01, B-02, ADR-001
- 다음 Phase: [P1 Search Surface Foundation](./phase-01-search-surface-foundation.md)

## 현재 구현 대조

- 소스 inventory 기준을 `feat/2026-08-12-premium-landing-refactor@e86e40d`로 갱신한다.
- `main@b33c33c`과 feature 구현을 분리해 운영 상태를 과장하지 않는다.
- 현재 `landing_id` event sink가 없으므로 제품 퍼널 값은 추정하지 않고 `missing`으로 기록한다.
- 증거: [2026-08-14 구현 대조 보고서](../current-implementation-alignment-2026-08-14.md)

## 1. 목표와 비범위

검색 노출과 전환의 현재값을 재현 가능한 기준선으로 고정하고, 경쟁 서비스에서 관찰한 공개 패턴을 HairFit의 검색 의도에 연결한다. P0에서는 애플리케이션 코드, sitemap, 분석 DB를 변경하지 않는다.

비범위:

- 경쟁사의 비공개 API·모델·데이터 구조 추정
- 검색량 또는 전환값 임의 보간
- Search Console 제출·색인 요청
- 자동화 수집을 위한 계정·키 생성

## 2. 입력 계약과 의사결정

| 입력 | 필수 필드 | 누락 시 처리 |
| --- | --- | --- |
| Search Console export | property, 기간, timezone, query, page, device, impressions, clicks, position | B-00을 `partial`로 두고 누락 사유 기록 |
| 공개 URL inventory | URL, status, canonical, title, H1, sitemap 포함 여부 | 로컬 build 또는 운영 read-only crawl로 보완 |
| 퍼널 로그 | landing, CTA, upload, board 이벤트 정의와 기간 | 수치는 `missing`, P3 계측 gap으로 등록 |
| 경쟁 snapshot | URL, 관찰 시각, locale, observed/claimed/inferred | 관찰되지 않은 필드는 비워 둠 |

P0 시작 전에 다음 결정을 기록한다.

- OD-01: 1차 KPI는 기본적으로 B2C `consultation_started / landing_viewed`로 제안
- OD-04: 초기에는 수동 export, 필드가 안정화된 후 API 자동화
- 브랜드 query: `hairfit`, `hair fit`, `헤어핏` 및 승인된 오탈자 목록
- 비교 기간: 최근 완전한 28일과 직전 28일, Asia/Seoul 기준

## 3. 변경·생성할 파일

| 작업 | 경로 | 내용 |
| --- | --- | --- |
| P0-W01 | `docs/search-benchmark/evidence/baseline-YYYY-MM-DD.md` | 기준선 요약, 필터, 누락, 전후 비교 |
| P0-W02 | `docs/search-benchmark/evidence/raw/README.md` | 원본 export 위치·보존·민감정보 금지 규칙 |
| P0-W03 | `docs/search-benchmark/evidence/competitor-snapshot-YYYY-MM-DD.yaml` | 경쟁사 공개 표면 |
| P0-W04 | `docs/search-benchmark/evidence/intent-map.yaml` | query cluster와 canonical Page ID |
| P0-W05 | `docs/search-benchmark/adr/ADR-001-discover-namespace.md` | `/discover` 선택 근거 |

원본 Search Console CSV는 개인정보·접근 정책을 확인한 뒤 저장한다. 저장소에 넣지 않는 경우 B-00의 `source_files`에는 승인된 외부 위치와 snapshot hash만 기록한다.

## 4. 작업 패키지

### P0-W01. 현재 공개 검색 표면 inventory

1. `app/sitemap.ts`, `app/robots.ts`, route 폴더에서 후보 URL을 추출한다.
2. 운영 URL에 읽기 전용 HEAD/GET을 실행해 status, canonical, title, H1을 기록한다.
3. 소스 정의와 운영 응답의 차이를 `source-only`, `runtime-only`, `mismatch`로 분류한다.
4. 로그인 redirect, noindex, canonical 충돌을 P0~P3 finding으로 등록한다.

Acceptance:

- 같은 URL이 query string 차이로 중복 집계되지 않는다.
- 운영 확인이 불가능하면 source-only임을 명시한다.
- `lastModified`는 실제 변경 근거가 없으면 현재 시각으로 채우지 않는다.

### P0-W02. Search Console 기준선

1. query/page/device 단위 export의 기간과 필터를 고정한다.
2. query를 `brand`, `non_brand`, `unknown`으로 분류한다.
3. non-brand query를 AI 시뮬레이션, 얼굴형, 성별, 스타일, 살롱 의도로 군집화한다.
4. 노출·클릭·CTR·평균순위를 URL과 intent별로 집계한다.
5. product funnel 데이터와 기간을 맞추고, 없으면 이벤트 gap만 기록한다.

```yaml
baseline_id: BASE-2026-07-15
timezone: Asia/Seoul
period:
  current: { from: YYYY-MM-DD, to: YYYY-MM-DD }
  previous: { from: YYYY-MM-DD, to: YYYY-MM-DD }
filters:
  country: KOR
  search_type: web
classification_version: brand-query-v1
missing_fields: []
source_files:
  - location: approved-location
    sha256: pending
```

### P0-W03. 경쟁 서비스 snapshot

관찰자는 화면에 실제 존재하는 정보만 `observed`에 기록한다. 서비스가 자체 주장한 무료 횟수·스타일 수·정확도는 `claimed`, 구조적 해석은 `inferred`에 둔다.

수집 항목:

- title, description, canonical, H1과 첫 viewport의 CTA
- 업로드/샘플 체험 위치, 실제 클릭 없이 확인 가능한 상태
- proof, trust, FAQ, 내부 링크와 locale 구조
- 로그인 요구 시점과 제품 플로우 전환 위치
- 관찰 URL, 시각, screenshot 또는 HTML evidence reference

### P0-W04. intent map과 페이지 경계

```yaml
- intent_id: INT-AI-SIM
  primary_query: AI 헤어스타일 시뮬레이션
  secondary_queries: []
  audience: B2C
  job_to_be_done: 여러 헤어 후보를 내 사진 기준으로 비교
  canonical_page_id: D-AI-SIM
  canonical_path: /discover/ai-hairstyle-simulation
  evidence_refs: []
  status: proposed
```

하나의 primary intent는 하나의 canonical Page ID만 가진다. 동일한 의도를 성별·스타일 modifier 없이 여러 페이지에 배정하면 P1 audit blocker다.

### P0-W05. ADR-001 승인

`/discover/[slug]`, top-level route, blog, 외부 CMS를 비교한다. 제품 체험과 분리되지 않으면서도 정적 페이지로 관리 가능한 `/discover`를 기본안으로 기록한다. URL 변경 비용, locale 확장, redirect 전략도 함께 승인한다.

## 5. 검증과 증거

| Gate | 검사 | 증거 |
| --- | --- | --- |
| Evidence | claimed와 observed 혼합 여부, source hash | B-00/B-01 |
| SEO | intent 중복, orphan 후보, canonical 충돌 | B-02 |
| Privacy | export에 사용자 식별자·사진·검색 원문 외 민감정보가 없는지 | 검토 기록 |
| Operations | 다음 재수집자가 같은 필터를 재현 가능한지 | baseline header |

정적 검증기는 최소 다음 오류를 반환해야 한다.

- 기간 역전, timezone 누락
- 숫자 필드에 `missing` 대신 임의의 0 사용
- snapshot URL 또는 observed_at 누락
- 한 primary intent에 canonical Page ID 2개 이상
- evidence ref가 존재하지 않는 경로를 가리킴

## 6. 롤백과 실패 처리

P0는 코드 롤백이 없다. 잘못된 원본이나 분류 규칙이 발견되면 기존 아티팩트를 덮어쓰지 않고 새 기준선 ID와 `supersedes`를 만든다. 외부 접근이 막히면 임시 수치를 만들지 않고 Q-04에 `external-blocked`로 기록한다.

## 7. Exit Gate

- [ ] B-00에 기간·timezone·property·필터·source hash가 있음
- [ ] 브랜드/비브랜드/unknown 분류 규칙이 버전 관리됨
- [ ] 누락값과 실제 0이 구분됨
- [ ] B-01의 observed/claimed/inferred가 분리됨
- [ ] B-02에서 primary intent와 canonical Page ID가 1:1임
- [ ] ADR-001이 accepted임
- [ ] P1 canary Page ID가 `D-AI-SIM`으로 지정됨
- [ ] 다음 행동이 “P1-W01 registry 타입과 audit fixture 생성” 하나로 지정됨

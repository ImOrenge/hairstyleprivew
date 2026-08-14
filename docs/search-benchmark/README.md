# HairFit 검색·전환 벤치마킹 문서

- 작성일: 2026-07-15
- 기준 브랜치: `dev/2026-07-15-search-benchmark-docs`
- 기준 커밋: `819c675a2d9aeec996540a6e0461fc599f37cc6f`
- 최근 구현 대조일: 2026-08-14
- 대조 구현: `feat/2026-08-12-premium-landing-refactor@e86e40d`
- 현재 문서 작업: `dev/2026-08-14-consulting-landing-doc-sync`

## 문서 목적

이 문서 묶음은 경쟁 서비스의 공개 페이지에서 관찰한 검색 유입, 즉시 체험, 신뢰, 내부 링크, 전환 구조를 HairFit의 실제 Next.js·Supabase·헤어 카탈로그 구조에 적용하기 위한 설계 기준이다.

- [아키텍처](./architecture.md): 벤치마킹 데이터, 목표 시스템 구조, 데이터 모델, 라우트와 컴포넌트 경계
- [아티팩트 정의](./artifact-specification.md): 단계별 필수 산출물, 스키마, 책임, 검증 기준, 완료 게이트
- [검색 유입 페이지 구현 가이드](./search-entry-page-implementation-guide.md): P1 canary와 P2 pilot의 실제 파일·코드·카피·검증 순서
- [Phase별 상세 구현 계획](./implementation-plan/README.md): P0~P5 독립 실행 문서, 파일·타입·API·DB·검증·롤백 계약
- [현재 컨설팅·랜딩 구현 대조](./current-implementation-alignment-2026-08-14.md): 구현 브랜치 증거, 재사용 가능 영역, 검색 전용 미구현 gap

### 현재 구현 요약

| 영역 | 현재 구현 | 검색 벤치마킹 판정 |
| --- | --- | --- |
| 프리미엄 랜딩 | 16명 rolling Hero, 컨설팅 evidence showcase, `/consulting/new` CTA | 재사용 가능, feature branch 상태 |
| AI 컨설팅 | 11 Scene, 서버 snapshot, 9 preview, 비교·결정·brief·aftercare·fashion | 재사용 가능, feature branch 상태 |
| 검색 표면 | `/discover/*` route·registry 없음 | P1 미구현 |
| 검색 계측 | `landing_id` event API·집계 없음 | P3 미구현 |
| 검색 실험 | discovery assignment manifest 없음 | P5 미구현 |

### Phase별 실행 문서

| Phase | 상세 문서 | 구현 초점 |
| --- | --- | --- |
| P0 | [Evidence Baseline](./implementation-plan/phase-00-evidence-baseline.md) | 기준선·경쟁 snapshot·intent map |
| P1 | [Search Surface Foundation](./implementation-plan/phase-01-search-surface-foundation.md) | registry·정적 route·metadata·audit |
| P2 | [Pilot Content & Sample Experience](./implementation-plan/phase-02-pilot-content-sample-experience.md) | 4개 pilot·9-preview sample·browser/performance |
| P3 | [Trust & Funnel Measurement](./implementation-plan/phase-03-trust-funnel-measurement.md) | trust SSoT·event API·DB·scorecard |
| P4 | [Content Expansion & Operations](./implementation-plan/phase-04-content-expansion-operations.md) | 7개 페이지·후보 승인·retire 운영 |
| P5 | [Experiment & Optimization](./implementation-plan/phase-05-experiment-optimization.md) | 실험 할당·판정·주기 운영 |

## 범위

포함:

- 공개 검색 랜딩과 내부 링크 아키텍처
- 로그인 전 샘플 체험과 기존 생성 플로우 연결
- 카탈로그 데이터를 검색 콘텐츠 후보로 안전하게 활용하는 경계
- 검색 성과와 제품 퍼널 계측
- 사진 처리·과금·후기·AI 결과 관련 신뢰 문구
- 단계별 구현 아티팩트와 완료 조건

제외:

- 경쟁사의 비공개 모델, DB, API 또는 인프라에 대한 추정 구현
- 현재 헤어 생성 모델·크레딧 정책 자체의 변경
- 자동 생성한 대량 SEO 페이지의 무검수 공개
- 실제 사용자 사진을 공개 샘플 자산으로 재사용하는 방식
- 이 문서 작업에서의 배포, 검색엔진 제출, 운영 데이터 수집

## Agentic Run Packet

### Mode

`audit -> plan -> copy-pass`

### User Goal

경쟁 서비스의 공개 아키텍처를 HairFit에 적용할 수 있는 문서로 만들고, 현재 컨설팅·랜딩 구현과 대조한 검색 유입 페이지의 canary 구현 계약까지 구체화한다.

### Assumptions

| ID | 가정 | 위험 | 확인 필요 |
| --- | --- | --- | --- |
| AS-01 | 1차 목적은 비브랜드 검색 노출과 B2C 체험 시작률 개선이다. | B2B 우선순위가 더 높으면 페이지 순서가 달라진다. | 구현 시작 전 제품 책임자 확인 |
| AS-02 | 현재 rolling Hero·premium showcase 자산을 검색 샘플 후보로 검토할 수 있다. | 랜딩 사용 승인이 검색 파생 자산 권리까지 자동 보장하지 않는다. | C-03 자산 매니페스트 승인 필요 |
| AS-03 | `/consulting/new`가 기본 전환 목적지이고 flag OFF 시 `/workspace`로 rollback한다. | 검색 source handoff가 auth·세션 생성 중 유실될 수 있다. | P2에서 resume context 계약 검증 |
| AS-04 | 초기 계측 저장소는 Supabase로 시작하고, 트래픽 증가 시 별도 분석 저장소로 교체할 수 있다. | 이벤트 증가가 운영 DB 비용에 영향을 줄 수 있다. | 보존기간·샘플링 승인 필요 |

### Work Queue

| ID | Phase | Task | Exit Condition | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| W-01 | intake | 경쟁사 공개 페이지와 HairFit 현재 구조 조사 | 관찰·주장·추정이 구분됨 | 아키텍처 2장 | complete |
| W-02 | plan | 목표 검색·전환 아키텍처 정의 | 라우트, 데이터, 컴포넌트, 계측 경계가 연결됨 | 아키텍처 4~11장 | complete |
| W-03 | plan | 구현 아티팩트와 게이트 정의 | 모든 Phase에 입력·출력·완료조건이 있음 | 아티팩트 정의서 | complete |
| W-04 | inspect | 문서 교차검증 | 링크·경로·ID·범위 불일치 없음 | Markdown link·fence·ID 검사 | complete |
| W-05 | plan | P0~P5를 독립 실행 문서로 상세화 | 각 Phase에 파일·계약·절차·검증·롤백·인계가 있음 | implementation-plan 7개 문서 | complete |
| W-06 | inspect | 현재 컨설팅·프리미엄 랜딩 구현 대조 | implemented·partial·missing이 commit·path로 구분됨 | 2026-08-14 대조 보고서 | complete |
| W-07 | plan | 검색 유입 페이지 구현 경로 구체화 | canary PR·pilot PR의 파일·카피·코드·검증·rollback 경계가 고정됨 | 검색 유입 페이지 구현 가이드 | complete |

### Acceptance Gates

- Agentic Operation Gate: passed — 이 Run Packet과 완료 조건을 기록함
- Copy Gate: defined — 메시지 맵·금지 주장·CTA 계약을 구현 게이트로 정의함
- Design Gate: defined — Hero 정체성·가치·CTA·다음 섹션 힌트를 구현 게이트로 정의함
- Browser Gate: partial — 프리미엄 홈 랜딩은 feature 이력에서 검증됐지만 `/discover/*`는 구현 전이므로 미검증
- Technical Gate: defined — 정적 생성, sitemap, canonical, 구조화 데이터, 이벤트 검증 기준을 정의함
- Fix Gate: partial — 랜딩 계약 16/16 통과, 컨설팅 묶음 73/75로 제한; 검색 route·sitemap·계측 gap도 미해결

### Current Status

`implementation-ready plan — canary contract defined, discovery code still open`

### Next Action

`B-00 기준선을 생성한 뒤 PR-1의 types.ts와 D-AI-SIM fixture를 구현한다.`

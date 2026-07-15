# HairFit 검색·전환 벤치마킹 문서

- 작성일: 2026-07-15
- 기준 브랜치: `dev/2026-07-15-search-benchmark-docs`
- 기준 커밋: `819c675a2d9aeec996540a6e0461fc599f37cc6f`

## 문서 목적

이 문서 묶음은 경쟁 서비스의 공개 페이지에서 관찰한 검색 유입, 즉시 체험, 신뢰, 내부 링크, 전환 구조를 HairFit의 실제 Next.js·Supabase·헤어 카탈로그 구조에 적용하기 위한 설계 기준이다.

- [아키텍처](./architecture.md): 벤치마킹 데이터, 목표 시스템 구조, 데이터 모델, 라우트와 컴포넌트 경계
- [아티팩트 정의](./artifact-specification.md): 단계별 필수 산출물, 스키마, 책임, 검증 기준, 완료 게이트

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

`audit -> plan`

### User Goal

경쟁 서비스의 구체적인 공개 아키텍처를 벤치마킹하고, 수집한 데이터를 HairFit에 적용할 수 있는 아키텍처 문서와 아티팩트 정의 문서를 작성한다.

### Assumptions

| ID | 가정 | 위험 | 확인 필요 |
| --- | --- | --- | --- |
| AS-01 | 1차 목적은 비브랜드 검색 노출과 B2C 체험 시작률 개선이다. | B2B 우선순위가 더 높으면 페이지 순서가 달라진다. | 구현 시작 전 제품 책임자 확인 |
| AS-02 | 홈의 3×3 데모 자산은 공개 마케팅에 사용할 권리가 확보되어 있다. | 권리 미확보 시 샘플 전체를 교체해야 한다. | 자산 매니페스트 승인 필요 |
| AS-03 | 기존 `/workspace`가 기본 전환 목적지이며 생성·결제 계약은 유지한다. | 진입점 통합 작업과 충돌할 수 있다. | 구현 브랜치 시작 전 현재 계약 재확인 |
| AS-04 | 초기 계측 저장소는 Supabase로 시작하고, 트래픽 증가 시 별도 분석 저장소로 교체할 수 있다. | 이벤트 증가가 운영 DB 비용에 영향을 줄 수 있다. | 보존기간·샘플링 승인 필요 |

### Work Queue

| ID | Phase | Task | Exit Condition | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| W-01 | intake | 경쟁사 공개 페이지와 HairFit 현재 구조 조사 | 관찰·주장·추정이 구분됨 | 아키텍처 2장 | complete |
| W-02 | plan | 목표 검색·전환 아키텍처 정의 | 라우트, 데이터, 컴포넌트, 계측 경계가 연결됨 | 아키텍처 4~11장 | complete |
| W-03 | plan | 구현 아티팩트와 게이트 정의 | 모든 Phase에 입력·출력·완료조건이 있음 | 아티팩트 정의서 | complete |
| W-04 | inspect | 문서 교차검증 | 링크·경로·ID·범위 불일치 없음 | Markdown link·fence·ID 검사 | complete |

### Acceptance Gates

- Agentic Operation Gate: passed — 이 Run Packet과 완료 조건을 기록함
- Copy Gate: defined — 메시지 맵·금지 주장·CTA 계약을 구현 게이트로 정의함
- Design Gate: defined — Hero 정체성·가치·CTA·다음 섹션 힌트를 구현 게이트로 정의함
- Browser Gate: limited — 공개 페이지는 읽기 전용 콘텐츠로 조사했으며 구현 스크린샷 검증은 아직 대상이 아님
- Technical Gate: defined — 정적 생성, sitemap, canonical, 구조화 데이터, 이벤트 검증 기준을 정의함
- Fix Gate: pending implementation — 기준선과 구현 전후 증거가 생긴 뒤 판정함

### Current Status

`complete — documentation scope only`

### Next Action

`B-00 현재 검색·퍼널 기준선 패킷을 생성한다.`

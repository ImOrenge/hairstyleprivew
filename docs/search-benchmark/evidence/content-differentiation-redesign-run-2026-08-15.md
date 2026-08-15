# 검색 유입 페이지 콘텐츠 차별화 재설계 실행 기록

## Agentic Landing Page Run Packet

### Mode

`redesign`

### User Goal

7개 검색 유입 페이지가 같은 템플릿과 얕은 설명을 반복하지 않고, 검색 의도별로 실제 결정을 돕는 충분한 콘텐츠를 제공하도록 재구현한다.

### Known Context

- 제품: HairFit AI 헤어 컨설팅
- 전환: `/consulting/new`
- 대상: 헤어 변화를 탐색하거나 미용실 상담을 준비하는 방문자
- 기술 대상: Next.js App Router의 정적 `/discover/[slug]` 페이지
- 유지 계약: 7개 정적 경로, canonical, FAQ JSON-LD, 3개 CTA, 9개 비교 이미지, 금지 표현, 결과 한계 고지

### Assumptions

| ID | Assumption | Risk | Confirmation Needed |
| --- | --- | --- | --- |
| A-01 | 주 전환은 프라이빗 AI 컨설팅 시작으로 유지한다. | 낮음 | 아니요 |
| A-02 | 기존 승인 synthetic continuity 자산은 유지하되 배열과 읽는 방법을 의도별로 다르게 한다. | 중간 | 새 전용 이미지 제작 시 필요 |
| A-03 | 시술 가능성과 결과는 현장 전문가 판단이 필요하다는 신뢰 경계를 유지한다. | 낮음 | 아니요 |

### Baseline Findings

| ID | Priority | Area | Finding | Evidence | Fix |
| --- | --- | --- | --- | --- | --- |
| CDR-01 | P1 | copy | 7개 페이지가 동일한 섹션 순서를 사용해 제목 외 차별화가 약했다. | 모든 페이지가 `workflow > proof > trust > related > faq` 순서를 공유 | 페이지별 slot 순서를 별도 계약으로 정의 |
| CDR-02 | P1 | product evidence | 여성·앞머리·단발 페이지가 동일한 9개 이미지를 동일한 3열 보드로 표시했다. | `femaleClassic` continuity set 공유 | length chapters, fringe baseline, cut ladder로 읽는 구조 분리 |
| CDR-03 | P1 | conversion | 공통 PRODUCT CONTRACT 수치가 검색 질문의 실제 결정에 충분히 답하지 못했다. | 5개 proof 항목 중 4개가 전 페이지 공통 | 관찰표·그루밍 계획·길이 비용·리스크·브리프 문서로 대체 |
| CDR-04 | P2 | information architecture | 고유 아티팩트가 한 구역에만 있어 전체 체감은 공통 템플릿에 가까웠다. | hero, sample, workflow, trust, FAQ가 동일 컴포지션 | 페이지마다 전용 경험 2개와 고유 sample layout 배치 |

### Page Message Map

| Page | Search job | Dedicated decision experience | Sample treatment |
| --- | --- | --- | --- |
| AI 시뮬레이션 | 9개 후보에서 이유 있는 3개를 고르기 | 후보 점수표 + shortlist 규칙 | direction matrix |
| 얼굴형 | 얼굴형 라벨 없이 관찰 근거 찾기 | 4축 관찰표 + silhouette pairing | observation rails |
| 남자 헤어 | 손질 시간과 커트 주기로 후보 고르기 | morning routine + barber brief | grooming schedule |
| 여자 헤어 | 길이 변화가 생활에 주는 비용 비교 | length cost + change budget | length chapters |
| 앞머리 | 자르기 전 되돌림 위험 확인 | four gates + return timeline | fringe baseline |
| 단발 | 실제 커트 끝선과 기르는 경로 결정 | cut line ruler + grow-out plan | cut ladder |
| 미용실 상담 | 사진과 선택 이유를 상담 문서로 전달 | brief preview + conversation flow | salon shortlist |

### Work Queue

| ID | Phase | Task | Exit Condition | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| W-01 | inspect | 공통 템플릿·자산 중복 확인 | 반복 원인과 영향 범위 기록 | CDR-01~04 | complete |
| W-02 | produce | 7종 고유 IA와 전용 결정 경험 구현 | 모든 페이지에 고유 experience/layout ID 존재 | `DiscoveryIntentExperience.tsx`, `discoveryLayouts` | complete |
| W-03 | produce | 의도별 샘플 구성과 반응형 CSS 구현 | 7개 sample layout이 서로 다름 | `data-sample-layout`, CSS variants | complete |
| W-04 | verify | 계약·타입·린트·빌드·브라우저 검증 | 모든 필수 검증 통과 | 아래 Acceptance Gates | complete |

### Acceptance Gates

- Agentic Operation Gate: 이 실행 기록에 모드, 가정, 작업 큐, 증거와 다음 액션을 기록했다.
- Copy Gate: 7개 검색 job마다 문제, 결정 기준, 신뢰 경계와 CTA를 연결했다.
- Design Gate: 공통 브랜드 토큰을 유지하면서 7개 고유 IA와 sample treatment를 제공한다.
- Browser Gate: 390px·1440px 전 페이지 overflow, 360/390/768/1440 canary, 대표 데스크톱·모바일 시각 검증을 통과했다.
- Technical Gate: 계약 13/13, 타입검사, 범위 린트, 프로덕션 빌드, Playwright 39/39를 통과했다.
- Fix Gate: 단일 공통 구조에서 7개 고유 layout·experience·sample treatment 계약으로 변경했다.

### Current Status

`complete`

### Next Action

검증된 로컬 커밋과 페이지 URL을 사용자에게 전달한다.

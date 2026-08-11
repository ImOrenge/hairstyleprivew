# HairFit V2 상담 인터뷰형 입력 개선 계획

- 작성일: 2026-08-11
- 작업 브랜치: `feat/2026-08-08-hairfit-v2-backend`
- 통합 대상: `develop/2026-08-08-hairfit-v2-backend`
- 문서 상태: 구현 계획
- 대상 Scene: `01 Discovery`, `11 Fashion`의 방향 설정 구간
- 제품 경계: 11개 lifecycle Scene은 유지하고 인터뷰는 Scene 내부의 입력 표현 방식으로만 사용한다.
- 시각 경계: 기존 공개 토큰·타이포그래피·표면 스타일을 유지하고 새 스타일은 `.f-consulting-interview-*` scoped namespace에만 추가한다.
- 검증 경계: Docker는 요구하지 않으며 실인증·라이브 AI·원격 migration·배포는 별도 승인 없이 완료로 주장하지 않는다. 유료 생성 여부 확인은 인터뷰 범위와 종료조건에서 제외한다.

> 통합 실행 안내: 이 문서의 인터뷰 상세와 구 엔진 리사이클링을 함께 완수하는 Phase 순서·종합 종료조건은 `hairfit-v2-engine-recycling-interview-completion-goal-2026-08-11.md`를 따른다.

## 1. 결정

Discovery와 Fashion 방향 설정을 단독 인터뷰 레이아웃으로 전환한다.

인터뷰는 질문을 한 번에 하나의 의미 단위로 보여주는 점진적 입력 UI다. 그러나 상담 전체를 순번으로 잠그는 Wizard 상태 모델은 도입하지 않는다. `currentStep`, `stepIndex`, 공통 Next, 완료하지 않은 앞 질문 때문에 모든 뒤 질문을 잠그는 구조를 만들지 않는다.

권장 판정은 다음과 같다.

| 적용 범위 | 판정 | 이유 |
|---|---|---|
| Discovery 내부 인터뷰 | 채택 | 많은 필드를 목적과 맥락에 맞게 나누고 충돌 질문을 적응적으로 제시할 수 있다. |
| Fashion 방향 인터뷰 | 채택 | 추상적인 상황·장르·핏·노출·예산·회피 조건을 선택한 헤어·컬러와 연결해 설명할 수 있다. |
| 11개 상담 전체 Wizard | 금지 | lifecycle capability, 직접 URL, 병렬 개방, 자동 진행 계약을 다시 순차 단계로 퇴행시킨다. |
| 질문마다 공통 Next | 금지 | 수동 클릭과 완료 피로를 늘리고 기존 능동형 UX 계약을 위반한다. |

## 2. 현재 문제

### 2.1 Discovery

현재 `DiscoveryWorkbench.tsx`는 한 화면에서 다음 내용을 모두 받는다.

- 상담 목적과 원하는 변화
- 현재 모발 설명
- 길이, 형태, 양, 굵기, 손상
- 최근 시술 이력
- 고려 중인 시술과 가능한 시술
- 관리 강도, 아침 시간, 열기구, 방문 주기
- 변화 강도, 회피 조건, 추가 메모

데이터 계약은 충분하지만 사용자는 어떤 답이 추천과 생성에 영향을 주는지 이해하기 전에 많은 선택지를 동시에 처리해야 한다. 모바일에서는 설문 길이가 길어지고, 충돌 안내는 모든 선택을 마친 뒤에야 눈에 들어오기 쉽다.

### 2.2 Fashion

현재 `FashionBatchWorkbench.tsx`의 방향 설정은 계절, 핏, 노출, 예산, 회피 아이템 등을 직접 입력한다. 사용자는 이미 확정된 헤어, 퍼스널 컬러, Discovery의 변화 강도와 관리 조건을 가지고 있지만 이 연결을 화면에서 충분히 안내받지 못한다.

방향 입력 이후 추천과 9개 생성이 이어지므로 입력 구간까지 다단계 폼처럼 보이면 Fashion 전체가 또 하나의 하위 마법사로 느껴질 위험이 있다.

## 3. 제품 원칙

1. **질문보다 이해가 먼저다.** 저장된 헤어·컬러·사용자 조건을 먼저 요약하고 부족한 내용만 질문한다.
2. **순번이 아니라 정보 충족도다.** `3/10 단계` 대신 `상담 기준 4/6 정리됨`을 표시한다.
3. **선택 즉시 저장한다.** 단일 선택은 별도 Next 없이 반영하고 다음 미충족 주제를 보여준다.
4. **필요한 확인만 남긴다.** 복수 선택 완료와 최종 방향 확인만 명시적 CTA를 사용한다. 유료 생성 여부는 묻지 않는다.
5. **모름을 허용한다.** 분석 가능한 항목은 `잘 모르겠어요`를 제공하고 사진 분석 뒤 근거와 함께 보완한다.
6. **충돌만 추가 질문한다.** 모든 사용자에게 같은 후속 설문을 강제하지 않는다.
7. **언제든 전체 내용을 볼 수 있다.** 인터뷰 도중 `전체 답변 보기·수정`을 제공한다.
8. **사용자를 가두지 않는다.** 저장 상태, 상담 나가기, 새로고침·재진입 복구를 항상 제공한다.
9. **AI는 구조를 지배하지 않는다.** 필수 질문·분기·완료 조건은 deterministic rule이 결정한다.
10. **기존 lifecycle을 유지한다.** 인터뷰 화면은 새 Scene, 새 완료 단계, 새 공통 navigation이 아니다.

## 4. 목표 사용자 흐름

### 4.1 Discovery Interview

```text
Discovery 진입
  -> 인터뷰 목적·예상 소요 안내
  -> 저장된 프로필이 있으면 확인·재사용
  -> 목적과 원하는 변화
  -> 현재 모발·손상·시술 이력
  -> 가능한 시술 범위
  -> 관리 현실성
  -> 회피·안전 조건
  -> 필요한 충돌 질문만 추가
  -> 전체 상담 기준 요약
  -> "이 기준으로 사진 준비"
  -> 서버 snapshot 저장
  -> Photo Scene 직접 이동
```

단일 선택은 선택 후 250~400ms 안에 다음 질문으로 전환한다. 이 지연은 선택 상태 인지를 위한 것이며 서버 응답을 가장하는 로딩 연출로 사용하지 않는다. 복수 선택과 자유 입력은 사용자가 완료 의사를 표시한다.

### 4.2 Fashion Direction Interview

```text
Fashion 진입
  -> 선택 헤어·퍼스널 컬러·기존 선호 요약
  -> 착용 상황
  -> 원하는 인상·장르
  -> 핏과 편안함
  -> 노출·넥라인 범위
  -> 계절·기후
  -> 예산과 회피 아이템
  -> 필요한 충돌 질문만 추가
  -> "헤어와 연결한 패션 방향" 요약
  -> "이 방향으로 추천 준비"
  -> entitlement 자동 검증
  -> entitlement가 있으면 서버 9-slot batch 실행
  -> 없으면 기존 상품 구매 경로 안내·인터뷰 답변 보존
```

인터뷰는 방향 확인까지만 담당한다. 유료 생성 여부를 묻거나 별도 금액 확인 CTA를 노출하지 않는다. 서버는 기존 entitlement를 자동 검증하고 권리가 있으면 batch를 접수한다. 권리가 없으면 기존 상품 구매 경로로 안내하되 인터뷰 답변을 보존하며 자동 차감하지 않는다.

## 5. 질문 설계

### 5.1 Discovery 주제

| Topic ID | 사용자 질문 | 저장 필드 | 입력 방식 | 자동 진행 |
|---|---|---|---|---|
| `discovery-purpose` | 이번 상담에서 가장 바꾸고 싶은 것은 무엇인가요? | `purpose` | 단일 선택 | 예 |
| `discovery-goals` | 어떤 인상과 결과를 원하나요? | `goals` | 복수 선택 | 완료 CTA |
| `discovery-current-hair` | 지금 모발 상태를 알려주세요. | `currentHair`, 길이·양·굵기·형태 | 혼합 | 완료 CTA |
| `discovery-history` | 최근 시술과 손상 상태는 어떤가요? | `treatmentHistory`, `damageLevel` | 복수+단일 | 완료 CTA |
| `discovery-services` | 원하는 시술과 실제 가능한 범위는 어디까지인가요? | `desiredServices`, `allowedServices` | 복수 선택 | 완료 CTA |
| `discovery-maintenance` | 아침과 미용실에서 어느 정도 관리할 수 있나요? | 관리 강도·시간·열기구·방문 주기 | 혼합 | 완료 CTA |
| `discovery-change` | 변화 강도와 피하고 싶은 것을 정리해볼게요. | `changeLevel`, `avoid`, `notes` | 혼합 | 완료 CTA |

다음 항목에는 `잘 모르겠어요`를 허용한다.

- 모발 양
- 모발 굵기
- 손상 정도
- 가능한 시술 범위

`잘 모르겠어요`는 임의 기본값으로 변환하지 않는다. `unknown` provenance를 유지하고 Photo/Analysis에서 관찰 가능한 내용만 보완한다. 시술 안전성처럼 사진만으로 확정할 수 없는 항목은 미용실 재확인 blocker로 남긴다.

### 5.2 Fashion 주제

| Topic ID | 사용자 질문 | 저장 필드 | 입력 방식 | 자동 진행 |
|---|---|---|---|---|
| `fashion-context` | 가장 먼저 필요한 룩은 어디에서 입을 예정인가요? | `situation` | 단일 선택 | 예 |
| `fashion-impression` | 어떤 분위기와 인상을 우선할까요? | `genre` | 단일+추천 | 예 |
| `fashion-fit` | 어떤 핏이 가장 편한가요? | `fit` | 단일 선택 | 예 |
| `fashion-exposure` | 원하는 노출과 넥라인 범위는 어디까지인가요? | `exposure` | 단일 선택 | 예 |
| `fashion-season` | 어느 계절과 환경을 기준으로 할까요? | `season` | 단일 선택 | 예 |
| `fashion-budget` | 한 착장에 고려할 예산 범위가 있나요? | `budget` | 범위·자유 입력 | 완료 CTA |
| `fashion-avoid` | 입지 않는 색상이나 아이템이 있나요? | `avoidItems` | 복수+자유 입력 | 완료 CTA |

Fashion은 다음 내용을 다시 질문하지 않는다.

- `SelectedStyleSnapshotV2`의 헤어스타일과 컬러
- 현재 consultation의 `PersonalColorEvidenceV2`
- Discovery의 변화 강도와 회피 조건
- 이미 저장된 body profile과 이전 Fashion 방향

출처가 없거나 신뢰도가 낮을 때만 `확인 필요`로 질문한다. AI가 없는 값을 알고 있는 것처럼 채우지 않는다.

## 6. 적응형 분기 규칙

분기는 서버와 공유 가능한 순수 규칙으로 정의한다.

| 조건 | 후속 질문·행동 |
|---|---|
| 과감한 변화 + 낮은 관리 강도 | 커트 실루엣 우선, 시술 변화 우선, 관리 부담 완화 중 하나를 확인 |
| 원하는 시술이 허용 범위 밖 | 허용 범위 수정 또는 해당 시술 제외를 확인 |
| 높은 손상 + 탈색·강한 펌 희망 | 안전 우선 blocker와 미용실 재확인 표시 |
| 짧은 앞머리 회피 + fringe 강조 목표 | 앞머리 대신 가르마·페이스라인 대안을 제안 |
| Fashion bold exposure + Discovery의 노출 회피 | 현재 상담에 적용할 우선 조건 확인 |
| 낮은 예산 + statement 중심 | 핵심 아이템 1개 중심 또는 기존 옷 활용 방향 확인 |
| Personal Color 신뢰도 낮음 | 팔레트를 확정값이 아닌 참고 범위로 표시 |

한 충돌에는 최대 한 개의 후속 질문을 노출한다. 해결되지 않은 충돌은 질문 반복 대신 summary의 `확인 필요` 목록으로 보낸다.

## 7. AI 역할과 안전 경계

### 허용

- 자유 입력을 구조화 후보로 제안
- 저장된 답변을 짧은 상담 문장으로 요약
- deterministic rule이 허용한 후속 질문 후보 중 표현 선택
- 선택 헤어·퍼스널 컬러·Fashion 방향의 연결 이유 설명
- 사용자가 수정할 수 있는 최종 요약 초안 생성

### 금지

- 필수 질문 목록과 완료 조건을 자유롭게 변경
- 답하지 않은 필드를 임의 확정
- 사진 분석 전 모발·얼굴·컬러를 관찰한 것처럼 표현
- 손상·시술 가능성을 의료·전문 시술 판단처럼 단정
- 인터뷰 답변을 prompt instruction으로 직접 승격
- entitlement가 없는데 생성·차감을 자동 실행
- AI 응답 실패를 인터뷰 완료로 위장

AI 요약이 실패해도 normalized answer와 lifecycle 진행은 유지한다. 자유 입력은 길이와 제어문자를 정규화하고 untrusted data 경계로 prompt compiler에 전달한다.

## 8. 데이터 계약

기존 도메인 출력은 유지한다.

- Discovery 결과: `ConsultationInputProfile`
- Fashion 결과: `FashionDirectionSnapshot`

인터뷰 표현을 위해 additive한 공통 draft metadata만 추가한다.

```ts
type ConsultationInterviewKind = "discovery" | "fashion-direction";

type ConsultationInterviewTopic =
  | "purpose"
  | "goals"
  | "current-hair"
  | "history"
  | "services"
  | "maintenance"
  | "change-and-avoid"
  | "fashion-context"
  | "fashion-impression"
  | "fashion-fit"
  | "fashion-exposure"
  | "fashion-season"
  | "fashion-budget"
  | "fashion-avoid";

interface ConsultationInterviewDraft {
  kind: ConsultationInterviewKind;
  schemaVersion: number;
  answeredTopics: ConsultationInterviewTopic[];
  skippedTopics: ConsultationInterviewTopic[];
  conflictIds: string[];
  summaryRevision: number;
  confirmedAt: string | null;
  lastSavedAt: string;
}
```

다음 값은 저장하지 않는다.

- `currentStep`
- `nextStep`
- 질문 배열의 현재 index
- 전체 AI 대화 transcript
- provider prompt 또는 내부 chain-of-thought

재진입 시 다음 질문은 normalized domain data, `answeredTopics`, unresolved conflict에서 다시 계산한다. 표시 중인 question ID와 focus 상태는 UI draft로만 유지할 수 있다.

각 답변 저장은 기존 consultation `expectedVersion`과 409 conflict 복구 계약을 따른다. 다른 탭이나 기기에서 새 snapshot이 저장되면 현재 미저장 입력을 덮어쓰지 않고 최신 서버 답변과 비교한 뒤 재적용 여부를 묻는다.

## 9. 컴포넌트 아키텍처

이번 변경은 `behavioral + style-contract` gate다. 질문 전환, 자동 저장, focus, 제출, exit/resume 동작과 새 CSS namespace가 모두 검증 대상이다.

| Component | Kind | 초기 상태 | 책임 | 금지 |
|---|---|---|---|---|
| `ConsultationInterviewShell` | layout | candidate | 단독 레이아웃, header, summary drawer, footer action, exit host | 질문 분기·API 호출 |
| `InterviewQuestionRenderer` | feature | candidate | question schema를 기존 primitive와 `ChoiceGroup`에 연결 | lifecycle 이동 결정 |
| `InterviewCoverageIndicator` | data-display | candidate | 정보 충족도와 확인 필요 수 표시 | 고정 step count |
| `InterviewSummaryDrawer` | data-display | candidate | 전체 답변 보기·수정, 출처·충돌 표시 | domain 값 재계산 |
| `InterviewSaveStatus` | feedback | candidate | 저장 중·저장됨·오프라인·충돌 상태 | 자체 polling |
| `DiscoveryInterview` | feature | experimental | Discovery 질문 schema, branching adapter, 최종 profile | Fashion 질문 소유 |
| `FashionDirectionInterview` | feature | experimental | Fashion 질문 schema, 기존 snapshot prefill, direction 확인 | 견적 승인·9개 생성 실행 |

공용 shell은 `ConsultationInputProfile`이나 `FashionDirectionSnapshot`을 import하지 않는다. 도메인 wrapper가 question schema, normalized value, validation과 mutation adapter를 전달한다.

권장 공개 API:

```ts
interface ConsultationInterviewShellProps {
  title: string;
  description: string;
  coverage: { completed: number; total: number; conflicts: number };
  saveState: "idle" | "saving" | "saved" | "offline" | "conflict";
  summaryOpen: boolean;
  onSummaryOpenChange(open: boolean): void;
  onExitRequest(): void;
  children: React.ReactNode;
  summary: React.ReactNode;
  footer?: React.ReactNode;
}
```

`InterviewQuestionRenderer`는 `single-choice`, `multi-choice`, `text`, `number-range`, `compound` variant를 지원한다. 실제 입력 primitive와 label, error, keyboard semantics는 기존 UI 계약을 재사용한다.

## 10. 레이아웃과 CSS 계약

### Desktop

- Scene identity보다 인터뷰 질문의 가시 영역을 우선한다.
- question body는 중앙의 읽기 가능한 폭으로 제한한다.
- 지금까지의 답변은 우측 고정 panel이 아니라 열고 닫는 summary drawer로 제공한다.
- 저장 상태와 상담 나가기는 항상 접근 가능해야 한다.

### Mobile

- 질문, 선택지, 도움말, action 순서의 단일 column을 사용한다.
- footer action은 safe area와 키보드를 침범하지 않는다.
- summary는 bottom sheet 또는 전체 화면 dialog로 제공한다.
- 화면 전환 뒤 heading으로 focus를 이동하고 이전 질문으로 돌아오면 마지막 선택으로 복원한다.

### CSS namespace

```text
.f-consulting-interview
.f-consulting-interview__header
.f-consulting-interview__coverage
.f-consulting-interview__question
.f-consulting-interview__choices
.f-consulting-interview__summary
.f-consulting-interview__footer
.f-consulting-interview[data-kind="discovery"]
.f-consulting-interview[data-kind="fashion-direction"]
.f-consulting-interview[data-save-state="conflict"]
```

- 색상, border, radius, shadow, type, spacing은 기존 `--app-*` 토큰을 사용한다.
- 전역 reset과 기존 Scene selector specificity를 변경하지 않는다.
- inline style은 runtime coverage나 측정값을 전달하는 제한된 CSS custom property에만 허용한다.
- 질문 전환은 opacity와 작은 translate만 사용하고 reduced motion에서는 즉시 교체한다.
- 공용 Scene의 `.f-consulting-input-control` 계약을 제거하지 않는다. 기존 폼 fallback에서 계속 사용할 수 있어야 한다.

## 11. 저장·이탈·재진입

- 단일 선택은 선택 즉시 optimistic UI를 적용하고 versioned mutation을 실행한다.
- 복수 선택·자유 입력은 질문 완료 시 저장하며 500~800ms debounce draft 저장을 선택적으로 사용할 수 있다.
- 저장 실패를 성공으로 표시하지 않는다.
- 오프라인이면 현재 브라우저 draft와 마지막 서버 저장 시각을 구분한다.
- 사용자가 상담을 나가면 저장된 답변은 유지되고 `/home`에서 상담 재개 CTA를 제공한다.
- 미저장 자유 입력이 있으면 exit dialog에서 폐기 가능성을 명시한다.
- 재진입 시 이미 충족된 주제를 다시 묻지 않고 첫 미충족 또는 unresolved conflict로 복원한다.
- 인터뷰 완료 후에도 summary에서 방향을 수정할 수 있다.
- Fashion 생성 접수 이후 방향 수정은 기존 batch를 변형하지 않고 새 revision·새 batch 필요성을 먼저 알린다.

## 12. CTA 계약

### 사용 가능

- `복수 선택 완료`
- `답변 저장`
- `전체 답변 보기`
- `이 기준으로 사진 준비`
- `이 방향으로 추천 준비`
- `이 방향으로 9개 룩 준비`
- `상담 나가기`

### 금지

- 모든 질문의 `다음`
- `1단계 완료`, `2단계 잠금 해제`
- `Discovery Wizard`, `Fashion Wizard`
- AI 요약 완료를 기다리기 위한 확인 CTA
- 유료 생성 여부를 다시 묻는 확인 CTA
- 질문을 건너뛰었는데 완료로 표시하는 CTA

## 13. 접근성 계약

- 현재 질문은 하나의 `h1` 또는 Scene 내부의 유일한 질문 heading으로 제공한다.
- 질문 변경 시 heading으로 focus를 이동한다.
- 선택 변경 자체는 과도하게 `aria-live`로 읽지 않는다.
- 저장 실패, conflict, 최종 summary 준비만 `aria-live="polite"`로 알린다.
- 단일 선택은 radio group, 복수 선택은 checkbox semantics를 사용한다.
- Enter는 자유 입력 제출에 사용할 수 있지만 IME 조합 중에는 제출하지 않는다.
- Escape는 summary drawer를 먼저 닫고, 닫힌 상태에서 상담 exit를 자동 실행하지 않는다.
- 키보드만으로 질문 선택, 이전 답변, summary 수정, 최종 확인이 가능해야 한다.
- 200% text zoom, 390px viewport, reduced motion, screen reader reading order를 검증한다.

## 14. 분석 지표

이벤트에는 답변 원문, 얼굴·사진 ID, prompt, provider payload를 넣지 않는다.

```text
consultation_interview_opened
consultation_interview_topic_visible
consultation_interview_topic_answered
consultation_interview_topic_skipped
consultation_interview_conflict_shown
consultation_interview_summary_opened
consultation_interview_confirmed
consultation_interview_exited
consultation_interview_resumed
consultation_interview_save_failed
```

관찰 지표:

- 인터뷰 시작→확정 시간
- 주제별 이탈률
- `잘 모르겠어요` 선택률
- conflict 노출·해결률
- summary 수정률
- 기존 전체 폼 대비 완료율
- 완료 후 Direction/Fashion 수정률
- Fashion 방향 확인→entitlement 확인→batch 접수율
- 저장 실패·409 conflict·재진입 복구율

초기 가설은 Discovery 중앙값 90초 이하, 기존 대비 이탈률 감소, 질문당 불필요 Next 0회다. 이는 출시 전 보장값이 아니라 canary에서 검증할 제품 가설이다.

## 15. 구현 순서

### P0. 계약 동결

- `ConsultationInputProfile`과 `FashionDirectionSnapshot` 출력 불변 확인
- 질문 topic, required/optional, `unknown`, conflict rule schema 정의
- 현재 prompt compiler와 generation input regression fixture 확보
- feature flag와 rollback 계약 확정

종료조건:

- 인터뷰 OFF에서 기존 Discovery/Fashion 입력이 그대로 동작한다.
- 질문 schema가 `currentStep`이나 route sequence를 포함하지 않는다.

### P1. 공용 인터뷰 프레임

- `ConsultationInterviewShell`
- `InterviewCoverageIndicator`
- `InterviewSummaryDrawer`
- `InterviewSaveStatus`
- component passport와 registry candidate 등록
- `.f-consulting-interview-*` CSS 계약 추가

종료조건:

- domain import 없이 fixture question을 렌더링한다.
- keyboard, focus, drawer, exit, reduced motion interaction test가 통과한다.

### P2. Discovery adapter

- 기존 필드를 7개 topic schema로 매핑
- 자동 저장과 409 conflict 복구
- unknown·충돌 질문·전체 summary
- 완료 시 `ConsultationInputProfile` 저장과 Photo 직접 이동
- 기존 `DiscoveryWorkbench`는 flag OFF fallback으로 유지

종료조건:

- 기존 prompt input과 동일하거나 명시적으로 versioned된 normalized 결과를 만든다.
- 단일 선택 질문에 공통 Next가 없다.

### P3. Fashion adapter

- 선택 헤어·퍼스널 컬러·Discovery 데이터 prefill
- 7개 Fashion topic과 conflict rule
- `FashionDirectionSnapshot` 저장
- 방향 확인 후 entitlement 자동 검증과 9개 추천·batch 접수
- entitlement가 없으면 기존 상품 구매 경로로 이동하고 답변 보존

종료조건:

- 이미 저장된 정보를 반복 질문하지 않는다.
- 방향 확인만으로 비용이 소비되지 않는다.

### P4. 재진입과 lifecycle 연결

- exit/resume
- server coverage 복원
- stale snapshot conflict
- Fashion 생성 접수 후 방향 수정 revision
- stage map에서 Interview를 새 Scene으로 노출하지 않음

종료조건:

- 새로고침·다른 기기 재진입에서 첫 미충족 주제로 복구한다.
- `recommendedStage`, `allowedStages`, `activeTasks` 계약이 유지된다.

### P5. 브라우저·접근성 검증

- desktop·tablet·390px
- keyboard·screen reader semantics·200% zoom
- reduced motion
- offline·409·exit/resume
- Discovery 완료→Photo 자동 이동
- Fashion 완료→entitlement 검증→batch 자동 접수
- 기존 전체 폼 flag OFF 회귀

### P6. Canary와 점진 활성화

- Discovery 5% → 25% → 100%
- Fashion은 Discovery와 별도 flag로 5% → 25% → 100%
- 완료율, 시간, summary 수정률, conflict 해결률 관찰
- 회귀 시 UI flag만 OFF하고 normalized domain data는 보존

## 16. Feature flag와 롤백

```text
CONSULTATION_DISCOVERY_INTERVIEW_ENABLED
CONSULTATION_FASHION_INTERVIEW_ENABLED
CONSULTATION_INTERVIEW_AI_SUMMARY_ENABLED
```

- Discovery와 Fashion flag는 독립적으로 끌 수 있어야 한다.
- AI summary flag OFF에서도 deterministic 질문과 summary가 동작한다.
- rollback은 기존 Workbench 폼을 다시 표시하며 저장된 `ConsultationInputProfile`, `FashionDirectionSnapshot`을 그대로 읽는다.
- 인터뷰 metadata는 additive로 남기고 rollback 과정에서 삭제하지 않는다.
- 진행 중 Fashion batch는 UI rollback과 무관하게 완료·소비 복구한다.

## 17. 테스트 계획

### 단위·계약

- topic coverage 계산
- single choice 자동 진행
- multi choice 완료 조건
- required/optional/unknown 처리
- conflict rule과 최대 한 번의 후속 질문
- 기존 profile/direction normalization parity
- prompt injection 경계
- AI summary 실패 fallback
- entitlement가 없을 때 생성·소비 없음

### 컴포넌트

- public props와 slot 계약
- heading focus
- radio/checkbox semantics
- summary drawer focus trap·return·Escape
- save state와 conflict feedback
- exit dialog와 미저장 draft 안내
- reduced motion

### 브라우저

1. 새 Discovery → 인터뷰 → summary → Photo 직접 이동
2. 기존 Discovery snapshot → 충족 질문 생략 → 수정 → 저장
3. unknown 답변 → Analysis 보완·미용실 확인 구분
4. 관리·시술 충돌 → 한 번의 후속 질문 → summary blocker
5. 새로고침·상담 나가기·재진입
6. 409 conflict 후 최신 snapshot 비교·복구
7. Fashion 진입 → 헤어·컬러 prefill → 방향 summary
8. 방향 확인 전 generation 호출 0회
9. 방향 확인 → entitlement 검증 → 9-slot batch 자동 접수
10. 접수 후 방향 수정 → 기존 batch 불변·새 revision 안내
11. flag OFF 기존 Discovery/Fashion 폼 회귀
12. 390px·768px·desktop keyboard/a11y/reduced-motion

## 18. 완료 조건

- [ ] Discovery와 Fashion 인터뷰는 단독 레이아웃을 사용한다.
- [ ] 11개 Scene과 lifecycle navigation은 유지된다.
- [ ] `currentStep`, step lock, 질문별 공통 Next가 없다.
- [ ] 단일 선택은 자동 저장·자동 진행하고 복수·자유 입력만 완료 CTA를 사용한다.
- [ ] 기존 답변과 서버 snapshot을 우선해 중복 질문하지 않는다.
- [ ] Discovery는 `ConsultationInputProfile`을 완전하게 산출한다.
- [ ] Fashion은 `FashionDirectionSnapshot`을 완전하게 산출한다.
- [ ] AI 없이도 deterministic 질문·완료·summary가 동작한다.
- [ ] 유료 생성 확인 없이 방향 확인과 entitlement 검증으로 batch가 접수된다.
- [ ] 사용자가 나가도 저장된 답변이 유지되고 재진입 시 복구된다.
- [ ] unknown, conflict, offline, 409, AI 실패가 완료로 위장되지 않는다.
- [ ] 기존 공개 CSS 토큰을 유지하고 새 스타일은 scoped namespace로 제한된다.
- [ ] component passport·registry·contract·browser·accessibility 검증이 통과한다.
- [ ] flag OFF rollback에서 기존 폼과 저장 데이터가 정상 동작한다.
- [ ] 실제 실행하지 않은 인증·AI·결제·원격 상태를 완료 증거로 표시하지 않는다.

## 19. 구현 골 프롬프트

```text
HairFit V2의 Discovery와 Fashion 방향 설정을 단독 인터뷰 레이아웃으로 개선한다. 인터뷰는 각 Scene 내부의 점진적 입력 표현일 뿐 새 Scene이나 순차 Wizard가 아니다. 11개 lifecycle URL, recommendedStage, allowedStages, activeTasks, 직접 URL과 자동 진행 계약을 유지하고 currentStep, stepIndex, 질문별 공통 Next를 도입하지 않는다.

Discovery는 목적, 목표, 현재 모발, 손상·시술 이력, 가능한 시술, 관리 현실성, 변화·회피 조건을 적응형 질문으로 받아 기존 ConsultationInputProfile을 완전하게 산출한다. Fashion은 확정 헤어, PersonalColorEvidenceV2, Discovery 조건과 기존 body profile을 먼저 재사용하고 상황, 인상, 핏, 노출, 계절, 예산, 회피 아이템 중 부족한 정보만 질문하여 FashionDirectionSnapshot을 산출한다. 단일 선택은 자동 저장·자동 진행하고 복수 선택·자유 입력·최종 summary에만 명시적 완료 행동을 둔다.

질문과 분기는 deterministic schema와 conflict rule이 결정한다. AI는 자유 입력 구조화와 요약 표현에만 사용하고 필수 질문, 완료 조건, 미응답 값을 임의 변경하지 않는다. 방향 확인 뒤 entitlement를 자동 검증하고 유료 생성 여부를 묻는 별도 확인 없이 서버가 9개 추천과 batch를 실행한다. entitlement가 없으면 기존 상품 구매 경로로 안내하되 인터뷰 답변을 보존하고 자동 차감하지 않는다.

공용 ConsultationInterviewShell, InterviewQuestionRenderer, InterviewCoverageIndicator, InterviewSummaryDrawer, InterviewSaveStatus를 domain-independent candidate component로 만들고 DiscoveryInterview와 FashionDirectionInterview가 도메인 adapter를 소유한다. behavioral + style-contract gate를 적용하고 component passport와 registry를 갱신한다. 기존 공개 CSS 토큰·타이포그래피·표면 스타일을 유지하고 .f-consulting-interview-* scoped namespace만 추가한다.

답변은 expectedVersion 기반 server snapshot에 자동 저장하고 새로고침, 상담 나가기, 재진입, offline, 409 conflict를 복구한다. 전체 transcript, provider prompt, currentStep은 저장하지 않는다. 모든 구현을 마친 마지막에 typecheck, lint, unit/contract, component passport/registry, CSS contract, production build, 12개 interview browser regression과 접근성 검증을 실행한다. Docker는 요구하지 않으며 실제 인증·라이브 AI·유료 결제·원격 migration·배포처럼 실행하지 않은 증거를 통과로 위장하지 않는다. 모든 완료 조건을 만족한 경우에만 골을 종료한다.
```

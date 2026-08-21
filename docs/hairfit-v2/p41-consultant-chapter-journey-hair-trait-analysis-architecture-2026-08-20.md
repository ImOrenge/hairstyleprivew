# P41 컨설턴트형 인터뷰·챕터 압축·모질 분석 아키텍처

- 기준일: 2026-08-20
- 상태: 구현 기준 문서
- 대상: HairFit V2 Web/Native 컨설팅 여정, 공유 계약, 분석 capability, PostgreSQL/Supabase 저장 계층
- 선행 계약: P25 공통 생성 입력, P40 메이크업 인터뷰·AI 근거, `ConsultationJourney`, `ConsultationInterviewDraft`, `AnalysisEvidenceV2`
- 비목표: 의료 진단, 탈모 판정, 실제 모발 직경·다공성·탄력 측정, 기존 CSS 시각 스타일 변경, 원격 migration·배포

구현 페이즈 문서:

1. [P43 Phase 01 — 컨설턴트형 인터뷰와 4챕터 여정 압축](./p43-phase-01-consultant-interview-chapter-compression-2026-08-20.md)
2. [P44 Phase 02 — 적응형 AI 진단과 모질 분석](./p44-phase-02-adaptive-ai-diagnosis-hair-trait-2026-08-20.md)
3. [P45 Phase 03 — 메이크업 진단 후 스타일 시뮬레이션](./p45-phase-03-makeup-style-simulation-2026-08-20.md)
4. [P46 — AI 주도 단일 헤어 결정·실상품 패션 개인화 아키텍처](./p46-ai-led-hair-commerce-fashion-personalization-architecture-2026-08-20.md)

P46은 이 문서의 Hair 후보 비교 고객 UX와 Fashion 9-slot 고정 완료조건을 후속 권위 계약으로 대체한다. 내부 stage, legacy deep link와 기존 snapshot 호환성은 유지한다.

## 1. 결정 요약

현재 고객에게 노출되는 15개 stage는 시스템 처리 단위와 고객 여정 단위가 섞여 있다. 내부 stage를 삭제하거나 합치면 생성 재시도, 중단·재개, 근거 추적, 결과 버전 연결이 약해진다. 따라서 다음처럼 계층을 분리한다.

1. 고객에게는 `상담 준비 → AI 진단 → 스타일 디자인 → 최종 리포트`의 4개 챕터만 노출한다.
2. 기존 15개 `ConsultationStage`는 서버 orchestration과 deep link 호환을 위해 유지한다.
3. 초기 Discovery 장문 인터뷰를 30초 이내의 `상담 목표 설정`으로 축소한다.
4. AI가 사진과 저장 프로필을 먼저 읽고, 결정에 필요한 정보가 부족할 때만 맥락형 질문을 제안한다.
5. 모질 검사는 `AI 진단` 챕터 안의 비가시적 child task로 실행하며 별도 여정 단계로 추가하지 않는다.
6. 사진 기반 결과는 `진단`이 아니라 `시각 기반 모발 특성 추정`으로 표시한다.
7. Aftercare는 상담 챕터에서 제외하고 실제 시술 기록 이후 별도 프로그램으로 연다. 리포트에는 초기 관리사항만 포함한다.

## 2. 목표와 UX 원칙

### 2.1 목표

- 사용자는 15단계가 아니라 4개 챕터의 상담으로 인식한다.
- 시작 전에 긴 설문을 완료하지 않아도 사진 분석까지 진입할 수 있다.
- 사진 제출 뒤 시스템 검사, 얼굴·모발·퍼스널 컬러 분석은 추가 클릭 없이 이어진다.
- AI는 이미 아는 정보를 다시 묻지 않고, 신뢰도가 낮거나 선택 충돌이 있는 항목만 질문한다.
- 관찰, 사용자 진술, 시스템 추론, 확정 결과의 출처가 분리된다.
- 분석 근거와 수정 이력이 헤어 추천, 염색, 메이크업, 패션, 브리프, 리포트까지 같은 revision으로 이어진다.

### 2.2 금지 패턴

- 전역 `01 / 15`, 모든 stage를 한 번에 나열하는 `ALL STAGES`
- 저장 후 별도의 `Next`를 눌러야 하는 이중 동작
- `currentStep`, `questionIndex`, `totalSteps`를 영속화한 숫자형 마법사
- 사용자 프로필에 이미 있는 성별/style target, 이전 확정 답변을 다시 필수 질문으로 노출
- AI가 사용자 선택을 몰래 변경하거나 낮은 신뢰도 추정을 사실처럼 표시
- 사진만으로 다공성, 탄력, 내부 손상, 탈모·두피 질환을 확정
- 분석 task 완료 전 빈 결과 카드를 최종 결과처럼 표시

## 3. 고객 여정 압축

### 3.1 챕터 매핑

| 고객 챕터 | 내부 stage | 고객이 보는 핵심 행동 | 자동 처리 |
|---|---|---|---|
| 상담 준비 | `discovery`, `photo` | 상담 범위·변화 정도·금지 조건 선택, 사진 제출 | 저장 프로필 재사용, 사진 사전검사 |
| AI 진단 | `scan`, `analysis`, `personal-color` | 준비된 결과 확인, 필요한 질문에만 답변 | 얼굴 분석, 모질 분석, 선택적 퍼스널 컬러 분석, 근거 통합 |
| 스타일 디자인 | `direction`, `previews`, `compare`, `decision`, `color-studio`, `salon-brief`, `makeup`, `fashion` | Hair·Color·Makeup·Fashion 설계와 확정 | 프리뷰 생성, 비교 데이터, 브리프 지속 갱신 |
| 최종 리포트 | `result` | 전체 결과와 근거 열람·내보내기 | 결과 compilation과 PDF 준비 |
| 별도 프로그램 | `aftercare` | 실제 시술 후 관리 프로그램 참여 | 실제 시술 기준 알림·체크포인트 생성 |

`salon-brief`는 내부 stage와 버전 계약을 유지하지만 전역 내비게이션에서는 제거한다. 헤어·컬러 선택이 바뀔 때 백그라운드에서 새 버전을 만들고, 스타일 디자인과 최종 리포트에서 산출물로 보여준다.

### 3.2 표시 계약

```ts
export const CONSULTATION_CHAPTERS = [
  "intake",
  "diagnosis",
  "design",
  "report",
] as const;

export type ConsultationChapter = (typeof CONSULTATION_CHAPTERS)[number];
export type ConsultationChapterStatus =
  | "locked"
  | "available"
  | "active"
  | "waiting"
  | "attention"
  | "complete";

export interface ConsultationJourneyPresentationV2 {
  schemaVersion: "consultation-journey-presentation-v2";
  activeChapter: ConsultationChapter;
  recommendedTask: {
    stage: ConsultationStage;
    taskKind: ConsultationTaskKind | "user-decision";
    href: string;
    label: string;
  };
  chapters: Array<{
    id: ConsultationChapter;
    status: ConsultationChapterStatus;
    completedTaskCount: number;
    totalTaskCount: number;
    availableDomains: Array<"hair" | "color" | "makeup" | "fashion">;
  }>;
  blockingAction: ConsultationBlockingAction | null;
}
```

- `ConsultationJourney`는 서버 권위 orchestration 계약으로 유지한다.
- `ConsultationJourneyPresentationV2`는 현재 snapshot에서 매번 파생하며 별도 마법사 cursor를 저장하지 않는다.
- 전역 내비게이션은 네 챕터와 상태만 표시한다.
- 챕터 내부에는 현재 권장 작업, 진행 중 작업, 완료 작업을 표시하되 내부 stage 번호는 표시하지 않는다.
- 재접속 시 챕터 첫 화면이 아니라 `recommendedTask.href`로 복귀한다.

### 3.3 스타일 디자인 내부 구조

`스타일 디자인`은 하나의 전역 챕터지만 다음 도메인 탭을 가진다.

- Hair: AI 단일 추천, 프리뷰, 확인·조정, 확정. 내부 `compare` stage는 legacy deep link 호환용으로만 유지한다.
- Color: 퍼스널 컬러 근거, 염색 후보와 최종 컬러
- Makeup: 단독 인터뷰, AI 조정안, 메이크업 방향 맵, 확정
- Fashion: 단독 인터뷰, 추천·생성, 최종 룩

탭은 순서를 강요하는 또 다른 마법사가 아니다. 필요한 근거가 준비된 탭은 병렬로 열 수 있고, 잠긴 탭에는 숫자 단계 대신 정확한 선행 조건과 이동 CTA를 보여준다.

## 4. 초기 상담 목표 설정

### 4.1 초기 필수 입력

초기 화면에서 요구하는 필수 결정은 최대 3개다.

| 주제 | 값 | 저장 방식 |
|---|---|---|
| 상담 범위 | `hair`, `hair_color`, `total_styling` | 단일 선택 즉시 저장 |
| 변화 강도 | `maintain`, `natural_change`, `clear_change` | 단일 선택 즉시 저장 |
| 금지·회피 조건 | 구조화 태그 복수 선택, 추가 설명 선택 | 명시적 `조건 저장` |

- 모발 자유 텍스트 폼은 초기 필수 입력에서 제거한다.
- 성별/style target은 온보딩 프로필에서 읽고 없으면 `neutral`로 유지한다. 얼굴이나 사진으로 성별을 추론하지 않는다.
- 과거 상담에서 확정된 유지 시간, 시술 가능 범위, 회피 조건은 `saved_profile` provenance로 미리 채운다.
- 사용자는 미리 채운 값을 펼쳐 수정할 수 있지만 같은 질문에 다시 답해야 시작되는 구조는 금지한다.

초기 목표는 기존 자유형 `ConsultationInputProfile`만으로 readiness를 계산하지 않고 다음 정규화 계약으로 저장한다.

```ts
export interface ConsultationIntentV2 {
  schemaVersion: "consultation-intent-v2";
  scope: "hair" | "hair_color" | "total_styling";
  changeLevel: "maintain" | "natural_change" | "clear_change";
  exclusions: string[];
  exclusionsConfirmed: boolean;
  styleTarget: "male" | "female" | "neutral";
  sourceProfileId: string | null;
  interviewRevision: number;
  confirmedAt: string;
}
```

- 새 `discoveryReady`는 `scope`, `changeLevel`, `exclusionsConfirmed`, `confirmedAt`으로 판단한다.
- `currentHair`, `allowedServices`, 손상도·모질 텍스트가 비어 있다는 이유로 사진 제출을 막지 않는다.
- 기존 `purpose`, `goals`, `allowedServices`는 `ConsultationIntentV2`에서 호환 projection하고 구 route 응답을 유지한다.
- `scope=hair`이면 Personal Color·Makeup·Fashion을 완료한 것처럼 위조하지 않고 `not_applicable` 도메인으로 표시한다.

### 4.2 점진형 컨설턴트 인터뷰

상세 질문은 도메인과 결정 시점에 맞춰 지연한다.

| 질문 시점 | 조건 | 질문 예시 |
|---|---|---|
| AI 진단 직후 | 모질 confidence가 중간이고 추천에 영향을 줌 | “젖었을 때 컬이 더 강해지나요?” |
| Hair 설계 진입 | 관리·시술 제약이 미확인 | 아침 손질 시간, 열기구, 방문 주기 |
| Color 탭 진입 | `hair_color` 또는 염색 선택 | 탈색 가능 여부, 목표 밝기, 뿌리 관리 허용 범위 |
| Makeup 탭 진입 | `total_styling` | 대표 모드, 상황, 마감, 시간·숙련도 |
| Fashion 탭 진입 | `total_styling` | 상황, 실루엣, 노출, 예산, 회피 아이템 |

질문 선택 정책은 결정론적이다. AI 설명 모델은 질문 문장을 자연스럽게 바꿀 수 있지만, 질문 필요 여부·허용 답변·저장 필드는 정책 엔진이 결정한다.

```ts
export interface ConsultantClarificationV1 {
  id: string;
  domain: "hair" | "color" | "makeup" | "fashion";
  fieldId: string;
  reasonCode:
    | "LOW_CONFIDENCE"
    | "MISSING_DECISION_INPUT"
    | "SOURCE_CONFLICT"
    | "USER_CONFIRMATION_REQUIRED";
  evidenceIds: string[];
  requiredFor: string[];
  question: InterviewQuestionSchema;
  blocking: boolean;
  status: "proposed" | "answered" | "skipped" | "resolved";
}
```

### 4.3 답변과 자동 이동

- 단일 선택은 저장 성공 후 다음 미완료 주제 또는 사진 제출로 자동 이동한다.
- 복합·다중 입력만 의미가 분명한 저장 CTA를 사용한다.
- 전역 `다음` CTA는 사용하지 않는다.
- 사용자는 언제든 상담을 나가고 재개할 수 있다.
- `ConsultationInterviewDraft`의 revision, coverage, conflict, skip 계약을 재사용한다.
- AI 분석 결과가 늦어도 이미 입력한 답변은 보존하며, 분석 재시도는 인터뷰를 초기화하지 않는다.

### 4.4 AI 진단 추가 질문 템플릿

전체 적응형 질문 은행과 도메인별 분기·우선순위·시각 선택 계약은 [P42 AI 진단 적응형 추가 질문 은행](./p42-ai-diagnosis-adaptive-question-bank-2026-08-20.md)을 하위 권위 문서로 사용한다. 이 절은 런타임 공통 계약과 기본 16개 템플릿을 정의한다.

#### 4.4.1 질문 생성 원칙

AI 진단의 추가 질문은 일반 채팅 모델이 임의로 생성하지 않는다. 서버 정책이 `evidence + confidence + source conflict + downstream impact`를 평가해 등록된 `templateId`를 고르고, AI는 허용된 변수로 관찰 설명을 자연스럽게 다듬는 역할만 한다.

질문 카드의 기본 순서는 다음과 같다.

1. 조심스러운 관찰: “사진에서는 웨이브가 조금 보이지만…”
2. 질문 이유: “평소 질감에 따라 커트와 손질 방향이 달라져요.”
3. 한 가지 질문: “머리가 젖었을 때 컬은 어떻게 변하나요?”
4. 3~6개 구조화 선택지와 별도의 미확인 선택지
5. 항상 제공하는 `잘 모르겠어요` 또는 `미용실에서 확인할게요`

다음 표현은 금지한다.

- “AI가 확실히 판단했습니다”, “정상/비정상”, “탈모가 의심됩니다”
- “모발이 심각하게 손상됐습니다”처럼 사진만으로 단정하는 표현
- 사용자의 성별, 인종, 나이를 사진으로 추론한 질문
- 한 카드에서 두 가지 이상을 동시에 묻는 복합 질문
- 답변하지 않으면 전체 분석 결과를 볼 수 없게 하는 불필요한 장벽

#### 4.4.2 질문 수 예산

- 결과 전 필수 clarification: 최대 2개
- 결과와 함께 제공하는 선택 clarification: 최대 2개
- 한 진단 run에서 총 최대 4개, 동일 field는 최대 1개
- 모바일과 데스크톱 모두 한 번에 질문 카드 1개만 활성화
- 사진 자체가 분석 불가능하면 질문으로 우회하지 않고 재촬영 CTA를 사용
- confidence가 높고 source conflict가 없으면 추가 질문 0개가 정상이다
- 사용자가 `잘 모르겠어요`를 선택한 항목은 같은 run에서 다시 묻지 않는다

질문 우선순위는 다음 순서로 결정한다.

1. 사진 보정·시술 이력처럼 결과 왜곡 가능성이 크고 사용자가 쉽게 답할 수 있는 항목
2. Hair/Color 추천이 달라지는 중간 confidence 항목
3. 사진 관찰과 저장 프로필이 충돌하는 항목
4. 결과 설명을 풍부하게 하지만 추천을 바꾸지 않는 선택 항목

정책 점수 예시는 다음과 같으며 값은 canary에서 조정한다.

```text
priorityScore =
  downstreamImpact * 0.40
  + uncertainty * 0.30
  + userAnswerability * 0.20
  + sourceConflict * 0.10
  - interactionBurden
```

#### 4.4.3 템플릿 계약

```ts
export interface AiDiagnosticQuestionTemplateV1 {
  schemaVersion: "ai-diagnostic-question-template-v1";
  id: string;
  domain: "capture" | "hair" | "personal_color" | "source_conflict";
  fieldId: string;
  trigger: {
    reasonCodes: Array<
      | "LOW_CONFIDENCE"
      | "MISSING_DECISION_INPUT"
      | "SOURCE_CONFLICT"
      | "CAPTURE_CONDITION_UNKNOWN"
    >;
    confidenceRange: { minInclusive: number; maxExclusive: number } | null;
    requiredEvidenceTraits: string[];
    excludedLimitationCodes: string[];
    downstreamImpact: "low" | "medium" | "high";
  };
  copy: {
    observationTemplate: string;
    reasonTemplate: string;
    prompt: string;
  };
  kind: "single" | "multiple";
  options: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
  unknownOption: {
    value: "unknown" | "salon_confirmation";
    label: string;
  };
  blocking: boolean;
  maxAskCount: 1;
  answerProjection: {
    targetField: string;
    provenance: "user";
    conflictResolution?: string;
  };
}
```

런타임 카드에는 템플릿 원문을 복사하지 않고 선택 결과와 근거 연결을 저장한다.

```ts
export interface AiDiagnosticQuestionInstanceV1 {
  id: string;
  templateId: string;
  consultationId: string;
  analysisRunId: string;
  hairProfileRevision: number;
  reasonCode: ConsultantClarificationV1["reasonCode"] | "CAPTURE_CONDITION_UNKNOWN";
  evidenceIds: string[];
  renderedCopy: {
    observation: string;
    reason: string;
    prompt: string;
  };
  status: "proposed" | "answered" | "skipped" | "expired";
  answer: InterviewAnswer | null;
  createdAt: string;
  answeredAt: string | null;
}
```

#### 4.4.4 모질 분석 질문 세트

| templateId | 발생 조건 | 고객 질문 | 선택지 | 반영 필드 |
|---|---|---|---|---|
| `hair.wet-pattern.v1` | texture confidence `0.55~0.79` 또는 스타일링 흔적 | 머리가 젖었을 때 컬이나 웨이브는 어떻게 변하나요? | 거의 펴짐 / 웨이브가 선명해짐 / 컬이 강해짐 / 부위마다 다름 / 잘 모르겠어요 | `reported.wetPattern` |
| `hair.strand-feel.v1` | 굵기 추정이 추천에 중요하고 confidence 중간 | 모발 한 올을 손가락으로 만졌을 때 어떤 느낌에 가깝나요? | 가늘고 잘 느껴지지 않음 / 중간 / 굵고 단단하게 느껴짐 / 부위마다 다름 / 잘 모르겠어요 | `reported.strandThickness` |
| `hair.normal-volume.v1` | 드라이·고정제 영향 가능성 | 제품을 바르지 않고 말렸을 때 평소 볼륨은 어떤가요? | 쉽게 가라앉음 / 자연스럽게 유지 / 쉽게 부풀어 오름 / 정수리와 옆이 다름 / 잘 모르겠어요 | `reported.naturalVolume` |
| `hair.frizz-condition.v1` | flyaway/frizz 관찰은 있으나 습도 영향 불명 | 부스스함은 언제 가장 잘 나타나나요? | 거의 없음 / 습한 날 / 건조한 날 / 늘 비슷함 / 잘 모르겠어요 | `reported.frizzCondition` |
| `hair.ends-touch.v1` | 끝부분이 보이고 visible end confidence 중간 | 모발 끝을 만졌을 때 가장 가까운 상태는 무엇인가요? | 매끄러움 / 조금 거침 / 쉽게 엉킴 / 갈라짐이 느껴짐 / 잘 모르겠어요 | `reported.endCondition` |
| `hair.chemical-history.v1` | 색 불균일·표면 변화가 보이거나 이력 미확인 | 최근 1년 동안 받은 시술을 알려주세요. | 염색 / 탈색 / 펌 / 매직·스트레이트 / 해당 없음 / 잘 모르겠어요 | `reported.treatmentHistory` |
| `hair.current-capture-state.v1` | 제품·열기구 사용 여부가 관찰 해석에 영향 | 이 사진을 찍을 때 모발 상태는 어땠나요? | 자연 건조 / 드라이만 함 / 고데기·아이론 사용 / 왁스·오일·스프레이 사용 / 잘 모르겠어요 | `reported.captureState` |
| `hair.color-origin.v1` | 뿌리·중간·끝 컬러 차이 또는 Color 진입 | 현재 보이는 머리색은 자연 모발색인가요? | 전체 자연 모발 / 뿌리만 자연 모발 / 전체 염색 모발 / 탈색 이력 있음 / 잘 모르겠어요 | `reported.colorOrigin` |

`hair.chemical-history.v1`만 복수 선택을 허용한다. 시술 시점·횟수의 상세 문진은 Color 설계에서 필요할 때만 이어서 묻고 AI 진단에서 한꺼번에 요구하지 않는다.

#### 4.4.5 사진·퍼스널 컬러 신뢰도 질문 세트

| templateId | 발생 조건 | 고객 질문 | 선택지 | 반영 필드 |
|---|---|---|---|---|
| `capture.filter-retouch.v1` | 피부색 또는 질감 보정 가능성을 배제할 수 없음 | 이 사진에 필터나 피부 보정을 사용했나요? | 사용하지 않음 / 밝기·색감만 조정 / 피부 보정 사용 / 잘 모르겠어요 | `reported.captureRetouch` |
| `capture.base-makeup.v1` | Personal Color를 실행하며 베이스 영향 불명 | 사진을 찍을 때 피부 표현 제품을 사용했나요? | 사용하지 않음 / 선크림·톤업만 / 가벼운 베이스 / 커버 메이크업 / 잘 모르겠어요 | `reported.baseMakeup` |
| `capture.light-source.v1` | 조명·화이트밸런스가 warning | 촬영 당시 얼굴을 비춘 주된 빛은 무엇이었나요? | 창가 자연광 / 실내 흰 조명 / 실내 노란 조명 / 여러 조명이 섞임 / 잘 모르겠어요 | `reported.lightSource` |
| `personal-color.natural-reference.v1` | 현재 염색 모발이 컬러 판단을 교란 | 자연 모발색에 가장 가까운 부분이 있나요? | 뿌리에서 확인 가능 / 눈썹이 더 가까움 / 현재 사진에서는 확인 어려움 / 잘 모르겠어요 | `reported.naturalColorReference` |

시스템 사전검사가 `retry_required`로 판정한 blur, 강한 과노출, 얼굴·모발 가림은 위 질문으로 통과시키지 않는다. 해당 상태는 “조금 더 밝은 곳에서 다시 촬영해 주세요”처럼 한 가지 복구 행동만 제공한다.

#### 4.4.6 관찰·사용자 정보 충돌 질문

충돌 질문은 어느 쪽이 맞는지 심문하지 않고 `사진 상태`와 `평소 상태`를 분리한다.

| templateId | 충돌 예 | 고객 문구 | 선택지 |
|---|---|---|---|
| `conflict.texture.v1` | 사진은 wave, 저장 프로필은 straight | 사진에서는 웨이브가 보이지만 저장된 정보에는 직모로 되어 있어요. 평소 자연 건조 상태는 어디에 가까운가요? | 직모 / 약한 웨이브 / 뚜렷한 웨이브·컬 / 사진 촬영 때만 스타일링함 / 잘 모르겠어요 |
| `conflict.density.v1` | 사진 apparent density와 사용자 진술 불일치 | 조명과 가르마 때문에 사진에서 숱이 다르게 보일 수 있어요. 평소 기준으로 알려주세요. | 두피가 거의 보이지 않음 / 가르마에서 조금 보임 / 부위별 차이가 큼 / 미용실에서 확인할게요 |
| `conflict.damage-history.v1` | 사진 표면 징후는 있으나 사용자는 손상 없음 | 사진의 표면 질감이 촬영 환경의 영향인지 확인하고 싶어요. 최근 시술이나 열기구 사용이 있었나요? | 시술 이력 있음 / 열기구를 자주 사용 / 둘 다 없음 / 잘 모르겠어요 |
| `conflict.color-origin.v1` | 사진은 색 차이, 프로필은 자연 모발 | 뿌리와 모발 끝의 색 차이가 보여요. 현재 모발 상태와 가까운 것을 골라주세요. | 자연 모발 / 염색 후 자란 상태 / 탈색·다회 염색 / 조명 때문에 달라 보임 / 잘 모르겠어요 |

충돌 답변은 기존 source를 삭제하지 않는다. `InterviewConflict.status`를 `resolved` 또는 `salon_confirmation_required`로 바꾸고 새 inferred field에 양쪽 source ID를 함께 남긴다.

#### 4.4.7 실제 카드 문구 예시

```text
[관찰]
사진에서는 모발 중간부터 약한 웨이브가 보여요.

[이유]
평소 컬이 살아나는 정도에 따라 레이어 위치와 손질 방법이 달라질 수 있어요.

[질문]
머리가 젖었을 때 컬이나 웨이브는 어떻게 변하나요?

[선택]
거의 펴져요
웨이브가 더 선명해져요
컬이 더 강해져요
부위마다 달라요
잘 모르겠어요
```

답변 저장 뒤에는 다음처럼 짧게 반영 결과를 보여준다.

```text
답변을 반영했어요.
약한 웨이브 특성을 기준으로 레이어와 손질 난이도를 계산할게요.
```

AI 문장 생성이 실패하면 템플릿 기본 문구를 그대로 사용한다. 문장 생성 실패가 질문 표시, 답변 저장, 모질 profile reconciliation 또는 결과 열람을 차단하지 않는다.

#### 4.4.8 UI 상태와 상호작용

- 질문 카드는 AI 진단 우측 `확인이 필요한 내용` 영역에 표시한다.
- 결과 전 필수 질문은 분석 진행 카드 아래, 선택 질문은 해당 결과 카드 바로 아래에 연결한다.
- 선택 즉시 optimistic UI로 표시하되 서버 revision 충돌 시 최신 답변을 다시 읽고 명확한 재선택 안내를 제공한다.
- 저장 중, 저장됨, 충돌, 실패 상태를 `aria-live`로 알린다.
- 답변 후 다음 질문이 있으면 제목으로 포커스를 이동하고, 없으면 갱신된 결과 요약으로 이동한다.
- `건너뛰기`는 `unknown`과 구분한다. 건너뛰기는 질문을 보류하고, `잘 모르겠어요`는 해당 run의 유효한 사용자 답변이다.
- 전체 답변 수정은 요약 drawer에서 제공하며 수정 시 hair profile revision과 downstream input fingerprint를 새로 만든다.

#### 4.4.9 템플릿 검증 기준

- 등록되지 않은 template ID는 API와 AI 출력 검증에서 거부한다.
- AI가 option value, target field, blocking 여부를 변경할 수 없다.
- 모든 질문은 evidence ID 또는 명시적인 missing-field reason을 가진다.
- 같은 analysis run과 field에 중복 질문 instance가 생기지 않는다.
- 질문 예산을 초과한 후보는 결과를 막지 않고 backlog로 버린다.
- `unknown`, `salon_confirmation`, skip 이후 동일 run 재질문을 금지한다.
- 답변이 추천을 바꾸면 변경된 recommendation reason과 source revision을 함께 기록한다.
- 헤어 특성 질문 결과가 의료·탈모 판정 문구로 projection되지 않는지 회귀 테스트한다.

## 5. 모질 분석 정의와 한계

### 5.1 제품 명칭

고객 화면과 API 설명에서 `모질 진단` 대신 `시각 기반 모발 특성 분석`을 사용한다. 미용 상담 목적의 관찰이며 의료·생체 측정이 아니다.

### 5.2 사진에서 관찰 가능한 항목

| 특성 | 출력 | 주의 |
|---|---|---|
| texture pattern | 직모·웨이브·컬 분포 | 젖은 상태와 스타일링 제품 영향 가능 |
| apparent density | 낮음·중간·높음과 영역별 분포 | 두피 노출, 가르마, 조명 영향 |
| strand thickness class | 가늘어 보임·중간·굵어 보임 | 실제 직경 측정값이 아님 |
| volume behavior | 정수리·측면·끝 볼륨 | 드라이·고정제 영향 |
| frizz/flyaway | 부스스함·잔머리 수준 | 습도와 정전기 영향 |
| surface shine | 낮음·중간·높음 | 조명과 노출 영향 |
| visible end condition | 끝 건조·갈라짐 징후 | 근접 사진이 없으면 unknown |
| color uniformity | 뿌리·중간·끝 색상 차이 | 화이트밸런스 영향 |
| hairline/parting visibility | 헤어라인·가르마 관찰 가능성 | 탈모 판정 금지 |

### 5.3 사진만으로 확정하지 않는 항목

- 실제 모발 직경, 다공성, 탄력, 수분·단백질 균형
- 모발 내부 손상과 정확한 화학 시술 이력
- 두피 유분·민감도와 피부 질환
- 탈모, 질병, 약물·호르몬 영향
- 시술 안전성의 최종 판정

위 항목이 추천에 필요하면 `reported` 사용자 답변 또는 `salon_confirmation_required`로 남긴다.

## 6. 모질 분석 파이프라인

### 6.1 입력 자산

- 필수: 정면 기본 사진 1장
- 권장: 정수리·가르마 또는 측면 근접 사진 1장
- 선택: 자연 건조 상태 사진 또는 끝부분 근접 사진

기본 사진만 있어도 분석을 시작하되, 관찰할 수 없는 특성을 채우기 위해 추가 사진을 강제하지 않는다. 추가 자산이 필요한 경우 해당 특성을 `unknown`으로 표시하고 선택적으로 요청한다.

### 6.2 처리 순서

```text
private photo asset
  → deterministic photo preflight
  → source transform/crop fingerprint
  → hair/scalp/accessory segmentation
  → visual feature extraction
  → evidence normalization + confidence calibration
  → saved profile/consultant answers reconciliation
  → targeted clarification policy
  → recommendation input projection
```

#### A. 시스템 사전검사

AI 모델 호출 전에 다음을 검사한다.

- 파일 형식·크기·해상도
- 초점과 blur
- 조명, 과노출·저노출, 강한 색 왜곡
- 얼굴 수와 정면성
- 헤어라인·가르마·모발 끝 가시성
- 모자, 손, 액세서리, 강한 배경 간섭

실패는 `blocking`, 제한적 사용 가능은 `warning`, 충분한 경우 `pass`로 나눈다. 이 결과는 AI가 생성한 설명과 섞지 않는다.

#### B. 영역 분리

비전 모델은 다음 마스크를 생성한다.

- `hair_primary`
- `hair_flyaway`
- `scalp_visible`
- `parting`
- `hairline`
- `face_exclusion`
- `accessory_exclusion`
- `background_exclusion`

마스크는 고객 화면에 항상 표시할 필요가 없지만, 근거 overlay와 품질 검사에서 재사용할 수 있어야 한다. 모발 마스크를 염색 렌더링에 자동 재사용하지 않는다. 염색 생성은 Color Studio의 별도 품질·모델 계약을 따른다.

#### C. 특성 추출

각 특성은 전체 이미지 단일 label이 아니라 관찰 영역과 분포를 함께 가진다. 예를 들어 texture는 `straight 0.18 / wave 0.67 / curl 0.15`, density는 `crown medium / sides high`처럼 저장한다.

#### D. 신뢰도와 미확인 처리

초기 정책값은 기능 플래그 또는 서버 설정으로 조정한다.

- `confidence >= 0.80`: 관찰 결과로 바로 사용
- `0.55 <= confidence < 0.80`: 추천에 영향이 크면 확인 질문 제안
- `confidence < 0.55`: `unknown`으로 유지하고 추론값을 최종 프롬프트에 넣지 않음

모델 confidence만 사용하지 않고 사진 품질, 마스크 경계 품질, 복수 사진 간 일치도를 합성한다.

#### E. 사용자 정보와 화해

- 사진 관찰과 사용자 답변이 같으면 `inferred` confidence를 높인다.
- 다르면 어느 한쪽을 덮어쓰지 않고 `SOURCE_CONFLICT`를 만든다.
- 사용자가 “미용실에서 확인”을 선택하면 `salon_confirmation_required`로 브리프에 전달한다.
- AI 설명은 충돌을 요약할 수 있지만 해결 결과를 자동 확정하지 않는다.

### 6.3 병렬 실행

사진 사전검사가 통과하면 다음 capability를 병렬 실행한다.

1. 얼굴 구조·랜드마크 분석
2. 모질 segmentation·특성 분석
3. 퍼스널 컬러 분석: 상담 범위와 사진 동의가 있을 때만

하나가 실패해도 다른 결과를 폐기하지 않는다. AI 진단 챕터는 `partial` 결과를 먼저 보여주고 실패한 capability에만 재시도를 제공한다.

`ConsultationTaskKind`에는 `hair-trait-analysis`를 additive하게 추가한다. 이 task는 `stage=scan`, `originStage=photo`, `transitionHostStage=scan`, `destinationStage=analysis`로 연결한다. 얼굴 분석 완료 여부를 대신하지 않으며 AI 진단 챕터의 child task로만 표시한다.

```ts
interface HairTraitAnalysisTaskProjection {
  kind: "hair-trait-analysis";
  readinessKey: "hair-profile-terminal";
  phaseKey: "queued" | "segmenting" | "extracting" | "reconciling" | "completed" | "retry-required";
  status: "pending" | "running" | "partial" | "waiting" | "failed" | "complete";
  partialOutputCount: number;
  retryable: boolean;
}
```

모질 분석 실패는 얼굴 분석 결과 열람을 막지 않는다. 단, 모질 근거가 필요한 추천에는 `HAIR_TRAIT_EVIDENCE_PENDING` 또는 `HAIR_TRAIT_EVIDENCE_UNAVAILABLE`을 표시하고 기존 사용자 답변을 AI 관찰처럼 변환하지 않는다.

## 7. 데이터 계약

### 7.1 관찰 근거

```ts
export type HairTraitKey =
  | "texture_pattern"
  | "apparent_density"
  | "strand_thickness_class"
  | "volume_behavior"
  | "frizz_flyaway"
  | "surface_shine"
  | "visible_end_condition"
  | "color_uniformity"
  | "hairline_parting_visibility";

export interface HairTraitObservationV1 {
  id: string;
  trait: HairTraitKey;
  status: "observed" | "unknown" | "unusable";
  value: string | null;
  distribution: Record<string, number>;
  confidence: number;
  qualityFactors: Record<string, number>;
  sourceAssetIds: string[];
  sourceRegionIds: string[];
  limitationCodes: string[];
  model: { provider: string; name: string; version: string };
  createdAt: string;
}

export interface HairProfileV2 {
  schemaVersion: "hair-profile-v2";
  id: string;
  consultationId: string;
  revision: number;
  sourceFingerprint: string;
  observed: HairTraitObservationV1[];
  reported: Record<string, InterviewAnswer>;
  inferred: Record<string, {
    value: string | null;
    confidence: number;
    sourceIds: string[];
    conflictId: string | null;
  }>;
  unresolvedFieldIds: string[];
  confirmedRevision: number | null;
  supersedesProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 7.2 provenance 규칙

- `observed`: 사진·마스크·비전 결과만 참조
- `reported`: 사용자 또는 저장 프로필 답변만 참조
- `inferred`: observed와 reported를 정책으로 조합한 결과
- `unknown`: 근거 부족을 명시하며 기본값으로 채우지 않음
- 모든 downstream projection은 `sourceIds`, `sourceFingerprint`, `hairProfileRevision`을 저장
- 확정 revision은 불변이며 새 사진·답변은 새 profile revision을 생성

### 7.3 공통 생성 입력 연결

`consultation-generation-input-v1`의 기존 `hairDensity`, `strandThickness`, `hairTexture`, `damageLevel`을 즉시 삭제하지 않는다.

- 새 profile이 있으면 검증된 `inferred` 값을 projection한다.
- 새 profile이 없으면 기존 Discovery 값에 `legacy_reuse` provenance를 붙인다.
- confidence가 기준 미만인 값은 프롬프트의 사실 필드에서 제외하고 `unknownFields`에 넣는다.
- Hair Preview, Color, Makeup, Fashion, Salon Brief, Result가 같은 `hairProfileRevision`과 input fingerprint를 참조한다.

## 8. 저장·API·보안 아키텍처

### 8.1 additive 저장 모델

| 테이블 | 목적 | 불변식 |
|---|---|---|
| `hair_analysis_runs_v2` | durable task, lease, retry, 모델 실행 상태 | consultation+fingerprint+capability 멱등 |
| `hair_trait_evidence_v2` | trait별 관찰·영역·품질·모델 근거 | 완료 row 수정 금지, 새 run이 supersede |
| `consultation_hair_profiles_v2` | observed/reported/inferred 통합 revision | confirmed revision 불변 |
| 기존 `consultation_interview_drafts_v2` | 맥락 질문 답변·coverage·conflict | optimistic revision 일치 |

실제 migration을 만들 때는 Supabase CLI의 `migration new`로 이름을 생성한다. 이 문서의 예시 테이블 이름을 근거로 임의 timestamp 파일을 만들지 않는다.

### 8.2 접근 제어

- 모든 public 테이블은 RLS를 활성화하고 현재 V2 테이블과 동일한 강제 RLS·권한 모델을 따른다.
- Clerk를 사용하는 브라우저가 테이블에 직접 쓰지 않는다. 소유권을 확인한 Next.js route/service만 결과를 읽고 쓴다.
- 모델 결과 쓰기는 서버 전용이며 `service_role` 또는 secret key를 클라이언트에 노출하지 않는다.
- Data API 직접 노출이 불필요한 테이블은 `anon`, `authenticated` 권한을 명시적으로 회수한다.
- 사진과 마스크는 private storage에 저장하고 짧은 signed URL만 반환한다.
- 저장 upsert가 필요하면 Storage의 INSERT·SELECT·UPDATE 권한과 실제 정책을 함께 검증한다.
- 로그에는 원본 사진, signed URL, 사용자 원문, 인증정보를 기록하지 않는다.

### 8.3 API

기존 상담 인증·소유권 adapter를 재사용한다.

- `POST /api/v2/consultations/:id/hair-analysis/runs`: source fingerprint 기준 시작 또는 기존 run replay
- `GET /api/v2/consultations/:id/hair-analysis`: task, partial evidence, profile, clarification 상태
- `PATCH /api/v2/consultations/:id/hair-profile/clarifications`: `expectedRevision`과 답변 저장
- `POST /api/v2/consultations/:id/hair-profile/confirm`: 선택적 사용자 수정 확정; 자동 분석 열람의 필수 장벽으로 사용하지 않음

사진 제출 route가 첫 API를 서버 내부에서 자동 호출하므로 브라우저가 별도 `분석 실행` 버튼을 누르지 않는다.

## 9. AI 진단 화면

### 9.1 레이아웃

- 좌측: 분석 사진, 안전한 근거 overlay, 사진 품질과 추가 사진 선택 요청
- 우측: AI output과 시스템 data
  - 진행 중 capability와 부분 결과
  - 얼굴 구조 요약
  - 모질 분석 카드
  - 퍼스널 컬러 요약
  - 확인이 필요한 질문
  - 분석 한계와 신뢰도

좌우 캔버스는 데스크톱에서 개별 스크롤을 유지하고 모바일에서는 단일 열로 합친다. 전역 CSS 팔레트와 공개 스타일 토큰은 변경하지 않는다.

### 9.2 생동감과 대기

- `preflight → segmentation → feature extraction → reconciliation → ready` phase를 고객용 언어로 변환한다.
- 대기 화면에는 기존 모션 토큰과 짧은 메시지 캐러셀을 사용한다.
- 메시지는 실제 task state를 숨기지 않으며 `정체 감지`, `재시도 중`, `부분 결과 준비`를 구분한다.
- 부분 결과가 준비되면 전체 완료를 기다리지 않고 해당 카드를 표시한다.
- 사용자는 대기 중 상담을 나갈 수 있고 재접속 시 서버 task를 복원한다.

## 10. 추천·리포트 연결

### 10.1 헤어 추천

- texture, volume, apparent density는 길이·레이어·볼륨·질감 축의 근거로 사용한다.
- visible end condition은 무리한 길이 유지 또는 화학 시술에 대한 주의 근거로만 사용한다.
- 낮은 confidence는 추천 점수를 높이거나 제한을 확정하는 데 사용하지 않는다.
- 각 추천은 hair trait evidence ID와 사용자 제약 source ID를 함께 참조한다.

### 10.2 Color·Makeup·Fashion

- Color는 색 균일성과 현재 컬러를 참고하되 탈색 가능성과 내부 손상을 사진으로 확정하지 않는다.
- Makeup은 얼굴·퍼스널 컬러 근거를 사용하며 모질 profile을 얼굴 화장 좌표 판단에 사용하지 않는다.
- Fashion은 확정 Hair/Color/Makeup 결과를 인상·팔레트 연결에 사용하고 모질 관찰을 직접 의상 추천 근거로 과대 사용하지 않는다.

### 10.3 최종 리포트

Hair 탭에 다음을 표시한다.

- 관찰된 모발 특성 요약과 confidence
- 사용자가 알려준 정보
- AI가 조합한 최종 설계 기준
- 미확인·미용실 확인 필요 항목
- 추천에 실제 사용된 evidence와 revision

의학적 용어, 탈모 판정, 제품·시술 효과 보장은 표시하지 않는다.

## 11. 상태 전이

```text
상담 목표 설정
  → 사진 제출
  → 시스템 사전검사
      ├─ blocking: 사진 재선택
      └─ pass/warning
           → 얼굴·모질·선택적 퍼스널 컬러 병렬 분석
           → partial result 노출
           → 근거 통합
           → 필요한 clarification만 제안
           → AI 진단 준비 완료
           → 스타일 디자인 recommended task
```

- 사용자가 답해야 하는 blocking clarification이 없으면 AI 진단에서 스타일 디자인으로 자동 안내한다.
- 자동 안내는 사용자가 결과를 다시 볼 수 없게 만드는 강제 redirect가 아니다.
- 백그라운드 task 완료는 `completedStages`와 별개로 기록하며, 실제 사용자 결정이 필요한 stage를 자동 완료하지 않는다.

## 12. 기능 플래그와 호환성

- `CONSULTATION_CHAPTER_NAV_ENABLED`: 4챕터 내비게이션과 presentation adapter
- `CONSULTATION_PROGRESSIVE_INTERVIEW_ENABLED`: 축소된 초기 목표 설정과 맥락 질문
- `HAIR_TRAIT_ANALYSIS_ENABLED`: 모질 child capability와 evidence 저장
- `HAIR_TRAIT_CLARIFICATION_ENABLED`: confidence·충돌 기반 질문 제안

롤백 우선순위:

1. clarification만 끄고 구조화 관찰 결과 유지
2. hair trait 분석을 끄고 기존 Discovery 모발 필드 projection으로 복귀
3. progressive interview를 끄고 기존 Discovery 인터뷰로 복귀
4. chapter nav를 끄고 기존 stage map으로 복귀

additive 테이블과 이미 저장된 evidence는 롤백 시 삭제하지 않는다.

## 13. 구현 페이즈

### P41-0 기준선과 계약

- 현재 15 stage, blocking action, deep link, resume fixture 고정
- 기존 Discovery 모발 필드와 공통 생성 입력 provenance 감사
- HairTraitObservationV1, HairProfileV2, presentation contract와 validator 추가

종료조건: 새 계약이 기존 snapshot을 읽을 수 있고 기능 플래그 OFF 회귀가 통과한다.

### P41-1 챕터 표시 계층

- stage→chapter 파생 adapter
- Scene identity, floating controls, stage overlay를 4챕터로 교체
- semantic CTA와 recommended task 복귀

종료조건: 고객 화면에 15단계 번호가 없고 모든 기존 deep link와 stage guard가 유지된다.

### P41-2 초기 목표 설정과 점진형 질문

- 초기 3개 결정, 저장 프로필 prefill, 모발 자유 텍스트 필수 제거
- clarification policy와 interview draft 연결
- 나가기·재개·답변 수정

종료조건: 신규 상담이 3개 이하 필수 결정으로 사진 제출에 도달하고 기존 사용자 프로필을 중복 질문하지 않는다.

### P41-3 모질 분석 저장·사전검사

- additive migration과 RLS/권한
- 사진 가시성 diagnostics 확장
- durable run, idempotency, lease·retry·fencing

종료조건: 중복 요청이 provider를 중복 실행하지 않고, 완료 evidence와 확정 profile이 불변이다.

### P41-4 segmentation·특성 추출·화해

- 마스크 품질 평가
- trait observation과 confidence calibration
- observed/reported/inferred reconciliation
- 부분 실패와 targeted retry

종료조건: 지원 trait는 근거·confidence와 함께 저장되고 비지원 trait는 unknown으로 남는다.

### P41-5 downstream 연결

- 공통 생성 입력 projection과 fingerprint
- Hair/Color/Brief/Result reason source 연결
- AI 진단 화면과 리포트 Hair 섹션

종료조건: 동일 hairProfileRevision이 프리뷰 입력, 브리프, 결과에 표시되고 낮은 confidence 값은 prompt 사실로 전달되지 않는다.

### P41-6 검증·canary·롤백

- Web/Native parity, 접근성, 성능, privacy QA
- provider fixture와 제한된 실사진 canary
- 플래그별 rollback rehearsal

종료조건: 로컬 계약과 fixture, 인증 환경 canary, rollback 결과를 서로 구분해 증거 문서로 남긴다.

## 14. 테스트 계획

### 계약·정책

- 4챕터 매핑, stage deep link 호환, recommended task 파생
- 초기 3개 결정, coverage, revision conflict, 저장 프로필 provenance
- trait enum, confidence 범위, source ID allow-list, immutable confirmed revision
- 낮은 confidence를 unknown으로 처리하고 질문 필요 여부를 결정하는 정책
- 사용자 답변과 관찰 충돌 시 자동 덮어쓰기 금지

### API·DB

- Clerk 사용자 소유권과 교차 사용자 접근 거부
- RLS 강제, public role grant 감사, service-only model write
- 동일 fingerprint idempotency, 동시 접수, 만료 lease, stale fence 거부
- partial evidence 보존, retry 대상만 재접수
- private storage와 signed URL 만료·재발급

### 브라우저

- 상담 시작에서 사진 제출까지 필수 결정 3개 이하
- 사진 제출 후 AI 진단 결과까지 불필요 클릭 0회
- 15단계 번호와 별도 Next CTA 부재
- partial/waiting/stalled/retrying/complete 구분
- 낮은 confidence 질문, 답변 저장, 결과 근거 갱신
- 나가기·재개 시 active task와 최초 미해결 질문 복원
- 390/768/desktop overflow, 키보드, focus, `aria-live`, reduced motion

### 일관성·회귀

- hairProfileRevision과 generation input fingerprint가 Preview/Brief/Result에서 일치
- Makeup P40 rationale revision과 Hair profile이 서로 덮어쓰지 않음
- Color Studio 마스크·생성 계약과 hair trait observation 마스크의 목적 분리
- Fashion은 P46의 동적 3/6/9 requestedCount terminal 조건을 따르고 Aftercare 별도 프로그램은 유지
- 기능 플래그 OFF에서 기존 Discovery, stage map, legacy prompt projection 회귀

## 15. 제품 관측 지표

- 상담 시작→사진 제출 시간과 이탈률
- 사진 제출 후 첫 부분 결과까지 시간
- 사용자당 초기 필수 질문 수, 전체 clarification 수
- confidence 구간별 질문 발생률과 사용자 수정률
- 사진 재촬영률과 원인 코드
- hair trait 분석 실패·재시도·정체율
- 추천 근거 열람률과 디자인 확정까지 시간
- 4챕터 도입 전후 상담 완료율

원본 답변이나 이미지 URL은 analytics payload에 넣지 않고 reason code, count, duration, 익명화된 상태만 기록한다.

## 16. 최종 수용 기준

- [ ] 고객에게는 4개 상담 챕터만 보이고 Aftercare는 별도 프로그램이다.
- [ ] 기존 15개 내부 stage와 deep link, durable task, resume 계약은 유지된다.
- [ ] 초기 필수 결정은 3개 이하이며 모발 자유 텍스트 입력은 필수가 아니다.
- [ ] 사진 제출 뒤 시스템 검사와 AI 분석은 별도 실행 버튼 없이 시작된다.
- [ ] 모질 분석은 지원 항목·비지원 항목·confidence·한계를 구분한다.
- [ ] observed/reported/inferred/unknown과 source revision이 저장된다.
- [ ] AI는 낮은 confidence나 충돌이 있을 때 필요한 질문만 제안한다.
- [ ] 의료·탈모 진단과 사진만으로 알 수 없는 모발 속성을 확정하지 않는다.
- [ ] partial 결과와 capability별 실패·재시도 상태가 사용자에게 보인다.
- [ ] Hair/Color/Makeup/Fashion/Brief/Result가 같은 권위 snapshot과 provenance를 사용한다.
- [ ] 사용자가 상담을 나가고 재개해도 답변·분석 task·부분 결과가 복원된다.
- [ ] 기능 플래그별 롤백이 기존 데이터 삭제 없이 가능하다.

## 17. 증거 경계

문서와 로컬 fixture 통과는 실제 모델의 모질 분석 정확도, 다양한 모발·피부·조명에 대한 공정성, 실사용자 이해도, 원격 Supabase migration, production provider 응답, canary 또는 배포를 증명하지 않는다. 모델 정확도는 별도 dataset/model card와 사람 검토 기준으로 평가하고, 운영 항목은 인증된 환경에서 별도 승인과 결과 기록을 남긴다.

# P54 — Zero-input Intake·분석 후 적응형 추가 질문 전환 계획

- 기준일: 2026-08-20
- 상태: 로컬 구현·계약·브라우저 하네스 검증 완료, 실인증·provider·원격 rollout 미검증
- 선행 문서: [P43 컨설턴트형 인터뷰·4챕터 압축](./p43-phase-01-consultant-interview-chapter-compression-2026-08-20.md), [P44 적응형 AI 진단·모질 분석](./p44-phase-02-adaptive-ai-diagnosis-hair-trait-2026-08-20.md)
- 변경 성격: Intake 완료조건·질문 시점·provenance의 behavioral 전환
- 컴포넌트 변경 게이트: `behavioral`; 기존 전역 CSS와 `f-consulting-interview-*` 시각 계약 유지
- 비목표: 내부 stage 삭제, 의료 진단, 사진만으로 화학 시술 이력 확정, 전역 재스타일링, Docker 도입, 원격 migration·배포

> 제품 불변식: 신규 고객은 질문에 답하지 않아도 사진 분석을 시작할 수 있다. AI는 먼저 관찰하고, 결과를 바꿀 수 있으며 사진으로 확정할 수 없는 내용만 나중에 묻는다. 입력과 결과는 같은 챕터에 속하더라도 하나의 화면에 섞지 않는다.

## 1. 결정 요약

P43의 초기 3개 필수 결정 `상담 범위 → 변화 정도 → 피하고 싶은 것`을 신규 기본 여정에서 제거한다. 첫 Intake는 설문이 아니라 분석 시작점이다.

```text
상담 시작
  → 사진으로 바로 진단 시작
  → 시스템 사진 검사
  → 얼굴·모질·퍼스널 컬러 후보 병렬 분석
  → 결과를 바꿀 핵심 불확실성만 질문 0~2개
  → AI Hair primary 제시
  → 필요한 경우 고객이 조정
```

고객이 처음부터 원하는 방향이 있을 때만 선택적으로 한 줄을 남길 수 있다. 이 입력은 사진 제출과 분석 접수의 선행조건이 아니다.

## 2. 현재 문제와 원인

현재 `ConsultantIntentInterview`는 다음 세 주제를 모두 완료해야 Photo로 이동한다.

1. 상담 범위
2. 변화 정도
3. 피하고 싶은 것

각 질문은 짧지만 고객은 AI의 가치를 보기 전에 세 번 판단해야 한다. `exclusionsConfirmed`와 `confirmedAt`이 readiness에 포함되어 있어 실질적으로 선형 인터뷰다.

추가 문제:

- `CONSULTATION_DISCOVERY_INTERVIEW_ENABLED=false`면 상세 Discovery form이 다시 노출될 수 있다.
- scope와 change 기본값이 이미 들어 있어도 고객에게 다시 선택시킨다.
- 빈 exclusions를 `피할 것이 없음`으로 확정하려면 별도 행동이 필요하다.
- 사진 분석으로 알 수 있는 정보와 분석 후에야 의미가 생기는 질문을 사진 전에 묻는다.
- 기본값, 온보딩 값, 고객 직접 답변이 downstream에서 충분히 구분되지 않으면 AI가 선택하지 않은 값을 고객 의사로 오인할 수 있다.

## 3. 목표와 정량 행동 예산

### 목표

- 사진 전 필수 질문: `0개`
- 신규 상담 진입 후 Photo 화면 도달: 주 CTA `1회`
- 사진 업로드 후 분석 접수: 별도 분석 실행 CTA `0회`
- Hair primary 전에 표시 가능한 추가 질문: 기본 `0개`, 필요한 경우 최대 `2개`
- 안전 관련 질문: 해당 화학 시술을 실제 추천·확정하려는 시점에만 표시
- 저장 후 별도 Next: `0회`
- 고객이 직접 입력하지 않은 값을 `source=user`로 저장: `0건`

### 성공 지표

- 신규 상담→Photo 도달률
- 상담 시작→사진 선택까지 p50/p95 시간
- 사진 전 고객 행동 수
- 분석 후 추가 질문 발생률과 평균 질문 수
- 추가 질문 전후 Hair primary 변경률
- 질문 skip률과 중단·재개 성공률
- 기존 3문항 대비 이탈률·완료율

운영 임계값은 로컬 fixture로 확정하지 않고 내부 Canary 관측 후 승인한다.

## 4. 고객 화면 구조

### 4.1 신규 첫 화면

첫 화면에는 주 행동과 선택 행동만 둔다.

- 주 CTA: `사진으로 바로 진단 시작`
- 보조 CTA: `원하는 방향이 있다면 알려주기`
- 설명: `사진을 먼저 보고 필요한 내용만 다시 물어볼게요.`
- 나가기·재개

다음 요소는 제거한다.

- 0/3 coverage
- 세 개 주제 사이드 목록
- 상담 범위 선택 의무
- 변화 정도 선택 의무
- exclusions 확인 의무
- `답변 저장`과 별도 Next

### 4.2 선택 입력

보조 CTA를 열었을 때만 한 개의 선택 입력을 제공한다.

```ts
type OptionalOpeningIntent =
  | "leave_it_to_ai"
  | "tidy_current_impression"
  | "natural_change"
  | "clear_change";
```

- 기본 강조: `AI가 정해주세요`
- 나머지: `현재 인상 정돈`, `자연스러운 변화`, `확실한 변화`
- 선택하지 않고 닫아도 아무 값도 사용자 답변으로 기록하지 않는다.
- 자유 입력은 선택적으로 한 줄만 제공하며 analytics에 원문을 보내지 않는다.
- `헤어·컬러·메이크업·패션 중 어디까지`는 첫 화면에서 묻지 않는다. 상담 제품은 연결형 컨설팅으로 시작하고, 각 도메인은 결과와 고객 행동에 따라 열거나 건너뛴다.

### 4.3 분석 후 질문

질문은 Diagnosis 챕터 안의 독립 `clarification` 화면에서 한 번에 하나만 표시한다. 분석 결과 화면과 편집 가능한 질문 폼을 동시에 렌더링하지 않는다.

- 질문 이유를 먼저 표시한다.
- `답변`, `모르겠어요`, `건너뛰기`를 제공한다.
- 답변 저장 성공 후 다음 필요한 질문이 있으면 같은 영역에서 교체한다.
- 별도 interview stage나 숫자형 wizard cursor를 만들지 않는다.
- 답하지 않아도 Hair 추천이 가능한 질문은 recommendation을 막지 않는다.
- 시술 안전 질문은 Hair 이미지 탐색을 막지 않고 해당 Color/Perm 확정만 막는다.

### 4.4 챕터 내부 입력·대기·결과 분리

전역 챕터는 네 개로 유지하되, 챕터 안에서 다음 surface를 독립적으로 전환한다.

```text
input → waiting → result
                   ↓
                revision → waiting → 새 result revision
```

- `input`: 고객이 답하거나 자료를 제출하는 집중 화면
- `waiting`: 분석·생성·컴파일 진행과 부분 준비 상태
- `result`: AI 결과·근거·불확실성·확정 CTA를 읽는 화면
- `revision`: 결과를 본 뒤 고객이 수정 요청을 입력하는 집중 화면
- `attention`: 실패·충돌·재촬영 등 복구 행동 화면

분리 규칙:

- 편집 가능한 input과 상세 AI output을 같은 canvas에 동시에 표시하지 않는다.
- result에는 고객 입력을 수정 폼이 아닌 읽기 전용 `적용 기준` snapshot으로만 표시한다.
- input에는 이전 결과 전체를 복제하지 않고 수정 대상과 이유만 짧게 표시한다.
- 저장 성공 후 별도 Next 없이 waiting 또는 result로 직접 전환한다.
- result에서 `수정 요청`을 선택할 때만 revision 화면을 연다.
- 브라우저 뒤로가기와 deep link는 현재 server snapshot에 맞는 유효 surface로 복구한다.
- surface는 진행 번호가 아니며 `1/4`, `다음 단계` 같은 wizard 표현을 사용하지 않는다.

챕터별 적용:

| 챕터·도메인 | input/revision | waiting | result |
|---|---|---|---|
| 상담 준비 | Photo 제출, 선택 opening intent | 사진 품질검사·분석 접수 | 제출 자료 receipt |
| AI 진단 | 필요한 추가 질문, 재촬영 | 얼굴·모질·컬러 후보 분석 | 얼굴 분석·모질 분석·근거·한계 |
| Hair 디자인 | primary 조정 요청 | Hair 9개 생성·rank | AI primary·전체 9개·근거 |
| Color | 염색 의향·안전 확인 | 염색 preview 생성 | 퍼스널 컬러·염색 결과 |
| Makeup | 메이크업 방향 입력 | 추천 근거·시뮬레이션 준비 | makeup map·예상 이미지·근거 |
| Fashion | 이번 상담 맥락 입력 | 3·6·9 생성 | AI 권장·전체 생성·상품 snapshot |
| 최종 리포트 | 없음 | report/PDF compilation | 읽기 전용 통합 결과 |

AI 진단 result의 분석 사진은 좌측에 둘 수 있지만, 우측은 editable input이 아니라 분석 결과·근거·시스템 상태만 표시한다. 추가 질문이 필요하면 result 위에 폼을 끼우지 않고 clarification surface로 전환한다.

## 5. 질문 소유권과 시점

| 정보 | 첫 Intake | 사진·AI | 분석 후 질문 | 살롱 확인 |
|---|---:|---:|---:|---:|
| 얼굴형·헤어라인·가시 볼륨 | 묻지 않음 | 관찰 | 저신뢰 시 보조 | 필요 시 |
| 모질·밀도·굵기 시각 추정 | 묻지 않음 | 관찰 | 결과 영향이 클 때 | 최종 확인 |
| 변화 의향 | 선택 입력 | 추론 금지 | primary 조정 시 확인 | 불필요 |
| 짧은 앞머리·강한 컬 회피 | 묻지 않음 | 추론 금지 | 해당 추천 후보가 있을 때 | 불필요 |
| 탈색·펌·염색 이력 | 묻지 않음 | 확정 금지 | 화학 시술 제안 시 | 필수 재확인 |
| 두피 민감·알레르기 | 묻지 않음 | 진단 금지 | 해당 시술 확정 시 | 필수 확인 |
| 손질 시간·방문 주기 | 온보딩 값 재사용 | 추론 금지 | 추천 결과가 정책과 충돌할 때 | 선택 확인 |
| 상담 범위 | 묻지 않음 | 산출물 준비도 파생 | 고객이 도메인을 건너뛸 때만 | 불필요 |

`unknown`은 실패가 아니다. 사진이나 고객 답변으로 확정할 수 없는 항목은 `salon_confirmation_required`로 남긴다.

## 6. 내부 상태 계약

### 6.1 시작 context

기존 `ConsultationIntentV2`는 legacy read 호환용으로 유지하고 신규 세션은 별도 시작 context를 사용한다.

```ts
export type ConsultationStartDisposition =
  | "direct_analysis"
  | "optional_intent_answered"
  | "legacy_intent_confirmed";

export type ConsultationValueSource =
  | "user"
  | "onboarding"
  | "entry_route"
  | "system_default"
  | "ai_observation"
  | "ai_followup"
  | "salon_confirmation";

export interface ConsultationStartContextV1 {
  schemaVersion: "consultation-start-context-v1";
  disposition: ConsultationStartDisposition;
  optionalOpeningIntent: OptionalOpeningIntent | null;
  optionalNote: string | null;
  fieldSources: {
    optionalOpeningIntent: ConsultationValueSource | null;
    optionalNote: ConsultationValueSource | null;
  };
  sourceProfileId: string | null;
  revision: number;
  startedAt: string;
  updatedAt: string;
}
```

`direct_analysis`는 `AI가 정해주세요`라는 사용자 선택과 다르다. 고객이 버튼 하나로 분석을 시작했다는 사실만 저장하며 change·scope·exclusions에 `user` provenance를 만들지 않는다.

### 6.2 유효 intent projection

downstream 호환을 위해 서버가 별도 projection을 파생한다.

```ts
export interface EffectiveConsultationIntentV3 {
  schemaVersion: "effective-consultation-intent-v3";
  scope: "hair" | "hair_color" | "total_styling";
  changeLevel: "maintain" | "natural_change" | "clear_change" | "undecided";
  scopeSource: ConsultationValueSource;
  changeLevelSource: ConsultationValueSource | null;
  exclusions: Array<{
    code: string;
    state: "selected" | "none" | "unknown";
    source: ConsultationValueSource | null;
  }>;
  unresolvedSafetyFieldIds: string[];
  fingerprint: string;
}
```

규칙:

- 기본 scope는 연결형 컨설팅 orchestration을 위한 `system_default`이며 고객 선택으로 표시하지 않는다.
- 선택하지 않은 change는 `undecided`다. 기존 natural change 기본값으로 덮지 않는다.
- exclusions 미응답은 `unknown`이다. `없음`으로 자동 확정하지 않는다.
- onboarding의 지속 선호와 이번 상담의 일회 답변을 별도 source revision으로 보존한다.
- AI observation은 고객 의향·금지 조건을 생성할 수 없다.

### 6.3 Intake 표시 상태

```ts
export type ZeroInputIntakeState =
  | "ready_to_start"
  | "optional_intent_open"
  | "saving_optional_intent"
  | "photo_required"
  | "photo_validating"
  | "analysis_starting"
  | "attention";
```

상태는 start context, photo draft, preflight, durable task에서 파생한다. `questionIndex`, `currentStep`, `coverage 0/3`를 저장하지 않는다.

### 6.4 챕터 surface presentation

```ts
export type ConsultationChapterSurfaceMode =
  | "input"
  | "waiting"
  | "result"
  | "revision"
  | "attention";

export interface ConsultationChapterSurfaceV1 {
  schemaVersion: "consultation-chapter-surface-v1";
  chapter: "intake" | "diagnosis" | "design" | "report";
  domain: "intake" | "hair" | "color" | "makeup" | "fashion" | "report";
  mode: ConsultationChapterSurfaceMode;
  hostStage: ConsultationStage;
  inputTask: RecommendedConsultationTaskV2 | null;
  activeTaskIds: string[];
  resultArtifactIds: string[];
  readOnlyInputSnapshotId: string | null;
  returnToResultHref: string | null;
  reasonCode: string;
}
```

이 계약은 `recommendedTask`, `activeTasks`, `blockingActions`, terminal artifact에서 매번 파생한다. 고객의 화면 위치를 별도 DB cursor로 저장하지 않는다.

파생 우선순위:

```text
attention
  > 명시적 revision 요청
  > 사용자 입력이 필요한 blocking action
  > active task waiting
  > terminal result
  > 최초 input
```

`resultArtifactIds`가 있어도 새 사용자 입력이 필요하면 기본 surface는 input 또는 revision이 된다. 단, 고객은 `기존 결과 보기`로 이전 immutable result를 열 수 있다.

## 7. Journey·readiness 변경

### 7.1 신규 readiness

```text
startReady = consultation owner 확인
             AND start context 생성 가능

photoAllowed = startReady

analysisAllowed = 유효한 photo asset
                  AND 사용 범위 동의
                  AND deterministic preflight가 blocking 실패가 아님
```

다음 값은 Photo 허용조건이 아니다.

- intent.scope
- intent.changeLevel
- exclusionsConfirmed
- currentHair 텍스트
- 모질·밀도·굵기·손상 선택
- allowedServices
- 손질 시간·방문 주기

### 7.2 내부 stage 호환

- 내부 `discovery`와 `photo` stage는 삭제하지 않는다.
- 신규 세션은 start context를 생성하면 `discovery`를 `completed_by_bypass`로 파생하고 Photo를 허용한다.
- `completedStages`에 새 enum을 넣지 않고 completion provenance에 reason code `ZERO_INPUT_START`를 저장한다.
- legacy confirmed intent는 `legacy_intent_confirmed`로 adapter한다.
- 미완료 legacy interview도 답변을 잃지 않고 `원하는 방향이 있다면 알려주기`에 prefill한 뒤 바로 Photo로 갈 수 있다.

## 8. 적응형 질문 정책

### 8.1 질문 발생 조건

질문은 다음 조건을 모두 만족할 때만 생성한다.

1. 사진·온보딩·기존 답변으로 값이 확정되지 않았다.
2. 답변에 따라 Hair primary, Color/Perm 안전성 또는 관리 적합성이 실제로 달라진다.
3. 동일 의미 질문을 이번 profile revision에서 묻지 않았다.
4. question budget 안에 있다.

### 8.2 우선순위

1. `safety_before_service_confirmation`
2. `primary_decision_margin_low`
3. `hard_preference_conflict`
4. `maintenance_feasibility_conflict`
5. `optional_result_refinement`

### 8.3 질문 예산

```ts
interface IntakeQuestionBudgetV2 {
  beforeHairPrimaryMaximum: 2;
  beforeHairPrimaryUsed: number;
  afterPrimaryRefinementMaximum: 2;
  afterPrimaryRefinementUsed: number;
  serviceSafetyQuestions: "only_when_relevant";
}
```

- Hair primary 전에 최대 2개이며 충분하면 0개다.
- 안전 질문은 관련 화학 서비스 확정 시점에만 추가된다.
- 질문 예산을 채우기 위해 질문을 만들지 않는다.
- 한 질문에 여러 독립 판단을 묶지 않는다.
- `모르겠어요`는 재질문 루프가 아니라 `salon_confirmation_required`로 종료한다.

## 9. API·저장 변경

### API

- `GET /api/v2/consultations/:id/start-context`
- `PATCH /api/v2/consultations/:id/start-context`
  - `expectedVersion`
  - 선택적 opening intent·note
- 기존 Photo 제출 API는 start context가 없으면 `direct_analysis`를 멱등 생성한다.
- 기존 P44 question API는 `queue`, `reasonCode`, `blockingDomain`, `questionBudget`을 반환한다.
- 기존 legacy `/intent` API는 구 클라이언트 호환용으로 유지하되 신규 UI는 호출하지 않는다.

### 저장

- start context는 consultation snapshot에 additive하게 저장한다.
- 별도 테이블이 필요하지 않으면 migration을 만들지 않는다.
- 기존 질문 instance·event check constraint에 신규 reason/event가 필요할 때만 mirrored additive migration을 만든다.
- mutation은 `expectedRevision`, owner scope, idempotency key를 검증한다.
- 브라우저 direct table write와 service-role key 노출을 금지한다.
- 선택적 자유 입력 원문은 제품 analytics에 포함하지 않는다.

## 10. 정확한 변경 지도

### Shared

- `packages/shared/src/consulting/contract.ts`
- `packages/shared/src/consulting/journey.ts`
- `packages/shared/src/consulting/interview.ts`
- `packages/shared/src/consulting/presentation.ts`
- 신규 start-context normalization·projection tests

### Web

- `my-app/components/consulting/interview/ZeroInputConsultationStart.tsx`
  - 신규 기본 경로이며 `ConsultantIntentInterview`는 flag-off 호환 adapter로 유지
- `my-app/components/consulting/workbenches/DiscoveryWorkbench.tsx`
  - legacy 상세 form 자동 fallback 제거
- `my-app/components/consulting/workbenches/PhotoWorkbench.tsx`
  - 첫 주 CTA의 직접 목적지
- `my-app/components/consulting/workbenches/AnalysisWorkbench.tsx`
  - 얼굴·모질 분석 result 전용 surface
- `my-app/components/consulting/ConsultationStagePage.tsx`
  - chapter surface projection에 따른 input/waiting/result/revision host 전환
- `my-app/components/consulting/scene/ConsultationScene.tsx`
  - mixed input/output workbench를 chapter-local 독립 surface로 전환
- 적응형 질문 composite
  - Diagnosis clarification 전용 surface, Analysis result와 동시 렌더링 금지
- `my-app/lib/consulting/stage-guards.ts`
- `my-app/lib/consulting/feature-flag.ts`
- `my-app/lib/consulting/server-store.ts`
- start-context API route·server adapter

### Native

- `apps/hairfit-app/app/consulting.tsx`
- `packages/api-client/src/index.ts`
  - start-context GET/PATCH Web·Native 공통 client
- Web과 같은 direct analysis, optional intent, adaptive question budget 적용

### Governance

- `docs/components/passports/web-consulting-interview.yaml`
- `docs/components/passports/native-consulting-screen.yaml`
- `docs/components/component-registry.json`
- P43 종료 판정에 P54 supersession 표시

## 11. 컴포넌트 안정성 계약

- 대상 종류: feature composite
- 기존 상태: candidate
- 변경 게이트: behavioral
- public CSS namespace: 유지
- DOM/CSS breaking change: 없음
- 전역 token 추가: 없음
- 필수 검증: interaction test, keyboard/focus, browser responsive, component registry

기존 `ConsultationInterviewShell`은 optional intent와 clarification surface에서 재사용할 수 있지만 첫 화면에 3개 topic navigation을 렌더링하지 않는다. input과 result를 동시에 배치하던 feature composite는 public props를 유지하는 adapter를 거쳐 순차 전환하므로 전역 CSS namespace를 깨지 않는다.

## 12. 기능 플래그·롤아웃

신규 플래그:

- `CONSULTATION_ZERO_INPUT_INTAKE_ENABLED`
- 기존 `CONSULTATION_ADAPTIVE_DIAGNOSIS_ENABLED` 재사용

| 상태 | 신규 상담 | 기존 상담 |
|---|---|---|
| Zero-input OFF | 3결정 `ConsultantIntentInterview` | 저장된 intent 재개 |
| Zero-input ON | 바로 Photo + 선택 intent | 기존 답변 보존, 바로 Photo 허용 |
| Adaptive questions OFF | 분석 결과와 `salon_confirmation_required`만 표시 | 동일 |
| Adaptive questions ON | 필요 질문 0~2개 | 기존 답변과 중복 제거 |

OFF fallback은 상세 `DiscoveryFormWorkbench`가 아니라 P43의 3결정 인터뷰로 고정한다. 구 상세 form은 한 릴리스 동안 deep-link 호환 코드로만 남기고 고객 기본 경로에서 제거한다.

권장 rollout:

1. 계약·Web/Native fixture
2. 내부 계정 100%
3. 신규 상담 10%
4. 질문 수·Photo 도달률·오류 관찰
5. 50%
6. 100%
7. legacy 상세 fallback 제거 여부 별도 승인

## 13. 구현 페이즈

### P54-0 — 기준선·호환 adapter

- 현재 3결정/상세 form 진입 조건 inventory
- start context·effective intent 계약 추가
- legacy V2 intent adapter와 provenance 테스트
- 플래그 OFF fixture 고정

종료 기준:

- 신규 계약이 기존 snapshot을 깨지 않고 읽는다.
- 기본값과 user source가 혼합되지 않는다.
- 상세 form이 신규 기본 경로로 열리지 않는다.

### P54-1 — Journey·API 전환

- Photo readiness에서 intent 필수조건 제거
- start-context GET/PATCH와 Photo 멱등 bypass
- ownership·revision·idempotency 검증
- 필요한 경우 mirrored migration과 RLS

종료 기준:

- 빈 신규 세션에서 Photo route가 허용된다.
- start context 중복 생성이 한 revision으로 replay된다.
- 다른 사용자의 consultation 접근이 차단된다.

### P54-2 — Web·Native 첫 화면

- 주 CTA와 optional intent 구현
- 0/3 coverage·topic list 제거
- 저장 후 직접 Photo 전환
- 나가기·재개·offline/conflict 복구

종료 기준:

- 질문 선택 없이 한 번의 CTA로 Photo에 도달한다.
- Web/Native parity가 통과한다.
- CSS 시각 스타일과 namespace가 유지된다.

### P54-3 — 챕터 surface 분리·분석 후 적응형 질문

- chapter surface projection과 input/waiting/result/revision host 연결
- mixed editable input·AI output 동시 렌더링 제거
- Analysis host와 P44 question queue 연결
- 최대 2개 pre-primary budget
- 안전 질문의 domain blocking 분리
- answer/unknown/skip/salon-confirmation 상태

종료 기준:

- 충분한 분석에서는 질문 0개다.
- 질문이 필요한 fixture는 정확한 reason code로 최대 2개만 표시된다.
- 안전 질문 미응답은 Hair 추천을 막지 않고 관련 서비스 확정만 막는다.
- result에는 읽기 전용 적용 기준만 있고 편집 폼이 없다.
- 수정 CTA는 독립 revision surface로 이동하고 완료 후 새 result revision으로 복귀한다.

### P54-4 — 회귀·관측·Canary 준비

- stage/chapter/deep-link/legacy resume 회귀
- event·metric·dashboard 계약
- flag OFF rollback drill
- 문서·passport·evidence package 갱신

종료 기준:

- 로컬 검증과 외부 증거층이 분리 보고된다.
- OFF 전환 시 저장된 start context와 질문 답변이 삭제되지 않는다.
- 실제 트래픽 변경 없이 canary/off dry-run이 통과한다.

## 14. 테스트 계획

### 계약

- direct analysis는 scope/change/exclusions user provenance를 만들지 않음
- optional intent 선택만 user source가 됨
- legacy confirmed intent 변환
- unknown exclusions와 explicit none 구분
- effective intent fingerprint 안정성
- 질문 0·1·2개와 budget 초과 차단

### API·DB

- owner success, non-owner/anon denial
- expected revision 충돌
- Photo와 start context 동시 접수 멱등성
- migration mirror·fresh·upgrade·RLS/FORCE RLS
- 이벤트에 자유 입력·사진 URL·token 부재

### Web·Native interaction

- 신규 상담 첫 화면에 질문 목록과 0/3 부재
- `사진으로 바로 진단 시작` 키보드·터치 동작
- 선택 intent 열기·닫기·저장·재개
- Photo 제출 후 자동 분석
- 질문 0개이면 결과 자동 표시
- 질문 1~2개이면 한 카드씩 저장 후 진행
- input·clarification·revision 화면과 result 화면이 동시에 렌더링되지 않음
- result의 `적용 기준`은 읽기 전용이며 수정 요청은 별도 surface에서 수행
- `모르겠어요`와 skip
- offline·409 conflict·분석 실패 복구

### 접근성·반응형

- 초기 focus는 제목 또는 주 CTA
- 상태 변경 `aria-live`
- 라디오·버튼 키보드 조작
- 390/768/desktop overflow 0
- reduced motion에서 자동 전환 애니메이션 축소
- 포커스가 숨겨진 optional panel에 남지 않음

### 회귀

- P43 4챕터
- P44 모질 분석과 질문 bank
- P47~P49 Hair 9개·AI primary
- Color/Makeup/Fashion domain gating
- Result/PDF provenance
- legacy 세션과 기능 플래그 OFF

## 15. 명확한 최종 종료 기준

- [x] 신규 고객은 질문에 답하지 않고 Photo에 진입할 수 있다.
- [x] 사진 전 필수 질문과 필수 텍스트 입력이 0개다.
- [x] 첫 화면의 주 CTA는 `사진으로 바로 진단 시작`이다.
- [x] optional intent는 한 개의 선택 영역이며 분석 시작을 막지 않는다.
- [x] 0/3 coverage와 세 주제 navigation이 신규 기본 경로에서 제거된다.
- [x] `exclusionsConfirmed`는 Photo readiness 조건이 아니다.
- [x] 미응답 exclusions는 `none`이 아니라 `unknown`으로 보존된다.
- [x] 시스템 기본값·온보딩·AI·고객 답변 provenance가 분리된다.
- [x] 사진 제출 후 별도 분석 실행 CTA 없이 durable analysis가 접수된다.
- [x] 분석 후 질문은 필요한 경우에만 Hair primary 전 최대 2개다.
- [ ] 충분한 분석 fixture에서는 질문 0개로 Hair 추천에 도달한다.
- [ ] 화학 시술 안전 질문은 관련 서비스 확정만 차단한다.
- [x] 사용자는 질문을 건너뛰거나 `모르겠어요`를 선택할 수 있다.
- [x] 저장 후 별도 Next가 없다.
- [x] 같은 챕터에서도 편집 가능한 입력과 상세 결과가 독립 surface로 분리된다.
- [x] result에는 읽기 전용 입력 snapshot만 표시된다.
- [x] 추가 질문은 Diagnosis result 옆에 끼워 넣지 않고 clarification surface에서 표시된다.
- [x] 결과 수정은 독립 revision surface에서 수행하고 새 immutable result revision으로 돌아온다.
- [x] surface mode는 snapshot에서 파생되며 wizard cursor로 저장되지 않는다.
- [x] 기존 intent·질문·사진·분석·결과 snapshot은 덮어쓰거나 삭제하지 않는다.
- [x] Web·Native·legacy resume·deep link가 일관된다(정적·fixture 기준).
- [x] 기존 CSS namespace·token·전반적 시각 스타일이 유지된다.
- [x] component registry와 passport가 갱신된다.
- [x] shared/Web/API/Native typecheck, focused lint, contract, interaction, browser 검증이 통과한다.
- [ ] migration이 필요하면 mirror·fresh·upgrade·RLS가 통과한다.
- [ ] 실인증·provider·원격 DB·배포 증거는 로컬 결과와 분리된다.

## 16. 롤백

1. `CONSULTATION_ZERO_INPUT_INTAKE_ENABLED=false`
2. 신규 상담은 P43 3결정 인터뷰로 복귀
3. 진행 중 분석 task는 취소하지 않고 terminal 또는 복구 상태로 유지
4. start context와 adaptive answer는 삭제하지 않음
5. legacy 상세 form으로 자동 복귀하지 않음

롤백은 snapshot, photo asset, evidence, task, generation, report, usage receipt를 삭제하지 않는다.

## 17. 증거 경계

로컬 contract·browser fixture는 실제 고객의 이탈률 감소나 질문 피로 개선을 증명하지 않는다. 실인증 resume, 실제 사진 분석, provider 비용, 원격 DB, 배포 Canary는 별도 승인과 증거가 필요하다. 구현 완료 보고에서는 다음을 분리한다.

- local static/contract
- local browser fixture
- authenticated session
- actual provider
- remote database
- deployed canary

문서 작성 완료는 구현·migration·배포 완료를 의미하지 않는다.

## 18. 2026-08-20 로컬 구현 증거

구현 완료:

- `ConsultationStartContextV1`, `EffectiveConsultationIntentV3`, deterministic fingerprint와 legacy adapter
- `ConsultationSnapshot.startContext`, Journey Photo readiness, stage guard, server snapshot patch
- Web `ZeroInputConsultationStart`와 Native 동일 start-context API client
- owner 인증·`expectedVersion` 충돌을 사용하는 `GET/PATCH /api/v2/consultations/:id/start-context`
- Diagnosis clarification과 Analysis result의 독립 렌더링
- Hair clarification·revision 입력과 9개 result gallery의 독립 렌더링
- pre-primary 모질 추가 질문 hard cap `2`
- chapter surface projection과 Scene `data-consulting-surface`
- 신규 rollout flag, OFF payload, P43 fallback, passport·registry 갱신

검증 완료:

- Shared typecheck 및 전체 unit `161/161`
- Web·API client·Native typecheck
- Consulting contract `132/132`
- P54 focused contract `3/3`
- Native consultation contract `9/9`
- Component registry `64/64`
- 변경 Web 파일 targeted ESLint 오류 `0`
- 개발 하네스 Discovery에서 필수 질문 `0`, 선택 intent `4`, 0/3 목록 부재 확인
- 개발 하네스 Analysis에서 질문만 표시되고 얼굴·모질 상세 result가 동시 렌더링되지 않음을 확인
- 390/768/1440 폭에서 horizontal overflow `0`
- Analysis clarification card 폭은 각각 `91.8% / 91.7% / 62.2%`, 선택 CTA는 `2열 / 4열 / 4열` 균등 배치
- 브라우저 console error `0`; Clerk development-key warning만 존재

증거 미완료:

- 실인증 세션의 start-context mutation·resume
- 실제 사진과 provider를 사용한 질문 `0/1/2` 분기
- 원격 DB·Cloudflare flag 등록·Canary·배포
- Native 실기기 접근성·offline·409 conflict interaction

이번 변경은 snapshot JSON의 additive 필드만 사용하므로 DB migration을 추가하지 않았다. Docker, 원격 migration, 배포, 비용 발생 provider 호출은 수행하지 않았다.

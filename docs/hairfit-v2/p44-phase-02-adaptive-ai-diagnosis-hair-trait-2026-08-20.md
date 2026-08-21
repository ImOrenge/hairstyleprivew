# P44 Phase 02 — 적응형 AI 진단과 모질 분석

- 기준일: 2026-08-20
- 선행 페이즈: P43 컨설턴트형 인터뷰·4챕터 압축
- 질문 은행: P42 AI 진단 적응형 추가 질문 은행
- 후속 페이즈: P45 메이크업 스타일 시뮬레이션
- 변경 성격: AI 진단 챕터의 child capability와 evidence/profile 계약 추가
- 비목표: 의료·탈모 진단, 다공성·탄력 직접 측정, Color Studio 염색 마스크 재사용, 별도 고객 여정 stage 추가

## 1. 목표

사진 제출 후 얼굴 분석과 병렬로 시각 기반 모발 특성을 분석하고, 사진만으로 부족한 핵심 정보만 적응형 질문으로 보완한다. 관찰과 사용자 답변을 분리 저장하며, 결과는 헤어 추천·염색·브리프·리포트에 같은 revision과 fingerprint로 전달한다.

## 2. 고객 경험

```text
사진 제출
  → 시스템 사전검사
  → 얼굴·모질·선택적 퍼스널 컬러 병렬 분석
  → 준비된 부분 결과부터 표시
  → 필요한 추가 질문 최대 4개
  → Hair 설계 기준 준비
```

- 별도의 `모질 검사` 전역 단계는 없다.
- 사용자가 `분석 실행`을 다시 누르지 않는다.
- 결과가 충분하면 질문 0개로 완료된다.
- 모질 분석 실패가 얼굴 분석·퍼스널 컬러 결과를 폐기하지 않는다.
- 사용자는 대기 중 나갈 수 있고 재접속 시 서버 task와 부분 결과를 복원한다.

## 3. 분석 범위

### 관찰 가능한 trait

- texture pattern
- apparent density와 영역별 분포
- strand thickness class의 시각 추정
- crown/side/end volume behavior
- frizz와 flyaway
- surface shine
- visible end condition
- color uniformity
- hairline/parting visibility

### 확정하지 않는 항목

- 실제 모발 직경
- 다공성, 탄력, 내부 손상
- 두피 질환, 탈모, 의학적 원인
- 정확한 화학 시술 이력
- 탈색·펌 시술 안전성

비지원 항목은 `unknown`, `reported` 또는 `salon_confirmation_required`로 남긴다.

## 4. 내부 상태 계약

### 4.1 분석 run 상태

```ts
export type HairTraitAnalysisRunState =
  | "idle"
  | "queued"
  | "preflight"
  | "segmenting"
  | "extracting"
  | "reconciling"
  | "partial_ready"
  | "completed"
  | "retry_required"
  | "failed"
  | "cancelled";

export interface HairTraitAnalysisRunV1 {
  id: string;
  consultationId: string;
  state: HairTraitAnalysisRunState;
  sourceFingerprint: string;
  sourceAssetIds: string[];
  model: { provider: string; name: string; version: string } | null;
  pipeline: {
    preflight: "pending" | "running" | "complete" | "failed";
    segmentation: "pending" | "running" | "complete" | "failed";
    extraction: "pending" | "running" | "complete" | "failed";
    reconciliation: "pending" | "running" | "complete" | "failed";
  };
  completedTraitCount: number;
  totalTraitCount: number;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  fencingToken: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
}
```

### 4.2 profile 상태

분석 task 완료와 사용자 clarification 완료를 같은 상태로 취급하지 않는다.

```ts
export type HairProfileState =
  | "empty"
  | "observations_partial"
  | "observations_ready"
  | "clarification_available"
  | "clarification_required"
  | "reconciling"
  | "ready"
  | "confirmed"
  | "superseded"
  | "attention";

export interface HairProfileV2 {
  schemaVersion: "hair-profile-v2";
  id: string;
  consultationId: string;
  revision: number;
  state: HairProfileState;
  sourceFingerprint: string;
  observed: HairTraitObservationV1[];
  reported: Record<string, InterviewAnswer>;
  inferred: Record<string, HairTraitInferenceV1>;
  conflicts: InterviewConflict[];
  unresolvedFieldIds: string[];
  questionBudget: {
    preResultUsed: number;
    postResultUsed: number;
    maximum: 4;
  };
  confirmedRevision: number | null;
  supersedesProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 4.3 질문 instance 상태

```ts
export type DiagnosticQuestionState =
  | "candidate"
  | "proposed"
  | "visible"
  | "saving"
  | "answered"
  | "unknown"
  | "skipped"
  | "salon_confirmation"
  | "expired";

export interface DiagnosticQuestionInstanceV1 {
  id: string;
  templateId: string;
  consultationId: string;
  analysisRunId: string;
  profileRevision: number;
  queue: "diagnosis-critical" | "result-refinement" | "design-deferred";
  state: DiagnosticQuestionState;
  reasonCode: string;
  evidenceIds: string[];
  answer: InterviewAnswer | null;
  createdAt: string;
  resolvedAt: string | null;
}
```

### 4.4 consultation task projection

`ConsultationTaskKind`에 `hair-trait-analysis`를 additive하게 추가한다.

```ts
const taskProjection = {
  kind: "hair-trait-analysis",
  stage: "scan",
  originStage: "photo",
  transitionHostStage: "scan",
  destinationStage: "analysis",
  readinessKey: "hair-profile-terminal",
};
```

task status는 다음처럼 매핑한다.

| run state | task status | 고객 표시 |
|---|---|---|
| queued, preflight | pending/running | 사진 상태를 확인하고 있어요 |
| segmenting | running | 모발 영역을 구분하고 있어요 |
| extracting | running/partial | 모발 특성을 살펴보고 있어요 |
| reconciling | running | 기존 답변과 분석을 맞추고 있어요 |
| partial_ready | partial | 준비된 결과부터 보여드려요 |
| retry_required | waiting | 일부 항목을 다시 확인할게요 |
| failed | failed | 모질 분석을 완료하지 못했어요 |
| completed | complete | 모질 분석이 준비됐어요 |

## 5. 상태 전이

| 현재 | 이벤트 | 조건 | 다음 | 동작 |
|---|---|---|---|---|
| idle | PHOTO_ACCEPTED | preflight 가능한 private asset | queued | 멱등 run 생성 |
| queued | LEASE_ACQUIRED | fencing token 발급 | preflight | worker 시작 |
| preflight | PHOTO_RETRY_REQUIRED | blocking quality | retry_required | 재촬영 action 생성 |
| preflight | PHOTO_USABLE | pass/warning | segmenting | source transform 고정 |
| segmenting | MASK_PARTIAL_READY | 일부 마스크 유효 | extracting | partial artifact 저장 |
| segmenting | MASK_FAILED | retryable | retry_required | 해당 capability만 재시도 |
| extracting | TRAIT_SAVED | trait validator 통과 | extracting/partial_ready | trait별 immutable evidence |
| extracting | REQUIRED_TRAITS_TERMINAL | 완료+명시적 unknown | reconciling | profile draft 생성 |
| reconciling | QUESTIONS_SELECTED | 예산 내 후보 존재 | completed | profile state를 clarification으로 파생 |
| reconciling | NO_QUESTION_NEEDED | high confidence | completed | profile ready |
| retry_required | RETRY_ACCEPTED | attempt 제한 이내 | queued | 새 fencing token |
| completed | NEW_SOURCE_ASSET | fingerprint 변경 | cancelled/superseded | 새 run 생성 |

완료된 evidence는 같은 row를 수정하지 않는다. 새 사진이나 모델 버전 변경은 새 run과 새 profile revision을 만든다.

## 6. 처리 파이프라인

### 6.1 deterministic preflight

- MIME, 파일 크기, 해상도
- blur, 조명, 과·저노출, 색 왜곡
- 얼굴 수, 정면성
- 모발, 가르마, 헤어라인, 끝부분 가시성
- 모자·손·액세서리·배경 간섭

preflight는 AI 결과가 아니며 `pass`, `warning`, `retry_required`를 구조화해 저장한다.

### 6.2 segmentation

- hair_primary
- hair_flyaway
- scalp_visible
- parting
- hairline
- face_exclusion
- accessory_exclusion
- background_exclusion

모질 분석용 마스크는 evidence와 quality 계산용이다. Color Studio의 염색 생성 마스크와 목적·품질 기준이 다르므로 자동 재사용하지 않는다.

### 6.3 feature extraction

각 trait는 단일 label 대신 분포와 영역을 저장한다.

```ts
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
```

### 6.4 confidence calibration

초기 정책:

- `>= 0.80`: 관찰값 사용
- `0.55~0.79`: downstream 영향이 크면 질문 후보
- `< 0.55`: unknown, 사실 prompt에서 제외

최종 confidence는 모델 값만 사용하지 않고 photo quality, mask boundary, 복수 사진 일치도를 합성한다.

### 6.5 reconciliation

- observed와 reported가 일치하면 inferred confidence 보강
- 불일치하면 source conflict 생성
- unknown은 기본값으로 채우지 않음
- salon confirmation은 Brief unresolved 항목으로 전달
- AI 설명은 source를 요약하지만 값·선택지·충돌 해소를 결정하지 않음

## 7. 적응형 질문

P42의 등록 은행에서 후보를 고른다.

- 결과 전 최대 2개
- 결과와 함께 최대 2개
- 총 최대 4개
- chain 깊이 최대 2
- 동일 field/run 중복 금지
- unknown 또는 salon confirmation 이후 같은 run 재질문 금지

질문 후보가 많아도 실제 노출 수는 늘어나지 않는다. design-deferred 질문은 Hair/Color 탭으로 전달한다.

## 8. 병렬성과 부분 실패

사진 preflight 통과 후 다음을 병렬 접수한다.

1. face-analysis
2. hair-trait-analysis
3. personal-color-analysis: scope와 동의가 있을 때만

`Promise.allSettled` 또는 durable task fan-out으로 독립 결과를 보존한다. 한 capability 실패를 consultation 전체 실패로 변환하지 않는다.

AI 진단 챕터 readiness:

```text
face analysis terminal
AND hair profile terminal or explicitly unavailable
AND personal color terminal/not_applicable/deferred
```

`terminal`은 completed만 의미하지 않는다. 최대 재시도 도달의 명시적 unavailable도 포함하며 UI에 limitation을 남긴다.

## 9. API

- `POST /api/v2/consultations/:id/hair-analysis/runs`
- `GET /api/v2/consultations/:id/hair-analysis`
- `PATCH /api/v2/consultations/:id/hair-profile/clarifications`
- `POST /api/v2/consultations/:id/hair-profile/confirm`

사진 제출 service가 run start를 서버 내부에서 호출한다. 브라우저가 별도 분석 버튼을 누르지 않는다.

요청 불변식:

- Clerk 사용자와 consultation 소유권
- expected revision
- source asset 소유권과 retention
- idempotency key = consultation + source fingerprint + capability version
- 등록 template ID와 option allow-list

## 10. 저장과 보안

additive 모델:

| 테이블 | 책임 |
|---|---|
| hair_analysis_runs_v2 | run, lease, retry, heartbeat, fencing |
| hair_trait_evidence_v2 | immutable trait evidence와 region |
| consultation_hair_profiles_v2 | revisioned observed/reported/inferred profile |
| consultation_interview_drafts_v2 | 질문 답변, coverage, conflict |

보안 기준:

- public schema RLS와 현재 Clerk 소유권 경계 유지
- 브라우저 direct DB write 금지
- model output write는 server-only
- secret/service role을 NEXT_PUBLIC 환경변수로 노출 금지
- private storage와 짧은 signed URL
- 필요 없는 Data API grant 회수
- UPDATE가 있으면 SELECT policy도 함께 검증
- 원본 이미지·signed URL·자유 답변을 로그에 기록하지 않음

실제 migration은 구현 시 CLI help를 확인하고 `supabase migration new`로 생성한다. root와 `my-app` migration mirror 정책을 따른다.

## 11. downstream projection

공통 생성 입력에 다음을 추가한다.

```ts
interface HairProfileReferenceV1 {
  profileId: string;
  revision: number;
  sourceFingerprint: string;
  usedFieldIds: string[];
  unknownFieldIds: string[];
}
```

- Hair Preview는 검증된 inferred trait만 사용
- Color는 current color와 visible condition을 참고하지만 안전성을 확정하지 않음
- Makeup은 hair trait를 얼굴 좌표 결정에 사용하지 않음
- Fashion은 확정 헤어 인상만 사용하고 모질 evidence를 직접 과대 사용하지 않음
- Brief/Result는 observed, reported, limitation을 구분해 표시

## 12. UI

### 좌측

- 분석 원본
- 안전한 hair region overlay
- 사진 품질과 추가 사진 선택 요청

### 우측

- capability별 진행 상태
- 준비된 trait 카드
- confidence와 한계
- 확인이 필요한 질문 한 장
- 답변 반영 후 변경된 추천 근거

기술 마스크·모델 파라미터를 고객 기본 화면에 노출하지 않는다. `관찰`, `사용자가 알려준 내용`, `상담 기준`의 세 그룹으로 설명한다.

## 13. 기능 플래그와 롤백

- `HAIR_TRAIT_ANALYSIS_ENABLED`
- `HAIR_TRAIT_CLARIFICATION_ENABLED`
- `AI_DIAGNOSIS_ADAPTIVE_QUESTION_BANK_ENABLED`

롤백:

1. adaptive bank OFF → P41 기본 질문만 사용
2. clarification OFF → 구조화 관찰만 표시
3. hair analysis OFF → legacy Discovery 모발 projection

저장된 run, evidence, profile은 삭제하지 않는다.

## 14. 구현 순서

1. shared state·evidence·profile validator
2. additive migration과 RLS/권한 테스트
3. durable task와 idempotency/lease/fence
4. preflight·segmentation adapter
5. extraction·confidence·reconciliation
6. adaptive question policy와 API
7. AI 진단 workbench·partial state
8. generation input·Brief·Result 연결
9. Native parity와 feature flag rollback

## 15. 테스트

### 모델·정책 fixture

- straight/wave/curl과 혼합 분포
- 어두운 모발·어두운 배경, 염색·탈색, 액세서리
- 낮은 해상도·blur·과노출·부분 가림
- high/medium/low confidence 분기
- 사용자 답변 충돌과 unknown

### durable task

- 동일 fingerprint 중복 접수 replay
- 만료 lease 재획득과 stale fence 거부
- partial evidence 보존
- 실패 trait만 재시도
- 새 asset이 이전 profile을 supersede

### 브라우저

- 사진 제출 후 분석까지 불필요 클릭 0회
- partial/waiting/retry/failed/complete 구분
- 질문 최대 4개와 결과 먼저 보기
- 나가기·재개, 409 revision conflict
- keyboard, aria-live, reduced motion, 390/768/desktop

### 보안·회귀

- 교차 사용자 asset/profile 접근 거부
- 의료·탈모 단정 문구 부재
- 낮은 confidence가 prompt 사실 필드에 없음
- Color mask와 evidence mask 목적 분리
- 기능 플래그 OFF legacy 경로

## 16. 종료 기준

- [ ] 모질 분석은 AI 진단의 child task이며 새 stage를 만들지 않는다.
- [ ] 사진 제출 뒤 자동으로 접수되고 별도 실행 CTA가 없다.
- [ ] trait마다 근거 영역, confidence, limitation, 모델 버전이 저장된다.
- [ ] observed/reported/inferred/unknown을 구분한다.
- [ ] 질문 후보가 많아도 실제 노출은 최대 4개다.
- [ ] partial 결과와 capability별 실패가 독립적으로 보존된다.
- [ ] 다공성·탄력·탈모·시술 안전성을 사진으로 확정하지 않는다.
- [ ] 동일 profile revision과 fingerprint가 Preview/Brief/Result에 이어진다.
- [ ] private storage, RLS, owner check, server-only write 검증이 통과한다.
- [ ] Web/Native와 롤백 회귀가 통과한다.

## 17. 증거 경계

로컬 fixture와 계약 테스트는 실사진 정확도, 모발 유형별 공정성, 실제 provider 성능, 사용자 응답 품질, 원격 migration, canary 또는 production 배포를 증명하지 않는다. 별도 dataset/model card와 사람 검토 기준, 인증 환경 canary 결과가 필요하다.

## 18. 2026-08-20 로컬 종료 판정

판정: **PASS — 구현·로컬 검증 완료**

- Photo 분석과 병렬로 `hair-trait-analysis` durable child capability를 자동 접수하며 별도 사용자 실행 CTA를 만들지 않았다.
- trait provenance를 `observed/reported/inferred/unknown`으로 나누고 confidence·limitation·model version·profile revision·fingerprint를 저장한다.
- 보충질문은 최대 4개이며 원자적 revision 확인 함수로 답변과 profile을 함께 갱신한다. 사진만으로 다공성·탄력·내부 손상·시술 안전성을 확정하지 않는다.
- Preview 공통 입력, Salon Brief, Result가 같은 hair profile revision/fingerprint를 참조한다.
- Web harness에서 관찰 근거·unknown 안내·보충질문을 확인했고 Web/Native·shared/consulting 계약과 migration mirror 100개가 통과했다.
- RLS·service-role-only·immutable 정책은 migration 정적 계약으로 검증했다. 원격 적용, 실사진 정확도·공정성·provider 성능은 미검증이다.

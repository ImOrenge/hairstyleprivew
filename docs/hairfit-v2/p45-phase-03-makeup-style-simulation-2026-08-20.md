# P45 Phase 03 — 메이크업 진단 후 스타일 시뮬레이션

- 기준일: 2026-08-20
- 선행 페이즈: P43 컨설턴트형 여정, P44 적응형 AI 진단
- 선행 Makeup 계약: P40 메이크업 인터뷰·AI 추천 근거
- 변경 성격: 기존 `makeup` stage 내부에 생성·검토·확정 상태 추가
- 비목표: 새 전역 stage, 실제 제품 발색 보장, 피부 치료·성형 시뮬레이션, 고객용 기술 패널 복구, 별도 유료 생성 확인 UI

## 1. 목표

메이크업 인터뷰와 AI 추천 검토 후, 확정 방향을 사용자의 얼굴에 적용한 `메이크업 스타일 시뮬레이션`을 생성한다. 사용자는 Fashion으로 이동하기 전에 Before/After 결과를 검토·조정·확정하며, 최종 이미지는 Result의 Makeup 탭에 읽기 전용으로 이어진다.

`시술 예상 이미지`라는 보장성 표현 대신 `메이크업 스타일 시뮬레이션`을 사용한다.

## 2. 여정 위치

```text
Salon Brief 준비
  → Makeup 인터뷰
  → AI 추천·조정안 검토
  → 방향 가이드 확인
  → 시뮬레이션 생성 대기
  → Before/After 검토·조정
  → Makeup 확정
  → Fashion
  → Result Makeup 탭
```

- AI 진단 챕터에는 생성 이미지를 표시하지 않는다.
- 스타일 디자인 챕터의 Makeup 탭에서 생성과 결정을 수행한다.
- Result에서는 확정 결과와 근거만 표시하며 재생성 controls를 제공하지 않는다.

## 3. 생성 전제조건

다음이 모두 준비돼야 자동 접수할 수 있다.

- Makeup interview의 필수 coverage 완료
- `MakeupRecommendationRationaleV1` 준비
- `accept_adjustment | keep_selection` 결정 완료
- Makeup direction map 또는 7개 모듈 구조화 결과 준비
- source face asset 소유권·retention 유효
- Personal Color profile/evidence terminal 또는 명시적 deferred
- 동일 consultation의 확정 Hair/Color snapshot
- 서버 entitlement·capability 판정 통과

사용자에게 별도의 유료 생성 확인 질문을 표시하지 않는다. 서버가 entitlement와 idempotency를 판정하며 권한이 없으면 정확한 접근 복구 안내를 제공한다.

## 4. 내부 상태 계약

### 4.1 Makeup workspace 파생 상태

```ts
export type MakeupWorkspaceStateV2 =
  | "interview"
  | "recommendation_preparing"
  | "recommendation_review"
  | "direction_review"
  | "simulation_queued"
  | "simulation_generating"
  | "simulation_partial"
  | "simulation_review"
  | "simulation_retry_required"
  | "simulation_failed"
  | "confirmed";
```

이 상태는 별도 `currentStep`으로 저장하지 않는다. 다음 권위 사실에서 매번 파생한다.

- interview `confirmedRevision`
- recommendation rationale revision과 decision
- direction map status·revision
- simulation run state
- accepted output ID
- immutable simulation selection snapshot

P40의 `direction-map` 표시명은 `direction_review`로 투영한다. 내부 호환 상태와 module data는 유지하되 고객에게 landmark·좌표·revision 기술 패널을 노출하지 않는다.

### 4.2 생성 run 상태

```ts
export type MakeupSimulationRunState =
  | "idle"
  | "queued"
  | "preparing"
  | "generating"
  | "quality_review"
  | "partial_ready"
  | "completed"
  | "retry_required"
  | "failed"
  | "cancelled";

export interface MakeupSimulationRunV1 {
  id: string;
  consultationId: string;
  state: MakeupSimulationRunState;
  purpose: "makeup_style_simulation";
  requestedOutputCount: 1 | 2;
  terminalOutputCount: number;
  sourceAssetId: string;
  sourceFingerprint: string;
  inputFingerprint: string;
  makeupInterviewRevision: number;
  rationaleRevision: number;
  directionRevision: number;
  personalColorProfileId: string | null;
  selectedHairSnapshotId: string;
  selectedColorSnapshotId: string | null;
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

### 4.3 output 상태

```ts
export type MakeupSimulationOutputState =
  | "pending"
  | "generated"
  | "quality_rejected"
  | "ready"
  | "failed";

export interface MakeupSimulationOutputV1 {
  id: string;
  runId: string;
  variant: "primary" | "alternative";
  state: MakeupSimulationOutputState;
  imagePath: string | null;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  moduleSummary: Array<{
    module: "base" | "brow" | "eyeshadow" | "eyeliner" | "blush" | "lip" | "lash";
    color: string;
    intensity: number;
    finish: string;
    reasonCodes: string[];
  }>;
  quality: {
    identityPreservation: number | null;
    faceGeometryPreservation: number | null;
    moduleAdherence: number | null;
    colorAdherence: number | null;
    backgroundPreservation: number | null;
    hairPreservation: number | null;
    retouchingRisk: number | null;
    status: "pending" | "pass" | "warning" | "reject";
    warnings: string[];
  };
  provider: string | null;
  model: string | null;
  modelVersion: string | null;
  createdAt: string;
}
```

### 4.4 확정 snapshot

```ts
export interface MakeupSimulationSelectionSnapshotV1 {
  schemaVersion: "makeup-simulation-selection-v1";
  id: string;
  consultationId: string;
  revision: number;
  runId: string;
  outputId: string;
  sourceAssetId: string;
  inputFingerprint: string;
  makeupInterviewRevision: number;
  rationaleRevision: number;
  directionRevision: number;
  adjustmentDecision: "accept_adjustment" | "keep_selection";
  confirmedModuleValues: MakeupSimulationOutputV1["moduleSummary"];
  limitations: string[];
  confirmedAt: string;
  supersedesSnapshotId: string | null;
}
```

확정 snapshot은 불변이다. 인터뷰·추천·컬러·모듈을 수정하면 기존 snapshot을 바꾸지 않고 새 run과 새 selection revision을 만든다.

### 4.5 consultation task projection

`ConsultationTaskKind`에 `makeup-simulation-generation`을 additive하게 추가한다.

```ts
const taskProjection = {
  kind: "makeup-simulation-generation",
  stage: "makeup",
  originStage: "makeup",
  transitionHostStage: "makeup",
  destinationStage: "makeup",
  readinessKey: "makeup-simulation-review-ready",
};
```

Makeup stage 완료 readiness는 다음으로 변경한다.

```text
makeup interview confirmed
AND recommendation decision completed
AND direction ready
AND simulation selection snapshot confirmed
```

시뮬레이션 생성 실패는 Makeup을 완료로 위조하지 않는다. retry 또는 `simulation unavailable` 제한과 함께 사용자의 명시적 보류 정책이 필요하다. MVP에서는 실패 시 retry를 기본으로 하고 자동 skip은 허용하지 않는다.

## 5. 상태 전이

| 현재 | 이벤트 | 조건 | 다음 | 동작 |
|---|---|---|---|---|
| interview | INTERVIEW_CONFIRMED | coverage 완료 | recommendation_preparing | rationale 생성 |
| recommendation_preparing | STRUCTURED_RATIONALE_READY | AI 설명 성공/실패 무관 | recommendation_review | 결정론적 결과 표시 |
| recommendation_review | DECISION_SAVED | accept/keep | direction_review | module map 생성 |
| direction_review | DIRECTION_READY | 7개 module valid | simulation_queued | idempotent run 접수 |
| simulation_queued | LEASE_ACQUIRED | entitlement·asset 유효 | simulation_generating | provider 호출 |
| simulation_generating | OUTPUT_GENERATED | 저장 성공 | quality_review 또는 partial | private output 저장 |
| quality_review | QUALITY_PASSED | 필수 gate 통과 | simulation_review | signed URL 발급 |
| quality_review | QUALITY_WARNING | 허용 가능한 warning | simulation_review | warning 표시 |
| quality_review | QUALITY_REJECTED | identity/geometry 등 실패 | simulation_retry_required | output 고객 비노출 |
| simulation_review | ADJUSTMENT_REQUESTED | 구조화 module 변경 | simulation_queued | 새 fingerprint/run |
| simulation_review | OUTPUT_CONFIRMED | ready output | confirmed | immutable snapshot |
| simulation_retry_required | RETRY_ACCEPTED | attempt 이내 | simulation_queued | 실패 output 보존·비노출 |
| confirmed | SOURCE_REVISION_CHANGED | interview/rationale/direction 변경 | recommendation_review 또는 direction_review | 기존 snapshot supersede 대기 |

AI 설명 실패는 recommendation review와 simulation 생성을 차단하지 않는다. 결정론적 rationale을 사용한다.

## 6. 생성 입력

```ts
export interface MakeupSimulationInputV1 {
  schemaVersion: "makeup-simulation-input-v1";
  consultationId: string;
  sourceAsset: {
    id: string;
    fingerprint: string;
    crop: PhotoCropTransform | null;
  };
  personalColor: {
    profileId: string | null;
    evidenceId: string | null;
    palette: string[];
    confidence: number | null;
  };
  makeup: {
    interviewRevision: number;
    selectedMode: MakeupMode;
    rationaleRevision: number;
    adjustmentDecision: "accept_adjustment" | "keep_selection";
    modules: MakeupSimulationOutputV1["moduleSummary"];
    exclusions: string[];
  };
  stylingContext: {
    hairSnapshotId: string;
    colorSnapshotId: string | null;
    fashionDirectionId: string | null;
  };
  preserve: {
    identity: true;
    faceGeometry: true;
    hair: true;
    background: true;
    pose: true;
    lightingIntent: true;
  };
  prohibit: [
    "skin_shape_change",
    "face_slimming",
    "eye_enlargement",
    "nose_reshaping",
    "hair_restyle",
    "background_replacement",
    "beauty_retouching"
  ];
}
```

모델은 구조화 입력을 시각화하며 새로운 메이크업 방향, 제품 호수, 좌표, 얼굴 특징을 발명하지 않는다.

## 7. 생성 전략

### 기본

- primary 1장 우선 생성
- 서비스 정책이 허용하면 alternative 1장 병렬 생성
- 첫 quality-pass 결과부터 review 화면 표시
- 나머지 output은 background에서 계속 처리
- 이미 통과한 output은 retry에서 재생성하지 않음

### idempotency

```text
inputFingerprint = hash(
  source fingerprint
  + personal color profile ID/version
  + interview revision
  + rationale revision
  + direction revision
  + selected hair/color snapshot
  + provider policy version
)
```

같은 fingerprint와 purpose의 active/completed run은 replay한다. 동시 요청은 unique constraint와 durable task fencing으로 하나만 실행한다.

## 8. 품질 gate

필수 reject 대상:

- 얼굴 identity drift
- 얼굴 윤곽·눈·코·입 geometry 변형
- 헤어스타일·컬러의 비의도 변경
- 배경·의상·포즈의 큰 변경
- 메이크업 module 위치 이탈
- 선택 팔레트와 현저한 색상 불일치
- 피부 미백·과도한 매끈 보정·점·주근깨 삭제 위험
- 손상된 눈·치아·귀·액세서리 artifact

warning 가능:

- 화면·조명에 따른 약한 발색 차이
- 속눈썹·아이라인 경계의 경미한 차이
- 제품 질감의 실제 재현 한계

threshold는 model policy card와 canary에서 버전 관리하며 문서의 임의 숫자로 고정하지 않는다.

## 9. 화면

### 생성 대기

- Makeup 탭 안에 머문다.
- `입력 정리 → 얼굴 보존 확인 → 메이크업 적용 → 품질 확인` phase를 표시한다.
- 짧은 메시지 캐러셀과 기존 모션 토큰을 사용한다.
- 정체·재시도·부분 준비 상태를 구분한다.
- 사용자는 대기 중 상담을 나갈 수 있다.

### simulation review

좌측:

- 원본과 primary simulation의 Before/After
- drag slider 또는 명확한 전환 버튼
- 이미지 주변의 중복 없는 확정 컬러칩
- alternative가 있으면 작은 선택 카드

우측:

- 선택한 Makeup mode
- 사용자 선택과 AI 조정 여부
- Personal Color·얼굴 관측·확정 Hair 근거 요약
- Base/Brow/Eyeshadow/Eyeliner/Blush/Lip/Lash 고객용 요약
- warning과 시뮬레이션 한계
- `추천 수정`, `이 이미지로 확정`

고객에게 불필요한 module toolbar, 좌표, revision, technical parameter, landmark table은 표시하지 않는다.

### Result Makeup 탭

- 확정 simulation image
- Before/After 정적 전환
- 선택 mode와 AI 조정 결정
- 7개 module 컬러·강도·finish 요약
- 5개 추천 근거 축과 한계
- 같은 selection/rationale revision

Result에서는 재생성·강도 slider·기술 수정 controls를 제공하지 않는다.

## 10. API

- `POST /api/consultations/:id/makeup/simulations`
- `GET /api/consultations/:id/makeup/simulations`
- `POST /api/consultations/:id/makeup/simulations/:runId/retry`
- `POST /api/consultations/:id/makeup/simulations/:runId/adjust`
- `POST /api/consultations/:id/makeup/simulations/:runId/confirm`

모든 mutation은 다음을 검사한다.

- Clerk 사용자와 consultation 소유권
- expected revision
- input fingerprint와 source snapshot 일치
- output이 해당 run 소속이고 quality ready
- idempotency key
- entitlement 서버 판정

## 11. 저장과 보안

additive 모델:

| 테이블 | 책임 |
|---|---|
| makeup_simulation_runs_v2 | durable run, fingerprint, lease, retry |
| makeup_simulation_outputs_v2 | private output, module summary, quality |
| makeup_simulation_selections_v2 | immutable confirmed snapshot |

보안:

- public schema RLS 활성화와 현재 Clerk service ownership 경계
- model result write는 server-only
- 브라우저 direct DB/Storage write 금지
- private bucket과 짧은 signed URL
- service role/secret을 public client에 노출 금지
- output upsert가 필요하면 Storage INSERT·SELECT·UPDATE 정책을 함께 검증
- signed URL, 원본 사진, prompt, 사용자 자유 답변을 로그에 기록하지 않음
- Data API 불필요 grant 회수

실제 migration은 구현 시 CLI help 확인 후 `supabase migration new`로 생성하며 root와 `my-app` mirror를 유지한다.

## 12. 리포트·브리프·Fashion 연결

- selection snapshot 확정 시 Makeup rationale과 simulation reference를 Result compiler에 전달
- Salon Brief 고객용 버전에는 mode·팔레트·한계 요약만 포함
- 아티스트 브리프에는 7개 module의 구조화 값과 전문가 확인사항 포함
- Fashion direction은 확정 Makeup 인상과 palette를 사용할 수 있으나 원본 얼굴·simulation prompt를 받지 않음
- Makeup 수정 후 Fashion 생성 전이면 새 revision 사용
- Fashion 확정 후 Makeup을 바꾸면 Fashion stale reason을 만들고 재검토만 권장, 몰래 재생성하지 않음

## 13. 기능 플래그와 롤백

- `MAKEUP_STYLE_SIMULATION_ENABLED`
- `MAKEUP_STYLE_SIMULATION_ALTERNATIVE_ENABLED`

롤백:

1. alternative OFF → primary 1장만 생성
2. simulation OFF → P40 direction map·routine·brief 흐름으로 복귀

기존 생성 output과 confirmed snapshot은 삭제하지 않고 read-only로 보존한다. 플래그 OFF 상태에서 새 run만 차단한다.

## 14. 구현 순서

1. shared run/output/selection/input contract와 validator
2. additive migration, RLS, private storage policy
3. durable capability와 provider adapter
4. prompt/input compiler와 idempotency
5. quality gate와 retry
6. Makeup workspace state derivation
7. waiting·Before/After·review UI
8. selection 확정과 Fashion gate
9. Result Makeup 탭 연결
10. Native parity, flags, rollback rehearsal

## 15. 테스트

### 계약

- workspace state가 persisted facts에서 파생되고 currentStep이 없음
- revision/fingerprint 변경 시 새 run
- quality rejected output confirm 금지
- confirmed snapshot 불변
- Result/Routine/Brief의 revision 일치

### 생성·품질

- identity·geometry·hair·background 보존 fixture
- 7개 module adherence와 palette
- retouching risk reject
- primary partial ready 후 review 가능
- alternative 실패가 primary 폐기하지 않음
- 동일 fingerprint replay와 동시 중복 방지

### API·DB

- 소유권·교차 사용자 거부
- RLS/role grant/private storage
- expired lease·retry·stale fence
- expected revision 409
- entitlement 중복 소비 방지

### 브라우저

- recommendation decision 후 자동 접수
- 별도 유료 확인 CTA 없음
- 대기·부분·정체·재시도·실패·완료
- Before/After keyboard·touch
- 추천 수정→새 run→확정
- 나가기·재개
- Result read-only 연결
- 390/768/desktop overflow와 접근성

## 16. 종료 기준

- [ ] simulation은 Makeup stage 내부 상태이며 새 전역 단계가 아니다.
- [ ] 추천 결정과 direction 준비 후 자동 접수된다.
- [ ] 별도 유료 생성 확인 질문이 없다.
- [ ] 원본·Personal Color·rationale·direction·Hair/Color revision이 fingerprint에 포함된다.
- [ ] identity·geometry·hair·background·retouching quality gate가 있다.
- [ ] Before/After와 고객용 근거가 Makeup 탭에 표시된다.
- [ ] 기술 패널·좌표·랜드마크 표는 고객 기본 화면에 없다.
- [ ] 수정은 새 run을 만들고 확정 snapshot은 불변이다.
- [ ] 확정 이미지가 Fashion 이전에 결정되고 Result Makeup 탭에 이어진다.
- [ ] provider 실패·부분 성공·retry·resume가 동작한다.
- [ ] private storage, RLS, owner check, idempotency 검증이 통과한다.
- [ ] 기능 플래그 롤백이 저장 결과를 삭제하지 않는다.

## 17. 안내 문구

```text
이 이미지는 선택한 메이크업 방향을 이해하기 위한 스타일 시뮬레이션입니다.
실제 발색과 질감은 피부 상태, 제품, 조명, 적용 방법에 따라 달라질 수 있습니다.
```

## 18. 증거 경계

로컬 fixture와 이미지 비교 테스트는 실제 사용자 얼굴에서의 identity 보존, 다양한 피부톤의 발색 공정성, 실제 provider latency·비용, entitlement 소비, 원격 migration, canary 또는 production 배포를 증명하지 않는다. 실사진 사용은 명시적 동의·retention·사람 검토 기준을 갖춘 별도 canary에서 검증한다.

## 19. 2026-08-20 로컬 종료 판정

판정: **PASS — 구현·로컬 검증 완료**

- simulation은 Makeup 내부 workspace 상태로 구현했고 새 전역 stage나 유료 생성 확인을 추가하지 않았다.
- 확정 rationale·direction 뒤 durable task를 자동 접수하며 waiting carousel, retry/resume, Before/After, 불변 선택 snapshot을 제공한다.
- 입력 fingerprint에 원본·Personal Color·rationale·direction·Hair/Color revision을 포함하고 결과 리포트 Makeup 탭과 Fashion gate가 같은 확정 선택을 사용한다.
- 고객 기본 화면에는 좌표·랜드마크·기술 패널을 노출하지 않고 컬러칩 연결과 아이라인·속눈썹 가이드만 유지한다.
- Web harness에서 확정 Before/After, 고객 안내, 390px 무가로오버플로를 확인했다. report PDF 13/13, consulting 112/112, Native 178/178, migration mirror 100개가 통과했다.
- 기능 플래그 기본값은 OFF이며 저장 결과를 삭제하지 않고 구 Makeup 흐름으로 복귀한다. 실 provider, 실얼굴 identity, latency·비용·entitlement, 원격 적용은 미검증이다.

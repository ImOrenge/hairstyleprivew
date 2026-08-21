# P48 — Phase 01 Hair 9안 Shadow Ranker

- 기준일: 2026-08-20
- 상태: 로컬 구현·검증 완료, 원격·실제 provider 검증 대기
- 상위 아키텍처: [P46](./p46-ai-led-hair-commerce-fashion-personalization-architecture-2026-08-20.md)
- 선행 페이즈: [P47 — 계약 기준선](./p47-phase-00-hair-fashion-contract-baseline-2026-08-20.md)
- 후속 페이즈: [P49 — Hair 고객 UX 전환](./p49-phase-02-hair-nine-preview-primary-ux-cutover-2026-08-20.md)
- 범위: Hair 9개 계획·생성 결과의 결정론적 랭킹, shadow 저장, 추가 질문 정책
- 증거 상태: 순수 정책·API 계약·RLS migration mirror·102개 fresh-chain은 `pass`; 실제 생성·원격 DB는 `not_run`

## 1. 목표

기존 Hair 3×3 엔진이 생성한 9개 결과를 그대로 유지하면서, 고객에게 노출하기 전에 AI 컨설턴트 정책이 주 추천 한 개를 안정적으로 결정하게 한다. 이 페이즈에서는 기존 shortlist·compare UI를 바꾸지 않고 shadow로만 실행한다.

성공 조건은 “1개만 생성”이 아니라 다음과 같다.

```text
Hair 3×3 plan 9개
  → durable image generation 9개
  → 9개 terminal
  → 품질·적합도·현실성 score
  → primary 1개 + ranked internal alternatives 8개
```

## 2. 포함·제외 범위

### 포함

- 기존 catalog·3×3 slot role을 사용한 9개 candidate plan
- hard constraint eligibility와 결정론적 policy score
- 생성 결과의 품질·얼굴 정체성·헤어 지시 충족 검증
- primary 1개와 8개 내부 대안의 순위·reason code
- confidence·conflict에 따른 추가 질문 최대 1개
- shadow task, idempotency, immutable decision revision
- 기존 고객 선택과 shadow primary의 일치·불일치 관측

### 제외

- 기존 shortlist·compare 화면 제거
- 고객에게 AI primary 표시
- Hair 생성 수를 1개·3개로 축소
- Color·Makeup·Fashion downstream 전환
- 생성 provider 교체 또는 모델 비용 정책 변경
- 원격 migration·배포·Canary

## 3. 입력 계약

```ts
interface HairRecommendationInputV1 {
  schemaVersion: "hair-recommendation-input-v1";
  consultationId: string;
  consultationRevision: number;
  discoveryRevision: number;
  analysisRevision: number;
  hairProfileRevision: number;
  personalColorRevision: number | null;
  styleTarget: string | null;
  allowedServices: string[];
  avoidRules: string[];
  maintenanceMinutes: number | null;
  changeIntensity: "low" | "medium" | "high";
  currentLengthBucket: string;
  sourceIds: string[];
  inputFingerprint: string;
}
```

입력 fingerprint는 정규화된 값과 각 source revision으로 만든다. 사진 URL, 자유 입력 원문, 인증정보는 fingerprint나 analytics에 포함하지 않는다.

## 4. 9안 계획과 랭킹 계약

```ts
type HairGridRole =
  | "face-balance-proportion"
  | "face-balance-hairline-parting"
  | "face-balance-jawline-volume"
  | "image-change-soft"
  | "image-change-polished"
  | "image-change-distinctive"
  | "manageability-cut-first"
  | "manageability-controlled-perm"
  | "manageability-high-change";

interface HairRankedPreviewV1 {
  previewId: string;
  slot: number;
  gridRole: HairGridRole;
  catalogItemId: string;
  eligible: boolean;
  hardFailureCodes: string[];
  score: number;
  scoreComponents: {
    userConstraintFit: number;
    hairTraitFit: number;
    faceEvidenceFit: number;
    maintenanceFit: number;
    imageQuality: number;
    identityPreservation: number;
    instructionAdherence: number;
    diversityPenalty: number;
  };
  reasonCodes: string[];
}

interface HairRecommendationDecisionV1 {
  schemaVersion: "hair-recommendation-decision-v1";
  consultationId: string;
  inputFingerprint: string;
  previewBatchId: string;
  requestedCount: 9;
  terminalCount: 9;
  policyVersion: string;
  rankedPreviews: HairRankedPreviewV1[];
  primaryPreviewId: string;
  confidence: number;
  clarification: ConsultationClarification | null;
  sourceIds: string[];
  revision: number;
  createdAt: string;
}
```

`rankedPreviews`는 정확히 9개여야 하고 `primaryPreviewId`는 eligible 항목 중 하나여야 한다. terminal 실패 슬롯이 있으면 해당 슬롯을 재시도해 9 terminal을 충족한 후 최종 decision을 만든다. 복구 불가능 실패는 성공으로 위장하지 않고 batch를 `failed`로 둔다.

## 5. 정책 순서

### 5.1 생성 전 eligibility

1. 사용자가 금지한 시술·기장·앞머리·관리 조건
2. 현재 기장과 모질상 물리적으로 불가능한 설계
3. 손상·탈색·시술 이력과 충돌하는 설계
4. 확인되지 않은 민감 특성에 의존하는 설계
5. 같은 catalog item 또는 사실상 같은 실루엣 중복

hard constraint 위반 후보는 생성 계획에서 대체한다. 9개 역할을 안전하게 채울 수 없을 때만 추가 질문을 한 번 제안한다.

### 5.2 생성 후 rank

정책 score는 normalized 0~1 범위를 사용하고 policy version을 저장한다. 이미지 품질이나 identity preservation이 최소 임계값을 통과하지 못한 결과는 사용자 적합도가 높아도 primary가 될 수 없다.

동점 처리 순서:

```text
hard constraint 안전성
  > 사용자 명시 목적
  > 모질·현재 기장 현실성
  > identity preservation
  > 관리 가능성
  > 변화 강도 적합
  > stable catalog order
```

동일 fingerprint·catalog version·policy version·preview artifact set은 같은 primary를 만들어야 한다.

## 6. 추가 질문 정책

다음 중 하나일 때만 질문한다.

- 9안 계획을 안전하게 채울 필수값이 없음
- 상위 두 결과의 차이가 임계값 미만이고 하나의 답이 primary를 실제로 바꿈
- 사용자 진술과 분석 evidence의 충돌이 시술 안전·현실성에 영향

질문 예산은 recommendation cycle당 최대 1개다. 답변을 건너뛰면 보수적 기본값과 제한사항을 기록하고 계속한다. 질문 자체가 별도 wizard stage나 공통 Next를 만들지 않는다.

## 7. 저장·task·API

### 신규 저장 후보

- `consultation_hair_recommendations_v2`
  - consultation owner, input fingerprint, batch ID, policy/catalog version
  - state, primary preview ID, confidence, source IDs, revision
- `consultation_hair_recommendation_scores_v2`
  - decision revision, preview ID, score components, failure/reason codes

구현 시 Supabase CLI로 additive migration을 만들고 양쪽 migration mirror에 반영한다. 기존 preview board 테이블과 9개 제약은 변경하지 않는다.

### API 후보

- `GET /api/v2/consultations/:id/hair-recommendation`
- `POST /api/v2/consultations/:id/hair-recommendation/evaluate`
- `POST /api/v2/consultations/:id/hair-recommendation/clarification`

`evaluate`는 `inputFingerprint + previewBatchId + policyVersion` 멱등키를 사용한다. 동일 요청은 기존 decision을 반환하고 중복 task·비용을 만들지 않는다.

## 8. 정확한 변경 지도

### 재사용·수정

- `packages/shared/src/v2/preview-board/contract.ts`
- `packages/shared/src/v2/prompt/compiler.ts`
- `my-app/lib/v2/preview-board-server.ts`
- `my-app/lib/consulting/decision-derivation.ts`
- `my-app/app/api/v2/consultations/[consultationId]/preview-board/route.ts`
- `packages/shared/src/consulting/contract.ts`
- 대응 test와 fixture

### 신규 후보

- `packages/shared/src/consulting/hair-recommendation.ts`
- `my-app/lib/consulting/hair-recommendation-policy.ts`
- `my-app/lib/consulting/hair-recommendation-server.ts`
- `my-app/lib/capabilities/hair-recommendation-service.ts`
- `my-app/app/api/v2/consultations/[consultationId]/hair-recommendation/route.ts`
- `my-app/app/api/v2/consultations/[consultationId]/hair-recommendation/evaluate/route.ts`

## 9. Shadow 운영과 관측

기존 UI는 현재 고객 선택을 계속 사용한다. shadow 결과는 다음만 기록한다.

- AI primary와 고객 최종 선택 일치 여부
- 상위 1·3·9 포함률
- hard constraint 탈락 비율과 코드
- primary confidence 분포
- 9개 생성 terminal latency와 retry 수
- identity/instruction 품질 실패율
- 질문 필요율과 질문 후 primary 변경률

자유 입력, 사진, 사용자 식별값은 analytics payload에서 제외하거나 비식별 집계한다.

## 10. 기능 플래그와 롤백

- `CONSULTATION_AI_LED_HAIR_DECISION_ENABLED=false` 유지
- 별도 내부 shadow gate: `CONSULTATION_HAIR_RANKER_SHADOW_ENABLED`

shadow gate OFF 시 rank task 접수만 중단한다. 기존 9개 생성, compare, 확정 snapshot은 영향을 받지 않는다. 생성된 decision row는 감사 목적으로 read-only 보존한다.

## 11. 구현 순서

1. P47 계약과 fixture를 기준으로 9안 입력 adapter를 만든다.
2. 생성 전 eligibility와 deterministic score를 순수 함수로 구현한다.
3. 9 terminal guard와 preview artifact 품질 입력을 연결한다.
4. durable shadow task·멱등 저장·revision 충돌을 구현한다.
5. API는 service-role worker와 consultation owner 권한을 분리한다.
6. 기존 선택과 shadow 결과 비교 계측을 붙인다.
7. shadow gate OFF/ON 회귀와 데이터 삭제 없는 rollback을 검증한다.

## 12. 검증 계획

### 정책·계약

- 정확히 9개가 아니면 final rank 거부
- ineligible 결과가 primary가 되지 않음
- score tie가 stable order로 재현됨
- 같은 fingerprint replay가 같은 decision을 반환
- 질문이 cycle당 1개를 넘지 않음
- low-quality·identity failure 결과가 primary에서 제외됨
- 9개 각 grid role이 중복 없이 존재

### API·DB·보안

- consultation owner 읽기, 타 사용자 403/404
- service-role task write와 RLS
- optimistic revision conflict 409
- duplicate evaluate가 중복 row·task를 만들지 않음
- migration mirror·fresh install

### 저장소 명령

```powershell
npm run typecheck
npm run lint
npm --prefix my-app run consulting:contract:test
npm run supabase:migrations:mirror:check
npm run supabase:migrations:fresh:check -- <repository-owned-arguments>
```

실제 인자는 구현 시 저장소 스크립트 도움말과 환경 계약으로 확정한다. Docker는 사용하지 않는다.

## 13. 종료 기준

- [x] 기존 3×3 보드의 accepted Hair 9개를 신규 ranker 입력으로 강제한다.
- [x] `requestedCount=9`, `terminalCount=9`, `acceptedCount=9`가 아니면 primary decision이 저장되지 않는다.
- [x] 같은 fingerprint·artifact set·policy version이 같은 primary를 만든다.
- [x] hard constraint 또는 품질 gate 위반 결과는 primary가 될 수 없다.
- [x] primary 1개와 내부 대안 8개의 rank·reason code가 저장된다.
- [x] 추가 질문 예산이 recommendation cycle당 최대 1개다.
- [x] shadow 결과가 고객 화면과 기존 journey completion을 변경하지 않는다.
- [x] 기능 OFF가 기존 3×3 생성·shortlist·compare를 보존한다.
- [x] 로컬 계약·API·migration 검증 결과가 증거로 남는다.

실제 provider가 만든 9개 이미지의 품질과 원격 DB 적용은 P48 로컬 종료 증거가 아니며 P49 실서비스 노출 전 별도 gate로 유지한다.

## 14. 종료 증거와 P49 인계

필수 증거:

- 9개 fixture에 대한 deterministic score snapshot
- constraint·quality failure fixture
- idempotency·RLS·migration 결과
- shadow 일치율·실패율 집계 예시
- feature flag OFF 회귀 로그

P49에는 안정화된 `HairRecommendationDecisionV1`, 고객용 reason code mapping, durable state와 9개 batch 진행률을 인계한다. 실제 provider 이미지에 대한 품질 검증이 없으면 P49의 실서비스 노출은 열지 않는다.

## 15. 증거 경계

| 증거 층 | P48 종료에 필요 | 비고 |
|---|---:|---|
| 순수 정책·계약 | 예 | 로컬 fixture |
| 로컬 API·DB fresh check | 예 | 승인된 로컬 환경 |
| 브라우저 UI | 아니요 | P49 |
| 실사용자 인증 | shadow canary 전 필요 | 로컬 완료와 분리 |
| 실제 이미지 provider 9안 | 실서비스 노출 전 필요 | 비용·권한 별도 |
| 원격 DB | 배포 전 필요 | 별도 승인 |
| 운영 canary | 아니요 | P53 |

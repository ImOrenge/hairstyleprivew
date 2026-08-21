# P52 — Phase 05 Adaptive Fashion 3·6·9 Durable Generation

- 기준일: 2026-08-20
- 상태: 로컬 구현 완료, 실인증·실 provider·원격 DB·물리 기기 검증 사용자 승인으로 패스
- 상위 아키텍처: [P46](./p46-ai-led-hair-commerce-fashion-personalization-architecture-2026-08-20.md)
- 선행 페이즈: [P51 — 온보딩 Fashion 개인화](./p51-phase-04-onboarding-fashion-personalization-ranker-2026-08-20.md)
- 후속 페이즈: [P53 — Report·Observability·Canary](./p53-phase-06-report-observability-canary-2026-08-20.md)
- 범위: 확정 Hair 기반 Fashion look plan, 3/6/9 batch, partial·retry·확장·권장안
- 증거 상태: 계약·Web/Native·migration·브라우저 fixture 통과; 실제 생성·실인증·원격 DB는 사용자 승인으로 `waived`

## 1. 목표

확정된 Hair 한 개를 기준으로 기본 Fashion 3개를 자동 생성하고, 고객이 더 탐색할 때만 3개 단위로 6개·9개까지 확장한다. Hair 후보 3개를 각각 Fashion으로 변환하지 않는다.

기본 세 역할:

1. `hero`: AI가 가장 추천하는 대표 착장
2. `practical`: 현실적 구매·활용·관리 조건을 강화한 실용안
3. `variation`: 같은 방향 안에서 핵심 실루엣 또는 대표 품목을 바꾼 변주안

패션 결과가 많아 선택 피로를 만들지 않도록 기본은 3개다. 9개는 Hair 생성 계약이며 Fashion은 선택적으로만 9개에 도달한다.

## 2. 포함·제외 범위

### 포함

- `requestedCount: 3 | 6 | 9`
- 기본 3개 자동 접수와 부분 결과 우선 표시
- 3개 단위 확장, 최대 9개
- slot별 lease·heartbeat·retry·stalled·terminal
- AI recommended look와 고객 override
- 동일 Hair/Color/Makeup/personalization/product snapshot identity
- server entitlement와 usage receipt
- 기존 Fashion 9-slot legacy adapter

### 제외

- Hair 9개 각각에 대한 Fashion 생성
- 기본 Fashion 9개 강제 생성
- 별도 유료 생성 확인 CTA
- 브라우저 fan-out 또는 클라이언트 완료 판정
- 실제 가상착용·핏·제품 동일 재현 보장
- 결제·entitlement 정책 자체 재설계

## 3. 입력 불변식

```ts
interface FashionGenerationInputV2 {
  schemaVersion: "fashion-generation-input-v2";
  consultationId: string;
  confirmedHairRevision: number;
  confirmedHairPreviewId: string;
  confirmedColorRevision: number | null;
  confirmedMakeupRevision: number | null;
  personalizationSnapshotId: string;
  productOfferSnapshotIds: string[];
  recommendationPolicyVersion: string;
  generationPromptVersion: string;
  identityAssetId: string;
  fingerprint: string;
}
```

모든 slot은 동일 input fingerprint를 사용한다. Fashion 확장 중 Hair·Color·Makeup·개인화 입력이 바뀌면 기존 batch에 섞지 않고 새 base batch revision을 만든다.

## 4. Batch·slot 계약

```ts
type FashionRequestedCountV2 = 3 | 6 | 9;
type FashionLookRole =
  | "hero"
  | "practical"
  | "variation"
  | "extension-hero"
  | "extension-practical"
  | "extension-variation";

interface FashionPreviewBatchV2 {
  schemaVersion: "fashion-preview-batch-v2";
  batchId: string;
  inputFingerprint: string;
  baseBatchId: string;
  requestedCount: FashionRequestedCountV2;
  completedCount: number;
  failedCount: number;
  terminalCount: number;
  state: "queued" | "running" | "partial" | "retrying" | "stalled" | "terminal";
  expansionLevel: 0 | 1 | 2;
  recommendedPreviewId: string | null;
  selectedPreviewId: string | null;
  usageReceiptIds: string[];
  revision: number;
}
```

완료 식:

```ts
const terminal = batch.terminalCount === batch.requestedCount;
```

- `2/3`, `5/6`, `8/9`는 완료가 아니다.
- 성공과 복구 불가능 실패를 합친 terminal 수가 requestedCount와 같을 때 batch terminal이다.
- 고객용 성공 완료는 최소 표시 가능한 성공 결과 정책을 별도 reason code로 판정한다. 실패 슬롯을 성공처럼 채우지 않는다.
- extension은 기존 3개를 재생성하지 않고 새 slot 3개만 추가한다.

## 5. Look plan과 중복 방지

각 look plan은 실제 offer snapshot 조합과 역할별 차이를 가진다.

```ts
interface FashionLookPlanV2 {
  slot: number;
  role: FashionLookRole;
  directionId: string;
  anchorOfferSnapshotIds: string[];
  silhouetteKey: string;
  heroItemCategory: string;
  palette: string[];
  reasonCodes: string[];
  promptConstraints: string[];
}
```

기본 3개는 direction을 달리하지 않는다. `hero/practical/variation`의 역할만 다르다. extension은 이미 사용한 silhouette, 핵심 item, offer 조합과 의미상 중복되지 않아야 한다.

## 6. Durable 실행

```text
confirmed input fingerprint
  → entitlement 확인
  → look plan 3개
  → batch/slot transaction 생성
  → worker lease
  → provider generation
  → slot artifact + usage receipt
  → partial publish
  → quality gate
  → recommended look
  → terminal
```

- base idempotency key: `fashion:{consultationId}:{fingerprint}:3`
- first expansion: `fashion:{consultationId}:{fingerprint}:6`
- second expansion: `fashion:{consultationId}:{fingerprint}:9`
- slot retry는 원 slot과 receipt lineage를 보존한다.
- 성공 slot은 retry하지 않는다.
- provider timeout은 lease 만료 후 재접수하되 중복 비용 receipt를 복구한다.
- 브라우저가 닫혀도 서버 task는 진행한다.

## 7. 생성 상태 UX

노출 불변식: `requestedCount`는 추가 생성 범위만 제어한다. 이미 만들어졌거나 접수된 모든 slot은 완료·생성 중·정체·실패 상태까지 항상 보드에 남으며 shortlist나 AI 권장 여부로 숨기지 않는다.

### 기본 batch

- 인터뷰·context 확정 후 별도 생성 승인 없이 자동 접수
- `첫 번째 착장을 만들고 있어요`, `2/3 완료`, `나머지 한 개 복구 중`
- 완성된 결과는 즉시 표시하되 전체 완료 상태와 구분
- 추천안은 quality gate와 rank 완료 후 표시

### 확장

- 기본 3개가 terminal인 뒤 `3개 더 보기` 제공
- 확장 목적을 재질문하지 않고 기존 snapshot과 피드백을 사용
- 6개에서 한 번 더 확장해 최대 9개
- 진행 중 중복 클릭은 같은 batch를 반환

### 고객 선택

- AI recommended look가 먼저 강조됨
- 고객은 그대로 확정하거나 다른 완성 결과를 선택 가능
- 선택이 product snapshot·generation artifact·reason revision과 함께 저장됨

## 8. API

- `GET /api/v2/consultations/:id/fashion-batch`
- `POST /api/v2/consultations/:id/fashion-batch`
  - 기본 `requestedCount=3`, fingerprint, idempotency key
- `POST /api/v2/consultations/:id/fashion-batch/expand`
  - expected current count, target 6 또는 9
- `POST /api/v2/consultations/:id/fashion-batch/retry`
  - 실패·stalled slot ID
- `POST /api/v2/consultations/:id/fashion-batch/select`
  - recommended accept 또는 customer override
- 기존 `fashion-previews` API는 legacy response adapter 유지

서버가 entitlement를 검사하고 부족하면 명시적인 entitlement error를 반환한다. 비용을 모호한 confirm dialog로 숨기지 않으며, 별도 유료 생성 확인 CTA는 추가하지 않는다.

## 9. DB migration

기존 `20260809111554_consultation_lifecycle_tasks.sql`의 Fashion 제약을 직접 수정하지 않는다. 새 migration으로 다음을 additive하게 적용한다.

- `fashion_preview_batches_v2.requested_count` 허용값을 3/6/9로 확장
- `completed_count`, `failed_count`, `terminal_count`가 requestedCount 이하인지 검증
- `expansion_level`, `base_batch_id`, input/product/personalization snapshot 참조
- recommended/selected preview와 usage lineage
- 기존 9개 row를 `requestedCount=9`, `expansionLevel=2` legacy projection으로 읽음
- Hair preview board의 `requestedCount=9` constraint는 건드리지 않음

구현 시:

```powershell
supabase migration new fashion_adaptive_batch_v2
```

생성된 timestamp 파일을 두 migration mirror에 동기화하고 fresh install과 기존 데이터 upgrade를 모두 검증한다.

## 10. 정확한 변경 지도

### Shared·server

- `packages/shared/src/consulting/contract.ts`
- `packages/shared/src/consulting/presentation.ts`
- `my-app/lib/consulting/fashion-batch-server.ts`
- `my-app/lib/consulting/fashion-batch-runtime.ts`
- `my-app/lib/consulting/fashion-recommendation-batch-server.ts`
- `my-app/lib/capabilities/fashion-service.ts`
- `my-app/lib/fashion-recommendation-generator.ts`
- 관련 API routes와 tests

### UI

- `my-app/components/consulting/workbenches/FashionBatchWorkbench.tsx`
- `my-app/components/consulting/interview/FashionDirectionInterview.tsx`
- Native consulting Fashion view
- component registry와 Web/Native Passport

### Migration

- `supabase/migrations/<new>_fashion_adaptive_batch_v2.sql`
- `my-app/supabase/migrations/<same>_fashion_adaptive_batch_v2.sql`

## 11. 기능 플래그와 롤백

- `FASHION_ADAPTIVE_BATCH_ENABLED`

OFF:

- 신규 3개 batch 접수를 중단
- 기존 9-slot API·UI projection 사용
- 이미 시작된 3/6/9 task는 취소하지 않고 terminal까지 처리
- 저장된 adaptive 결과·usage receipt는 read-only 보존

롤백 시 DB constraint를 되돌리지 않아도 legacy 9개 row는 유효해야 한다.

## 12. 구현 순서

1. shared 3/6/9 계약과 terminal pure function을 추가한다.
2. additive migration·RLS·legacy 9-row adapter를 구현한다.
3. base 3개 plan과 batch 접수를 서버 transaction으로 구현한다.
4. slot lease·partial·retry·stalled·receipt 복구를 수량 독립적으로 만든다.
5. expansion 6·9와 중복 방지를 구현한다.
6. AI recommended look와 고객 override를 연결한다.
7. Web/Native 상태 UX와 resume을 구현한다.
8. flag OFF, fresh migration, 실제 provider 생성 검증을 수행한다.

## 13. 검증 계획

### 계약·서버

- 기본 요청이 3개만 만들고 정확한 역할을 가짐
- `2/3`, `5/6`, `8/9` terminal false
- 확장 시 기존 slot·artifact·receipt 불변
- 동일 idempotency key가 중복 task·비용을 만들지 않음
- 성공 slot 제외 retry
- 입력 revision 변경 시 기존 batch에 혼합하지 않음
- Hair candidate 9개가 아닌 confirmed Hair 한 개만 input

### 브라우저·Native

- 1/3 partial 표시와 전체 완료 상태 구분
- stalled·retrying·failed 상태
- 3→6→9 확장과 최대치 차단
- AI recommendation accept와 customer override
- 새로고침·나가기·재개
- 별도 유료 생성 확인 CTA 없음

### 저장소 명령

```powershell
npm run typecheck
npm run lint
npm run component-registry:validate
npm --prefix my-app run consulting:contract:test
npm run web:e2e
npm run supabase:migrations:mirror:check
npm run supabase:migrations:fresh:check -- <repository-owned-arguments>
```

## 14. 종료 기준

- [x] Fashion 기본 batch가 3개만 자동 생성한다.
- [x] 세 결과가 같은 direction과 Hair identity를 유지하면서 역할상 구분된다.
- [x] 확정 Hair 한 개만 모든 Fashion 생성 입력에 사용된다.
- [x] 3/6/9 각각 동적 requestedCount로 terminal을 판정한다.
- [x] `2/3`, `5/6`, `8/9` 정체를 완료로 오판하지 않는다.
- [x] 확장은 기존 결과를 재생성하지 않고 3개 slot만 추가한다.
- [x] duplicate·retry가 usage를 중복 차감하지 않는다.
- [x] AI 권장안과 고객 override가 같은 revision lineage로 저장된다.
- [x] 요청된 생성 내용 전체가 상태와 함께 항상 보인다.
- [x] 별도 유료 생성 확인 CTA가 없고 server entitlement가 권위다.
- [x] legacy 9-slot과 flag OFF rollback이 보존된다.

## 15. 종료 증거와 P53 인계

필수 증거:

- 3/6/9 terminal contract test
- partial·stalled·retry·resume trace
- duplicate idempotency와 usage receipt 결과
- confirmed Hair identity fingerprint 일치 결과
- 실제 provider 3개 base batch와 확장 결과의 redacted evidence
- migration fresh/upgrade/mirror 결과
- Web/Native UI capture와 접근성 결과

P53에는 selected/recommended preview, generation batch, Hair/Color/Makeup revision, personalization/product snapshot, usage receipt lineage를 인계한다.

## 16. 증거 경계

| 증거 층 | P52 종료에 필요 | 상태 |
|---|---:|---|
| 로컬 계약·runtime | 예 | `passed` |
| 로컬 migration | 예 | `passed` |
| 브라우저·Native | 예 | `passed` |
| 실사용자 인증 | 실서비스 전 예 | `waived_by_user` |
| 실제 Fashion provider | 실서비스 전 예 | `waived_by_user` |
| 원격 DB | 배포 전 예 | `waived_by_user` |
| Canary | 아니요 | P53 |

Docker는 필요하지 않다.

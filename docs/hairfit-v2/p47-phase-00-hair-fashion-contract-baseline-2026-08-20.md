# P47 — Phase 00 Hair·Fashion 계약 기준선과 호환 계층

- 기준일: 2026-08-20
- 상태: 계획 확정, 구현 전
- 상위 아키텍처: [P46 — AI 주도 헤어 9안 생성·단일 결정·실상품 패션 개인화](./p46-ai-led-hair-commerce-fashion-personalization-architecture-2026-08-20.md)
- 선행 페이즈: 없음
- 후속 페이즈: [P48 — Hair 9안 Shadow Ranker](./p48-phase-01-hair-nine-preview-shadow-ranker-2026-08-20.md)
- 범위: 공유 계약, journey projection, feature flag, fixture, migration 설계 기준선
- 증거 상태: 문서 설계만 완료; 코드·DB·실인증·provider·배포는 `not_run`

## 1. 목표

P46의 제품 결정을 구현 가능한 계약으로 먼저 고정한다. 이 페이즈의 목적은 기능을 노출하는 것이 아니라 이후 페이즈가 서로 다른 완료조건을 섞지 않도록 경계를 만드는 것이다.

핵심 불변식은 다음과 같다.

1. Hair는 기능 플래그 ON/OFF 모두 기존 3×3 다양성과 정확히 9개 생성 계약을 유지한다.
2. 신규 Hair 모드에서 제거하는 것은 생성 수가 아니라 고객의 shortlist·compare 의무다.
3. Fashion만 `requestedCount: 3 | 6 | 9`로 확장한다. Hair의 `requestedCount: 9`를 동적 수량으로 바꾸지 않는다.
4. 신규 snapshot은 additive schema와 adapter로 추가하며 기존 확정 snapshot을 수정하지 않는다.
5. 기능 플래그 OFF에서는 기존 route, deep link, 9안 compare, 9-slot Fashion을 그대로 읽고 실행할 수 있어야 한다.

## 2. 포함·제외 범위

### 포함

- P41·P43·P46·기존 3×3·Fashion 9-slot 사이의 권위 우선순위 명시
- Hair 9안 batch, AI primary, internal alternative, adjustment revision 계약
- Fashion 3/6/9 batch, product truth, onboarding personalization snapshot 계약의 타입 골격
- legacy와 신규 journey completion predicate 분리
- 기능 플래그 기본값 OFF와 rollback projection
- 기존 fixture를 읽는 호환 adapter와 신규 fixture
- migration mirror 및 fresh-check 적용 규칙 문서화

### 제외

- Hair ranker 실행, 이미지 생성 provider 호출, UI 전환
- 실상품 공급자 연결, 상품 수집, Fashion 생성 수량 변경
- 원격 Supabase migration, 운영 데이터 backfill, 배포
- 기존 migration 파일 수정
- CSS 전역 스타일 변경
- Docker 도입 또는 Docker 기반 검증

## 3. 현재 기준선과 충돌 지점

| 영역 | 현재 기준선 | 신규 권위 |
|---|---|---|
| Hair 생성 | preview board가 3×3·9개를 생성 | 그대로 유지 |
| Hair 진행 | shortlist와 compare가 journey 조건 | AI primary 확정으로 고객 완료조건 교체 |
| Hair 대안 | 고객이 후보를 직접 비교 | 9개 모두 생성하되 8개는 기본 비노출 internal alternative |
| Fashion 생성 | 정확히 9개만 허용 | 신규 모드만 3/6/9 동적 수량 |
| Fashion 상품 | 상품 URL·브랜드가 null이어도 가능 | product-truth 모드에서는 유효 offer snapshot 필수 |
| 개인화 | 상담 화면과 profile에 분산 | 지속 정책은 온보딩, 일회 맥락은 상담, 생성은 immutable 합성 snapshot |

현재 `supabase/migrations/20260809111554_consultation_lifecycle_tasks.sql`과 mirror는 Fashion batch의 `requested_count = 9` 제약을 갖는다. 이를 직접 수정하지 않고 P52에서 `supabase migration new`로 additive migration을 만든다. Hair preview board의 9개 제약은 변경 대상이 아니다.

## 4. 공유 계약

### 4.1 Hair 완료 계약

```ts
interface HairNinePreviewBatchRefV1 {
  schemaVersion: "hair-nine-preview-batch-ref-v1";
  batchId: string;
  inputFingerprint: string;
  requestedCount: 9;
  terminalCount: number;
  acceptedCount: number;
  failedCount: number;
  state: "queued" | "running" | "partial" | "retrying" | "terminal" | "failed";
}

interface HairPrimaryDecisionRefV1 {
  batchId: string;
  primaryPreviewId: string;
  rankedPreviewIds: string[];
  policyVersion: string;
  rationaleRevision: number;
  confirmedRevision: number | null;
}
```

Hair batch terminal 조건은 `terminalCount === 9`다. 신규 고객 여정 완료는 여기에 `primaryPreviewId`와 `confirmedRevision`이 존재할 때만 성립한다. shortlist 개수는 신규 predicate에 포함하지 않는다.

### 4.2 Fashion 완료 계약

```ts
type FashionRequestedCountV2 = 3 | 6 | 9;

function isFashionBatchTerminal(batch: {
  requestedCount: FashionRequestedCountV2;
  completedCount: number;
  failedCount: number;
}) {
  return batch.completedCount + batch.failedCount === batch.requestedCount;
}
```

Hair와 Fashion은 동일한 `requestedCount` 이름을 사용하더라도 validator를 공유하지 않는다. Hair validator는 9 literal, Fashion V2 validator는 3/6/9 union이다.

### 4.3 권위 및 revision

```text
confirmed user constraints
  > confirmed analysis evidence
  > current consultation context
  > deterministic policy output
  > AI explanation
  > trend signal
```

- 확정 snapshot은 immutable이다.
- 수정은 `supersedesRevision`을 가진 새 revision을 만든다.
- 고객에게 표시한 report와 생성 입력은 같은 fingerprint를 참조한다.
- AI 설명은 구조화 결정을 바꾸지 않는다.

## 5. 저장·migration 원칙

- 모든 신규 테이블과 제약은 구현 시 `supabase migration new <name>`으로 생성한다.
- `supabase/migrations`와 `my-app/supabase/migrations` mirror를 같은 내용으로 유지한다.
- 기존 확정 행은 backfill로 덮어쓰지 않는다. adapter로 legacy projection을 만든다.
- 신규 enum/check constraint는 기능 플래그 OFF 데이터도 읽을 수 있게 additive하게 적용한다.
- RLS는 consultation owner와 service-role worker의 권한을 분리한다.
- 원격 migration은 별도 승인·실행 단계이며 이 문서 작업의 범위가 아니다.

## 6. 정확한 변경 지도

### 수정 대상

- `packages/shared/src/consulting/contract.ts`
- `packages/shared/src/consulting/journey.ts`
- `packages/shared/src/consulting/presentation.ts`
- `packages/shared/src/v2/preview-board/contract.ts`
- `packages/shared/src/v2/feature-flags.ts`
- `my-app/lib/v2/feature-flags.ts`
- `my-app/lib/consulting/feature-flag.ts`
- 대응 contract·journey·presentation test

### 신규 후보

- `packages/shared/src/consulting/hair-recommendation.ts`
- `packages/shared/src/consulting/fashion-personalization.ts`
- `packages/shared/src/consulting/fashion-product-truth.ts`
- `my-app/lib/consulting/legacy-hair-journey-adapter.ts`
- `my-app/lib/consulting/legacy-fashion-batch-adapter.ts`

파일명은 구현 시 기존 export convention과 충돌 여부를 확인해 확정한다. 이 페이즈에서는 provider·UI 파일을 변경하지 않는다.

## 7. 구현 순서

1. Hair와 Fashion의 현재 literal, journey guard, API response, UI dependency inventory를 테스트 fixture로 고정한다.
2. shared contract에 신규 타입을 추가하되 기존 타입을 제거하거나 의미 변경하지 않는다.
3. legacy adapter와 신규 validator를 분리한다.
4. 기능 플래그를 기본 OFF로 추가한다.
5. journey/presentation이 플래그에 따라 서로 다른 completion predicate를 선택하도록 준비한다.
6. 신규·legacy fixture의 serialize/deserialize와 round-trip을 검증한다.
7. P48~P53에서 사용할 파일·migration·flag 소유권 표를 확정한다.

## 8. 기능 플래그와 롤백

- `CONSULTATION_AI_LED_HAIR_DECISION_ENABLED=false`
- `FASHION_PRODUCT_TRUTH_ENABLED=false`
- `ONBOARDING_FASHION_PERSONALIZATION_ENABLED=false`
- `FASHION_ADAPTIVE_BATCH_ENABLED=false`
- `FASHION_TREND_SIGNALS_V2_ENABLED=false`

이 페이즈 종료 시 모든 신규 플래그 기본값은 OFF다. OFF 상태는 기존 Hair compare와 Fashion 9-slot 동작을 변경하지 않아야 한다. 롤백은 플래그만 내리며 snapshot, 생성 이미지, usage receipt를 삭제하지 않는다.

## 9. 검증 계획

### 정적·계약

- Hair 신규/legacy fixture 모두 `requestedCount === 9`
- Fashion V2만 3/6/9를 허용하고 4·8을 거부
- `2/3`, `8/9`를 terminal로 오판하지 않음
- 신규 Hair predicate에 shortlist가 포함되지 않음
- legacy deep link와 snapshot round-trip 보존
- feature flag OFF regression

### 저장·보안

- 신규 migration 초안이 기존 migration을 수정하지 않는지 diff 확인
- RLS owner/service-role matrix 작성
- mirror와 fresh migration 검증은 migration이 실제 추가되는 P48/P50/P51/P52에서 수행

### 저장소 명령

```powershell
npm run typecheck
npm run lint
npm --prefix my-app run consulting:contract:test
npm run component-registry:validate
npm run supabase:migrations:mirror:check
```

명령은 구현 완료 후 실행한다. 현재 문서 단계에서는 `not_run`이다.

## 10. 종료 기준

- [ ] Hair 9개 생성과 Fashion 3/6/9 validator가 별개 타입·테스트로 존재한다.
- [ ] Hair 신규 completion은 `9 terminal + AI primary + confirmed revision`이며 shortlist를 요구하지 않는다.
- [ ] legacy completion과 신규 completion이 같은 boolean 필드에 혼합되지 않는다.
- [ ] 기능 플래그 OFF에서 기존 Hair/Fashion fixture와 deep link가 회귀 없이 동작한다.
- [ ] 신규 snapshot의 revision·fingerprint·supersede 규칙이 validator로 강제된다.
- [ ] 기존 migration 파일이 변경되지 않았다.
- [ ] 구현하지 않은 provider·실상품·원격 DB 상태를 완료로 표시하지 않는다.
- [ ] P48~P53의 계약 소유권과 handoff가 충돌 없이 문서화됐다.

## 11. 종료 증거와 인계

필수 증거:

- 변경 파일 목록과 계약 diff
- Hair/Fashion 경계 fixture 결과
- flag OFF 회귀 결과
- typecheck·contract test 로그
- migration 파일 무변경 확인

P48 인계 입력은 Hair 9안 batch ref, primary decision ref, reason code, fingerprint, flag다. 종료 증거가 없으면 P48은 shadow 데이터를 쓰기 시작하지 않는다.

## 12. 증거 경계

| 증거 층 | P47 종료에 필요 | 현재 상태 |
|---|---:|---|
| 문서 구조·링크 | 예 | 이 문서 검증 후 판정 |
| 로컬 typecheck·계약 테스트 | 예 | `not_run` |
| 브라우저 | 아니요 | `not_run` |
| 실사용자 인증 | 아니요 | `not_run` |
| 이미지·상품 provider | 아니요 | `not_run` |
| 원격 Supabase | 아니요 | `not_run` |
| 배포·Canary | 아니요 | `not_run` |

Docker는 필요하지 않다.

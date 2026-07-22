# Phase 03 — 유료 행동 Quote·Receipt 코어

- 상태: 로컬 구현 완료, 운영 검증 대기 — 헤어·Styler·에프터케어 Quote와 action별 원자 실행/receipt를 연결했으나 원격 migration·staging/실서비스 증거는 미확보
- 우선순위: P0
- 변경 게이트: `behavioral`, `breaking`
- 선행 페이즈: Phase 00, Phase 02A
- 독립 배포: migration/RPC·API·호환 client를 coordinated rollout하고 운영 smoke를 통과한 뒤 가능

## 목표

헤어, Styler, 에프터케어의 비용과 실행 결과를 서버가 결정하게 한다. 오래 열린 확인 화면, 중복 탭, 앱 종료, 동시 요청에서도 UI 표시와 실제 ledger가 달라지지 않아야 한다.

## 구현 계약

```ts
type PaidActionQuote = {
  quoteId: string;
  action: "hair_generation" | "outfit_generation" | "aftercare";
  subjectId: string | null;
  billingScope: "customer" | "salon";
  costCredits: number;
  currentBalance: number;
  balanceAfter: number;
  shortfallCredits: number;
  isFree: boolean;
  freeReason: string | null;
  isAllowed: boolean;
  issuedAt: string;
  expiresAt: string;
  policyVersion: string;
  lockConsequence: string | null;
  failurePolicy: string;
};

type PaidActionExecutionReceipt = {
  executionId: string;
  action: PaidActionQuote["action"];
  subjectId: string;
  state: "reserved" | "charged" | "refunded" | "free";
  costCredits: number;
  chargedCredits: number;
  refundedCredits: number;
  balanceAfter: number;
  freeReason: string | null;
  ledgerId: string | null;
  refundLedgerId: string | null;
  createdAt: string;
  completedAt: string | null;
  replayed: boolean;
};
```

Quote는 5분 만료 HMAC 토큰이다. API가 사용자·action·subject·payer·금액·잔액·policy를 다시 검증한 뒤 raw token을 저장하지 않고 SHA-256 quote fingerprint와 감사 snapshot만 RPC에 전달한다. receipt의 금액·잔액은 서버 authoritative snapshot이며 클라이언트가 다시 계산하지 않는다.

## 2026-07-15 로컬 구현 범위

- [x] shared 고정 단가: 헤어 10, Styler 20, 계정 첫 에프터케어 0·추가 30
- [x] paid-action 실행·표시 가격에 `PRICING_CREDITS_PER_*` env override를 사용하지 않아 Quote와 DB 실행의 단가 drift 제거
- [x] Quote 만료, policy version, 비용·잔액 변경 시 최신 Quote와 재확인 응답
- [x] Quote 없음은 기본 fail-closed, `PAID_ACTION_QUOTES_REQUIRED=false`만 명시적 legacy rollback switch
- [x] 세 action 공통 `PaidActionQuote`와 `PaidActionExecutionReceipt` shared/API client DTO
- [x] 모든 유료 action에서 실행 직전 사용자·subject·선택·잔액·무료 여부 원자 재검증
- [x] action별 persisted execution/receipt와 ledger unique 계약으로 반복·동시 요청 멱등 처리
- [x] 성공 차감, 진행 예약, 실패 환불, 첫 무료, replay를 공통 receipt state로 노출
- [x] 고객·살롱 generation 비용 부담 주체를 Quote `billingScope`와 generation receipt `payerScope`로 분리
- [x] 첫 에프터케어 동시 요청을 사용자별 free claim row lock으로 직렬화
- [x] 에프터케어 record·guide·서로 다른 content type 6개·ledger·receipt를 한 RPC transaction으로 처리
- [x] Styler 모델/storage 실패 시 20크레딧 refund ledger와 receipt 생성
- [x] Styler 정산 응답이 모호하면 persisted receipt를 재조회해 완료 이미지를 보존하고, 확정할 수 없으면 `STYLING_SETTLEMENT_PENDING`으로 중복 실행을 막음
- [x] 에프터케어 RPC 응답이 유실돼도 persisted program receipt를 재조회해 성공 replay를 반환
- [x] 웹·Expo의 헤어·Styler·에프터케어 확인 UI, fresh Quote 오류, 부족 잔액 결제 복귀, receipt 표시 연결

## 2026-07-19 웹 견적 확인 UX 안정화

- 공용 `PaidActionQuoteCard`가 `loading`, `unavailable`, `ready`, `free`, `expired`, `insufficient`, `error`를 `data-state`로 명시하고, 견적이 없을 때 현재 잔액·작업 비용·예상 잔액을 확인할 수 있다는 다음 행동을 바로 설명한다.
- 만료 상태의 중복 새로고침 버튼을 하나로 합쳤다. 어떤 상태에서도 카드 상단의 한 위치에서만 `견적 확인`, `최신 견적 확인`, `견적 새로고침`을 제공하며 로딩 중에는 native disabled·`aria-busy`로 중복 요청을 막는다.
- 카드 전체를 heading/summary로 연결한 section으로 만들고 상태 변화는 하나의 polite/atomic live region에서만 공지한다. 만료·부족·오류 시각 알림은 같은 문구를 다시 공지하지 않는다.
- `c-paid-action-quote` components-layer CSS와 `data-allowed` 계약을 추가했다. 1024px light·320px light·375px dark visual, overflow 0, keyboard refresh, 부족 잔액 충전 링크, axe serious/critical 0을 production Chromium 3/3으로 확인했다.
- paid-action 정적 계약은 20/20, Next E2E build는 static 107/107이다. 인증된 실제 Quote API의 잔액 변경, 결제 후 `returnTo` 복귀와 최신 Quote 재확인은 운영·인증 게이트로 남긴다.

## action별 원자 실행 구조

### 헤어 generation — 10크레딧

- accept transaction이 generation, `acceptedAt`, Workflow outbox, `generation_credit_reservations`, usage ledger를 함께 확정한다.
- 첫 authoritative 성공은 reservation을 `charged`로 확정한다.
- 성공 0건 terminal 실패는 10크레딧을 `refunded`로 복구한다.
- 헤어 generation만 durable Workflow/outbox와 완료 이메일 계약을 가진다.

### Styler — 20크레딧

- `styling_credit_attempts`가 세션별 attempt, Quote 감사 필드, execution lease, usage/refund ledger를 보존한다.
- `begin_styling_execution`이 user/session을 잠그고 20크레딧을 한 번 예약한다.
- `settle_styling_execution`이 성공 이미지를 `charged`로 확정하거나 실패를 `refunded`로 복구한다.
- `read_styling_credit_receipt`와 begin replay가 진행·완료·실패 반복 요청에 같은 receipt를 반환한다.

### 에프터케어 — 첫 무료, 이후 30크레딧

- `aftercare_free_claims`의 user PK가 계정 최초 무료를 서로 다른 generation 사이에서도 한 번만 허용한다.
- `aftercare_program_receipts`가 user/generation별 free 또는 charged receipt와 정확히 6개 content 계약을 보존한다.
- `execute_aftercare_program`이 claim/debit, record, guide, 6 contents, generation selection lock, receipt를 한 transaction으로 처리한다.
- legacy backfill은 guide·`care_generated_at`·6 distinct content type이 모두 있는 완성 프로그램만 free claim/receipt로 인정한다. partial legacy row는 차감 없이 repair 가능하게 남긴다.

## 데이터·권한·호환 전략

- SSoT 단가는 `packages/shared/src/billing/policy-selectors.ts`의 10/20/30 상수다. `my-app/lib/pricing-plan.ts` getter도 이 값을 그대로 반환한다.
- Quote HMAC secret은 Workflow·Supabase 자격 증명과 공유하지 않는다.
- 비용이 달라졌거나 첫 무료 상태가 경합으로 바뀌면 자동 실행하지 않고 `QUOTE_CHANGED`와 fresh Quote를 반환한다.
- 새 migration의 receipt/claim/attempt table은 RLS를 강제하고 public·anon·authenticated 권한을 revoke한다.
- 실행·조회 RPC는 `security invoker`, 고정 `search_path`와 service-role execute grant를 사용한다.
- 기존 API 응답에는 receipt를 additive로 추가한다. 새 client는 `quoteId`를 전송하며 migration 미적용 상태에서 직접 `consume_credits`로 조용히 fallback하지 않는다.

## 주요 파일

- `packages/shared/src/billing/paid-action.ts`
- `packages/shared/src/billing/policy-selectors.ts`
- `packages/api-client/src/index.ts`
- `my-app/lib/pricing-plan.ts`
- `my-app/lib/paid-action-quote.ts`
- `my-app/app/api/paid-actions/quote/route.ts`
- `my-app/app/api/generations/run/route.ts`
- `my-app/app/api/styling/generate/route.ts`
- `my-app/app/api/styling/[id]/route.ts`
- `my-app/app/api/hair-records/route.ts`
- `supabase/migrations/20260715173000_paid_action_atomic_execution.sql`과 `my-app` 미러
- `my-app/supabase/tests/paid_action_atomic_execution_smoke.sql`

## 수용 기준

- [x] UI 입력이나 env를 신뢰하지 않고 shared/DB 고정 단가와 서버 Quote가 최종 비용을 결정한다.
- [x] 같은 action subject의 동시·반복 실행은 usage/refund ledger를 한 번만 만든다.
- [x] 서로 다른 generation의 첫 에프터케어 동시 요청 두 개가 모두 무료가 되지 않는다.
- [x] 에프터케어 DB 실패 뒤 partial record·guide·content·claim·차감이 남지 않는다.
- [x] 실제 charged/refunded amount와 receipt, ledger, balance가 일치한다.
- [x] 살롱 generation이 고객 wallet을 잘못 차감하지 않는다.
- [ ] 원격 migration과 staging 동시성, 실제 결제·이메일·실기기 복귀에서 같은 계약을 입증한다.

## 검증

```powershell
npm --workspace @hairfit/shared test
npm run paid-action:contract:test
npm run generation-workflow:contract:test
npm run portone:audit
npm run typecheck
npm run lint:all
# migration 적용이 끝난 격리 PostgreSQL에서
psql -v ON_ERROR_STOP=1 -f my-app/supabase/tests/paid_action_quote_smoke.sql
psql -v ON_ERROR_STOP=1 -f my-app/supabase/tests/paid_action_atomic_execution_smoke.sql
```

이번 로컬 직접 증거:

- shared 계약 20/20, paid-action 계약 17/17 통과
- generation Workflow 계약 42/42와 기존 generation Quote/settlement PostgreSQL smoke 통과
- PostgreSQL 18.4 fresh DB에서 `paid_action_atomic_execution_smoke_ok`: Styler reserve/replay/refund/refund replay/refunded Quote 재사용 차단/새 성공, 에프터케어 첫 무료/6 contents/replay/두 번째 30/legacy 완성 프로그램 무과금 복구/동일 이름 다른 variant 잠금/invalid payload rollback/stale Quote no-write 확인
- 실제 두 연결 Styler 경합: 잔액 80, usage ledger 1, reserved attempt 1
- 실제 두 generation 에프터케어 경합: free claim 1, free receipt 1, program record 1, 잔액 100; 패자는 `QUOTE_CHANGED`
- root와 `my-app`의 `20260715173000_paid_action_atomic_execution.sql` SHA-256 `518ED26C3F216750A67B71468B5813B2D5202E4E0786E09C212A3308AAF27E97` 일치
- 2026-07-19 추가 UI 증거: `PaidActionQuoteCard` 계약 포함 paid-action 20/20, production Chromium 3/3, 1024/320/375px visual·axe·overflow·단일 갱신 행동 통과, registry `stable` 승격

이는 격리 로컬 DB와 코드 계약 증거다. 원격 migration 적용, staging/운영 병렬 실행, 실제 PortOne·Resend, 인증 브라우저, iOS/Android 실기기 증거가 아니다.

## 잔여 위험

- Styler는 202 접수·전용 Workflow/outbox·완료 이메일을 후속 구현해 로컬 종료 내구성 계약을 충족했다. 다만 원격 migration·coordinated deploy·실메일·강제 종료 E2E 전에는 운영 완료로 승격하지 않는다.
- 에프터케어 AI 생성은 transaction 전에 수행한다. 이때 요청이 중단되면 DB write·차감은 없지만 생성 완료도 없으므로 fresh Quote로 재시도해야 한다.
- 헤어 generation의 페이지/앱 종료 계약을 에프터케어까지 자동 확대하지 않는다. Styler는 공용 paid-action reservation 위에 별도 Workflow/notification 계약을 추가해 제공한다.

## 롤백·인계

- 서버 Quote와 DB 멱등·환불·free claim 보호는 유지하고 UI rollout만 되돌리는 것을 우선한다.
- migration/RPC와 client 배포 순서를 분리할 때는 additive response와 명시적 feature gate를 사용한다.
- Phase 06, 10B, 10C에 Quote/receipt/error code와 안전한 `returnTo` 계약을 넘긴다.

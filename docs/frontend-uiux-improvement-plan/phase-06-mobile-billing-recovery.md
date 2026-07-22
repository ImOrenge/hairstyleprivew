# Phase 06 — 모바일 결제 복구 루프

- 상태: 부분 로컬 구현 — generation·Styler·에프터케어의 안전한 ResumeTarget과 fresh Quote 재확인은 연결, PortOne sandbox·webhook·실기기 수명주기 증거는 미완료
- 우선순위: P0
- 변경 게이트: `behavioral`
- 선행 페이즈: Phase 01B, Phase 03, Phase 05
- 독립 배포: sandbox와 iOS/Android callback 검증 후 가능

## 목표

크레딧 부족 사용자가 모바일에서 결제 화면에 도달하고, 성공·실패·취소 후 원래 확인 화면으로 돌아가 최신 Quote를 다시 확인할 수 있게 한다.

## 확정 흐름

```text
Paid action confirm
  -> insufficient balance
  -> billing plan selection
  -> PortOne prepare/SDK
  -> webhook/server completion
  -> account-bound ResumeTarget
  -> original action screen
  -> fresh HMAC Quote
  -> user confirms again
```

결제 후 원래 유료 행동을 자동 실행하지 않는다. 결제 전 Quote는 잔액이 바뀌어 더 이상 실행 근거가 아니므로 반드시 새 Quote를 발급한다.

## 2026-07-15 로컬 구현

- [x] generation 부족 CTA가 `/billing?returnTo=/generate`를 사용
- [x] Styler 부족 CTA가 UUID가 검증된 `/styler/{sessionId}`를 보존
- [x] 에프터케어 부족 CTA가 UUID generation과 안전한 variant만 허용한 `/result/{generationId}?variant={variantId}`를 보존
- [x] billing이 서버 dashboard의 현재 잔액·정책·플랜 snapshot을 표시
- [x] 준비된 payment ID·plan·생성 시각·allowlist `returnTo`를 `customerId`별 SecureStore v2 key에 격리해 보존
- [x] 30분 `PAYMENT_AUTO_RESUME_WINDOW_MS`를 자동 서버 재확인 창으로만 사용하고, 이후 unresolved receipt를 삭제하거나 새 결제를 허용하지 않음
- [x] billing 재진입 시 보존 payment를 서버에 재확인하고, 자동 확인 창 이후에는 수동 상태 확인·고객지원 안내 유지
- [x] 서버 성공 또는 명시적 PortOne `CANCELLED`/`FAILED`에서만 해당 계정·payment ID를 조건부 삭제
- [x] SDK 오류·404·`PAID` 검증 불일치·계정 변경에서는 pending을 보존하고 중복 결제 차단
- [x] `app/payments/complete.tsx` callback에서 현재 계정, `customerId`, `paymentId`, 허용된 `returnTo`를 함께 검증
- [x] 모바일 결제 prepare의 `appScheme`을 정확히 `hairfit`만 허용
- [x] generation·Styler·에프터케어 복귀 화면이 fresh Quote를 발급하고 사용자가 다시 눌러야 실행
- [x] 웹 billing return allowlist에도 generation/workspace, UUID Styler, UUID result+safe variant를 동일 의미로 반영
- [x] 취소·실패·pending·retryable·manual review를 분리하고 unresolved 주문의 폐기·새 결제 CTA와 중복 completion 호출 차단

## ResumeTarget 계약

허용 경로는 정규식·URL parser로 구조를 검사하며 임의 pathname, 외부 origin, hash, 추가 query, 이중 decode를 허용하지 않는다.

| action | Expo·웹 복귀 대상 | 복귀 후 행동 |
| --- | --- | --- |
| 헤어 generation | `/generate` 또는 허용된 generation entry | fresh Quote 표시, 사용자 재확인 |
| Styler | `/styler/{uuid}` | 세션 상태·receipt 재조회, 실행 가능할 때 fresh 20 Quote |
| 에프터케어 | `/result/{uuid}?variant={safe-id}` | 확정 상태 재조회, 미완료면 fresh 0/30 Quote |

Expo는 `customerId`별 SecureStore에 pending payment를 보존한다. 결제 callback과 서버 completion이 성공해도 현재 계정이 바뀌었으면 원래 계정의 pending을 임의 삭제하거나 다른 계정으로 복귀시키지 않는다.

## 포함 범위

- [x] 세 유료 action의 부족 크레딧 billing CTA와 ResumeTarget
- [x] 서버가 제공하는 plan/price snapshot 사용, 앱 하드코딩 제거
- [x] 월 자동 결제, 기간 종료 해지, 결제 확인 후 크레딧 지급·미사용 잔액 유지, 약관·개인정보·지원 링크를 shared 정책으로 웹 선택/체크아웃/마이페이지와 Expo 결제/약관에 정렬
- [x] payment success, authoritative failure/cancel, pending/retryable/manual-review 상태 분리 — 로컬 구현, 실제 SDK 검증 대기
- [x] webhook 또는 서버 verification을 최종 결제 판정 원천으로 사용 — 로컬 route 계약, 실제 webhook 검증 대기
- [x] 앱 재실행 시 계정별 pending payment 복구 — 코드·단위 계약 완료, 실기기 강제 종료 미검증
- [x] 복귀 후 fresh Quote와 사용자 재확인
- [x] 중복 SDK callback·deep link idempotency의 로컬 방어
- [x] paid action 실행 receipt는 원래 action 화면에서 표시

## 제외 범위

- 앱스토어 IAP 전환 정책
- 구독 환불·해지 전체 기능 parity
- Native push
- 장기 미확정 주문을 서버가 취소하고 지원 case를 자동 생성하는 운영 도구

## 주요 파일

- `apps/hairfit-app/app/billing.tsx`
- `apps/hairfit-app/app/payments/complete.tsx`
- `apps/hairfit-app/lib/payment-resume.ts`
- `apps/hairfit-app/__tests__/payment-resume.test.ts`
- `my-app/lib/billing-return-target.ts`
- `my-app/lib/billing-return-target.test.ts`
- `my-app/app/api/mobile/payments/prepare/route.ts`
- `my-app/app/api/mobile/payments/complete/route.ts`
- `packages/payments-portone/*`
- `packages/api-client/src/index.ts`

## 수용 기준

- [x] 크레딧 부족 사용자가 막다른 화면에 남지 않고 세 action 모두 billing으로 이동한다.
- [x] 표시 플랜·가격이 서버 정책 snapshot과 일치한다.
- [x] 성공·실패·취소·pending을 서로 다른 화면과 복구 CTA로 표시한다.
- [x] 로컬 코드상 앱 재실행 뒤 계정별 결제 상태와 ResumeTarget을 복구한다.
- [x] 결제 후 원래 paid action의 fresh Quote로 돌아가며 자동 과금하지 않는다.
- [x] 중복 callback이 크레딧을 중복 지급하지 않도록 account/payment 결속과 서버 멱등 처리를 사용한다.
- [ ] 실제 앱 종료 중 webhook 완료, iOS/Android callback, SDK 중복 callback에서 위 계약을 입증한다.

## 검증

```powershell
npm run portone:audit
npm run portone:contract:test
npm run portone:mobile:smoke
npm --workspace @hairfit/app test -- --runTestsByPath __tests__/payment-resume.test.ts __tests__/payment-complete.test.ts
npm run paid-action:contract:test
npm run typecheck
npm run lint:all
# 통합 환경
npm run portone:e2e:inspect -- --paymentId=<test-payment-id>
```

최신 로컬 직접 재검증에서 결제 복구 집중 test 24/24와 웹 billing return allowlist test 5/5가 통과했고, `portone:audit`, `portone:contract:test`, `portone:mobile:smoke`도 통과했다. Styler·에프터케어 웹·Expo 화면은 각 safe target, fresh Quote, manual reconfirmation을 사용한다.

### 2026-07-18 결제 콘텐츠 완결성

- `packages/shared/src/billing/subscription-policy.ts`가 월 자동결제, 결제 확인 후 월 크레딧 지급, 현재 미사용 크레딧 잔액 유지, 기간 종료 해지를 한국어 단일 원천으로 제공한다.
- 웹 `/billing`, `/billing/checkout`, 결제 폼의 CTA 직전과 웹·Expo 이용 약관이 같은 정책을 사용한다. 웹은 이용 약관·개인정보 처리방침·결제 문의 링크, Expo는 이용 약관·개인정보 처리방침 버튼을 제공한다.
- 웹 마이페이지의 1-click 해지 요청을 `ConfirmActionDialog`로 바꿔 변경 전/후 상태와 미사용 크레딧 영향을 확인한 뒤에만 기간 종료 해지를 요청한다.
- `SubscriptionPolicyDisclosure`를 component registry/passport에 `experimental`로 등록했다. 인증 checkout interaction·visual 증거 전 stable로 승격하지 않는다.
- billing content 계약 4/4, notification retention 추가 후 shared 전체 41/41, registry 45/45, 웹·Expo typecheck와 대상 lint 오류 0을 확인했다. 격리 Next production build static 96/96, 공개 Playwright 15/15, Expo Web 1,059·iOS 1,338·Android 1,360 modules export도 통과했다. Expo 전체 lint의 기존 에프터케어 배열 표기 경고 1건은 이 범위 밖으로 유지한다.

### 2026-07-19 정기결제 정책 표시 안정화

- `SubscriptionPolicyDisclosure`를 inline 문장 묶음에서 네 개 정책 카드로 분리해 월 자동결제, 크레딧 지급, 미사용 잔액, 기간 종료 해지를 빠르게 구분할 수 있게 했다. 정책 문구는 기존 shared SSoT를 그대로 사용한다.
- root labelled section, semantic list, `data-density=default|compact`, 정책 ID/count 계약을 추가했다. 이용 약관·개인정보 처리방침·결제 문의는 별도 labelled navigation과 44px 최소 높이·focus ring을 가진다.
- fail-closed production harness에서 기본/compact 전환, 키보드 이용 약관 이동, 세 링크 도달성, axe serious/critical 0, 1024px light·320px light·375px dark visual과 overflow 0을 Chromium 3/3으로 확인했다.
- billing content 계약은 7/7, Next E2E build는 static 108/108이다. 시각 증거 차단은 해소했지만 계획에 고정된 인증 checkout 통합 증거가 없으므로 registry는 `stable`이 아니라 `candidate`로만 승격했다.

### 2026-07-19 구독 오픈 알림 신청 폼 안정화

- 이메일 형식이 잘못된 상태에서 제출 버튼 자체를 막던 흐름을 제거했다. 사용자가 제출하면 이메일 필드에 연결된 인라인 오류를 표시하고 해당 필드로 focus를 이동하므로, 왜 진행되지 않는지 즉시 알 수 있다.
- `SubscriptionWaitlistForm`은 공용 `FormField`의 설명·오류 계약을 사용하고 root `data-state=idle|invalid|submitting|success|error`, `data-plan-locked`, `aria-busy`로 상태를 명시한다. 제출 중에는 이메일·플랜·사용 목적·버튼을 함께 잠가 입력 변경과 중복 요청을 막는다.
- 요청은 한 번에 하나만 허용하고 `AbortController`로 unmount 시 남은 요청을 중단한다. 실패·성공 뒤 필드를 수정하면 결과 상태를 초기화해 안전하게 다시 제출할 수 있다.
- fail-closed production harness의 mock API에서 `429 → 재시도 → 201 성공 → 수정 → 200 기존 신청 갱신`을 검증했다. 이메일 trim/lowercase, 선택 플랜·사용 목적·`sourcePath` request body와 성공 callback 1회도 함께 확인했다.
- Chromium 3/3에서 1024px light의 전체 복구 흐름, 320px light의 인라인 오류·focus, 375px dark의 성공 상태를 visual·overflow·axe serious/critical 0으로 확인했다. billing content 계약은 10/10, Next E2E build는 static 109/109다.
- Passport와 registry는 `experimental`에서 `candidate`로만 승격했다. 실제 Supabase 저장·인증 checkout/modal 통합·오픈 시점 이메일 수신 증거가 없으므로 `stable` 또는 운영 완료로 표기하지 않는다.

이는 정적·단위·로컬 API 계약 증거다. 실제 PortOne SDK, webhook 지연, 프로세스 강제 종료, iOS universal link/Android app link callback 수명주기 증거는 아니다.

필수 sandbox/실기기 시나리오:

- 세 action 각각 결제 성공, 사용자 취소, SDK 실패, webhook 지연, 앱 강제 종료, 중복 callback
- 결제 전후 잔액과 paid-action receipt/ledger 일치
- 결제 중 계정 전환과 다시 원래 계정으로 복귀
- Android back과 iOS dismiss 후 정확한 action session/result 복귀
- 악성·오래된 `returnTo`가 기본 플랜 화면으로 안전하게 축소되는지 확인

## 잔여 운영 리스크

장기 미확정 주문의 안전한 해제 경로가 없다. 현재 앱은 중복 결제를 막고 고객지원 안내를 보여 주지만, 서버가 취소를 확인해 pending을 해제하거나 추적 가능한 지원 case를 자동 생성하지 않는다.

또한 결제 복귀는 실행 내구성과 별개다. 세 action 모두 결제 성공 뒤 fresh Quote를 확인하고 사용자가 직접 다시 실행해야 한다. 헤어 generation과 Styler는 DB 접수가 끝난 뒤 각각 durable Workflow가 실행을 소유하므로 그 시점부터 화면을 닫을 수 있다. 에프터케어 AI 실행만 아직 HTTP 요청 수명에 묶여 있어 완료 전 앱 종료 가능 문구를 사용하지 않는다.

## 롤백·인계

- 기존 billing 진입을 fallback으로 유지하되 하드코딩 가격이나 broad `returnTo` allowlist로 되돌리지 않는다.
- account/payment 결속과 unresolved 중복 결제 차단은 UI rollout과 별개로 유지한다.
- Phase 07A, 07B, 10B, 10C에 paid-action resume 계약을 넘긴다.

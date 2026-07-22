# Phase 10B — Styler 유료·진행·복구 흐름

- 상태: 로컬 구현·운영 검증 대기 — 20크레딧 Quote·원자 예약/정산·실패 환불·receipt·웹/Expo 결제 복귀, 전신 사진 개인정보·삭제 UX, 202 접수·전용 Workflow/outbox·완료 이메일을 연결했으며 원격 migration·배포·실메일·실기기 종료 E2E는 미완료
- 우선순위: P0/P1
- 변경 게이트: `behavioral`
- 선행 페이즈: Phase 01A, Phase 01B, Phase 02A, Phase 03, Phase 06
- 독립 배포: migration/RPC와 웹·앱을 함께 rollout하고 실환경 검증한 뒤 가능

## 목표

Styler 룩북 생성의 고정 20크레딧 비용, 사용 가능한 헤어 조건, 모델 생성 진행·실패·재시도를 웹과 앱에서 같은 의미로 제공한다.

## 확정 제품 계약

- Styler 자격은 `confirmedHairRecord`가 아니라 현재 generation의 `selectedVariantId`다.
- 실행 단가는 shared `OUTFIT_LOOKBOOK_CREDITS = 20`으로 고정하며 paid-action 가격 env override를 사용하지 않는다.
- 실행 전 서버가 5분 HMAC Quote를 발급하고, API는 `quoteId`를 다시 검증한 뒤 서명 토큰이 아닌 감사 snapshot을 DB RPC에 전달한다.
- 최초 실행은 20크레딧을 예약한다. 성공하면 `charged`, 모델·저장 실패면 20크레딧을 `refunded`로 정산한다.
- 같은 세션의 진행 중·완료·실패 재조회는 persisted receipt를 재사용하고 ledger를 중복 생성하지 않는다.
- 결제 뒤 원래 `/styler/{sessionId}`로 복귀하지만 자동 실행하지 않고 fresh Quote와 사용자 재확인을 요구한다.
- 생성 접수는 DB reservation과 `styling_workflow_outbox` enqueue를 같은 트랜잭션에서 확정하고 HTTP 202로 반환한다.
- 접수 뒤 페이지 이동·브라우저 종료·앱 종료 여부와 무관하게 전용 `StylingWorkflow`가 실행을 소유하며, terminal 정산 뒤 가입 이메일을 알림 전용 outbox로 발송한다.

## 2026-07-15 로컬 구현

- [x] 웹·앱 실행 전 20크레딧 Quote, 현재 잔액, 차감 후 잔액 표시
- [x] 부족 시 Phase 06 billing 진입과 UUID 기반 `/styler/{sessionId}` 복귀
- [x] 실행 후 `PaidActionExecutionReceipt`로 실제 예약·차감·환불과 잔액 표시
- [x] 모델 실패분 20크레딧 자동 환불과 새 20크레딧 Quote 재시도 정책 표시 — 실패분 중복 차감 없음
- [x] `recommend`와 `generate` API에서 현재 선택 variant와 생성 결과 존재 여부 재검증
- [x] `styling_credit_attempts`, `begin_styling_execution`, `settle_styling_execution`, `read_styling_credit_receipt`로 세션 단위 원자 예약·정산·replay 구현
- [x] 모바일 선택 modal을 `FlatList` 기반 스크롤 목록으로 변경
- [x] 웹·앱 상세의 `generating` 3초 polling, `failed` 재시도, 완료·환불 receipt 상태 분리
- [x] 2시간 execution lease가 만료된 `reserved` 세션을 안전한 재시도 상태로 표시하고 기존 예약 크레딧으로 재실행
- [x] 성공·실패 정산 응답이 모호할 때 DB receipt를 재조회해 `charged` 이미지를 삭제하지 않고, 미확정이면 202 `STYLING_SETTLEMENT_PENDING`으로 유지
- [x] Quote·세션 요청에 request ID/중복 요청 방어를 적용해 늦은 응답이 최신 상태를 덮는 범위 축소
- [x] raw 서버 Quote 오류를 만료·변경·부족·권한별 사용자 문구와 fresh Quote로 변환
- [ ] light/dark token 대비와 작은 viewport CTA 도달성의 인증 실브라우저·실기기 증거 — 운영 Styler 선택 Dialog의 320px light·375px dark Chromium 도달성·axe는 통과, 인증 통합·실기기 남음
- [x] 전신 사진의 저장 위치·보존기간·삭제 방법을 실행 직전에 설명하는 개인정보 고지
- [x] Expo 사진 권한 거부와 Styler 정적 영문 fallback 문구를 한국어 복구 CTA·상태로 정리

## 2026-07-17 내구성 후속 구현

- [x] `begin_styling_execution`과 같은 트랜잭션에서 Workflow command를 enqueue하는 `styling_workflow_outbox` 추가
- [x] `generate` API를 AI/storage 동기 실행에서 HTTP 202 접수 command로 변경
- [x] 1분 dispatcher와 Cloudflare `StylingWorkflow`의 실행·실패 callback, lease token fencing, deterministic output path·재조회 구현
- [x] terminal 정산과 분리된 `styling_notification_outbox`, 불변 발송 payload, provider attempt fencing, retry/dead-letter·23시간 delivery unknown 격리 구현
- [x] 완료·실패·환불 결과 이메일과 `styling-completed/{sessionId}` idempotency key 구현
- [x] 웹·Expo 상세에 3초 polling, 백그라운드 진행 안내, 완료 이메일 상태를 같은 의미로 표시
- [x] 로컬 PostgreSQL 18.4 migration/smoke와 Workflow·알림 계약 테스트, callback/Worker dry-run 검증

## 데이터·실행 구조

```text
fresh HMAC Quote
  -> begin_styling_execution(session/user row lock)
  -> 20 credit reservation + styling_credit_attempts(reserved)
  -> styling_workflow_outbox(queued), same transaction
  -> HTTP 202 accepted
  -> dispatcher -> Cloudflare StylingWorkflow
  -> run callback -> AI image/private storage
  -> settle_styling_execution (lease-token fenced)
       success: charged + completed image receipt
       failure: refund ledger + refunded receipt
  -> styling_notification_outbox
  -> email drain -> Resend -> sent/retry/dead_letter/delivery_unknown
```

DB는 고정 20크레딧, quote fingerprint·quote 시점 잔액·만료·policy version, 2시간 execution lease token, Workflow dispatch lease와 이메일 provider attempt를 보존한다. RLS는 강제되고 관련 table/RPC는 service-role 전용이다. 기존 완료·실패 세션의 `outfit_styling_usage` ledger는 migration에서 receipt로 backfill한다.

## 내구성 구현과 운영 한계

Styler 접수 API는 더 이상 AI와 storage를 HTTP 요청 안에서 실행하지 않는다. DB reservation과 Workflow command가 원자적으로 확정된 뒤 202를 반환하고, dispatcher 장애나 callback 재시도는 lease가 만료된 command를 다시 claim한다. 실행 결과 경로와 정산은 attempt token으로 fencing하며, 완료 알림 장애는 Styler 성공·실패 상태를 바꾸지 않는다.

따라서 로컬 소스 계약은 접수 뒤 페이지 이동·앱 종료 가능 문구를 충족한다. 다만 원격 migration과 Worker/App coordinated deploy, 실제 Resend 수신, 인증 브라우저와 iOS/Android 강제 종료 후 terminal 도달 증거가 없으므로 운영 완료로 승격하지 않는다.

## 제외 범위

- 헤어 생성 Workflow 변경
- 에프터케어 과금·잠금
- Styler 파일 behavior-preserving 분해
- 패션 모델·프롬프트 품질 변경
- Native push

## 주요 파일

- `my-app/app/styler/new/page.tsx`
- `my-app/app/styler/[id]/page.tsx`
- `my-app/app/api/styling/recommend/route.ts`
- `my-app/app/api/styling/generate/route.ts`
- `my-app/app/api/styling/[id]/route.ts`
- `my-app/app/api/styling/run/route.ts`
- `my-app/app/api/styling/fail/route.ts`
- `my-app/app/api/styling/workflow-dispatch/route.ts`
- `my-app/app/api/styling/notifications/drain/route.ts`
- `my-app/lib/styling-workflow-execution.ts`
- `my-app/lib/styling-notification-outbox.ts`
- `my-app/workers/generation-workflow/src/index.ts`
- `apps/hairfit-app/app/styler/new.tsx`
- `apps/hairfit-app/app/styler/[id].tsx`
- `packages/api-client/src/index.ts`
- `packages/shared/src/billing/paid-action.ts`
- `supabase/migrations/20260715173000_paid_action_atomic_execution.sql`과 `my-app` 미러
- `supabase/migrations/20260717074603_styling_durable_workflow_and_notifications.sql`과 `my-app` 미러

## 수용 기준

- [x] 실행 전에 20크레딧과 잔액 변화를 알 수 있다.
- [x] 결제 후 원래 Styler session과 fresh Quote로 돌아오며 자동 생성하지 않는다.
- [x] selected 자격과 사용자 문구가 서버 검사와 일치한다.
- [x] `generating`·`failed`가 단순 “이미지 없음”으로 보이지 않는다.
- [x] 모델 실패와 반복 요청에서 중복 차감이 없고 20크레딧 환불 receipt가 남는다.
- [ ] 작은 화면과 light/dark 환경에서 목록·닫기·확인 CTA 도달을 실기기로 확인한다.
- [x] 전신 사진 개인정보 고지와 삭제 정책을 실행 화면에서 확인할 수 있다.
- [x] 요청 연결과 분리된 durable worker·outbox·완료 이메일 계약과 DB 상태 전이를 로컬 자동 검증으로 입증한다.
- [ ] 인증 브라우저·iOS/Android 강제 종료와 실제 배포 환경에서 완료·환불·메일 수신을 입증한다.

## 검증

```powershell
npm run paid-action:contract:test
npm run styling-workflow:contract:test
npm run generation-workflow:contract:test
npm run portone:audit
npm run typecheck
npm run lint:all
npm run build
npm --workspace @hairfit/app test
npm run mobile:bundle
# migration 적용이 끝난 격리 PostgreSQL에서
psql -v ON_ERROR_STOP=1 -f my-app/supabase/tests/paid_action_atomic_execution_smoke.sql
psql -v ON_ERROR_STOP=1 -f my-app/supabase/tests/styling_durable_workflow_smoke.sql
```

이번 로컬 세션의 PostgreSQL 18.4 fresh DB에서 reserve, 진행 중 replay, 실패 환불과 환불 replay, 새 attempt 성공을 확인했다. 두 연결의 실제 경합에서는 한 연결만 20크레딧을 예약하고 다른 연결은 같은 attempt를 `inProgress`로 받았으며, 최종 확인값은 잔액 80·usage ledger 1·reserved attempt 1이었다.

2026-07-17 후속 로컬 패치에서 웹·Expo 실행 화면에 비공개 버킷, 임시 서명 링크 사용, 교체 시 이전 파일 삭제, 직접 삭제 전 보관 정책을 표시했다. Expo는 기존 `DELETE /api/style-profile/body-photo`를 API client에 연결해 확인 대화상자 뒤 즉시 삭제할 수 있다. 새 Styler·헤어 선택 modal·세션 결과의 정적 영문 문구와 raw `error.message` 노출을 한국어 상태·안전 오류 mapper로 바꾸고, 3단계를 `견적·생성`으로 명확히 했다. 이는 운영 버킷 정책·실기기 접근성 증거를 대체하지 않는다.

같은 날 내구성 패치에서 2시간 lease, 원자 Workflow enqueue, HTTP 202 접수, 1분 dispatch, 전용 `StylingWorkflow`, terminal 이메일 outbox를 추가했다. 로컬 계약은 styling 7/7, paid-action 17/17, generation Workflow 45/45를 통과했고 PostgreSQL smoke는 성공·실패 환불·잘못된 lease 거절·메일 claim/send 상태를 확인했다. Wrangler dry-run은 `GENERATION_WORKFLOW`와 `STYLING_WORKFLOW` binding을 모두 확인했으며 실제 배포는 수행하지 않았다.

2026-07-18 운영 컴포넌트 E2E에서 Styler 선택 Dialog를 320px light와 375px dark로 각각 열어 패널의 viewport 경계, 문서 가로 overflow 0, 닫기 버튼과 스타일 카드 도달·선택 완료 status, axe serious/critical 0을 확인했다. 전체 production Playwright는 21/21이다. 이는 인증 route와 iOS/Android 실기기 증거가 아니므로 관련 종료 체크는 유지한다.

자동 계약·타입·lint·build 결과는 로컬 코드 증거다. 인증된 웹 viewport, iOS/Android 실기기, 원격 migration, 서버리스 연결 중단, 실제 PortOne 복귀는 아직 검증하지 않았다.

## 롤백·인계

- 서버 quote·reservation·refund idempotency는 유지하고 새 UI만 단계적으로 되돌릴 수 있다.
- migration 미적용 환경에서 기존 직접 차감 경로로 조용히 fallback하지 않는다. coordinated rollout 또는 명시적 feature rollback을 사용한다.
- Phase 10D와 12B에는 Styler state fixture, controller 책임, 개인정보·반응형 잔여 항목을 넘긴다.
- Styler 전용 command/outbox와 notification outbox를 하나의 coordinated rollout 단위로 유지하며, migration 미적용 상태에서 동기 실행으로 fallback하지 않는다.

# HairFit UI/UX 제품 계약 기준선

- 확정일: 2026-07-15
- 기준 브랜치: `develop/2026-07-14-generation-completion-notifications`
- 기준 HEAD: `eb77c7f5421b9b8ac44e540e66931573f4097a41`
- 적용 범위: 웹, Expo 앱, 살롱, 관리자, 생성 Workflow, 완료 이메일
- 성격: 목표 제품 계약과 현재 구현 차이를 함께 기록하는 단일 기준선

## 1. 용어와 상태

| 개념 | 단일 의미 | 허용 행동 |
| --- | --- | --- |
| `selectedVariantId` | 사용자가 비교 보드에서 현재 선택한 대표 헤어. 바꿀 수 있다. | 결과 보기, Styler 시작, 다른 후보로 변경 |
| `confirmedHairRecord` | 사용자가 시술 계획을 확정해 만든 기록. 선택 잠금의 유일한 근거다. | 에프터케어 생성, 시술·상담 기록 유지 |
| 살롱 방문 확정 | 살롱 CRM의 예약·방문 도메인 상태 | 고객의 개인 헤어 확정과 별도로 변경 |

Styler는 `selectedVariantId`가 있으면 시작할 수 있다. Styler는 탐색 기능이므로 `confirmedHairRecord`를 강제하지 않는다. 따라서 Styler와 요금 화면의 “확정 헤어” 문구는 “선택한 헤어”로 정렬한다. 에프터케어만 `confirmedHairRecord`를 요구한다.

DB에 저장하는 생성 상태는 `queued`, `processing`, `completed`, `failed` 네 가지다. `partial`은 일부 후보 완료와 일부 후보 실패를 조합한 표시 상태이며 DB enum으로 추가하지 않는다. 알 수 없는 값은 UI에서 `unknown`으로 안전하게 표시하고 결과 화면으로 보내지 않는다.

## 2. 생성 접수와 종료 계약

`acceptedAt`은 다음 네 조건이 충족된 뒤 DB accept 트랜잭션이 기록한 서버 시각이다. 원본 업로드는 accept 전 완료되며, generation·reservation·Workflow outbox는 같은 DB 트랜잭션에서 확정된다.

1. 원본 이미지가 비공개 Storage에 저장됨
2. 차감 정책과 generation ID가 확정됨
3. generation별 10크레딧 reservation과 usage ledger가 한 번만 저장됨
4. generation별 유일한 내구성 Workflow outbox intent가 저장됨

클라이언트는 `acceptedAt` 또는 동등한 서버 receipt를 받은 뒤에만 “페이지나 앱을 닫아도 된다”고 안내한다. 얼굴 분석과 추천 구성처럼 접수 전 동기 작업이 남아 있으면 화면 유지를 명시한다. 같은 generation의 시작 재시도는 Workflow를 중복 생성하거나 크레딧을 다시 차감하지 않는다.

종료 상태와 복구 정책은 다음과 같다.

| 결과 | 표시 | 과금·복구 목표 |
| --- | --- | --- |
| 하나 이상 성공, 실패 없음 | 완료 | 첫 authoritative 성공에서 reservation을 generation당 한 번 `charged`로 확정, 재조회 무료 |
| 일부 성공, 일부 실패 | 부분 완료 | 첫 성공에서 한 번 `charged`, 추가 차감 없이 실패 후보 재시도 가능, 성공 결과는 즉시 사용 가능 |
| 성공 0건 | 전체 실패 | terminal 실패에서 reservation 전액을 `refunded`로 멱등 복구. 새 생성은 새 접수 필요 |
| 사용자 입력·정책 오류 | 작업 필요 | 원인을 고친 뒤 새 접수. 실제 AI 실행 전이면 차감 없음 |

현재 헤어 구현은 private upload draft, generation·`acceptedAt`·Workflow outbox·10크레딧 reservation의 원자적 accept를 제공하고, 분석·추천 준비를 `acceptedAt` 뒤의 Workflow lease 단계로 이동했다. 첫 authoritative 성공은 차감을 확정하고 성공 0건 terminal 실패는 전액을 복구하며, accept/run/detail/status API와 웹·Expo·살롱 UI가 같은 receipt를 표시한다. 완료 이메일은 settlement가 끝날 때까지 retry한 뒤 차감 또는 환불 결과를 포함한다.

Phase 03의 일반 paid-action 계약도 로컬 구현됐다. 세 action 모두 실행 전 5분 HMAC `quoteId`, `expiresAt`, `currentBalance`, `balanceAfter`, policy version을 서버가 확정하며, 실행 API는 사용자·action·subject·payer·금액·잔액을 다시 검증한다. DB에는 raw Quote가 아니라 SHA-256 fingerprint와 감사 snapshot을 보존한다. Styler는 세션별 20크레딧 reserve/charge/refund receipt와 2시간 lease 재시도를 제공하고, 정산 응답이 모호하면 receipt를 재조회해 완료 이미지를 보존한다. 에프터케어는 계정 첫 무료 claim과 추가 30크레딧 debit·프로그램 receipt를 사용하며 RPC 응답 유실 시 기존 program을 replay한다.

종료 내구성은 action마다 다르다. 헤어 generation과 Styler는 각각 durable Workflow/outbox와 완료 이메일을 가지므로 DB가 접수를 확정한 뒤 화면 종료 계약을 제공한다. Styler `generate` API는 AI/storage를 직접 실행하지 않고 Workflow command와 20크레딧 reservation을 원자적으로 남긴 뒤 202를 반환한다. 에프터케어는 AI guide/content 생성이 transaction 전 HTTP 단계이므로 아직 “앱을 닫아도 반드시 완료된다”는 문구를 사용하지 않는다. 에프터케어가 AI 단계에서 중단되면 DB write·차감 없이 fresh Quote로 재시도하며, RPC 응답만 유실된 경우 같은 generation receipt를 replay한다.

전체 실패 refund 뒤 수동 재시도는 같은 generation을 다시 실행하지 않고 새 접수로 시작한다. 부분 완료의 실패 후보 무료 재시도는 목표 계약이지만, 페이지·앱 종료 후에는 현재 클라이언트가 로컬 portrait를 다시 확보해야 하는 P1 복구 격차가 남아 있다.

원본 자동 삭제는 현재 모든 후보가 완료된 generation에만 허용한다. 부분 완료·전체 실패는 같은 generation 무료 재시도를 위해 원본을 보존하며, 재시도 포기·보존기한 만료 시점의 원자적 취소와 개인정보 삭제 UX는 Phase 07의 남은 계약이다. terminal 알림 실패는 전체 Workflow 재시작이 아니라 알림 전용 outbox/retry로 복구해야 한다.

## 3. 가격·차감 계약

| 기능 | 비용 | 기준 |
| --- | ---: | --- |
| 추천 목록·분석 조회 | 0 | 결과 이미지 생성 전 |
| 헤어 추천 보드 결과 생성 | 10 | `recommendation_grid_usage`, generation당 1회 |
| Styler 룩북 이미지 | 20 | 선택한 헤어 기준, `outfit_styling_usage` |
| 첫 에프터케어 프로그램 | 0 | 계정 생애 최초 1회 |
| 추가 에프터케어 프로그램 | 30 | 프로그램당 1회, 예약 메일별 추가 차감 없음 |

shared `HAIRSTYLE_GENERATION_CREDITS = 10`, `OUTFIT_LOOKBOOK_CREDITS = 20`, `ADDITIONAL_AFTERCARE_PROGRAM_CREDITS = 30`과 서버의 versioned `creditPolicy`/Quote snapshot이 표시와 실행의 기준이다. 앱은 서버 snapshot을 우선하고 응답 부재 때만 shared 기본 정책을 fallback으로 사용하며, 5크레딧 같은 화면 로컬 상수는 계산에 사용하지 않는다. paid-action 실행 단가는 `PRICING_CREDITS_PER_*` 환경 변수로 override하지 않는다. 표시 Quote와 DB 실행 단가 drift를 막기 위해 v1 10/20/30은 shared와 RPC에서 고정한다.

헤어 generation receipt 상태는 `reserved` → `charged` 또는 `reserved` → `refunded` 단방향이다. accept replay와 terminal callback 재시도는 같은 reservation·ledger를 재사용하며, UI는 예약 후 잔액과 환불 후 잔액을 서버 receipt로 표시한다. 이 receipt는 실행 전 일반 Quote나 결제 복귀를 대체하지 않는다.

공통 `PaidActionExecutionReceipt`는 `reserved`, `charged`, `refunded`, `free` 상태와 cost/charged/refunded, authoritative `balanceAfter`, usage/refund ledger ID, replay 여부를 가진다. Styler의 `styling_credit_attempts`는 같은 세션의 진행 중 attempt와 terminal receipt를 재사용하고, 실패 시 20크레딧 refund ledger를 한 번만 만든다. 에프터케어의 `aftercare_free_claims`는 user PK로 계정 최초 무료를 직렬화하고, `aftercare_program_receipts`는 user/generation별 free 또는 charged 결과와 content 6개를 보존한다.

v1 헤어 generation 금액은 고객·살롱 accept route와 DB에서 모두 10으로 고정한다. settlement reason은 receipt·이메일에 안전하게 전달되도록 256자로 제한하며, `ensure_user_profile` 직접 실행은 authenticated에서 revoke하고 service-role만 허용한다. refund CTA의 `retryPath`와 전체 실패 이메일은 개인 또는 살롱에서 시작한 context에 맞는 재진입 경로를 유지한다.

살롱 고객 workspace에서 생성한 비용의 `billingScope`는 현재 로그인한 살롱 소유자 계정이다. 연결된 고객 계정에서는 차감하지 않는다. 접수 전 확인 화면에 비용 부담 계정을 명시해야 한다.

## 4. 완료 알림 계약

- 필수 채널: 가입 이메일
- 선택 채널: Native push
- fallback: 웹·앱의 generation 상태 재조회와 이력
- 대상: 완료, 부분 완료, 전체 실패
- 횟수: generation·channel별 정확히 한 번. callback 재시도는 같은 idempotency key를 사용한다.
- 실패 격리: 메일 또는 push 실패가 generation의 완료·실패 상태를 바꾸지 않는다.
- 재진입: 링크가 인증을 거친 뒤 같은 generation ID를 열어야 한다.
- 이메일 없음: `skipped`를 기록하고 인앱 상태 조회는 계속 제공한다.

현재 알림 기준선은 다음과 같다.

- migration 순서: legacy compatibility `20260714121238_generation_completion_notifications.sql` → variant lease `20260715103000_generation_variant_attempt_leases.sql` → notification outbox `20260715134451_generation_notification_outbox.sql` → durable acceptance `20260715150000_generation_durable_acceptance.sql` → generation credit reservation/settlement `20260715160000_generation_credit_reservation_settlement.sql` → Styler/aftercare atomic execution `20260715173000_paid_action_atomic_execution.sql` → Styler durable Workflow/notification `20260717074603_styling_durable_workflow_and_notifications.sql`과 각 `my-app` 미러
- Workflow: `my-app/workers/generation-workflow/src/index.ts`
- 메일 idempotency key: `generation-completed/{generationId}`
- Styler 메일 idempotency key: `styling-completed/{sessionId}`
- 현재 작업 트리 보강: 다섯 callback route shape만 공유 secret 검증 후 Clerk 사용자 인증을 우회하고, 각 route가 secret을 다시 검증
- 알림 SSoT: generation·event·channel unique outbox, DB lease token, `SKIP LOCKED`, 필수 payload·수신자·멱등키·전이 순서를 DB가 검증하는 불변 rendered payload, 5분 scheduled reconcile/drain
- 발송 불확실성: Resend SDK의 network/null status·408·5xx·concurrent idempotency를 누적하고 23시간에 `delivery_unknown`으로 격리
- rolling compatibility: outbox 존재 시 legacy claim 차단, legacy `sent/skipped` 흡수, 새 terminal 상태를 legacy 컬럼에 1회 mirror
- variant 실행 lease: `20260715103000_generation_variant_attempt_leases.sql`; DB 발급 fencing token, 완료 흡수 상태, 응답 유실 reconciliation으로 Workflow 재시도 중 stale write와 성공 강등을 차단
- 운영 URL·secret: production HTTPS origin 강제, placeholder·32바이트 미만·저엔트로피 callback secret 거절
- durable 접수: private upload draft, 원자적 accept replay, preparation lease, Workflow dispatch outbox와 1분 dispatcher
- credit 정산: accept 시 10크레딧 reservation, 첫 성공 commit, 성공 0건 terminal 실패 refund, API/UI receipt, 이메일 settlement gate
- Styler 내구성: 20크레딧 reservation과 Workflow command 원자 enqueue, 2시간 실행 lease, 1분 dispatcher, deterministic output path, terminal 정산 뒤 전용 이메일 outbox
- 재진입: generation UUID ResumeTarget, 웹 open-redirect 방어, Expo pending target, 환경 기반 AASA/Asset Links route. 운영 identifier가 없으면 association은 503으로 fail closed
- 로컬 DB 증거: 이번 세션의 PostgreSQL 18.4 fresh apply에서 generation accept replay·commit/refund·부족 rollback과 Styler reserve/replay/refund/refunded Quote 재사용 차단/new success, 에프터케어 first-free/30/replay/6 contents/legacy 완성 프로그램 무과금 복구/동일 이름 다른 variant 잠금/invalid payload rollback/stale Quote no-write를 확인했다. 두 연결 Styler 경합은 usage ledger와 reserved attempt를 하나만 만들었고, 서로 다른 generation의 동시 에프터케어는 free claim/receipt/program을 하나만 만든 뒤 다른 요청에 `QUOTE_CHANGED`를 반환했다. root/`my-app` atomic paid-action migration SHA-256은 `518ED26C3F216750A67B71468B5813B2D5202E4E0786E09C212A3308AAF27E97`로 일치한다.
- 미확보 증거: 원격 credit/paid-action/Styler durable migration 적용, staging 병렬 claim·settlement, 배포 환경 secret 일치, 실제 PortOne·Resend 수신, 인증 브라우저·앱 종료 후 수신, Styler 강제 종료와 에프터케어 요청 연결 종료, 로그인 만료 재진입, 운영 Team ID·release cert와 실기기 app-link, dead-letter/unknown 관측·runbook, payload 보존기간

## 5. route/state matrix

| 사용자 표면 | 진입 상태 | 기본 목적지 | 막힘·복구 |
| --- | --- | --- | --- |
| 웹 `/workspace` | 사진 없음 | 업로드 | 검증 실패를 필드·가이드 근처에 표시 |
| 웹 `/upload`, ID 없는 `/generate` | 구형 bookmark·billing 복귀 | 307 → `/workspace` 또는 `/workspace?nextStep=generate` | 계정별 이미지 hydration 뒤 생성/업로드 단계 결정, 구형 hit 구조화 기록 |
| 웹·앱 생성 사전 업로드/accept | `acceptedAt` 전 | 현재 화면 유지 | 업로드·접수 재시도, 아직 종료 가능하다고 말하지 않음 |
| 웹·앱 `/generate/[id]` | accepted + queued/preparing/retry/processing | 진행 상태와 `reserved` receipt | 다른 화면 이동·종료 가능, 정산 뒤 이메일 안내 |
| 웹·앱 `/generate/[id]` | completed/partial | 결과 후보 비교 | 완료 후보만 열고 실패 후보는 재시도 |
| 웹·앱 이력 | failed/unknown | 생성 상세와 `refunded` receipt | 결과로 보내지 않고 실패 원인·환불 상태·새 접수 안내 |
| 웹·앱 Styler | 선택 헤어 없음 | 헤어 결과 선택 | “선택한 헤어 필요”와 되돌아갈 CTA |
| 웹·앱 Styler | 선택 헤어 있음 + recommended/failed | 20크레딧 Quote와 receipt | 부족 시 billing→같은 session→fresh Quote, 생성 중 3초 polling, 실패 시 환불 후 재시도 |
| 웹·앱 Styler | generating | 진행 상태·reserved receipt·완료 이메일 상태 | DB 202 접수 뒤 다른 화면 이동·종료 가능; 재진입해 session/receipt 조회 |
| 에프터케어 | 시술 확정 없음 | 0/30 Quote·시술일·잠금 결과 확인 | 부족 시 billing→같은 result→fresh Quote, 선택만으로 자동 생성하지 않음 |
| 에프터케어 | 이미 확정됨 | 기존 상세와 persisted receipt | 같은 generation 재요청 무료 replay, 추가 차감 금지 |
| 모바일 `/mypage` | 모든 generation 상태 | 상태별 상세 | completed만 result, 나머지는 generation 상세 |
| 모바일 `/billing` | account snapshot 있음 | 서버 self-serve catalog·현재 플랜·크레딧·정책 | 일부 요청 실패는 성공 snapshot 유지, 결제 후 `/mypage?tab=plan` 복귀 |
| 살롱 고객 workspace | owner 인증·동의 있음 | 고객 생성 | 차감 주체를 살롱 계정으로 표시 |
| 관리자 | admin | 운영 화면 | 사용자 쓰기 API와 관리자 쓰기 API 분리 |
| 완료 이메일 | 인증 유효 | 같은 generation | 만료 시 로그인 후 같은 ID로 복귀 |

## 6. 검증 표면

| 계약 | 기본 검증 | 현재 증거 |
| --- | --- | --- |
| 상태·선택·가격·paid-action receipt | Node contract test | shared 20/20, paid-action 17/17 통과 |
| Native primitive | jest-expo + RNTL | `apps/hairfit-app/__tests__/ui-native.test.tsx` 2건 통과 |
| Mobile 정적 타입·번들 | TypeScript + Expo export | 7-workspace typecheck와 `mobile:bundle` exit 0; Web 946·iOS 1,229·Android 1,250 modules의 3-platform export 확인. 실기기 미완료 |
| Workflow callback·attempt lease·notification outbox·credit settlement | Node contract test + 재사용 staging smoke + 대상 lint/typecheck + Worker dry-run | Supabase RPC receiver binding과 v1 금액·reason·profile 권한·retry context 회귀 포함 generation 계약 42/42, PostgreSQL 18 상태 전이·credit settlement, Wrangler 4.87.0 dry-run exit 0 통과; 실제 Worker 배포와 재사용 staging smoke는 미완료 |
| Styler·에프터케어 원자 실행 | Node contract + PostgreSQL smoke/병렬 연결 | Styler reserve/settle/refund/replay와 aftercare free claim/30/6 contents/rollback 통과; 원격 migration·staging·연결 종료 미검증 |
| 웹 interaction·접근성 | component test + 브라우저 | 공통 primitive 구축 중, viewport 증거 미확보 |
| 실제 알림 | 배포 환경 DB·Workflow·Resend E2E | 미확보, 완료로 간주하지 않음 |

## 7. 변경 규칙

- 위 용어·가격·상태를 바꾸려면 이 문서와 shared fixture를 먼저 바꾼다. 생성 상태·가격은 `fixtures/product-contract.ts`, 결과 선택은 `fixtures/generation-selection.ts`, 확정 잠금은 `fixtures/generation-selection-lock.ts`, 완료 알림은 `fixtures/generation-notification.ts`가 각각 독립 기준선이다.
- 서버 snapshot과 UI 문구가 다르면 서버 snapshot이 우선이며 UI를 고친다.
- `partial`을 DB enum으로 추가하거나 선택을 잠금 근거로 사용하는 변경은 breaking contract다.
- 외부 배포·메일 수신·실기기 증거가 없으면 “운영 완료”로 승격하지 않는다.

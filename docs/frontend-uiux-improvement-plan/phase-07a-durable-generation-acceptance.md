# Phase 07A — 서버 내구성 생성 접수

- 상태: 로컬 구현 완료 — 운영 migration·Worker/App 배포·staging 동시성 검증 대기
- 우선순위: P0
- 변경 게이트: `behavioral`, `breaking`, DB migration
- 선행 페이즈: Phase 02A, Phase 03의 가격 계약, Phase 05의 사용자 복귀 계약
- 독립 배포: 불가. migration, 앱 API, Workflow Worker를 호환 순서로 배포해야 함

## 목표

사진 업로드 이후의 얼굴 분석·추천 보드 준비·이미지 생성·terminal 알림을 브라우저나 앱 프로세스와 분리한다. 클라이언트는 작은 멱등 accept command만 수행하며, 서버가 `acceptedAt`을 반환한 뒤에는 DB outbox와 Workflow가 실행 책임을 가진다.

## 서버 계약

```text
upload draft: ready -> accepted | expired
preparation: queued -> preparing -> ready
                         |          |
                         +-> retry -+
                         +-> failed
workflow outbox: queued -> dispatching -> dispatched
                                  |          |
                                  +-> retry -+
                                  +-> failed
```

고객·살롱 API route는 먼저 Quote HMAC, 사용자, action, subject, payer와 현재 정책을 검증한다. 그 뒤 `accept_generation_upload_draft`는 draft row를 잠그고 다음을 한 트랜잭션으로 처리한다.

1. draft 소유권·상태·만료 확인
2. generation 생성 또는 동일 요청 재조회
3. route가 검증해 전달한 Quote snapshot의 action·draft subject·payer·비용·잔액·만료·정책을 재검증하고 사용자 잔액 행을 잠금
4. generation별 10크레딧 reservation과 usage ledger를 한 번만 저장
5. `accepted_at`과 `preparation_status='queued'` 저장
6. generation별 유일한 Workflow outbox 저장
7. draft를 `accepted`로 전이

같은 draft를 다시 accept하면 기존 generation·credit receipt를 반환하며 새 generation, reservation, ledger, outbox를 만들지 않는다.

## 로컬 구현 완료

- [x] `generation_upload_drafts`와 24시간 expiry 계약
- [x] `generation_workflow_outbox`와 generation별 unique dispatch intent
- [x] 두 테이블의 RLS·force RLS·service-role 전용 접근
- [x] 원자적 `accept_generation_upload_draft`와 idempotent replay
- [x] accept와 같은 트랜잭션의 10크레딧 reservation·usage ledger, 부족 잔액 전체 롤백
- [x] 고객·살롱 route와 DB의 v1 금액 10 고정, settlement reason 256자 제한
- [x] 첫 authoritative 성공 시 `charged`, 성공 0건 terminal 실패 시 `refunded`로 전이하는 멱등 DB settlement
- [x] authenticated의 직접 `ensure_user_profile` 실행 권한 revoke와 service-role 전용 실행
- [x] preparation claim/finish/retry/fail lease token fencing
- [x] Workflow outbox claim/finish/retry lease token fencing과 `SKIP LOCKED`
- [x] `/api/generations/drafts`의 JPEG/PNG/WebP, 8MB, SHA-256, private upload 검증
- [x] `/api/generations/accept`의 사용자·스타일 대상·정책 확인과 202 receipt
- [x] 고객·Expo·살롱의 generation Quote 표시·만료·재확인과 accept `quoteId` 전달
- [x] 새 accept의 Quote 기본 fail-closed와 명시적 `PAID_ACTION_QUOTES_REQUIRED=false` legacy rollback switch
- [x] DB에서 Quote `subjectId`가 현재 draft인지, 고객/살롱 payer, quote policy, 현재 잔액과 차감 후 잔액을 `FOR UPDATE` 잠금 안에서 검증
- [x] quote fingerprint·quoted balance·expiry·`quote_policy_version`을 정산 `policy_version`과 분리해 receipt 감사 필드로 보존
- [x] `/api/generations/prepare`로 얼굴 분석·추천·디자이너 브리프를 `acceptedAt` 뒤로 이동
- [x] `/api/generations/workflow-dispatch`와 Worker 1분 cron 재조정
- [x] 구형 `/api/prompts/generate`와 살롱 추천 route를 durable adapter로 전환
- [x] generation detail/status의 accepted/preparation/dispatch 상태 노출
- [x] accept·run·detail·status API와 웹·Expo·살롱 UI의 additive credit receipt
- [x] credit settlement 전 완료 이메일 보류와 정산 뒤 차감·환불 문구
- [x] refunded retry CTA의 `retryPath`로 개인·살롱 context를 보존하고 전체 실패 이메일도 올바른 개인·살롱 재진입 경로 사용
- [x] 모든 후보 완료에서만 원본 삭제하고 partial/failed 원본 보존
- [x] partial/failed 원본의 접수 후 24시간 무료 재시도 창과 웹·Expo 보존 상태 표시
- [x] 앱·페이지 재진입 뒤에도 private 서버 원본으로 실패 후보만 재시도하는 owner 인증 경로
- [x] 재시도 포기·generation 보존기한 만료·ready draft 만료와 삭제 outbox의 원자 전이
- [x] Storage API 삭제 consumer, lease token fencing, retry/dead-letter와 삭제 후 variant claim 경쟁 차단
- [x] root와 `my-app` migration mirror 일치 계약
- [x] 고객 예약·stale balance 무변경 rollback·살롱 payer·refund replay의 재사용 SQL smoke

## 로컬 검증 증거

- [x] `generation-workflow:contract:test`에 credit reservation, Quote/payer, 재사용 DB smoke 정적 계약, Supabase RPC receiver binding 회귀를 포함한 durable acceptance, app-link, callback, variant lease, notification outbox 계약 42/42
- [x] shared Quote·credit receipt 계약 20/20
- [x] paid-action Quote 계약 8/8 — 기본 강제/legacy switch, 변조, 전용 secret, 만료, 비용·잔액 변경, 부족 잔액
- [x] PostgreSQL 18.4 격리 DB에서 `my-app/supabase/tests/paid_action_quote_smoke.sql`의 고객 예약, accept replay, stale balance rollback, 살롱 payer, refund replay 통과
- [x] 이전 fresh apply smoke에서 role/RLS, 성공 commit, 전체 실패 release/refund 멱등성, 부족 잔액 rollback, preparation·dispatch stale token fencing 통과
- [x] 7개 workspace typecheck exit 0, `lint:all` 오류 0·기존 경고 14
- [x] 최종 Next production build exit 0, compile 15.4초·TypeScript 35.8초, static page 89/89
- [x] root와 `my-app`의 credit migration SHA-256 `A6C668772E645298432555986E2DCCEEADEB25E7476C68D9892568E2744B8337` 일치
- [x] `retryPath` snapshot을 포함한 notification outbox migration SHA-256 `3C4C909B92DF29C0CA464C487CD77952F86244F96BB20A36A32049F02138334B` 일치
- [x] Workflow Worker Wrangler 4.87.0 dry-run exit 0, upload 8.61 KiB/gzip 2.55 KiB와 bindings/base URL 확인; 명시적 dry-run으로 배포 없음
- [x] Expo Jest 36/36와 `mobile:bundle` exit 0; Android/iOS/Web export 61 files·16,746,161 bytes, Web 945·iOS 1,228·Android 1,214 modules, SHA-256 Android `E2C692EA…0C86`·iOS `06D1604C…929E`·Web `8238CAE3…813D`
- [x] `mobile:sync` 103/103 정적 계약 통과; runtime-verified route는 0개라는 경고가 있어 실기기 route 검증으로 간주하지 않음
- [x] 원본 보존 shared 계약 포함 44/44, 원본 retention 정적 계약 3/3, 웹·Expo 대상 lint 오류 0, 세 workspace typecheck 통과
- [x] PostgreSQL 18.4 재사용 격리 DB에서 소유자·24시간 경계·draft 만료·lease fencing·삭제 marker·삭제 후 재시도 차단 smoke 통과
- [x] 빈 PostgreSQL 18.4에 73개 migration을 전체 적용하고 variant lease → notification outbox → durable acceptance → credit reservation/settlement 순서를 실행기 assertion과 계약 테스트로 고정
- [x] 재사용 가능한 `generation:workflow-dispatch:db-smoke` 추가 — 1분 future row 비선점, 지연 후 claim, active lease 중복 claim 차단, expired lease 재시작 회수, stale finish fencing, retry delay, finish replay, poison row retry-budget 실패 수렴을 transaction rollback으로 검증
- [x] 최신 `generation-workflow:contract:test` 64/64 통과. app-link external preflight, dispatch recovery runner의 loopback 제한·짧은 timeout·패키지 wiring, SQL 장애 행렬과 durable migration 의존 순서를 정적 계약으로 고정

로컬 smoke는 운영 배포 증거가 아니다. generation Quote용 SQL fixture는 저장소에 재사용 가능하게 보존했지만, 실제 staging URL·운영 role·동시 연결을 사용하는 suite는 별도로 필요하다.

## 운영·런타임 검증 대기

- [ ] `20260715150000_generation_durable_acceptance.sql`과 `20260715160000_generation_credit_reservation_settlement.sql` 운영 적용
- [x] 로컬 빈 DB에서 기존 migration → variant lease → notification outbox → durable acceptance → credit reservation/settlement 순서 검증 — 운영 적용 여부는 바로 위 별도 항목으로 유지
- [ ] 신규 접수 중지·active lease/drain을 포함한 Worker/App coordinated rollout
- [ ] staging에서 동시 accept, 응답 유실, expired lease, poison row, retry budget 검증
- [x] 로컬 PostgreSQL 18.4에서 1분 dispatcher 지연·active lease 경쟁·lease 만료 재시작·retry·poison row를 재현하고 generation/outbox 유실·중복 0 확인
- [ ] 실제 staging dispatcher를 1분 이상 중지·재시작하고 같은 accepted generation이 terminal까지 도달하는 queue age·Workflow instance 증거 확보
- [ ] 운영 관측: queued age, retry count, failed outbox, preparation latency와 alert
- [ ] 브라우저·앱 종료 후 complete/partial/failed terminal 도달 확인
- [ ] 운영 Storage 삭제 consumer의 retry/dead-letter, oldest queued age와 24시간 만료 sweep 관측

## 남은 P0 정책·운영 격차

- 공통 `PaidActionQuote` 발급·검증과 generation 연결은 로컬 구현됐다. Styler·에프터케어는 Quote 비용 계산만 제공하며 실제 원자적 execute/receipt 통합은 남아 있다.
- terminal DB 상태에 따른 commit/refund는 로컬 PostgreSQL smoke까지 확인했다. 운영 migration, staging 동시성, 실제 Workflow 실패가 terminal `failed`로 수렴한 뒤 ledger·receipt·이메일이 일치하는 E2E는 아직 수용 기준을 충족하지 않는다.
- 전체 실패 refund 뒤에는 새 generation 접수를 요구한다. partial 작업의 실패 후보는 24시간 안에 소유자 인증으로 서버 원본을 사용해 재시도하며, 완료 후보에는 서버 원본 재사용을 허용하지 않는다.
- 재시도 포기·draft 만료·원본 보존기간 만료의 원자 전이와 Storage 삭제 outbox는 로컬 구현·PG smoke까지 완료했다. 운영 migration, 실제 bucket 삭제, retry/dead-letter 관측은 배포 게이트다.

## 수용 기준

- accept 응답의 `generationId`와 `acceptedAt`이 DB transaction과 일치한다.
- 즉시 Workflow create가 실패해도 outbox dispatcher가 같은 generation을 재접수한다.
- 중복 accept와 중복 dispatcher가 generation, Workflow, 크레딧을 중복 생성하지 않는다.
- stale preparation/dispatch writer가 최신 상태를 덮어쓰지 않는다.
- accepted 이후 클라이언트 연결이 끊겨도 terminal 상태까지 진행한다.
- 부족 잔액·전체 실패 정책이 Phase 03 receipt/ledger와 일치한다.
- 만료·stale balance·다른 subject의 Quote는 generation·outbox·ledger를 남기지 않고 최신 Quote 재확인을 요구한다.
- 삭제 요청이 커밋된 뒤에는 Storage 객체가 남아 있어도 신규 variant claim이 시작되지 않는다.
- Storage 삭제 성공은 lease token이 일치하는 outbox finish와 generation/draft 삭제 marker를 같은 트랜잭션으로 기록한다.

## 주요 파일

- `supabase/migrations/20260715150000_generation_durable_acceptance.sql`
- `my-app/supabase/migrations/20260715150000_generation_durable_acceptance.sql`
- `supabase/migrations/20260715160000_generation_credit_reservation_settlement.sql`
- `my-app/supabase/migrations/20260715160000_generation_credit_reservation_settlement.sql`
- `my-app/app/api/generations/drafts/route.ts`
- `my-app/app/api/generations/accept/route.ts`
- `my-app/lib/generation-credit-receipt.ts`
- `my-app/lib/paid-action-quote.ts`
- `my-app/app/api/paid-actions/quote/route.ts`
- `my-app/supabase/tests/paid_action_quote_smoke.sql`
- `my-app/supabase/tests/generation_workflow_dispatch_recovery_smoke.sql`
- `my-app/scripts/smoke-generation-workflow-dispatch-recovery.mjs`
- `packages/shared/src/billing/generation-credit.ts`
- `my-app/app/api/generations/prepare/route.ts`
- `my-app/app/api/generations/workflow-dispatch/route.ts`
- `my-app/lib/generation-workflow-outbox.ts`
- `my-app/workers/generation-workflow/src/index.ts`
- `my-app/lib/generation-durable-acceptance.test.ts`
- `supabase/migrations/20260718053130_generation_original_retention.sql`
- `my-app/lib/generation-original-cleanup-outbox.ts`
- `my-app/app/api/generations/[id]/abandon-retry/route.ts`
- `my-app/supabase/tests/generation_original_retention_smoke.sql`

## 롤백·인계

- 이미 accepted된 row와 outbox를 삭제하지 않는다.
- 새 접수를 중지한 뒤 active preparation·variant lease와 outbox를 drain한다.
- 앱 UI만 되돌려도 새 drain/Workflow consumer는 기존 accepted 작업이 끝날 때까지 유지한다.
- Phase 07B에 receipt와 preparation 상태를, Phase 09A에 terminal generation event를, Phase 13에 migration/rollout runbook을 넘긴다.

# Phase 09A — 생성 완료 이메일과 딥링크 재진입

- 상태: 로컬 구현 완료 — 전용 outbox·lease fencing·불변 메일 payload·예약 drain·generation ResumeTarget·관리자 큐 지표·구조화 경보·운영 runbook·배포 사전검사 반영, 운영 DB/App/Workflow probe·외부 경보 연결·실제 수신·종료/재로그인 E2E 대기
- 우선순위: P0
- 변경 게이트: `behavioral`
- 선행 페이즈: Phase 05, Phase 07A, Phase 07B, Phase 08
- 독립 배포: 불가. legacy → variant lease → notification outbox → durable acceptance migration과 App/Workflow 호환 배포를 접수 중지 상태에서 함께 검증해야 함

## 목표

웹이나 앱을 닫은 사용자에게 완료·부분 완료·전체 실패를 이메일로 알리고, 인증이 만료돼도 같은 generation으로 돌아오게 한다. generation·channel idempotency, DB fencing, Resend 24시간 멱등 창 안의 재시도와 창 만료 전 `delivery_unknown` 격리로 중복을 막으며, 실제 정확히 1회 수신은 외부 E2E로 판정한다.

## 현재 기반

- `supabase/migrations/20260714121238_generation_completion_notifications.sql`
- `my-app/supabase/migrations/20260714121238_generation_completion_notifications.sql`
- `20260715134451_generation_notification_outbox.sql` 루트·앱 미러
- `20260715150000_generation_durable_acceptance.sql` 루트·앱 미러
- Workflow terminal 후 targeted outbox kick과 독립 5분 drain
- `my-app/app/api/generations/[id]/notify/route.ts`
- `my-app/app/api/generations/notifications/drain/route.ts`
- `my-app/lib/generation-notification-outbox.ts`
- generation ID 기반 Resend idempotency key
- `/generate/:id` CTA와 완료·부분 완료·실패 문구

이 페이즈 시작 branch에 위 기반 commit이 포함됐는지 ancestry로 확인한다.

## 포함 범위

- [x] terminal event와 notification outbox/claim을 분리해 메일 실패가 generation을 실패로 바꾸지 않게 함
- [x] DB 발급 lease token, `SKIP LOCKED`, stale writer no-op, terminal 흡수 상태
- [x] provider 호출 전 `to/from/subject/html/text/source/idempotencyKey` 불변 snapshot 저장
- [x] DB에서 필수 payload·수신자·멱등키·live lease와 `prepare → begin → finish` 전이 순서 검증
- [x] 네트워크·408·5xx·concurrent idempotency의 불확실성을 누적하고 23시간에 `delivery_unknown` 격리
- [x] targeted callback 실패와 무관한 5분 scheduled reconcile/drain
- [x] complete, partial, failed별 제목·본문·CTA
- [x] 한 generation·한 채널당 1회 idempotency
- [x] Resend 일시 실패 retry와 `sent/skipped/dead_letter/delivery_unknown` 상태
- [x] 이메일이 없는 계정의 `skipped`와 인앱 상태 fallback
- [x] 이메일 링크 `/generate/{id}` → 로그인 → 같은 generation ResumeTarget의 웹·앱 로컬 경로
- [x] foreground 복귀 시 즉시 status refresh
- [x] migration 미러 누락·App/Workflow callback secret fingerprint 불일치·sender 주소 오류를 배포 전 차단하는 로컬 preflight — 실제 운영 DB 적용 여부·Resend domain 인증·배포 Worker canary는 운영 게이트
- [x] 전용 callback/attempt/outbox/Resend ambiguity contract test 추가
- [x] iOS/Android generation app-link 선언과 환경 기반 AASA/Asset Links route
- [x] 이번 세션의 일회성 격리 PostgreSQL 18 fresh-apply·상태 전이 smoke — 재사용 fixture/log artifact는 저장하지 않음
- [x] 재사용 가능한 staging DB 동시성 smoke와 redacted JSON/Markdown artifact 추가 — 실제 staging 실행은 release-candidate environment 승인 대기
- [ ] 외부 Resend·브라우저 종료·앱 종료·재로그인 E2E 추가
- [ ] 운영 Apple Team ID·Android release cert SHA-256 설정과 실제 Universal/App Link 검증
- [x] `retry_wait` 지연, 만료 `sending` lease, `dead_letter`, `delivery_unknown` 집계와 관리자 표면·drain 구조화 metric/alert 추가
- [x] 운영자 판정·복구 runbook 추가 — `delivery_unknown`은 중복 위험 때문에 자동 재발송하지 않음

## 제외 범위

- OS Native push
- 앱 badge와 알림 inbox
- result 화면의 원본 비교 재디자인
- 이메일 발송을 generation 성공의 필수 조건으로 취급

## 완료 판정 분리

### 로컬 구현 완료

- [x] generation terminal 상태와 이메일 outbox 분리
- [x] generation·event·channel 및 provider idempotency key unique 계약
- [x] DB lease fencing, 불변 payload, Resend ambiguity 격리
- [x] complete/partial/failed 이메일 payload와 `/generate/{id}` CTA
- [x] 웹 Clerk와 Expo auth resume의 generation ID 보존
- [x] 실제 provider 호출과 무관한 contract·일회성 PostgreSQL smoke
- [x] 관리자 aggregate 상태·큐 지연·구조화 경보와 `delivery_unknown` 무재발송 운영 runbook
- [x] callback secret을 출력하지 않는 domain-separated fingerprint와 배포 전 migration 미러·App HEAD·sender 설정 preflight

### 운영·실기기 검증 대기

- [ ] 배포 환경 migration/RPC/RLS/secret/sender/domain probe
- [ ] 실제 Resend 수신함에서 complete/partial/failed 각 1회 확인
- [ ] 브라우저 종료와 iOS/Android 강제 종료 후 수신 확인
- [ ] 이메일 tap 시 웹 세션 만료와 앱 cold start 각각 같은 generation 복귀
- [ ] 외부 로그 수집·호출 채널에서 `retry_wait`, 만료 lease, `dead_letter`, `delivery_unknown` 경보 E2E — 로컬 metric·관리자 UI·구조화 로그·runbook은 완료
- [x] 메일 rendered payload의 보존기간·redaction·삭제 정책

## 운영 순서

실제 deploy 권한이 별도로 주어졌을 때만 다음 순서로 진행한다.

1. 신규 generation 접수를 일시 중지하고 legacy `sending`, preparation, variant active lease를 drain한다.
2. `20260714121238_generation_completion_notifications.sql` 적용 여부와 legacy claim RPC를 확인한다.
3. `20260715103000_generation_variant_attempt_leases.sql`을 적용하고 variant claim·finish 권한을 probe한다.
4. `20260715134451_generation_notification_outbox.sql`을 적용하고 legacy claim fence·`sent/skipped` 흡수를 probe한다.
5. `20260715150000_generation_durable_acceptance.sql`을 적용하고 draft/accept/preparation/Workflow outbox RPC·RLS를 probe한다.
6. 접수를 계속 중지한 상태에서 동일한 callback secret과 app base URL을 가진 App과 Workflow Worker를 coordinated deploy한다. 한쪽만 새 계약인 시간에는 트래픽을 재개하지 않는다.
7. 1분 Workflow dispatcher와 5분 notification drain을 수동 probe하고 첫 reconcile이 legacy `sent/skipped`를 재발송하지 않는지 확인한다.
8. `retry_wait` 지연과 `dead_letter`·`delivery_unknown` 경보, 운영자 runbook, Resend sender/domain을 확인한다.
9. canary generation으로 브라우저 종료, 앱 강제 종료, 로그인 만료 재진입, 실제 메일 1회를 확인한 뒤 접수를 재개한다.

## 수용 기준

- 웹 종료와 앱 강제 종료 후 terminal 메일이 작업당 정확히 1회 도착한다.
- complete, partial, failed의 제목과 CTA가 실제 상태와 일치한다.
- 동시·반복 notify callback이 중복 메일을 만들지 않는다.
- Resend 실패 후 retry가 generation 상태를 실패로 바꾸지 않는다.
- 이메일 링크가 인증 후 같은 generation ID를 연다.
- 이메일이 없거나 opt-out이면 명시적 `skipped`와 앱 내 재조회 경로가 있다.
- `dead_letter`와 `delivery_unknown`이 조용히 누락되지 않고 운영자에게 노출되며, `delivery_unknown`은 수동 판정 전 재발송하지 않는다.

## 검증

기존 기본 검사:

```powershell
npm run lint
npm run typecheck
npm run build
```

신규 필수 게이트:

```text
npm run generation-workflow:contract:test
npx wrangler deploy --dry-run --config workers/generation-workflow/wrangler.jsonc
generation:notification:preflight             # 로컬 migration 미러·App/Workflow 계약 검사
generation:notification:preflight -- --mode=deploy  # 환경 설정 검사와 인증된 read-only App HEAD probe
generation:notification:staging-db-smoke -- --databaseUrl=<staging-url> --environment=staging --expectedHost=<staging-host> --confirmStagingWrite=I_UNDERSTAND_THIS_WRITES_EPHEMERAL_FIXTURES
generation:notification:e2e               # 추가 필요
generation:notification:ops-check         # metric·관리자 표면·구조화 alert·runbook 정적 게이트
```

E2E는 성공, 부분 성공, 전체 실패, callback 중복, Resend 일시 실패, 이메일 없음, 로그인 만료, 원본 정리 후 재진입을 포함한다.

## 2026-07-15 진행 증거

- middleware는 정확한 다섯 callback route shape와 강한 shared secret이 모두 맞을 때만 Clerk 인증을 우회하며 각 route도 독립 재검증
- placeholder·32바이트 미만·저엔트로피 secret은 앱과 Workflow 양쪽에서 거절
- production CTA origin은 HTTPS만 허용하고 잘못된 URL은 `https://hairfit.beauty`로 안전하게 복구
- 전용 outbox는 generation·event·channel과 idempotency key를 각각 unique로 고정하고 DB 발급 lease token으로 모든 전이를 fence
- provider 호출 전 최종 메일 payload를 한 번만 저장하며 이후 retry는 같은 payload와 `generation-completed/{generationId}`를 사용
- SDK가 반환하는 transport ambiguity를 분류하고, 확인 불가능한 발송은 Resend 24시간 창이 끝나기 전 23시간에 `delivery_unknown`으로 격리
- Workflow의 notification kick 실패는 `deferred`로 끝나며 생성 Workflow를 실패시키지 않고 5분 cron이 terminal generation을 재조정
- migration은 구형 claim을 outbox 존재로 차단하고 legacy `sent/skipped`를 claim 전 흡수해 rolling cutover 이중 소비를 방지
- Phase 07 통합 회귀: 모든 후보 완료 원본은 즉시 정리하고 partial/failed 원본은 접수 후 최대 24시간 무료 재시도를 위해 보존한다. 보존기한 만료·재시도 포기·draft 만료는 DB outbox와 원자 전이하며 Storage 삭제 consumer는 lease token으로 fencing한다.
- Phase 07 통합 회귀: terminal `/start`는 전체 Workflow를 재시작하지 않으며 알림 상태는 outbox SSoT와 legacy fallback을 함께 노출
- 자동 증거: callback/secret/site URL/attempt lease/outbox/Resend ambiguity/durable acceptance/app-link/배포 preflight 계약 58/58, 전 workspace typecheck exit 0, 대상 lint 오류 0, Worker dry-run, 이전 Next 89/89 routes build·Expo 3-platform bundle 통과
- 비로그인 HTTP 증거: `/generate`와 `/generate/{uuid}`가 generation 경로를 보존해 login 307 → 200으로 연결되고 보호 API는 401, 5xx는 없었다. 인증 상태·403·접수 후 UI는 아직 미검증이다.
- DB 증거: 이번 세션의 임시 PostgreSQL 18에 migration을 fresh apply하고 중복 enqueue, active lease, stale token, payload·전이 불변식, uncertainty 보존, full-failure empty variants, 101회 legacy attempt clamp, poison-row 비차단, legacy sent 흡수, sent/skipped mirror, 권한을 smoke했다. 재사용 fixture와 결과 artifact는 아직 저장하지 않았다.
- 운영 미확보: 배포 환경 migration·secret 일치, sender/domain, 실제 Resend 1회 수신, 앱 종료·브라우저 종료, 로그인 만료 후 같은 generation 복귀, retention cron 실제 실행, 외부 로그 수집·호출 채널
- 2026-07-18 운영 관측 보강: `generation_notification_outbox` 상태별 건수, 처리 가능한 `retry_wait`, 만료 `sending` lease, 가장 오래된 큐 체류를 관리자 `/admin/stats`에 aggregate로 노출했다. 5분 drain은 동일 snapshot을 `generation_notification_operation_alert` 구조화 로그로 남기며 `delivery_unknown`, `dead_letter`, 만료 lease는 critical, 큐·재시도 지연은 warning으로 판정한다.
- 운영 runbook: `docs/generation-notification-operations-runbook.md`에 `delivery_unknown` 자동 재발송 금지, 상태별 판정·redaction·복구 기록·경보 종료 조건을 고정했다. `generation:notification:ops-check`와 generation Workflow 계약 54/54, my-app typecheck·대상 lint가 통과했다. 외부 로그 수집·호출 채널 연결과 실제 Resend 수신은 여전히 운영 증거가 필요하다.
- 배포 사전검사: retention을 포함한 루트·앱의 필수 generation migration 6개 미러, App/Workflow callback fingerprint fail-closed 계약, 정확한 `HairFit <noreply@hairfit.beauty>` sender, 공개 HTTPS App URL, Resend key 형식을 검사한다. deploy mode는 인증된 read-only `HEAD /api/generations/notifications/drain`으로 배포 App의 secret 계약을 확인한다. 로컬 preflight·합성 환경 회귀·Worker dry-run은 통과했으며 실제 운영 DB 적용 여부, Resend domain 인증, 배포 Worker canary는 권한 있는 배포 창에서 확인해야 한다.
- 재진입 로컬 기반: shared generation ResumeTarget, 웹 open-redirect 방어, Expo SecureStore pending target, iOS/Android generation link 선언, fail-closed `/.well-known` route 구현. 운영 Team ID·release cert와 실기기 검증은 미확보
- 2026-07-18 개인정보 최소화: `20260718051646_notification_outbox_retention.sql`이 generation·Styler 메일 outbox를 함께 다룬다. 처리 중 payload는 그대로 보존하고 `sent/skipped`는 30일, `dead_letter/delivery_unknown`은 운영 판정을 위해 90일 뒤 수신자·렌더링 본문·event payload·오류 전문을 제거한다. 비식별 상태·멱등성 메타데이터는 365일 뒤 삭제하며, batch/`skip locked`, 부분 인덱스, service-role 전용 public wrapper와 private `security definer`, 조건부 일일 pg_cron을 적용했다. 웹·Expo 개인정보처리방침은 shared 문구를 사용한다. 로컬 계약과 SQL smoke fixture를 추가했으며 원격 적용·cron 실행은 배포 게이트로 남긴다.
- 2026-07-18 동시성 smoke 재사용화: `smoke-generation-notification-staging-db.mjs`가 staging host 일치·명시적 write 확인·SSL 비활성 거부를 먼저 검사하고, 임시 user/generation만 생성해 8개 세션의 concurrent enqueue·claim·finish와 stale lease no-op을 검증한 뒤 cascade cleanup한다. 로컬 PostgreSQL 18.4에서 한 outbox·한 claim·한 sent 전이, immutable payload, generation mirror, fixture 잔여 0을 확인했고 비밀값 없는 JSON/Markdown artifact를 생성했다. generation Workflow 계약은 61/61 통과했다. 승인형 GitHub gate는 `STAGING_DATABASE_URL`과 `STAGING_DATABASE_EXPECTED_HOST`가 있을 때만 같은 실행기를 staging에 쓰고 artifact를 30일 보존하며, 실제 staging run URL은 아직 없다.

## 롤백·인계

- 앱 notify 호출을 중단해도 terminal generation과 기존 결과 조회는 유지돼야 한다.
- outbox migration 이후 구형 claim은 이중 소비 방지를 위해 차단된다. 앱 전체를 구버전으로 단순 rollback하면 메일 소비가 멈추므로 새 drain route/Worker는 유지하고 앱 UI만 되돌리거나 별도 consumer-cutover migration을 먼저 적용한다.
- table·terminal 상태를 삭제하는 down migration보다 forward-compatible 상태와 roll-forward를 우선한다.
- retention migration은 additive이며 원격 적용 전 건수와 예상 redaction 대상을 read-only로 확인한다. rollback은 cron을 해제하고 함수를 중단하되 이미 비식별화·삭제된 payload를 복원한다고 주장하지 않는다.
- Phase 09B와 10A에 terminal event, channel status, canonical URL을 넘긴다.

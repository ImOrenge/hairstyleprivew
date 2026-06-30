# PortOne Billing Migration Status

작성일: 2026-06-30

이 문서는 PortOne 빌링 연동을 위해 현재 연결된 Supabase DB의 migration 적용 상태를 기록한다.

## 대상

- Supabase project ref: `dpzdhxlqnogfpubpslbf`
- Supabase CLI: `2.65.5`
- Supabase workdir: `my-app`

## 적용 결과

`2026-06-30` 기준으로 PortOne billing migration 5개가 remote history에 모두 적용되었다.

1. `202606290001_update_billing_plan_pricing.sql`
2. `202606290002_payment_transaction_portone_tracking.sql`
3. `202606290003_encrypt_portone_billing_keys.sql`
4. `202606290004_payment_credit_clawback.sql`
5. `202606290005_subscription_renewal_retry_tracking.sql`

적용 명령:

```powershell
npm run portone:migration:apply
$env:PORTONE_MIGRATION_ALLOW_REMOTE_WRITE="1"
$env:PORTONE_MIGRATION_CONFIRM_PROJECT_REF="dpzdhxlqnogfpubpslbf"
npm run portone:migration:apply -- --write
```

첫 적용 중 `202606290005`에서 `get_subscriptions_due_for_renewal(timestamptz)` 반환 컬럼 추가로 Postgres `cannot change return type of existing function` 오류가 발생했다. `202606290005_subscription_renewal_retry_tracking.sql`에서 기존 함수를 먼저 `drop function if exists` 하도록 보정한 뒤, 남은 `202606290005`만 재적용해 성공했다.

## Supabase CLI migration history

명령:

```powershell
supabase migration list --workdir my-app
```

결과:

- remote history가 `202606290001`부터 `202606290005`까지 모두 포함한다.
- `npm run portone:migration:apply` dry-run은 `Remote database is up to date`와 `no pending PortOne migrations`를 반환한다.

## 읽기 전용 schema/RPC 체크

명령:

```powershell
npm run portone:migration:check
```

결과:

- `payment_transactions` PortOne 추적 컬럼 확인 완료
- `user_subscriptions` 빌링키 암호문/해시 컬럼 확인 완료
- `payment_credit_clawbacks` 테이블/핵심 컬럼 확인 완료
- `user_subscriptions` 갱신 retry 컬럼 확인 완료
- `get_subscriptions_due_for_renewal`, `apply_payment_credits`, `grant_subscription_credits`, `advance_subscription_period`, `claw_back_payment_credits` RPC probe 통과

## DB smoke

읽기 전용 schema/RPC smoke:

```powershell
$env:PORTONE_DB_SMOKE_CONFIRM_TEST_DB="1"
npm run portone:db:smoke
```

결과:

- `schema/rpc probe passed dueRows=0`

write smoke:

```powershell
$env:PORTONE_DB_SMOKE_CONFIRM_TEST_DB="1"
$env:PORTONE_DB_SMOKE_ALLOW_WRITE="1"
$env:BILLING_KEY_ENCRYPTION_SECRET="portone-db-smoke-local-secret-only"
npm run portone:db:smoke -- --write
```

결과:

- disposable user/subscription/payment row 생성 후 cleanup 경로 통과
- Basic 갱신 금액 `9,900`원과 `80`크레딧 반환 확인
- `grant_subscription_credits`, `apply_payment_credits`, `advance_subscription_period`, `claw_back_payment_credits` idempotency 확인

## Webhook DB smoke

로컬 Next 서버를 일반 `.env.local` 로딩으로 실행한 뒤, signed webhook이 실제 route와 테스트 DB 상태 전이를 통과하는지 확인했다.

```powershell
npm run dev -- --port 3010
$env:PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB="1"
npm run portone:webhook:test -- --url=http://localhost:3010/api/payments/webhook --type Transaction.Ready --paymentId smoke-ready-local-route-normal-env-001 --expectStatus 202 --expectBodyIncludes "payment transaction not found"
npm run portone:webhook:db:smoke -- --url=http://localhost:3010/api/payments/webhook
npm run portone:webhook:db:smoke -- --scenario=pending-payment-events --url=http://localhost:3010/api/payments/webhook
npm run portone:webhook:db:smoke -- --scenario=cancelled-paid-payment --url=http://localhost:3010/api/payments/webhook
npm run portone:webhook:db:smoke -- --scenario=partial-cancelled-paid-payment --url=http://localhost:3010/api/payments/webhook
npm run portone:webhook:db:smoke -- --scenario=renewal-failed-payment --url=http://localhost:3010/api/payments/webhook
npm run portone:webhook:db:smoke -- --scenario=renewal-cancelled-paid-payment --url=http://localhost:3010/api/payments/webhook
npm run portone:webhook:db:smoke -- --scenario=billing-key-deleted --url=http://localhost:3010/api/payments/webhook
npm run portone:webhook:db:smoke -- --scenario=billing-key-deleted-legacy --url=http://localhost:3010/api/payments/webhook
```

결과:

- 랜덤 `Transaction.Ready`는 `payment transaction not found` 202 no-op으로 처리되어 migration 적용 후 route/Supabase 조회 경로가 정상임을 확인했다.
- `failed-first-payment`: transaction `failed`, 준비 구독 `canceled`, 빌링키 필드 제거 확인
- `pending-payment-events`: `Transaction.PayPending`, `Transaction.Ready`, `Transaction.VirtualAccountIssued`, `Transaction.CancelPending`이 확정 상태를 만들지 않고 transaction `pending`, 구독 `active`, 저장 빌링키 유지 확인
- `cancelled-paid-payment`: paid 결제 전액 취소/재전송에서 transaction `refunded`, 구독 `canceled`, `payment_credit_clawbacks` 1건, +원장 1건/-원장 1건, 사용자 크레딧 0 확인
- `partial-cancelled-paid-payment`: 부분취소에서 transaction `refunded`, 부분취소 metadata 기록, 구독 `active`, 저장 빌링키 유지, `payment_credit_clawbacks` 0건, 사용자 크레딧 80 확인
- `renewal-failed-payment`: `cron-subscription-renewal` transaction 실패/재전송에서 transaction `failed`, 구독 `past_due`, 저장 빌링키 유지, `renewal_failure_count=1` 유지 확인
- `renewal-cancelled-paid-payment`: paid 갱신 결제 취소/재전송에서 transaction `refunded`, 구독 `past_due`, 저장 빌링키 유지, 크레딧 회수 idempotency, `renewal_failure_count=1` 유지 확인
- `billing-key-deleted`: 해시 저장 구독에서 구독 `active` 유지, `cancel_at_period_end=true`, `canceled_at` 기록, 저장 빌링키 암호문/해시 제거 확인
- `billing-key-deleted-legacy`: 백필 전 legacy `pg_billing_key` 원문 row fallback 매칭도 같은 기대 상태 확인

## Runtime env and backfill readiness

```powershell
npm run portone:env:check -- --mode=test-payment
npm run portone:env:check -- --mode=deploy-webhook
npm run portone:env:check -- --mode=renewal-cron
npm run portone:env:check -- --mode=deploy-webhook --webhookUrl=https://hairfit.example/api/payments/webhook
npm run portone:env:check -- --mode=deploy-webhook --webhookUrl=https://hairfit.beauty/api/payments/webhook
npm run portone:preflight -- --profile=deploy --webhookUrl=https://hairfit.beauty/api/payments/webhook
npm run portone:cloudflare:secrets
npm run portone:billing-key:backfill -- --limit=100
npm run portone:renewal:function:smoke
npm run portone:launch:check -- --renewalFunctionUrl=https://dpzdhxlqnogfpubpslbf.functions.supabase.co/cron-subscription-renewal --allowMissingExternal
npm run portone:launch:check -- --fullLocal --allowMissingExternal
```

결과:

- 테스트 결제에 필요한 PortOne 공개 설정, API secret, webhook secret, billing-key encryption secret, Supabase URL/service role key가 secret 값 출력 없이 확인되었다.
- `--webhookUrl` 없이 실행한 deploy-webhook 검사는 현재 로컬 환경에 `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_APP_URL`/`APP_URL`/`SITE_URL` 공개 URL이 없어 public app URL과 PortOne webhook URL 2개 항목에서 실패한다.
- 갱신 cron env check는 Supabase URL/service role key, PortOne store/API secret, 선택적 channel key, billing-key encryption secret을 secret 값 출력 없이 확인한다.
- 배포 웹훅 preflight는 명시한 공개 HTTPS webhook URL 기준으로 URL 형식과 필수 secret/env 구성을 확인했다. 위 `hairfit.example` 값은 형식 검증용 placeholder이며 실제 배포 route probe 증거는 아니다.
- `https://hairfit.beauty/`는 Cloudflare/OpenNext 앱으로 HTTP 200 응답을 반환한다.
- `https://hairfit.beauty/api/payments/webhook` route probe는 route까지 도달했지만 HTTP 403과 `{"error":"Missing PORTONE_V2_WEBHOOK_SECRET"}`를 반환했다. 즉 현재 공개 앱 배포 환경에는 PortOne webhook secret이 없거나 런타임에서 읽히지 않는다.
- `npm run portone:cloudflare:secrets` dry-run은 로컬 `.env`에서 Cloudflare Worker `hairstyleprivew`에 동기화할 PortOne/Supabase secret 이름 준비 여부를 secret 값 출력 없이 확인한다. 실제 write는 `CLOUDFLARE_API_TOKEN`과 `PORTONE_CLOUDFLARE_SECRET_SYNC_CONFIRM=hairstyleprivew`가 있어야 한다.
- `npm run portone:cloudflare:secrets -- --write --verifyAfterWrite --only=PORTONE_V2_WEBHOOK_SECRET`는 write 성공 직후 배포 Worker의 secret 이름 목록을 다시 조회하는 guarded sync 경로다. 현재 세션에는 `CLOUDFLARE_API_TOKEN`이 없어 실제 write/verify는 아직 실행할 수 없다.
- `npm run portone:webhook:unblock -- --webhookUrl=https://hairfit.beauty/api/payments/webhook`는 현재 배포 webhook blocker를 좁게 해소하기 위한 dry-run wrapper다. 로컬 `PORTONE_V2_WEBHOOK_SECRET` 준비 여부를 확인하고, 실제 write/verify/preflight 순서를 출력한다.
- `npm run portone:webhook:unblock -- --write --webhookUrl=https://hairfit.beauty/api/payments/webhook`는 현재 세션에서 로컬 webhook secret dry-run을 통과한 뒤 `CLOUDFLARE_API_TOKEN` 부재로 중단되었다. Cloudflare에는 아무 값도 쓰지 않았고 deploy preflight도 실행하지 않았다.
- `npm run portone:cloudflare:secrets -- --write --only=PORTONE_V2_WEBHOOK_SECRET`는 현재 세션에서 `CLOUDFLARE_API_TOKEN` 부재로 중단되었다. secret 이름 준비 상태만 `[ok]`로 확인됐고, Cloudflare에는 아무 값도 쓰지 않았다.
- `npm run portone:cloudflare:secrets -- --verify --only=PORTONE_V2_WEBHOOK_SECRET`는 Cloudflare에 저장된 secret 이름만 확인하는 후속 검증 경로다. 현재 세션에서는 `CLOUDFLARE_API_TOKEN` 부재로 중단되어 실제 조회는 아직 실행할 수 없다.
- `npm run portone:launch:check -- --verifyCloudflareSecrets --webhookUrl=https://hairfit.beauty/api/payments/webhook --allowMissingExternal`는 로컬 preflight, test-payment env, renewal-cron env, billing-key backfill dry-run을 통과했다. 현재 세션에는 `CLOUDFLARE_API_TOKEN`이 없어 Cloudflare secret 이름 검증은 누락 증거로 남고, deploy route probe까지 계속 진행된다. 최신 실행은 배포 route probe에서 HTTP 403 `Missing PORTONE_V2_WEBHOOK_SECRET`로 실패했지만 `--allowMissingExternal`가 외부 blocker로 모아 보고하고 exit 0으로 종료했다. 최신 probe paymentId는 `deploy_webhook_probe_f8p0d8um`다.
- `npm run portone:cloudflare:secrets -- --only=PORTONE_V2_WEBHOOK_SECRETT`는 unsupported secret name 오류로 실패해 `--only` 오타가 write 전에 차단되는 것을 확인했다.
- `npm run portone:preflight -- --profile=deploy --webhookUrl=https://hairfit.beauty/api/payments/webhook`를 재실행했지만 배포 route probe는 여전히 HTTP 403 `Missing PORTONE_V2_WEBHOOK_SECRET`로 실패한다. 로컬 env 기준 deploy-webhook/renewal-cron 필수 값 점검은 통과했다. 최신 probe paymentId는 `deploy_webhook_probe_ba4otcvc`다.
- `npm run portone:launch:check`는 `PORTONE_WEBHOOK_URL`, `PORTONE_RENEWAL_FUNCTION_URL`, `PORTONE_TEST_PAYMENT_ID`, `PORTONE_TEST_PLAN`, `PORTONE_TEST_SOURCE` 환경 변수 fallback을 지원한다. 명령 인자가 있으면 인자가 우선한다.
- `PORTONE_WEBHOOK_URL=https://hairfit.beauty/api/payments/webhook npm run portone:launch:check -- --allowMissingExternal`는 환경 변수 fallback으로 deploy preflight까지 진입했고, 배포 route probe에서 HTTP 403 `Missing PORTONE_V2_WEBHOOK_SECRET`로 실패했다. 최신 fallback probe paymentId는 `deploy_webhook_probe_ae1ogv1x`다.
- linked DB의 legacy plaintext billing key 백필 후보는 dry-run 기준 `0`건이다.
- root `portone:billing-key:backfill` proxy는 `--limit=100`을 하위 `my-app` backfill 스크립트까지 전달한다.
- `portone:renewal:function:smoke`는 `https://dpzdhxlqnogfpubpslbf.functions.supabase.co/cron-subscription-renewal`을 파생해 호출했고, due row `0`건에서 HTTP 200, `renewed=0`, `failed=0`, `message="no subscriptions due"`를 확인했다. 이 검증은 함수 배포/인증/RPC 접근 no-due probe이며 실제 갱신 결제 증거는 아니다.
- launch readiness check는 로컬 preflight, full-local preflight(typecheck, Deno check, production build 포함), test-payment env, renewal-cron env, billing-key backfill dry-run, renewal Edge Function no-due probe를 통과했다. `npm run portone:launch:check -- --allowMissingExternal`도 로컬 preflight, test-payment env, renewal-cron env, billing-key backfill dry-run을 통과하고 외부 증거 누락만 보고했다. 실제 공개 앱 URL은 `https://hairfit.beauty`로 확인됐지만 webhook route probe는 배포 `PORTONE_V2_WEBHOOK_SECRET` 누락으로 막혀 있고, 실제 PortOne 테스트 결제 `paymentId`도 아직 필요하다. `--verifyCloudflareSecrets`를 붙이면 Cloudflare secret 이름 확인 후 deploy route probe로 이어진다.
- 2026-06-30 재검증에서 현재 셸 환경의 `CLOUDFLARE_API_TOKEN`, `PORTONE_CLOUDFLARE_SECRET_SYNC_CONFIRM`, `PORTONE_WEBHOOK_URL`, `PORTONE_TEST_PAYMENT_ID`, `PORTONE_RENEWAL_FUNCTION_URL`는 모두 미설정이다. 로컬 `.env` 기준 `PORTONE_V2_WEBHOOK_SECRET` dry-run 준비는 통과했지만 Cloudflare write/verify는 실행할 수 없다.
- 같은 재검증에서 `npm run portone:preflight -- --profile=deploy --webhookUrl=https://hairfit.beauty/api/payments/webhook`는 deploy env와 renewal-cron env check를 통과한 뒤 배포 route probe에서 HTTP 403 `Missing PORTONE_V2_WEBHOOK_SECRET`로 실패했다. 최신 직접 preflight probe paymentId는 `deploy_webhook_probe_e3x2579s`다.
- `npm run portone:launch:check -- --verifyCloudflareSecrets --webhookUrl=https://hairfit.beauty/api/payments/webhook --renewalFunctionUrl=https://dpzdhxlqnogfpubpslbf.functions.supabase.co/cron-subscription-renewal --allowMissingExternal`는 로컬 preflight, test-payment env, renewal-cron env, billing-key backfill dry-run, renewal Edge Function no-due live smoke를 통과했다. 남은 누락 증거는 Cloudflare secret 이름 verify용 API token, 실제 PortOne 테스트 결제 `paymentId`, 배포 webhook route 202 no-op 통과다. 최신 launch deploy probe paymentId는 `deploy_webhook_probe_7k04q8lw`다.
- `scripts/check-portone-launch-readiness.mjs`는 이제 `.env.local`/`.env`를 로딩하고, `--renewalFunctionUrl`이 없어도 `portone:renewal:function:smoke`가 `NEXT_PUBLIC_SUPABASE_URL`에서 `https://dpzdhxlqnogfpubpslbf.functions.supabase.co/cron-subscription-renewal`을 파생해 no-due live smoke를 수행한다.
- 최신 직접 deploy preflight는 `deploy_webhook_probe_e504ltgb`로 HTTP 403 `Invalid PortOne webhook signature: No matching signature found`를 반환했다. 이는 배포 route가 더 이상 `PORTONE_V2_WEBHOOK_SECRET` 누락 상태로 보이지 않지만, 로컬 smoke가 사용하는 secret과 Cloudflare Worker `hairstyleprivew`에 등록된 webhook secret이 일치하지 않는다는 뜻이다.
- 최신 launch readiness는 `--renewalFunctionUrl` 없이 실행해도 renewal Edge Function no-due live smoke를 통과했다. Cloudflare secret 이름 verify는 현재 로딩된 Cloudflare 인증 정보로 Wrangler가 authentication error를 반환해 실패했고, deploy route probe는 `deploy_webhook_probe_rg5wy5vg`로 HTTP 403 `Invalid PortOne webhook signature: No matching signature found`를 반환했다. 남은 누락 증거는 유효한 Cloudflare API token/권한으로 secret 이름 verify, Cloudflare Worker webhook secret 값 동기화, 실제 PortOne 테스트 결제 `paymentId`다.

## 남은 외부 검증

- 실제 PortOne 테스트 결제로 `Transaction.Paid` 단건 조회 응답 shape 확인
- Cloudflare Worker `hairstyleprivew`의 `PORTONE_V2_WEBHOOK_SECRET`를 로컬 smoke/PortOne 콘솔 webhook secret과 같은 값으로 맞춘다. guarded sync 경로는 `PORTONE_CLOUDFLARE_SECRET_SYNC_CONFIRM=hairstyleprivew npm run portone:cloudflare:secrets -- --write --verifyAfterWrite --only=PORTONE_V2_WEBHOOK_SECRET`이며, 설정 후 `npm run portone:preflight -- --profile=deploy --webhookUrl=https://hairfit.beauty/api/payments/webhook` route probe가 202 `payment transaction not found`로 통과하는지 확인
- 배포 환경에는 `NEXT_PUBLIC_SITE_URL` 또는 `NEXT_PUBLIC_APP_URL`을 실제 공개 HTTPS 앱 URL로 설정해 `--webhookUrl` 없이도 deploy-webhook env check가 통과하는지 확인
- PortOne 콘솔에 배포 URL을 등록한 뒤 `Transaction.Paid`, 실패/취소/대기 이벤트, `BillingKey.Deleted` 재전송 smoke 확인
- 실제 테스트 결제 `paymentId`로 `npm run portone:e2e:inspect -- --paymentId=<payment-id> --plan=basic --source=web` 실행
- 실제 launch 판정은 `npm run portone:launch:check -- --fullLocal --verifyCloudflareSecrets --webhookUrl=<deployed-webhook-url> --renewalFunctionUrl=<function-url> --paymentId=<payment-id> --plan=basic --source=web` 통과 필요
- 테스트 갱신 Edge Function에서 `--allowDueRows`를 명시한 만료 직전 구독 1건이 결제, 기간 연장, 크레딧 지급까지 완료되는지 확인
- 로그인 세션이 있는 브라우저에서 `/billing`, `/mypage?tab=plan` 활성구독/pending/failed 상태 표시 확인
- 운영 DB 적용 시에는 적용 전 백업/rollback 계획과 현재 구독 고객 영향 범위를 별도로 확인한다. `202606290001`은 기존 `basic`, `standard`, `pro` 구독의 `credits_per_cycle` 값을 새 정책으로 갱신한다.

`portone:migration:apply`는 기본적으로 `supabase db push --dry-run --workdir my-app`만 실행한다. `--write`를 붙여도 `PORTONE_MIGRATION_ALLOW_REMOTE_WRITE=1`과 `PORTONE_MIGRATION_CONFIRM_PROJECT_REF=dpzdhxlqnogfpubpslbf`가 없으면 원격 DB에 쓰지 않는다.

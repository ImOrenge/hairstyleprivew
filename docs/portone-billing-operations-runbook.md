# PortOne 빌링 운영 Runbook

작성일: 2026-06-30

이 문서는 HairFit 포트원 V2 빌링키 구독 결제의 테스트, 배포, 웹훅 장애 대응, 수동 보정 절차를 정리한다. 구현 계획은 `docs/portone-billing-integration-plan.md`를 기준으로 한다.

현재 연결된 Supabase migration 상태는 `docs/portone-billing-migration-status.md`에 별도로 기록한다.

## 1. 운영 전 체크

### 1.1 필수 환경 변수

테스트와 운영 환경은 값을 섞지 않는다.

| 구분 | 변수 |
| --- | --- |
| PortOne 공개 설정 | `NEXT_PUBLIC_PORTONE_V2_STORE_ID`, `NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY` |
| PortOne 서버 설정 | `PORTONE_V2_STORE_ID`, `PORTONE_V2_CHANNEL_KEY`, `PORTONE_V2_API_SECRET`, `PORTONE_V2_WEBHOOK_SECRET` |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| 빌링키 암호화 | `BILLING_KEY_ENCRYPTION_SECRET` |
| 내부 호출 | `INTERNAL_API_SECRET` |
| 테스트 DB smoke 보호 | `PORTONE_DB_SMOKE_CONFIRM_TEST_DB`, `PORTONE_DB_SMOKE_ALLOW_WRITE` |

`BILLING_KEY_ENCRYPTION_SECRET`은 테스트/운영을 분리한다. 운영에서 값을 교체할 때는 기존 `pg_billing_key_encrypted` row를 새 키로 재암호화한 뒤 교체한다.

새 secret은 로컬에서 생성하되, 운영 값은 배포 플랫폼의 secret manager에만 저장한다. 검증 명령은 secret 값을 출력하지 않고 누락/약한 길이만 판정한다.

```powershell
npm run portone:billing-secret:generate
npm run portone:billing-secret:generate -- --check
```

로컬 `.env.local`에 `PORTONE_V2_WEBHOOK_SECRET`을 직접 둘 때 값에 `#`, 공백, 따옴표처럼 dotenv 파서가 해석할 수 있는 문자가 있으면 전체 값을 따옴표로 감싼다. 예: `PORTONE_V2_WEBHOOK_SECRET="<PortOne webhook secret>"`. 따옴표를 생략하면 Next.js가 `#` 뒤를 주석으로 처리해 웹훅 서명 검증이 실패할 수 있다.

### 1.2 로컬 검증

릴리즈 후보마다 아래 명령을 통과시킨다.

```powershell
npm run portone:preflight
npm run portone:preflight -- --profile=full-local
npm run portone:launch:check -- --allowMissingExternal
npm run portone:env:check -- --mode=test-payment
npm --prefix my-app run portone:contract:test
npm --prefix my-app run portone:confirmation:test
npm --prefix my-app run portone:audit
npm run portone:ui:smoke -- --baseUrl=http://localhost:3010
npm run portone:mobile:smoke
npm --prefix my-app run portone:webhook:signature:test
npm --prefix my-app run portone:migration:check
npm --prefix my-app run portone:db:smoke
npm run typecheck
deno check --no-lock my-app\supabase\functions\cron-subscription-renewal\index.ts
npm run lint
npm --prefix my-app run build
npm --prefix my-app run cf:build
```

`portone:preflight`의 기본 `local` profile은 외부 결제와 DB write 없이 script syntax, 정적 audit, PortOne 요청/응답 contract, confirmation 규칙, 웹훅 signature, 모바일 결제 계약을 한 번에 검증한다. `full-local` profile은 여기에 lint, typecheck, `cron-subscription-renewal` Deno typecheck, production build를 추가한다.

`portone:env:check`는 secret 값을 출력하지 않고 테스트 결제, 배포 웹훅, 로컬 웹훅, 갱신 cron, 빌링키 백필에 필요한 환경 변수 이름만 확인한다. 현재 단계에 맞춰 `--mode=local-webhook`, `--mode=test-payment`, `--mode=deploy-webhook`, `--mode=renewal-cron`, `--mode=backfill` 중 하나를 사용한다.

배포된 웹훅 URL을 PortOne 콘솔에 등록하기 전에는 공개 앱 URL과 웹훅 endpoint도 확인한다. `NEXT_PUBLIC_SITE_URL` 또는 `NEXT_PUBLIC_APP_URL`이 공개 HTTPS URL이어야 하고, webhook URL은 `/api/payments/webhook`로 끝나야 한다.

```powershell
npm run portone:env:check -- --mode=deploy-webhook
npm run portone:env:check -- --mode=renewal-cron
npm run portone:env:check -- --mode=deploy-webhook --webhookUrl=https://<your-domain>/api/payments/webhook
npm run portone:renewal:function:smoke -- --functionUrl=https://<project>.functions.supabase.co/cron-subscription-renewal
npm run portone:preflight -- --profile=deploy --webhookUrl=https://<your-domain>/api/payments/webhook
npm run portone:webhook:test -- --deployProbe --url=https://<your-domain>/api/payments/webhook
```

`--profile=deploy`는 배포 웹훅 env, 갱신 cron env, signed route probe를 함께 실행한다. `--deployProbe`는 공개 HTTPS `/api/payments/webhook` URL만 허용하고, signed `Transaction.Ready`와 랜덤 `paymentId`를 전송한다. 정상 migration이 적용된 배포 환경이면 `payment transaction not found`를 포함한 202 응답이 나와야 한다. 이 probe는 결제 확정이나 DB write를 만들지 않는다.

`portone:renewal:function:smoke`는 먼저 `get_subscriptions_due_for_renewal()` 결과를 확인한다. 기본값은 갱신 대상이 0건일 때만 배포된 `cron-subscription-renewal` Edge Function을 호출해 `renewed=0`, `failed=0` no-due 응답을 확인한다. 갱신 대상이 있으면 실제 빌링키 결제를 막기 위해 호출 전에 실패한다. 만료 직전 테스트 구독으로 실제 갱신 결제까지 검증할 때만 `--allowDueRows`를 붙인다.

릴리즈 직전에는 launch readiness 명령으로 로컬 준비도와 외부 증거 누락을 한 번에 확인한다. `--allowMissingExternal`은 배포 URL, Cloudflare secret verify, renewal Function URL, 실제 결제 `paymentId`, 배포 route probe 같은 외부 게이트의 누락/실패를 모아 보고만 하며, 실제 launch 판정에는 제거해야 한다.

```powershell
npm run portone:launch:check -- --allowMissingExternal
npm run portone:launch:check -- --fullLocal --verifyCloudflareSecrets --webhookUrl=https://<your-domain>/api/payments/webhook --renewalFunctionUrl=https://<project>.functions.supabase.co/cron-subscription-renewal --paymentId=<payment-id> --plan=basic --source=web
```

반복 실행할 때는 아래 환경 변수를 설정해 긴 인자를 줄일 수 있다. 명령 인자가 있으면 인자가 환경 변수보다 우선한다.

```powershell
$env:PORTONE_WEBHOOK_URL="https://<your-domain>/api/payments/webhook"
$env:PORTONE_RENEWAL_FUNCTION_URL="https://<project>.functions.supabase.co/cron-subscription-renewal"
$env:PORTONE_TEST_PAYMENT_ID="<payment-id>"
$env:PORTONE_TEST_PLAN="basic"
$env:PORTONE_TEST_SOURCE="web"
npm run portone:launch:check -- --fullLocal --verifyCloudflareSecrets
```

`--verifyCloudflareSecrets`는 `CLOUDFLARE_API_TOKEN`으로 Worker에 등록된 secret 이름을 먼저 확인한 뒤 deploy preflight를 실행한다. secret 값은 읽거나 출력하지 않는다.

`portone:migration:check`는 읽기 전용 schema/RPC probe다. row 데이터를 읽지 않고 `select <column> limit 0`와 실패가 기대되는 RPC probe만 수행한다. 이 명령이 실패하면 먼저 누락된 migration을 적용한다. 단, `get_subscriptions_due_for_renewal`의 새 가격/크레딧 반환값은 읽기 전용 체크만으로 확정하지 않고 `portone:db:smoke -- --write`에서 검증한다.

`portone:db:smoke`는 테스트 Supabase 프로젝트에서만 실행한다. 기본 schema/RPC probe도 아래 확인 변수가 없으면 DB에 접속하지 않는다.

```powershell
$env:PORTONE_DB_SMOKE_CONFIRM_TEST_DB="1"
npm --prefix my-app run portone:db:smoke
```

RPC idempotency까지 확인하려면 write smoke를 테스트 DB에서만 실행한다. 이 모드는 disposable user/payment/subscription row를 만들고 cleanup한다.

```powershell
$env:PORTONE_DB_SMOKE_CONFIRM_TEST_DB="1"
$env:PORTONE_DB_SMOKE_ALLOW_WRITE="1"
npm --prefix my-app run portone:db:smoke -- --write
```

웹훅 실패/대기/취소/빌링키 삭제 이벤트가 실제 DB 상태를 바꾸는지도 테스트 DB에서만 확인한다. 기본 smoke는 disposable web-subscribe pending transaction을 만들고 signed `Transaction.Failed` 웹훅을 지정 URL에 전송한 뒤 transaction `failed`, 준비 구독 `canceled`, 빌링키 필드 제거를 검증하고 cleanup한다.

```powershell
$env:PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB="1"
npm run portone:webhook:db:smoke -- --url=http://localhost:3010/api/payments/webhook
```

대기 계열 이벤트는 결제/취소 확정이 아니므로 별도 시나리오로 확인한다. 이 smoke는 pending transaction에 `Transaction.PayPending`, `Transaction.Ready`, `Transaction.VirtualAccountIssued`, `Transaction.CancelPending`을 순서대로 전송하고, transaction이 계속 `pending`, 구독이 `active`, 저장 빌링키가 유지되며 clawback row가 생기지 않는지 검증한다.

```powershell
$env:PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB="1"
npm run portone:webhook:db:smoke -- --scenario=pending-payment-events --url=http://localhost:3010/api/payments/webhook
```

이미 paid 처리된 결제의 전액 취소/재전송 idempotency는 별도 시나리오로 확인한다. 이 smoke는 paid transaction과 +80 credit ledger를 만든 뒤 `Transaction.Cancelled`를 두 번 전송하고, transaction `refunded`, 구독 `canceled`, 빌링키 제거, `payment_credit_clawbacks` 1건, +원장 1건/-원장 1건, 사용자 크레딧 0을 검증한다.

```powershell
$env:PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB="1"
npm run portone:webhook:db:smoke -- --scenario=cancelled-paid-payment --url=http://localhost:3010/api/payments/webhook
```

부분취소는 자동 크레딧 회수 정책이 없으므로 별도 시나리오로 확인한다. 이 smoke는 paid transaction과 +80 credit ledger를 만든 뒤 `Transaction.PartialCancelled`를 전송하고, transaction `refunded`, 부분취소 metadata, 구독 `active`, 저장 빌링키 유지, `payment_credit_clawbacks` 0건, 사용자 크레딧 80을 검증한다.

```powershell
$env:PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB="1"
npm run portone:webhook:db:smoke -- --scenario=partial-cancelled-paid-payment --url=http://localhost:3010/api/payments/webhook
```

갱신 결제 실패/취소도 별도 시나리오로 확인한다. 이 smoke는 `cron-subscription-renewal` metadata를 가진 transaction에 `Transaction.Failed` 또는 paid 상태의 `Transaction.Cancelled`를 두 번 전송하고, 구독이 `past_due`로 전환되며 저장 빌링키는 재시도를 위해 유지되고 `renewal_failure_count`가 재전송으로 중복 증가하지 않는지 검증한다. paid 갱신 취소는 크레딧 회수 idempotency도 함께 확인한다.

```powershell
$env:PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB="1"
npm run portone:webhook:db:smoke -- --scenario=renewal-failed-payment --url=http://localhost:3010/api/payments/webhook
npm run portone:webhook:db:smoke -- --scenario=renewal-cancelled-paid-payment --url=http://localhost:3010/api/payments/webhook
```

포트원 콘솔에서 빌링키가 삭제된 경우의 갱신 차단도 별도 시나리오로 확인한다. 이 smoke는 해시 저장된 active 구독을 만든 뒤 `BillingKey.Deleted`를 전송하고, 구독이 기간 종료 전까지 `active`를 유지하면서 `cancel_at_period_end=true`, `canceled_at` 기록, 저장 빌링키 암호문/해시 제거 상태가 되는지 검증한다. 백필 전 legacy plaintext row도 `billing-key-deleted-legacy`로 같은 기대 상태를 확인한다.

```powershell
$env:PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB="1"
$env:BILLING_KEY_ENCRYPTION_SECRET="<test-secret>"
npm run portone:webhook:db:smoke -- --scenario=billing-key-deleted --url=http://localhost:3010/api/payments/webhook
npm run portone:webhook:db:smoke -- --scenario=billing-key-deleted-legacy --url=http://localhost:3010/api/payments/webhook
```

`npm run mobile:sync`는 결제 변경 검증에 포함하되, 현재 기존 온보딩 포팅 누락이 있으면 해당 blocker를 결제 변경과 분리해 기록한다.

## 2. 배포 순서

1. `npm --prefix my-app run portone:migration:check`로 현재 DB의 누락 schema/RPC를 확인한다.
2. `supabase db push --dry-run --workdir my-app` 또는 `npm run portone:migration:apply`로 적용 예정 migration이 PortOne billing migration 목록의 전체 또는 미적용 suffix인지 확인한다.
3. `PORTONE_MIGRATION_ALLOW_REMOTE_WRITE=1`과 `PORTONE_MIGRATION_CONFIRM_PROJECT_REF=<project-ref>`를 설정한 뒤 `npm run portone:migration:apply -- --write`로 Supabase migration을 순서대로 적용한다.
4. `npm --prefix my-app run portone:migration:check`가 통과하는지 다시 확인한다.
5. 테스트 DB에서 `npm --prefix my-app run portone:db:smoke`와 `npm --prefix my-app run portone:db:smoke -- --write`를 실행해 `get_subscriptions_due_for_renewal`, `grant_subscription_credits`, `apply_payment_credits`, `advance_subscription_period`, `claw_back_payment_credits` 호출과 idempotency를 확인한다.
6. 앱 환경 변수와 Edge Function 환경 변수를 테스트 값으로 등록한다.
7. `npm run portone:env:check -- --mode=test-payment`로 테스트 결제 smoke에 필요한 PortOne/Supabase/Billing secret 구성을 확인한다.
8. 웹 앱을 테스트 배포한다.
9. `npm run portone:env:check -- --mode=deploy-webhook --webhookUrl=https://<test-domain>/api/payments/webhook`로 배포 URL과 웹훅 endpoint 형식을 확인한다.
10. `npm run portone:env:check -- --mode=renewal-cron`로 갱신 Edge Function의 Supabase/PortOne/Billing secret 구성을 확인한다.
11. `npm run portone:preflight -- --profile=deploy --webhookUrl=https://<test-domain>/api/payments/webhook`로 배포 env, 갱신 cron env, signed webhook route probe를 함께 확인한다.
12. `cron-subscription-renewal` Edge Function을 테스트 배포한 뒤 `npm run portone:renewal:function:smoke -- --functionUrl=https://<project>.functions.supabase.co/cron-subscription-renewal`로 no-due 호출을 확인한다.
13. PortOne 테스트 콘솔에 웹훅 URL을 등록하고 `Transaction.Paid`, `Transaction.Failed`, `Transaction.Cancelled`, `Transaction.PartialCancelled`, `Transaction.PayPending`, `Transaction.Ready`, `Transaction.VirtualAccountIssued`, `Transaction.CancelPending`, `BillingKey.Deleted`를 활성화한다.
14. 테스트 결제 smoke를 완료한 뒤 `npm run portone:launch:check -- --fullLocal --webhookUrl=https://<test-domain>/api/payments/webhook --renewalFunctionUrl=https://<project>.functions.supabase.co/cron-subscription-renewal --paymentId=<payment-id> --plan=basic --source=web`를 실행한다.
15. 운영 환경 변수와 운영 웹훅 URL로 같은 순서를 반복한다.

현재 확인된 공개 앱 `https://hairfit.beauty`의 `POST /api/payments/webhook`는 route까지 도달한다. 초기에는 `PORTONE_V2_WEBHOOK_SECRET` 누락으로 403을 반환했고, 최신 probe는 `Invalid PortOne webhook signature`로 403을 반환한다. Cloudflare Worker 이름은 `my-app/wrangler.jsonc` 기준 `hairstyleprivew`다. 값은 출력하지 말고 Cloudflare 대시보드 또는 Wrangler secret으로 로컬 smoke/PortOne 콘솔과 같은 webhook secret을 설정한다.

```powershell
npm run portone:webhook:unblock -- --webhookUrl=https://hairfit.beauty/api/payments/webhook
$env:CLOUDFLARE_API_TOKEN="<Cloudflare API token>"
$env:PORTONE_CLOUDFLARE_SECRET_SYNC_CONFIRM="hairstyleprivew"
npm run portone:webhook:unblock -- --write --webhookUrl=https://hairfit.beauty/api/payments/webhook
```

`portone:webhook:unblock`는 현재 배포 webhook blocker를 좁게 해소하기 위한 wrapper다. 기본 실행은 dry-run으로 `PORTONE_V2_WEBHOOK_SECRET` 준비 여부와 다음 명령을 출력한다. `--write`를 붙이면 `PORTONE_V2_WEBHOOK_SECRET`만 Cloudflare에 쓰고 `--verifyAfterWrite`로 배포 secret 이름을 확인한 뒤 `portone:preflight -- --profile=deploy`를 실행한다.

`portone:preflight -- --profile=deploy`가 403 `Invalid PortOne webhook signature`를 반환하면 endpoint와 secret 존재 여부는 확인된 상태다. 이 경우 로컬 `.env`의 `PORTONE_V2_WEBHOOK_SECRET`, PortOne 콘솔의 webhook secret, Cloudflare Worker `hairstyleprivew`의 secret 값이 같은지 맞춘 뒤 같은 deploy preflight를 다시 실행한다.

전체 PortOne/Supabase secret 묶음을 동기화해야 할 때는 아래 명령을 사용한다.

```powershell
npm run portone:cloudflare:secrets
$env:CLOUDFLARE_API_TOKEN="<Cloudflare API token>"
$env:PORTONE_CLOUDFLARE_SECRET_SYNC_CONFIRM="hairstyleprivew"
npm run portone:cloudflare:secrets -- --write --verifyAfterWrite --only=PORTONE_V2_WEBHOOK_SECRET,PORTONE_V2_API_SECRET,BILLING_KEY_ENCRYPTION_SECRET,SUPABASE_SERVICE_ROLE_KEY,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_PORTONE_V2_STORE_ID,NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY
npm run portone:cloudflare:secrets -- --verify --only=PORTONE_V2_WEBHOOK_SECRET,PORTONE_V2_API_SECRET,BILLING_KEY_ENCRYPTION_SECRET,SUPABASE_SERVICE_ROLE_KEY,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_PORTONE_V2_STORE_ID
cd my-app
npx wrangler secret put PORTONE_V2_WEBHOOK_SECRET --config wrangler.jsonc
npm run portone:cloudflare:secrets -- --verify --only=PORTONE_V2_WEBHOOK_SECRET
npm run portone:preflight -- --profile=deploy --webhookUrl=https://hairfit.beauty/api/payments/webhook
```

`portone:cloudflare:secrets`의 기본값은 dry-run이다. 실제 write는 `CLOUDFLARE_API_TOKEN`과 `PORTONE_CLOUDFLARE_SECRET_SYNC_CONFIRM=hairstyleprivew`가 모두 있을 때만 진행하며, secret 값은 출력하지 않는다. `--verify`는 Cloudflare에 저장된 secret 이름만 확인하고 값은 읽거나 출력하지 않는다. `--verifyAfterWrite`는 write 성공 직후 방금 쓴 secret 이름이 배포 Worker에 보이는지 확인한다. 특정 blocker만 해소할 때는 `--only=PORTONE_V2_WEBHOOK_SECRET`로 범위를 좁힌다. `--only`는 스크립트에 등록된 PortOne/Supabase secret 이름만 허용하므로 오타가 있으면 write 전에 실패한다.

## 3. 테스트 Smoke

### 3.0 DB/RPC smoke

1. 테스트 DB에 PortOne billing migration 전체를 적용한다.
2. `npm --prefix my-app run portone:migration:check`가 통과하는지 확인한다.
3. `PORTONE_DB_SMOKE_CONFIRM_TEST_DB=1`로 schema/RPC probe를 실행한다.
4. `PORTONE_DB_SMOKE_ALLOW_WRITE=1`을 추가해 write smoke를 실행한다.
5. Basic 갱신 금액 9,900원, 80크레딧, 암호화 빌링키 row의 갱신 대상 포함, `grant_subscription_credits`/`apply_payment_credits`/`advance_subscription_period`/`claw_back_payment_credits` 중복 호출 idempotency가 통과하는지 확인한다.
6. `PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB=1`로 `npm run portone:webhook:db:smoke -- --url=<webhook-url>`를 실행해 첫 결제 실패 웹훅 DB 상태 전이를 확인한다.
7. `npm run portone:webhook:db:smoke -- --scenario=pending-payment-events --url=<webhook-url>`를 실행해 대기/입금대기/취소대기 이벤트가 확정 상태를 만들지 않는지 확인한다.
8. 같은 guard로 `npm run portone:webhook:db:smoke -- --scenario=cancelled-paid-payment --url=<webhook-url>`를 실행해 paid 결제 전액 취소, 크레딧 회수, 취소 웹훅 재전송 idempotency를 확인한다.
9. `npm run portone:webhook:db:smoke -- --scenario=partial-cancelled-paid-payment --url=<webhook-url>`를 실행해 부분취소가 자동 회수 없이 운영 검토 metadata만 남기는지 확인한다.
10. `npm run portone:webhook:db:smoke -- --scenario=renewal-failed-payment --url=<webhook-url>`와 `--scenario=renewal-cancelled-paid-payment`를 실행해 갱신 실패/취소가 `past_due`, 재시도 필드, 크레딧 회수 idempotency로 반영되는지 확인한다.
11. `BILLING_KEY_ENCRYPTION_SECRET` 테스트 값을 함께 설정하고 `npm run portone:webhook:db:smoke -- --scenario=billing-key-deleted --url=<webhook-url>`와 `--scenario=billing-key-deleted-legacy`를 실행해 빌링키 삭제 시 갱신 차단, 저장 키 제거, legacy fallback을 확인한다.
12. 배포된 갱신 함수는 `npm run portone:renewal:function:smoke -- --functionUrl=<function-url>`로 no-due 호출을 먼저 확인하고, 만료 직전 테스트 구독과 테스트 billing key가 준비된 뒤에만 `--allowDueRows`를 붙여 실제 갱신 결제, 기간 연장, 크레딧 지급까지 확인한다.
13. smoke 완료 후 `smoke-`, `webhook-smoke-` user와 `portone-db-smoke-`, `webhook-smoke-payment-` payment row가 남지 않았는지 확인한다.

### 3.1 신규 웹 구독

1. 테스트 사용자로 `/billing`에 접속한다.
2. Basic 플랜을 결제한다.
3. 결제 완료 후 `paymentId`를 기준으로 읽기 전용 inspector를 실행한다.

```powershell
npm run portone:e2e:inspect -- --paymentId=<payment-id> --plan=basic --source=web
```

4. inspector가 `PortOne payment status is PAID`, `payment transaction status is paid`, `subscription status is active`, `subscription does not store plaintext billing key`, `web subscription stores encrypted billing key and hash`, `exactly one positive credit ledger row exists`를 모두 통과하는지 확인한다.
5. `payment_transactions`에서 같은 `provider_order_id`가 `paid`인지 확인한다.
6. `user_subscriptions`가 `active`, `plan_key=basic`, `credits_per_cycle=80`, `pg_billing_key_encrypted`/`pg_billing_key_hash` 저장, `pg_billing_key=null`인지 확인한다.
7. `credit_ledger`에 같은 `payment_transaction_id` row가 1개만 있는지 확인한다.
8. `/mypage?tab=plan`에서 현재 플랜, 다음 결제일, 크레딧 상태가 표시되는지 확인한다.

모바일 결제 smoke를 진행한 경우에는 같은 inspector를 `--source=mobile`로 실행한다. 이때는 `mobile subscription does not store billing-key fields`와 `credit ledger reason matches expected flow`의 expected 값 `mobile_portone_payment`가 통과해야 한다.

```powershell
npm run portone:e2e:inspect -- --paymentId=<mobile-payment-id> --plan=basic --source=mobile
```

### 3.2 중복 웹훅

1. PortOne 콘솔에서 같은 `Transaction.Paid` 이벤트를 재전송한다.
2. API 응답이 200인지 확인한다.
3. `credit_ledger`의 같은 `payment_transaction_id` row가 1개인지 확인한다.
4. `user_subscriptions.current_period_end`가 같은 `paymentId`로 반복 연장되지 않았는지 확인한다.

### 3.3 실패/취소

1. 실패 결제를 만들거나 signed webhook smoke로 `Transaction.Failed`를 전송한다.
2. 첫 결제 실패는 `payment_transactions.status=failed`, 준비 구독 `status=canceled`, 저장 빌링키 제거, `past_due` 미표시를 확인한다.
3. 갱신 실패는 `user_subscriptions.status=past_due`, `renewal_failure_count`, `renewal_next_retry_at`, 실패 코드/메시지 기록을 확인한다.
4. paid 결제 전액 취소는 `payment_transactions.status=refunded`, `payment_credit_clawbacks` 1건, +원장 1건/-원장 1건, 사용자 잔여 크레딧 차감, `credits_unrecovered`를 확인한다.
5. 부분취소는 자동 크레딧 회수 없이 운영 검토 metadata가 남는지 확인한다.

### 3.4 환불 실행 플로우 smoke

앱 내부 환불 실행 API가 추가된 뒤에는 이 smoke를 릴리즈 게이트에 포함한다. 2026-07-02 로컬 브랜치 기준 구현은 사용자 요청 원장, 관리자 승인 API, PortOne 취소 함수, 마이페이지/관리자 UX까지 포함한다.

1. 테스트 Basic 결제를 만들고 `npm run portone:e2e:inspect -- --paymentId=<payment-id> --plan=basic --source=web`를 통과시킨다.
2. 사용자 환불 요청 API가 `payment_refund_requests.pending` row를 만들고 같은 거래의 중복 pending 요청을 409로 막는지 확인한다.
3. 관리자 승인 API가 PortOne `POST /payments/{paymentId}/cancel` 호출 전 DB 금액, PortOne 상태, 취소 가능 금액을 다시 검증하는지 확인한다.
4. 전액 환불 승인 후 `Transaction.Cancelled` 웹훅 또는 취소 후 단건 조회로 `payment_transactions.status=refunded`, `payment_credit_clawbacks` 1건, `payment_refund_requests.completed`를 확인한다.
5. 같은 승인 요청을 다시 보내도 PortOne 취소 API가 중복 호출되지 않고 기존 request 상태를 반환하는지 확인한다.
6. 부분환불은 정책 확정 전까지 `manual_review_required`와 운영 검토 metadata만 남고 자동 크레딧 회수가 발생하지 않는지 확인한다.
7. 로컬 정적 확인은 `npm run portone:refund:smoke`로 요청 원장, 승인 API, PortOne 취소 함수, 마이페이지/관리자 UX 연결을 확인한다.

### 3.5 로컬 signed webhook

로컬 서버와 `.env.local`에 `PORTONE_V2_WEBHOOK_SECRET`이 있을 때만 사용한다.

```powershell
npm --prefix my-app run portone:webhook:test -- --url http://localhost:3010/api/payments/webhook --type Transaction.Paid --paymentId <pending-payment-id>
```

`Transaction.Paid`는 서버가 PortOne `GET /payments/{paymentId}`로 재조회하므로 실제 PortOne 테스트 결제가 없는 임의 paymentId는 최종 paid 확정까지 가지 않는다. 서명/라우팅 smoke와 결제 확정 smoke를 구분해서 기록한다.

외부 PortOne 조회 없이 라우트 서명 검증만 확인하려면 랜덤 `paymentId`와 `Transaction.Ready`를 사용한다.

```powershell
npm --prefix my-app run portone:webhook:test -- --url http://localhost:3010/api/payments/webhook --type Transaction.Ready --paymentId smoke-ready-local-route-001 --expectStatus 202 --expectBodyIncludes "payment transaction not found"
```

정상 migration이 적용된 테스트 DB라면 랜덤 `paymentId`는 `payment transaction not found`로 202 no-op 처리된다. `provider_transaction_id` 같은 컬럼 누락 오류가 나오면 migration 미적용 상태이며, 이 오류는 PortOne 재시도를 위해 500으로 반환되어야 한다.

현재 연결된 DB가 migration 미적용 상태인지 확인할 때는 기대값을 500으로 둔다.

```powershell
npm --prefix my-app run portone:webhook:test -- --url http://localhost:3010/api/payments/webhook --type Transaction.Ready --paymentId smoke-ready-local-route-001 --expectStatus 500 --expectBodyIncludes "provider_transaction_id"
```

배포 route는 같은 검증을 `--deployProbe`로 실행한다. 이 모드는 URL이 공개 HTTPS가 아니거나 `/api/payments/webhook`로 끝나지 않으면 요청을 보내기 전에 실패한다.

```powershell
npm run portone:webhook:test -- --deployProbe --url=https://<your-domain>/api/payments/webhook
```

### 3.6 Guarded migration apply

원격 DB 쓰기 작업은 `portone:migration:apply`로만 실행한다. 기본 실행은 dry-run이다.

```powershell
npm run portone:migration:apply
```

실제 적용은 project ref를 명시적으로 확인한 뒤에만 실행한다.

```powershell
$env:PORTONE_MIGRATION_ALLOW_REMOTE_WRITE="1"
$env:PORTONE_MIGRATION_CONFIRM_PROJECT_REF="dpzdhxlqnogfpubpslbf"
npm run portone:migration:apply -- --write
```

스크립트는 dry-run migration 목록이 예상한 PortOne migration 전체 또는 아직 미적용인 suffix와 일치하지 않거나, linked project ref 확인 env가 다르면 적용을 중단한다. 이미 모두 적용된 상태에서는 `no pending PortOne migrations`로 종료한다.

## 4. 장애 대응

### 4.1 결제 성공, 크레딧 지급 실패

증상:

- `/api/payments/subscribe`가 500과 `paymentId`, `subscriptionId`를 반환한다.
- `payment_transactions.status=paid`이지만 `credit_ledger.payment_transaction_id`가 없다.

대응:

1. PortOne 콘솔 또는 API에서 `paymentId`가 `PAID`, KRW, 기대 금액인지 확인한다.
2. `payment_transactions`의 `amount`, `credits_to_grant`, `user_id`, `subscription_id`를 확인한다.
3. `grant_subscription_credits`를 같은 `payment_transaction_id`로 재호출한다.
4. 재호출 후 ledger가 1개만 생성됐는지 확인한다.

### 4.2 웹훅 5xx 반복

대응:

1. 로그에서 `paymentId`, `confirmation.reason`, `failure_code`, `failure_message`를 확인한다.
2. `portone_lookup_failed`이면 PortOne API 장애 또는 secret/env 문제를 먼저 확인한다.
3. `transaction_update_failed`이면 Supabase 권한, migration 적용 여부, 컬럼명을 확인한다.
4. 원인이 해결되면 PortOne 콘솔에서 이벤트를 재전송한다.

### 4.3 빌링키 삭제

대응:

1. `BillingKey.Deleted` payload에서 billing key 식별자가 들어왔는지 확인한다.
2. `pg_billing_key_hash` 매칭 row가 `cancel_at_period_end=true`, 저장 빌링키 null로 갱신됐는지 확인한다.
3. 기존 plaintext row가 남아 있으면 백필 후 `--clear-plaintext`를 실행한다.

### 4.4 갱신 실패 증가

대응:

1. `user_subscriptions.status=past_due` row를 조회한다.
2. `renewal_failure_count`, `renewal_next_retry_at`, `renewal_failure_code`, `renewal_failure_message`를 확인한다.
3. PortOne billing key 상태와 결제수단 실패 여부를 확인한다.
4. 결제수단 문제면 사용자에게 결제수단 재등록을 안내한다.
5. 시스템 문제면 원인을 수정하고 다음 cron 또는 수동 재처리를 실행한다.

### 4.5 환불 요청 처리

운영자가 PortOne 콘솔에서 직접 환불하면 앱은 `Transaction.Cancelled`/`Transaction.PartialCancelled` 웹훅을 받아 후처리한다. 앱 내부 환불 요청/승인 API를 사용할 때는 아래 순서를 따른다.

1. `payment_transactions.provider_order_id`와 PortOne 콘솔의 결제 상태가 같은지 확인한다.
2. 환불 요청자, 사유, 전액/부분 환불 여부, 요청 금액을 `payment_refund_requests`에 기록한다.
3. 관리자 승인 전 `payment_transactions.status=paid`, 금액/통화, 크레딧 지급 원장, 기존 환불 요청 상태를 확인한다.
4. 전액 환불은 PortOne 취소 API 호출 후 `Transaction.Cancelled` 웹훅 또는 단건 조회 결과로 내부 상태를 확정한다.
5. 부분환불은 금액 비율 크레딧 회수 정책이 확정될 때까지 자동 회수하지 않고 운영 검토로 남긴다.
6. `credits_unrecovered > 0`이면 이미 사용된 크레딧이 있다는 뜻이므로 사용자 잔액 보정 또는 미수 처리 정책에 따라 별도 티켓을 만든다.

## 5. 운영 보류 기준

아래 중 하나라도 있으면 운영 배포를 보류한다.

- 테스트 결제가 `payment_transactions.paid`, `user_subscriptions.active`, `credit_ledger`까지 연결되지 않는다.
- 같은 `paymentId` 재처리에서 크레딧이 중복 지급되거나 구독 기간이 중복 연장된다.
- 신규 빌링키 원문이 로그, metadata, 클라이언트 응답, `pg_billing_key`에 남는다.
- 갱신 cron이 결제 후 PortOne 단건 조회 없이 기간을 연장한다.
- 전액 취소가 크레딧 회수 원장 없이 끝난다.
- `PORTONE_V2_WEBHOOK_SECRET` 테스트/운영 값이 혼용된다.

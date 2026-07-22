# HairFit AI (Next.js + Cloudflare Workers)

HairFit AI is a Next.js App Router project for hairstyle preview generation using a Gemini prompt-agent pipeline and Gemini image generation.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment setup

Create `.env.local` from `.env.local.example` and fill real values.

Required keys for core flow:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (use `/login`)
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (use `/signup`)
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` (use `/home`)
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` (use `/home`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_API_KEY`

Optional:
- `PROMPT_LLM_MODEL` (default: `gemini-2.5-pro`, deep-research prompt-agent)
- `PROMPT_RESEARCH_MODEL` (default: `PROMPT_LLM_MODEL`, grounded deep-research stage)
- `PROMPT_DEEP_RESEARCH_GROUNDING` (default: `true`, enables Google Search grounding in deep-research stage)
- `AFTERCARE_LLM_MODEL` (default: `gemini-3.5-flash`, aftercare guide and scheduled care copy)
- `GEMINI_IMAGE_MODEL` (default: `gemini-3-pro-image`, Nano Banana Pro GA line)
- `NEXT_PUBLIC_PORTONE_V2_STORE_ID` or `PORTONE_V2_STORE_ID` (required for PortOne billing key issuance)
- `NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY` or `PORTONE_V2_CHANNEL_KEY` (optional PortOne channel key)
- `PORTONE_V2_API_SECRET` (required for PortOne billing key charges)
- `PORTONE_V2_WEBHOOK_SECRET` (required for PortOne payment webhooks)
- `BILLING_KEY_ENCRYPTION_SECRET` (required for encrypted PortOne billing key storage and renewals)
- `SUBSCRIPTION_ACCESS_MODE` (`waitlist` by default; set `checkout` only when PG checkout is ready)
- `GENERATION_ACCEPTANCE_ENABLED` (`true` by default; set `false` to pause only new hair-generation acceptance while accepted work drains)
- `STYLING_ACCEPTANCE_ENABLED` (`true` by default; set `false` to pause only new Styler acceptance while generating work drains)
- `PAID_ACTION_QUOTES_REQUIRED` (`true` by default; `false` is an incident-only monitored legacy compatibility switch)
- `GENERATION_PUSH_ENABLED` (`false` until Expo production credentials and physical-device evidence are ready)
- `PRICING_STYLE_COST_USD` (default: `0.16`, assumed cost per style)
- `PRICING_TARGET_MARGIN` (default: `0.4`, target margin)
- `PRICING_CREDITS_PER_STYLE` (default/minimum: `10`, credits charged per hair result image)
- `PRICING_USD_TO_KRW` (default: `1350`, USD/KRW exchange-rate assumption)
- `PRICING_SAFETY_MULTIPLIER` (default: `1.06`, safety multiplier)
- `PRICING_FREE_CREDITS` (default: `10`)
- `PRICING_FREE_PRICE_KRW` (default: `0`)
- `PRICING_BASIC_CREDITS` (default: `80`)
- `PRICING_BASIC_PRICE_KRW` (default: `9900`)
- `PRICING_STANDARD_CREDITS` (default: `200`)
- `PRICING_STANDARD_PRICE_KRW` (default: `19900`)
- `PRICING_PRO_CREDITS` (default: `600`)
- `PRICING_PRO_PRICE_KRW` (default: `49900`)
- `PRICING_SALON_CREDITS` (default: `500`)
- `PRICING_SALON_PRICE_KRW` (default: `39900`)
- `RESEND_API_KEY` (optional, payment success email notifications)
- `RESEND_FROM_EMAIL` (optional, default: `HairFit <noreply@hairfit.beauty>`)
- `INBOUND_EMAIL_SECRET` (required for Cloudflare Email Routing Worker -> app webhook)
- `BUSINESS_INBOUND_EMAIL` (optional, default: `busyness@hairfit.beauty`)
- `SUPPORT_INBOUND_EMAIL` (optional, default: `support@hairfit.beauty`)
- `CLERK_SOCIAL_PROOF_SECRET_KEY` (optional, server-only `sk_live_` key for production-only landing user count)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (required for B2B inquiry form CAPTCHA)
- `TURNSTILE_SECRET_KEY` (required for server-side Cloudflare Turnstile validation)
- `NTS_BUSINESS_SERVICE_KEY` (required for B2B signup business registration verification)
- `B2B_LEAD_WEBHOOK_URL` (optional, receives B2B lead JSON payloads)
- `B2B_LEAD_WEBHOOK_SECRET` (optional, signs B2B lead webhook payloads)

## Cloudflare deployment prep

This project is configured with OpenNext for Cloudflare Workers.

Added files:
- `wrangler.jsonc`
- `open-next.config.ts`
- `middleware.ts`

Note:
- OpenNext currently does not support **Node.js proxy middleware**.
- For Cloudflare compatibility, this repo uses `middleware.ts` (Edge middleware) instead of `proxy.ts`.

### 1) Build for Cloudflare

```bash
npm run cf:build
```

### 2) Preview locally on Workers runtime

```bash
npm run cf:preview
```

### 3) Deploy to Cloudflare

```bash
npm run cf:deploy
```

## Cloudflare environment variables

Set these in Cloudflare Workers/Pages project settings or Wrangler secrets:
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_PUBLISHABLE_KEY` (recommended for Cloudflare production runtime; use the same `pk_live_...` value)
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (use `/login`)
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (use `/signup`)
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` (use `/home`)
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` (use `/home`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_API_KEY`
- `NEXT_PUBLIC_PORTONE_V2_STORE_ID` or `PORTONE_V2_STORE_ID`
- `NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY` or `PORTONE_V2_CHANNEL_KEY`
- `PORTONE_V2_API_SECRET`
- `PORTONE_V2_WEBHOOK_SECRET`
- `BILLING_KEY_ENCRYPTION_SECRET`
- `INTERNAL_API_SECRET`
- `RESEND_API_KEY` (optional)
- `RESEND_FROM_EMAIL` (optional, use a verified HairFit sender; development Resend senders are ignored)
- `INBOUND_EMAIL_SECRET` (required for inbound support email storage)
- `BUSINESS_INBOUND_EMAIL` (optional, default: `busyness@hairfit.beauty`)
- `SUPPORT_INBOUND_EMAIL` (optional, default: `support@hairfit.beauty`)
- `CLERK_SOCIAL_PROOF_SECRET_KEY` (optional; set only to a live Clerk secret key)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `NTS_BUSINESS_SERVICE_KEY`
- `B2B_LEAD_WEBHOOK_URL` (optional)
- `B2B_LEAD_WEBHOOK_SECRET` (optional)

Clerk note:
- In local development (`http://localhost:*`), use `pk_test_` / `sk_test_` keys.
- Authenticated protected-page Playwright uses `npm run web:protected-e2e` from the repository root. Set `E2E_CLERK_USER_EMAIL` to an existing development-instance `+clerk_test` customer in `.env.local`; the suite never creates a user or accepts live keys.
- Run `npm run web:protected-e2e:preflight` to check only the number of eligible existing users without printing addresses or mutating Clerk.
- `pk_live_` keys are domain-restricted and will not render Clerk widgets on localhost.
- Production builds must use `pk_live_` / `sk_live_` keys. The app treats Clerk test keys as unconfigured when `NODE_ENV=production` so deployments cannot silently run against a development Clerk instance. On Cloudflare, set `CLERK_PUBLISHABLE_KEY=pk_live_...` so the runtime can override a local test `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from `.env.local`.
- Confirm `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` come from the same live Clerk instance. A mismatched live key pair can render the sign-in widget but fail after authentication.
- Google OAuth uses Clerk's redirect flow in the app. In the Clerk and Google OAuth dashboards, confirm the live social connection is enabled for the production Clerk instance and the production domain/callback URLs for `hairfit.beauty` and `clerk.hairfit.beauty` are allowed.
- The landing user count reads only live Clerk data. In non-production environments, set `CLERK_SOCIAL_PROOF_SECRET_KEY=sk_live_...` if the production count should appear; test keys are ignored.

Optional pricing and prompt env:
- `PROMPT_LLM_MODEL`
- `PROMPT_RESEARCH_MODEL`
- `PROMPT_DEEP_RESEARCH_GROUNDING`
- `AFTERCARE_LLM_MODEL`
- `GEMINI_IMAGE_MODEL`
- `PRICING_STYLE_COST_USD`
- `PRICING_TARGET_MARGIN`
- `PRICING_CREDITS_PER_STYLE`
- `PRICING_USD_TO_KRW`
- `PRICING_SAFETY_MULTIPLIER`
- `PRICING_FREE_CREDITS`
- `PRICING_FREE_PRICE_KRW`
- `PRICING_BASIC_CREDITS`
- `PRICING_BASIC_PRICE_KRW`
- `PRICING_STANDARD_CREDITS`
- `PRICING_STANDARD_PRICE_KRW`
- `PRICING_PRO_CREDITS`
- `PRICING_PRO_PRICE_KRW`
- `PRICING_SALON_CREDITS`
- `PRICING_SALON_PRICE_KRW`
- `SUBSCRIPTION_ACCESS_MODE`
- `GENERATION_ACCEPTANCE_ENABLED`
- `STYLING_ACCEPTANCE_ENABLED`
- `PAID_ACTION_QUOTES_REQUIRED`
- `GENERATION_PUSH_ENABLED`

## PortOne payment routes

Before running live PortOne smoke tests, check runtime configuration without printing secret values:

```bash
npm run portone:billing-secret:generate
npm run portone:billing-secret:generate -- --check
npm run portone:preflight
npm run portone:preflight -- --profile=full-local
npm run portone:env:check -- --mode=test-payment
npm run portone:env:check -- --mode=deploy-webhook --webhookUrl=https://<your-domain>/api/payments/webhook
npm run portone:preflight -- --profile=deploy --webhookUrl=https://<your-domain>/api/payments/webhook
npm run portone:webhook:test -- --deployProbe --url=https://<your-domain>/api/payments/webhook
```

After a test payment completes, inspect the PortOne payment and linked Supabase rows:

```bash
npm run portone:e2e:inspect -- --paymentId=<payment-id> --plan=basic --source=web
```

- `POST /api/payments/billing-key/prepare`
  - Returns authenticated-user billing key issue parameters for the browser SDK, including `issueId`, `customerId`, store/channel config, and display amount.
- `POST /api/payments/subscribe`
  - Encrypts and hashes the PortOne billing key, charges it, creates or updates the subscription, records `payment_transactions`, and grants credits.
- `POST /api/payments/webhook`
  - Verifies PortOne V2 Standard Webhooks headers and processes paid, failed, canceled, pending, and billing-key-deleted events.
  - Renewal payments advance the subscription period, grant credits, and optionally send renewal email when `RESEND_API_KEY` is configured.
  - `BillingKey.Deleted` matches encrypted-key subscriptions by `pg_billing_key_hash`; legacy plaintext rows are still handled as a fallback.
  - Full cancellation events claw back currently available credits once per payment transaction and record unrecovered credits in `payment_credit_clawbacks`.
  - Partial cancellation events update transaction metadata only; credit adjustment remains a manual operations decision.

## PortOne webhook setup

1. In the PortOne dashboard, create a webhook endpoint with:
   - URL: `https://<your-domain>/api/payments/webhook`
   - Events: `Transaction.Paid`, `Transaction.Failed`, `Transaction.Cancelled`, `Transaction.PartialCancelled`, `Transaction.CancelPending`, `Transaction.PayPending`, `Transaction.Ready`, `Transaction.VirtualAccountIssued`, `BillingKey.Deleted`
2. Copy the webhook signing secret from PortOne and set:
   - `PORTONE_V2_WEBHOOK_SECRET=<secret from PortOne dashboard>`
3. Ensure runtime env has:
   - `PORTONE_V2_API_SECRET`
   - `PORTONE_V2_WEBHOOK_SECRET`
   - `BILLING_KEY_ENCRYPTION_SECRET`
4. Deploy app, then verify the deployed endpoint shape:

```bash
npm run portone:env:check -- --mode=deploy-webhook --webhookUrl=https://<your-domain>/api/payments/webhook
npm run portone:preflight -- --profile=deploy --webhookUrl=https://<your-domain>/api/payments/webhook
npm run portone:webhook:test -- --deployProbe --url=https://<your-domain>/api/payments/webhook
```

5. Send a PortOne test event.

Local signed webhook test without the PortOne dashboard:

```bash
npm run portone:webhook:test -- --url=http://localhost:3000/api/payments/webhook --paymentId=<provider_order_id>
```

Use `--type=<event>` and `--billingKey=<billing_key>` to smoke-test non-paid events, for example `BillingKey.Deleted`.

If the payment ID exists in `payment_transactions.provider_order_id`, API should return `200`.
If not, API may return `202` with an ignored reason, which still confirms the signature verification path is working.

To verify failed/cancelled webhook DB transitions with disposable rows in a test database:

```bash
PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB=1 npm run portone:webhook:db:smoke -- --url=http://localhost:3000/api/payments/webhook
PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB=1 npm run portone:webhook:db:smoke -- --scenario=pending-payment-events --url=http://localhost:3000/api/payments/webhook
PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB=1 npm run portone:webhook:db:smoke -- --scenario=cancelled-paid-payment --url=http://localhost:3000/api/payments/webhook
PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB=1 npm run portone:webhook:db:smoke -- --scenario=partial-cancelled-paid-payment --url=http://localhost:3000/api/payments/webhook
BILLING_KEY_ENCRYPTION_SECRET=<test-secret> PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB=1 npm run portone:webhook:db:smoke -- --scenario=billing-key-deleted --url=http://localhost:3000/api/payments/webhook
BILLING_KEY_ENCRYPTION_SECRET=<test-secret> PORTONE_WEBHOOK_DB_SMOKE_CONFIRM_TEST_DB=1 npm run portone:webhook:db:smoke -- --scenario=billing-key-deleted-legacy --url=http://localhost:3000/api/payments/webhook
```

## PortOne billing key backfill

New subscriptions store PortOne billing keys in encrypted form. Existing rows that still have `user_subscriptions.pg_billing_key` can be backfilled after `BILLING_KEY_ENCRYPTION_SECRET` is configured:

```bash
npm run portone:billing-key:backfill -- --limit=100
npm run portone:billing-key:backfill -- --write --limit=100
npm run portone:billing-key:backfill -- --write --clear-plaintext --limit=100
```

The first command is dry-run. Use `--clear-plaintext` only after confirming encrypted renewal works in the target environment.

For local Wrangler preview, copy `.dev.vars.example` to `.dev.vars` and fill values.

## Cloudflare inbound email setup

Resend remains the outbound email provider. Inbound support email is handled by a separate Cloudflare Email Routing Worker in `workers/email-router`.

1. Deploy the app with `INBOUND_EMAIL_SECRET` set.
2. Set the same secret on the email Worker:
   `npx wrangler secret put INBOUND_EMAIL_SECRET --config workers/email-router/wrangler.jsonc`
3. If you want failed app deliveries forwarded, set:
   `npx wrangler secret put INBOUND_FALLBACK_EMAIL --config workers/email-router/wrangler.jsonc`
4. Deploy the Worker:
   `npm run email-worker:deploy`
5. In Cloudflare Email Routing, onboard `hairfit.beauty`, then create custom addresses `support` and `busyness` and route both to the `hairfit-email-router` Worker.

The Worker posts parsed messages to `POST /api/email/inbound/cloudflare`. Emails to `busyness@hairfit.beauty` are tagged as the business mailbox. Admin users can review and filter messages at `/admin/inbox`.

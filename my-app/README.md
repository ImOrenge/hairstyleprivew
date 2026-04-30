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
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_API_KEY`

Optional:
- `PROMPT_LLM_MODEL` (default: `gemini-2.5-pro`, deep-research prompt-agent)
- `PROMPT_RESEARCH_MODEL` (default: `PROMPT_LLM_MODEL`, grounded deep-research stage)
- `PROMPT_DEEP_RESEARCH_GROUNDING` (default: `true`, enables Google Search grounding in deep-research stage)
- `GEMINI_IMAGE_MODEL` (default: `gemini-3-pro-image-preview`, Nano Banana Pro line)
- `PORTONE_V2_API_SECRET` (required for PortOne billing key charges)
- `PORTONE_V2_WEBHOOK_SECRET` (required for PortOne payment webhooks)
- `PRICING_STYLE_COST_USD` (default: `0.16`, assumed cost per style)
- `PRICING_TARGET_MARGIN` (default: `0.4`, target margin)
- `PRICING_CREDITS_PER_STYLE` (default: `5`, credits charged per style)
- `PRICING_USD_TO_KRW` (default: `1350`, USD/KRW exchange-rate assumption)
- `PRICING_SAFETY_MULTIPLIER` (default: `1.06`, safety multiplier)
- `PRICING_FREE_CREDITS` (default: `10`)
- `PRICING_FREE_PRICE_KRW` (default: `0`)
- `PRICING_STARTER_CREDITS` (default: `60`)
- `PRICING_STARTER_PRICE_KRW` (default: `9900`)
- `PRICING_PRO_CREDITS` (default: `250`)
- `PRICING_PRO_PRICE_KRW` (default: `39000`)
- `RESEND_API_KEY` (optional, payment success email notifications)
- `RESEND_FROM_EMAIL` (optional, default: `HairFit <onboarding@resend.dev>`)
- `INBOUND_EMAIL_SECRET` (required for Cloudflare Email Routing Worker -> app webhook)
- `CLERK_SOCIAL_PROOF_SECRET_KEY` (optional, server-only `sk_live_` key for production-only landing user count)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (required for B2B inquiry form CAPTCHA)
- `TURNSTILE_SECRET_KEY` (required for server-side Cloudflare Turnstile validation)
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
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_API_KEY`
- `PORTONE_V2_API_SECRET`
- `PORTONE_V2_WEBHOOK_SECRET`
- `INTERNAL_API_SECRET`
- `RESEND_API_KEY` (optional)
- `RESEND_FROM_EMAIL` (optional)
- `INBOUND_EMAIL_SECRET` (required for inbound support email storage)
- `CLERK_SOCIAL_PROOF_SECRET_KEY` (optional; set only to a live Clerk secret key)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `B2B_LEAD_WEBHOOK_URL` (optional)
- `B2B_LEAD_WEBHOOK_SECRET` (optional)

Clerk note:
- In local development (`http://localhost:*`), use `pk_test_` / `sk_test_` keys.
- `pk_live_` keys are domain-restricted and will not render Clerk widgets on localhost.
- The landing user count reads only live Clerk data. In non-production environments, set `CLERK_SOCIAL_PROOF_SECRET_KEY=sk_live_...` if the production count should appear; test keys are ignored.

Optional pricing and prompt env:
- `PROMPT_LLM_MODEL`
- `PROMPT_RESEARCH_MODEL`
- `PROMPT_DEEP_RESEARCH_GROUNDING`
- `GEMINI_IMAGE_MODEL`
- `PRICING_STYLE_COST_USD`
- `PRICING_TARGET_MARGIN`
- `PRICING_CREDITS_PER_STYLE`
- `PRICING_USD_TO_KRW`
- `PRICING_SAFETY_MULTIPLIER`
- `PRICING_FREE_CREDITS`
- `PRICING_FREE_PRICE_KRW`
- `PRICING_STARTER_CREDITS`
- `PRICING_STARTER_PRICE_KRW`
- `PRICING_PRO_CREDITS`
- `PRICING_PRO_PRICE_KRW`

## PortOne payment routes

- `POST /api/payments/subscribe`
  - Charges a PortOne billing key, creates or updates the subscription, records `payment_transactions`, and grants credits.
- `POST /api/payments/webhook`
  - Verifies PortOne V2 Standard Webhooks headers and processes `Transaction.Paid` and `Transaction.Failed`.
  - Renewal payments advance the subscription period, grant credits, and optionally send renewal email when `RESEND_API_KEY` is configured.

## PortOne webhook setup

1. In the PortOne dashboard, create a webhook endpoint with:
   - URL: `https://<your-domain>/api/payments/webhook`
   - Events: `Transaction.Paid`, `Transaction.Failed`
2. Copy the webhook signing secret from PortOne and set:
   - `PORTONE_V2_WEBHOOK_SECRET=<secret from PortOne dashboard>`
3. Ensure runtime env has:
   - `PORTONE_V2_API_SECRET`
   - `PORTONE_V2_WEBHOOK_SECRET`
4. Deploy app, then send a PortOne test event.

Local signed webhook test without the PortOne dashboard:

```bash
npm run portone:webhook:test -- --url=http://localhost:3000/api/payments/webhook --paymentId=<provider_order_id>
```

If the payment ID exists in `payment_transactions.provider_order_id`, API should return `200`.
If not, API may return `202` with an ignored reason, which still confirms the signature verification path is working.

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
5. In Cloudflare Email Routing, onboard `hairfit.beauty`, then create the custom address `support` and route it to the `hairfit-email-router` Worker.

The Worker posts parsed messages to `POST /api/email/inbound/cloudflare`. Admin users can review messages at `/admin/inbox`.

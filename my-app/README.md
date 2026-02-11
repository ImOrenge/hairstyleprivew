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
- `POLAR_SERVER` (`sandbox` or `production`, default: `production`)
- `POLAR_PRODUCT_ID_STARTER` (Starter checkout에 사용할 Polar Product ID)
- `POLAR_PRODUCT_ID_PRO` (Pro checkout에 사용할 Polar Product ID)
- `POLAR_SUCCESS_URL` (optional, checkout 성공 후 리다이렉트 URL)
- `PRICING_STYLE_COST_USD` (default: `0.16`, style 1회 원가 가정)
- `PRICING_TARGET_MARGIN` (default: `0.4`, 목표 마진율)
- `PRICING_CREDITS_PER_STYLE` (default: `5`, 스타일 1회당 크레딧 차감값)
- `PRICING_USD_TO_KRW` (default: `1350`, USD/KRW 환율)
- `PRICING_SAFETY_MULTIPLIER` (default: `1.06`, 안전 계수)
- `PRICING_STARTER_FIXED_PRICE_USD` (default: `10`, Starter 플랜 고정 월 가격)

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

Set these in Cloudflare Workers/Pages project settings (or Wrangler secrets):
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_API_KEY`
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_SERVER` (optional)
- `POLAR_PRODUCT_ID_STARTER` (optional if request body sends `productId`)
- `POLAR_PRODUCT_ID_PRO` (optional if request body sends `productId`)
- `POLAR_SUCCESS_URL` (optional)
- `PROMPT_LLM_MODEL` (optional)
- `PROMPT_RESEARCH_MODEL` (optional)
- `PROMPT_DEEP_RESEARCH_GROUNDING` (optional)
- `GEMINI_IMAGE_MODEL` (optional)
- `PRICING_STYLE_COST_USD` (optional)
- `PRICING_TARGET_MARGIN` (optional)
- `PRICING_CREDITS_PER_STYLE` (optional)
- `PRICING_USD_TO_KRW` (optional)
- `PRICING_SAFETY_MULTIPLIER` (optional)
- `PRICING_STARTER_FIXED_PRICE_USD` (optional)
- `INTERNAL_API_SECRET`

## Polar payment routes

- `POST /api/payments/checkout`
  - Creates a pending `payment_transactions` row and returns `checkoutUrl`.
  - Body example: `{"plan":"starter"}` or `{"productId":"...","amount":9900,"creditsToGrant":100}`
- `POST /api/payments/webhook`
  - Verifies Standard Webhook signature headers and processes `order.paid` events.
  - Updates `payment_transactions` to `paid` and calls `apply_payment_credits` RPC.

For local Wrangler preview, copy `.dev.vars.example` to `.dev.vars` and fill values.

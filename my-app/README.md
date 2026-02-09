# HairFit AI (Next.js + Cloudflare Workers)

HairFit AI is a Next.js App Router project for hairstyle preview generation using Prompt API + Replicate.

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
- `REPLICATE_API_TOKEN`
- `REPLICATE_MODEL_VERSION`

Optional:
- `GOOGLE_API_KEY` (Prompt LLM; fallback heuristic works without it)
- `PROMPT_LLM_MODEL`

## Replicate smoke test

```bash
npm run replicate:smoke
```

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
- `REPLICATE_API_TOKEN`
- `REPLICATE_MODEL_VERSION`
- `GOOGLE_API_KEY` (optional)
- `PROMPT_LLM_MODEL` (optional)
- `POLAR_ACCESS_TOKEN` / `POLAR_WEBHOOK_SECRET` (if payment routes used)
- `INTERNAL_API_SECRET`

For local Wrangler preview, copy `.dev.vars.example` to `.dev.vars` and fill values.

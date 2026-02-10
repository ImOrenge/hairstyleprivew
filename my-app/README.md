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
- `PROMPT_LLM_MODEL` (optional)
- `PROMPT_RESEARCH_MODEL` (optional)
- `PROMPT_DEEP_RESEARCH_GROUNDING` (optional)
- `GEMINI_IMAGE_MODEL` (optional)
- `POLAR_ACCESS_TOKEN` / `POLAR_WEBHOOK_SECRET` (if payment routes used)
- `INTERNAL_API_SECRET`

For local Wrangler preview, copy `.dev.vars.example` to `.dev.vars` and fill values.

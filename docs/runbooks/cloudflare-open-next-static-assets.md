# Cloudflare OpenNext static asset release contract

The production HTML Worker and its `/_next/static` files must come from the same OpenNext build. A deployment is invalid when HTML is served but any referenced JavaScript, CSS, font, or image is missing or has the wrong MIME type.

## Cloudflare Workers Builds settings

Use these values for the production Worker connected to `main`:

- Root directory: `my-app`
- Build command: `npm run cf:build`
- Deploy command: disabled for automatic production rollout; use the atomic split release command below
- Non-production branch deploy command: `npm run cf:builds:preview`

Do not use `npx wrangler versions upload` as the production deploy command. `versions upload` is reserved for preview/non-production versions. Workers Builds does not run the Wrangler custom-build configuration, so the explicit build command is required.

## Enforced checks

`npm run cf:build` now fails unless all of the following are true:

1. `.open-next/worker.js` exists.
2. `.open-next/assets/_next/static` contains JavaScript, CSS, and font files.
3. every static file referenced by the OpenNext build manifests exists in the upload directory.
4. the primary Worker, split server, and production router declare the `ASSETS` binding and correct asset directory.

`npm run cf:builds:deploy` intentionally fails. A single-Worker deploy can publish HTML from one OpenNext build while the router still pins server, media, or admin Workers from another build.

## Atomic production release

Run from a clean checkout whose `HEAD` is the published `main` revision:

```powershell
npm run cf:deploy -- --apply --confirm=HAIRFIT_ATOMIC_SPLIT_DEPLOY --source-revision=<40-character-main-SHA> --env-file=<HAIRFIT_PRODUCTION_ENV>
```

The command builds once, uploads server, media, and admin from that exact output, registers each new version at 0% beside the currently pinned version, uploads one router version that pins all three new IDs and the matching asset set, and finally deploys only that router version at 100%. It refuses a source revision that differs from `HEAD` and requires the production runtime inputs without printing secret values.

The final gate verifies both `/login` and `/consulting/e2e-harness`. This is required because authenticated consultation pages are rendered by the media Worker and can reference a different chunk set even when `/login` is healthy.

For a standalone production check:

```powershell
npm run cf:assets:live
```

The live check is intentionally cache-busted and should be retained as the final release gate.

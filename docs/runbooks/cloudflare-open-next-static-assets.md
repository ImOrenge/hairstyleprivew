# Cloudflare OpenNext static asset release contract

The production HTML Worker and its `/_next/static` files must come from the same OpenNext build. A deployment is invalid when HTML is served but any referenced JavaScript, CSS, font, or image is missing or has the wrong MIME type.

## Cloudflare Workers Builds settings

Use these values for the production Worker connected to `main`:

- Root directory: `my-app`
- Build command: `npm run cf:build`
- Deploy command: `npm run cf:builds:deploy` (intentionally fails; use the atomic split release command below)
- Non-production branch deploy command: `npm run cf:builds:preview`

Do not use `npx wrangler versions upload` as the production deploy command. `versions upload` is reserved for preview/non-production versions. Workers Builds does not run the Wrangler custom-build configuration, so the explicit build command is required.

## Enforced checks

`npm run cf:build` now fails unless all of the following are true:

1. `.open-next/worker.js` exists.
2. `.open-next/assets/_next/static` contains JavaScript, CSS, and font files.
3. `NEXT_DEPLOYMENT_ID` and `.open-next/hairfit-deployment.json` bind the build to the exact 40-character Git `HEAD`.
4. every static file referenced by every default, media, and admin OpenNext manifest exists in the upload directory.
5. the primary Worker, split server, and production router declare the `ASSETS` binding and correct asset directory.

`npm run cf:builds:deploy` intentionally fails. A single-Worker deploy can publish HTML from one OpenNext build while the router still pins server, media, or admin Workers from another build.

`my-app/wrangler.jsonc` also points at the intentionally absent `.cloudflare-builds-disabled/worker.js`. This is a fail-closed repository guard: even if Workers Builds is accidentally reset to `npx wrangler versions upload`, Wrangler stops before uploading or promoting the production Worker. The real production entry points live only in `workers/open-next-multi/*.jsonc` and are selected explicitly by `npm run cf:deploy`.

## Atomic production release

Run from a clean checkout whose `HEAD` is the published `main` revision:

```powershell
npm run cf:deploy -- --apply --confirm=HAIRFIT_ATOMIC_SPLIT_DEPLOY --source-revision=<40-character-main-SHA> --env-file=<HAIRFIT_PRODUCTION_ENV>
```

The command builds once with the Git `HEAD` as Next.js `deploymentId`, uploads server, media, and admin from that exact output, registers each new version at 0% beside the currently pinned version, and uploads one router version that pins all three new IDs and the matching asset set. It deploys the router first, then promotes the matching server, media, and admin versions to 100% so Cloudflare service bindings do not mix a version override with the prior module or asset state. It refuses a source revision that differs from `HEAD` or the build marker and requires the production runtime inputs without printing secret values. The deployment ID makes a stale tab hard-navigate when it encounters a newer server instead of mixing old RSC navigation data with new assets.

The final gate verifies both `/login` and `/consulting/e2e-harness`. This is required because authenticated consultation pages are rendered by the media Worker and can reference a different chunk set even when `/login` is healthy.

For a standalone production check:

```powershell
npm run cf:assets:live
```

The live check is intentionally cache-busted. It also requires the same Git SHA in `<html data-dpl-id>` and every `/_next/static/*?dpl=` reference, and should be retained as the final release gate.

# Cloudflare OpenNext static asset release contract

The production HTML Worker and its `/_next/static` files must come from the same OpenNext build. A deployment is invalid when HTML is served but any referenced JavaScript, CSS, font, or image is missing or has the wrong MIME type.

## Cloudflare Workers Builds settings

Use these values for the production Worker connected to `main`:

- Root directory: `my-app`
- Build command: `npm run cf:build`
- Deploy command: `npm run cf:builds:deploy`
- Non-production branch deploy command: `npm run cf:builds:preview`

Do not use `npx wrangler versions upload` as the production deploy command. `versions upload` is reserved for preview/non-production versions. Workers Builds does not run the Wrangler custom-build configuration, so the explicit build command is required.

## Enforced checks

`npm run cf:build` now fails unless all of the following are true:

1. `.open-next/worker.js` exists.
2. `.open-next/assets/_next/static` contains JavaScript, CSS, and font files.
3. every static file referenced by the OpenNext build manifests exists in the upload directory.
4. both the primary Worker and the custom-domain split server declare the `ASSETS` binding and correct asset directory.

`npm run cf:builds:deploy` verifies the artifacts again, deploys them atomically with Wrangler, and then fetches `/login` plus every `/_next/static` reference. The command fails if any asset is not HTTP 2xx or its MIME type does not match its extension.

For a standalone production check:

```powershell
npm run cf:assets:live
```

The live check is intentionally cache-busted and should be retained as the final release gate.

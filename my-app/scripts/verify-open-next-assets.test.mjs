import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  assertAutomaticProductionDeployGuard,
  assertWranglerAssetBinding,
  collectManifestAssets,
  expectedMimePattern,
  extractHtmlStaticAssets,
  normalizeManifestAsset,
} from "./verify-open-next-assets.mjs";

const appRoot = resolve(import.meta.dirname, "..");

test("manifest references resolve into the uploaded OpenNext asset tree", () => {
  assert.equal(normalizeManifestAsset("static/chunks/app/page.js"), "_next/static/chunks/app/page.js");
  assert.equal(normalizeManifestAsset("/_next/static/css/app.css"), "_next/static/css/app.css");
  assert.equal(normalizeManifestAsset("server/app/page.js"), null);
  assert.deepEqual(
    [...collectManifestAssets({ root: ["static/chunks/main.js"], nested: { css: "/_next/static/css/app.css" } })].sort(),
    ["_next/static/chunks/main.js", "_next/static/css/app.css"],
  );
});

test("live HTML extraction checks only same-origin Next static assets", () => {
  const html = [
    '<link rel="stylesheet" href="/_next/static/css/app.css?dpl=abc">',
    '<script src="/_next/static/chunks/main.js?dpl=abc"></script>',
    '<script src="https://clerk.example.test/clerk.js"></script>',
    '<script src="/_next/static/chunks/main.js?dpl=abc"></script>',
  ].join("");
  assert.deepEqual(extractHtmlStaticAssets(html), [
    "/_next/static/chunks/main.js?dpl=abc",
    "/_next/static/css/app.css?dpl=abc",
  ]);
  assert.match("text/css; charset=utf-8", expectedMimePattern("/app.css"));
  assert.match("application/javascript", expectedMimePattern("/app.js"));
});

test("every custom-domain OpenNext Worker uploads the same static asset directory", () => {
  assert.doesNotThrow(() => assertWranglerAssetBinding(resolve(appRoot, "wrangler.jsonc"), ".open-next/assets"));
  assert.doesNotThrow(() => assertWranglerAssetBinding(
    resolve(appRoot, "workers", "open-next-multi", "wrangler.server.jsonc"),
    "../../.open-next/assets",
  ));
  assert.doesNotThrow(() => assertWranglerAssetBinding(
    resolve(appRoot, "workers", "open-next-multi", "wrangler.middleware.jsonc"),
    "../../.open-next/assets",
  ));
});

test("the default Workers Builds command cannot upload the production Worker", () => {
  assert.doesNotThrow(() => assertAutomaticProductionDeployGuard(resolve(appRoot, "wrangler.jsonc")));
});

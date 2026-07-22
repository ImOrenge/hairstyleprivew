import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildAndroidAssetLinks,
  buildAppleAppSiteAssociation,
} from "./app-link-association.ts";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("app-link associations only expose the generation route", () => {
  const apple = buildAppleAppSiteAssociation("A1B2C3D4E5");
  assert.deepEqual(apple?.applinks.details[0], {
    appID: "A1B2C3D4E5.com.hairfit.app",
    paths: ["/generate/*"],
  });

  const fingerprint = Array.from({ length: 32 }, (_, index) =>
    index.toString(16).padStart(2, "0"),
  ).join(":").toUpperCase();
  const android = buildAndroidAssetLinks(fingerprint);
  assert.equal(android?.[0]?.target.package_name, "com.hairfit.app");
  assert.deepEqual(android?.[0]?.target.sha256_cert_fingerprints, [fingerprint]);
});

test("app-link associations reject placeholders and malformed identifiers", () => {
  assert.equal(buildAppleAppSiteAssociation("YOUR_TEAM_ID"), null);
  assert.equal(buildAppleAppSiteAssociation("short"), null);
  assert.equal(buildAndroidAssetLinks("YOUR_SHA256"), null);
  assert.equal(buildAndroidAssetLinks("AA:BB"), null);
});

test("external association preflight fails closed on redirects, non-JSON, and identifier mismatch", () => {
  const runner = read("../scripts/check-app-link-associations.mjs");
  const appPackage = read("../package.json");
  const rootPackage = read("../../package.json");
  const externalGates = read("../../.github/workflows/release-candidate-external-gates.yml");

  assert.match(runner, /redirect: "manual"/);
  assert.match(runner, /response\.status !== 200/);
  assert.match(runner, /application\/json/);
  assert.match(runner, /HAIRFIT_APPLE_TEAM_ID/);
  assert.match(runner, /HAIRFIT_ANDROID_CERT_SHA256/);
  assert.match(runner, /com\.hairfit\.app/);
  assert.match(runner, /\/generate\/\*/);
  assert.match(appPackage, /app-links:external:check/);
  assert.match(rootPackage, /app-links:external:check/);
  assert.match(externalGates, /app-link-association-preflight:/);
  assert.match(externalGates, /HAIRFIT_APPLE_TEAM_ID: \$\{\{ secrets\.HAIRFIT_APPLE_TEAM_ID \}\}/);
  assert.match(externalGates, /HAIRFIT_ANDROID_CERT_SHA256: \$\{\{ secrets\.HAIRFIT_ANDROID_CERT_SHA256 \}\}/);
  assert.match(externalGates, /npm run app-links:external:check/);
});

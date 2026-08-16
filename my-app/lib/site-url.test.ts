import assert from "node:assert/strict";
import test from "node:test";
import { getCanonicalNavigationRedirectUrl, getSiteUrl } from "./site-url.ts";

test("site URL uses the configured origin without carrying a path", () => {
  assert.equal(
    getSiteUrl({
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://preview.hairfit.beauty/some/path",
    }),
    "https://preview.hairfit.beauty",
  );
});

test("production email links never fall back to localhost", () => {
  assert.equal(getSiteUrl({ NODE_ENV: "production" }), "https://hairfit.beauty");
  assert.equal(
    getSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "not a url" }),
    "https://hairfit.beauty",
  );
  assert.equal(
    getSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://hairfit.beauty" }),
    "https://hairfit.beauty",
  );
  assert.equal(
    getSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "ftp://hairfit.beauty" }),
    "https://hairfit.beauty",
  );
  assert.equal(
    getSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" }),
    "https://hairfit.beauty",
  );
});

test("local development keeps the localhost fallback", () => {
  assert.equal(getSiteUrl({ NODE_ENV: "development" }), "http://localhost:3000");
});

test("www navigation redirects to the canonical production origin", () => {
  const redirectUrl = getCanonicalNavigationRedirectUrl(
    "https://www.hairfit.beauty:8443/workspace?source=bookmark",
    "GET",
  );

  assert.equal(
    redirectUrl?.toString(),
    "https://hairfit.beauty/workspace?source=bookmark",
  );
});

test("canonical redirect leaves API, mutations, and the canonical host unchanged", () => {
  assert.equal(
    getCanonicalNavigationRedirectUrl(
      "https://www.hairfit.beauty/api/account",
      "GET",
    ),
    null,
  );
  assert.equal(
    getCanonicalNavigationRedirectUrl(
      "https://www.hairfit.beauty/workspace",
      "POST",
    ),
    null,
  );
  assert.equal(
    getCanonicalNavigationRedirectUrl(
      "https://hairfit.beauty/workspace",
      "GET",
    ),
    null,
  );
});

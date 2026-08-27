import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSignInRedirectUrl, getClerkConfigState, getSafeClerkReturnPath } from "./clerk.ts";

const generationId = "123e4567-e89b-42d3-a456-426614174000";

test("Clerk return URLs preserve validated internal routes and queries", () => {
  const generationPath = `/generate/${generationId}?from=email`;

  assert.equal(getSafeClerkReturnPath(generationPath), generationPath);
  assert.equal(
    buildSignInRedirectUrl(generationPath),
    `/login?redirect_url=${encodeURIComponent(generationPath)}`,
  );
  assert.equal(
    buildSignInRedirectUrl("/mypage?tab=billing#history"),
    `/login?redirect_url=${encodeURIComponent("/mypage?tab=billing#history")}`,
  );
});

test("Clerk return URLs reject external and ambiguous redirect payloads", () => {
  const invalidPaths = [
    "https://evil.example/account",
    "//evil.example/account",
    "\\\\evil.example\\account",
    "/\\evil.example/account",
    "/%5C%5Cevil.example/account",
    "/%2F%2Fevil.example/account",
    "/%252F%252Fevil.example/account",
    "/home\u0000",
    `/generate/not-a-uuid`,
    `/generate/${generationId}/extra`,
    `/${"x".repeat(2100)}`,
  ];

  for (const path of invalidPaths) {
    assert.equal(getSafeClerkReturnPath(path), null, path);
    assert.equal(buildSignInRedirectUrl(path), "/login", path);
  }
});

test("middleware preserves validated page targets even when Clerk configuration is unavailable", () => {
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");

  assert.match(middleware, /const returnBackPath = `\$\{url\.pathname\}\$\{url\.search\}`/);
  assert.match(
    middleware,
    /NextResponse\.redirect\(new URL\(buildSignInRedirectUrl\(returnBackPath\), req\.url\)\)/,
  );
});

test("customer stylebook requires authentication without protecting public share pages", () => {
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");

  assert.match(middleware, /"\/stylebook",/);
  assert.doesNotMatch(middleware, /"\/stylebook\(\.\*\)",/);
});

test("production Clerk config prefers the runtime server alias over a baked public development key", () => {
  const names = [
    "NODE_ENV",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  try {
    Reflect.set(process.env, "NODE_ENV", "production");
    Reflect.set(process.env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_baked_fixture");
    Reflect.set(process.env, "CLERK_PUBLISHABLE_KEY", "pk_live_runtime_fixture");
    Reflect.set(process.env, "CLERK_SECRET_KEY", "sk_live_runtime_fixture");

    const state = getClerkConfigState();
    assert.equal(state.publishableKey, "pk_live_runtime_fixture");
    assert.equal(state.publishableKeyType, "live");
    assert.equal(state.secretKeyType, "live");
    assert.equal(state.canUseClerkServer, true);
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else Reflect.set(process.env, name, value);
    }
  }
});

test("Clerk middleware passes runtime keys explicitly instead of SDK build constants", () => {
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");

  assert.doesNotMatch(middleware, /const \{ canUseClerkServer: hasClerkConfig \} = getClerkConfigState\(\)/);
  assert.match(middleware, /const \{ canUseClerkServer \} = getClerkConfigState\(\)/);
  assert.match(middleware, /function getClerkMiddlewareRuntimeOptions\(\)/);
  assert.match(middleware, /publishableKey: publishableKey \?\? undefined/);
  assert.match(middleware, /secretKey: secretKey \?\? undefined/);
  assert.match(middleware, /}, getClerkMiddlewareRuntimeOptions\);/);
});

test("login recovery uses a hard navigation and protected consultation links never prefetch", () => {
  const loginPage = readFileSync(new URL("../app/(auth)/login/[[...rest]]/page.tsx", import.meta.url), "utf8");
  const loginGate = readFileSync(new URL("../components/auth/LoginAuthGate.tsx", import.meta.url), "utf8");
  const protectedEntryFiles = [
    "../app/home/page.tsx",
    "../app/consulting/plans/page.tsx",
    "../components/home/HairstylePreviewShowcase.tsx",
    "../components/home/HeroSection.tsx",
    "../components/home/MobileStickyCtaBar.tsx",
    "../components/home/PremiumOfferPreview.tsx",
    "../components/home/PremiumConsultingShowcases.tsx",
    "../components/home/PricingPreview.tsx",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  assert.match(loginPage, /getSafeClerkReturnPath\(rawReturnPath\)/);
  assert.match(loginPage, /fallbackRedirectUrl=\{returnPath\}/);
  assert.match(loginGate, /window\.location\.replace\(returnPath\)/);
  assert.match(loginGate, /window\.sessionStorage\.getItem\(resumeKey\)/);
  assert.match(loginGate, /AUTH_RESUME_WINDOW_MS = 15_000/);
  assert.match(loginGate, /href=\{returnPath\}>상담 다시 열기/);
  for (const source of protectedEntryFiles) {
    assert.doesNotMatch(
      source,
      /<Link(?=[^>]*href="\/consulting\/new")(?![^>]*prefetch=\{false\})[^>]*>/,
    );
  }
});

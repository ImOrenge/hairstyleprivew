import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authenticatedFetchWithRetry } from "./authenticated-fetch.ts";

test("forces one token refresh and replays a web request after 401", async () => {
  const headers: (string | null)[] = [];
  let requestCount = 0;
  const response = await authenticatedFetchWithRetry(
    "/api/generations/id",
    { method: "GET" },
    {
      getToken: (options) => options?.skipCache ? "fresh-web-token" : "cached-web-token",
      fetchImpl: async (_input, init) => {
        requestCount += 1;
        headers.push(new Headers(init?.headers).get("Authorization"));
        return requestCount === 1
          ? new Response(null, { status: 401 })
          : new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(headers, ["Bearer cached-web-token", "Bearer fresh-web-token"]);
});

test("sends the current Clerk session token on the first web request", async () => {
  const headers: (string | null)[] = [];
  const response = await authenticatedFetchWithRetry(
    "/api/account",
    { cache: "no-store" },
    {
      getToken: () => "email-session-token",
      fetchImpl: async (_input, init) => {
        headers.push(new Headers(init?.headers).get("Authorization"));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(headers, ["Bearer email-session-token"]);
});

test("returns the first 401 when token refresh is unavailable", async () => {
  let requestCount = 0;
  const response = await authenticatedFetchWithRetry(
    "/api/generations/id",
    undefined,
    {
      getToken: async () => {
        throw new Error("offline");
      },
      fetchImpl: async () => {
        requestCount += 1;
        return new Response(null, { status: 401 });
      },
    },
  );

  assert.equal(response.status, 401);
  assert.equal(requestCount, 1);
});

test("account role readers recover one stale Clerk session request", () => {
  const headerAccountContext = readFileSync(
    new URL("../components/layout/HeaderAccountContext.tsx", import.meta.url),
    "utf8",
  );
  const adminReadOnly = readFileSync(
    new URL("../hooks/useAdminReadOnly.ts", import.meta.url),
    "utf8",
  );

  for (const source of [headerAccountContext, adminReadOnly]) {
    assert.match(source, /useAuthenticatedFetch\(\)/);
    assert.match(source, /authenticatedFetch\("\/api\/account"/);
    assert.doesNotMatch(source, /fetch\("\/api\/account"/);
  }
});

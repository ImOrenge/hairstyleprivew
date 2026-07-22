import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedFetchWithRetry } from "./authenticated-fetch.ts";

test("forces one token refresh and replays a web request after 401", async () => {
  const headers: (string | null)[] = [];
  let requestCount = 0;
  const response = await authenticatedFetchWithRetry(
    "/api/generations/id",
    { method: "GET" },
    {
      getToken: (options) => options?.skipCache ? "fresh-web-token" : null,
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
  assert.deepEqual(headers, [null, "Bearer fresh-web-token"]);
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

import { HairfitApiClient, HairfitApiError } from "@hairfit/api-client";

describe("mobile API authentication recovery", () => {
  test("refreshes the Clerk token once and replays an authenticated 401 request", async () => {
    const tokenCalls: ({ skipCache?: boolean } | undefined)[] = [];
    const authorizationHeaders: (string | null)[] = [];
    let requestCount = 0;
    const client = new HairfitApiClient({
      baseUrl: "https://hairfit.test",
      getAuthToken: (options) => {
        tokenCalls.push(options);
        return options?.skipCache ? "fresh-token" : "cached-token";
      },
      fetchImpl: jest.fn(async (_input, init) => {
        requestCount += 1;
        authorizationHeaders.push(new Headers(init?.headers).get("Authorization"));
        return requestCount === 1
          ? new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
          : new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as typeof fetch,
    });

    await expect(client.request<{ ok: true }>("/api/mobile/me")).resolves.toEqual({ ok: true });
    expect(tokenCalls).toEqual([undefined, { skipCache: true }]);
    expect(authorizationHeaders).toEqual(["Bearer cached-token", "Bearer fresh-token"]);
  });

  test("does not refresh or replay public requests", async () => {
    const getAuthToken = jest.fn(() => "token");
    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })) as typeof fetch;
    const client = new HairfitApiClient({
      baseUrl: "https://hairfit.test",
      getAuthToken,
      fetchImpl,
    });

    await expect(client.request("/public", { auth: false })).rejects.toEqual(
      expect.objectContaining<Partial<HairfitApiError>>({ status: 401 }),
    );
    expect(getAuthToken).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

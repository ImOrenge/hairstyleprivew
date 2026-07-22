export interface AuthenticatedFetchDependencies {
  fetchImpl?: typeof fetch;
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null> | string | null;
}

export async function authenticatedFetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  dependencies: AuthenticatedFetchDependencies,
) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let response = await fetchImpl(input, init);
  if (response.status !== 401) return response;

  try {
    const refreshedToken = await dependencies.getToken({ skipCache: true });
    if (!refreshedToken) return response;

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${refreshedToken}`);
    response = await fetchImpl(input, { ...init, headers });
  } catch {
    // Keep the first 401 so the feature can preserve its own return target.
  }

  return response;
}

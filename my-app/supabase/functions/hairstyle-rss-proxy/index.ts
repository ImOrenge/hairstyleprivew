/**
 * hairstyle-rss-proxy
 * Internal Google News RSS egress for the Cloudflare catalog rotation worker.
 */

const GOOGLE_NEWS_HOST = "news.google.com";
const GOOGLE_NEWS_PATH = "/rss/search";
const MAX_REQUEST_URL_LENGTH = 2048;
const MAX_QUERY_LENGTH = 500;
const MAX_RESPONSE_BYTES = 1_500_000;
const UPSTREAM_TIMEOUT_MS = 12_000;
const ALLOWED_QUERY_PARAMETERS = new Set(["q", "hl", "gl", "ceid"]);

function jsonResponse(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readBearerToken(value: string | null) {
  const match = value?.trim().match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function isAuthorizedRequest(request: Request) {
  const serviceRoleKey = (
    Deno.env.get("HAIRSTYLE_CATALOG_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    ""
  ).trim();
  if (!serviceRoleKey) return false;

  const apiKey = request.headers.get("apikey")?.trim() ?? "";
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  return apiKey === serviceRoleKey || bearerToken === serviceRoleKey;
}

function validateGoogleNewsUrl(value: unknown) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_REQUEST_URL_LENGTH) {
    throw new Error("invalid_url");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_url");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== GOOGLE_NEWS_HOST ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== GOOGLE_NEWS_PATH ||
    url.hash
  ) {
    throw new Error("url_not_allowed");
  }

  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMETERS.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new Error("query_parameters_not_allowed");
    }
  }

  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > MAX_QUERY_LENGTH) throw new Error("invalid_query");
  if (
    url.searchParams.get("hl") !== "ko" ||
    url.searchParams.get("gl") !== "KR" ||
    url.searchParams.get("ceid") !== "KR:ko"
  ) {
    throw new Error("locale_not_allowed");
  }

  return url;
}

async function readLimitedText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("response_too_large");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("response_too_large");
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(405, "Method not allowed");
  if (!isAuthorizedRequest(request)) return jsonResponse(401, "Unauthorized");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, "Invalid JSON body");
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = validateGoogleNewsUrl(
      typeof payload === "object" && payload !== null && "url" in payload
        ? (payload as { url?: unknown }).url
        : undefined,
    );
  } catch {
    return jsonResponse(400, "Google News RSS URL is not allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(upstreamUrl, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        "user-agent": "HairFitCatalogResearch/1.0",
      },
    });

    if (!response.ok) {
      return jsonResponse(response.status === 429 || response.status >= 500 ? 503 : 502, "RSS upstream failed");
    }

    const xml = await readLimitedText(response);
    if (!/<rss(?:\s|>)/i.test(xml)) return jsonResponse(502, "RSS upstream returned invalid content");

    return new Response(xml, {
      status: 200,
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return jsonResponse(timedOut ? 504 : 502, timedOut ? "RSS upstream timed out" : "RSS proxy failed");
  } finally {
    clearTimeout(timeout);
  }
});

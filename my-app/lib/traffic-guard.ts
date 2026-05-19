import { NextResponse, type NextRequest } from "next/server";

type RateLimitRule = {
  name: string;
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
  lastSeenAt: number;
};

const ONE_MINUTE_MS = 60_000;
const RATE_LIMIT_BUCKET_LIMIT = 8_000;
const RATE_LIMIT_PRUNE_INTERVAL_MS = ONE_MINUTE_MS;

const rateLimitBuckets = new Map<string, RateLimitBucket>();
let lastRateLimitPruneAt = 0;

const apiReadRule: RateLimitRule = { name: "api-read", limit: 180, windowMs: ONE_MINUTE_MS };
const apiMutationRule: RateLimitRule = { name: "api-mutation", limit: 80, windowMs: ONE_MINUTE_MS };
const expensiveApiRule: RateLimitRule = { name: "expensive-api", limit: 30, windowMs: ONE_MINUTE_MS };
const publicPageRule: RateLimitRule = { name: "public-page", limit: 240, windowMs: ONE_MINUTE_MS };
const protectedPageRule: RateLimitRule = { name: "protected-page", limit: 120, windowMs: ONE_MINUTE_MS };

const protectedPrefixes = [
  "/admin",
  "/aftercare",
  "/generate",
  "/home",
  "/mypage",
  "/personal-color",
  "/result",
  "/salon",
  "/styler",
  "/upload",
  "/workspace",
];

const authPrefixes = ["/login", "/signup", "/b2b/signup"];

const scannerPathPatterns = [
  /^\/(?:\.env|\.git|\.svn|\.hg)(?:\/|$)/,
  /^\/(?:wp-admin|wp-content|wp-includes|wp-login\.php|xmlrpc\.php)(?:\/|$)/,
  /^\/(?:phpmyadmin|pma|adminer|mysql|vendor\/phpunit)(?:\/|$)/,
  /^\/(?:actuator|server-status|cgi-bin|owa|HNAP1)(?:\/|$)/i,
  /(?:\.\.\/|%2e%2e|%5c|\\)/i,
];

const expensiveApiPathPatterns = [
  /^\/api\/generations\/run(?:\/|$)/,
  /^\/api\/prompts\/generate(?:\/|$)/,
  /^\/api\/personal-color\/analyze(?:\/|$)/,
  /^\/api\/result-translations(?:\/|$)/,
  /^\/api\/styling\/generate(?:\/|$)/,
  /^\/api\/salon\/customers\/[^/]+\/workspace\/recommendations(?:\/|$)/,
  /^\/api\/style-profile\/body-photo(?:\/|$)/,
  /^\/api\/hair-records(?:\/|$)/,
];

const blockedUserAgentPatterns = [
  /(?:ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|dataforseobot)/i,
  /(?:gptbot|chatgpt-user|ccbot|claudebot|anthropic-ai|perplexitybot|amazonbot|applebot-extended)/i,
  /(?:blexbot|barkrowler|serpstatbot|megaindex|seokicks|yandexbot|baiduspider|sogou)/i,
  /(?:python-requests|scrapy|libwww-perl|wget|curl|go-http-client|java\/|nikto|sqlmap|masscan|nmap)/i,
  /(?:headlesschrome|phantomjs|puppeteer|playwright)/i,
];

const crawlerPolicyPaths = new Set(["/robots.txt", "/sitemap.xml"]);

function normalizePath(pathname: string) {
  return pathname.toLowerCase();
}

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isWebhookPath(pathname: string) {
  return pathname === "/api/payments/webhook" || pathname === "/api/email/inbound/cloudflare";
}

function isMobileApiPath(pathname: string) {
  return pathname === "/api/mobile" || pathname.startsWith("/api/mobile/");
}

function isMutationMethod(method: string) {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

function isExpensiveApiPath(pathname: string) {
  return expensiveApiPathPatterns.some((pattern) => pattern.test(pathname));
}

function isScannerPath(pathname: string) {
  return scannerPathPatterns.some((pattern) => pattern.test(pathname));
}

function hasBlockedUserAgent(userAgent: string) {
  return blockedUserAgentPatterns.some((pattern) => pattern.test(userAgent));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getClientAddress(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    forwardedFor ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function getCredentialKey(req: NextRequest) {
  const authorization = req.headers.get("authorization")?.trim();
  const clerkSession = req.cookies.get("__session")?.value?.trim();
  const credential = authorization || clerkSession;

  return credential ? `credential:${stableHash(credential)}` : null;
}

function getClientKey(req: NextRequest) {
  const credentialKey = getCredentialKey(req);
  if (credentialKey) {
    return credentialKey;
  }

  const userAgent = req.headers.get("user-agent")?.trim() || "missing-user-agent";
  return `client:${stableHash(`${getClientAddress(req)}|${userAgent}`)}`;
}

function pruneRateLimitBuckets(now: number) {
  if (
    rateLimitBuckets.size < RATE_LIMIT_BUCKET_LIMIT &&
    now - lastRateLimitPruneAt < RATE_LIMIT_PRUNE_INTERVAL_MS
  ) {
    return;
  }

  lastRateLimitPruneAt = now;

  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now || bucket.lastSeenAt + 10 * ONE_MINUTE_MS <= now) {
      rateLimitBuckets.delete(key);
    }
  }

  if (rateLimitBuckets.size <= RATE_LIMIT_BUCKET_LIMIT) {
    return;
  }

  const staleCount = rateLimitBuckets.size - RATE_LIMIT_BUCKET_LIMIT;
  let deleted = 0;
  for (const key of rateLimitBuckets.keys()) {
    rateLimitBuckets.delete(key);
    deleted += 1;
    if (deleted >= staleCount) {
      break;
    }
  }
}

function selectRateLimitRule(req: NextRequest): RateLimitRule | null {
  const pathname = normalizePath(req.nextUrl.pathname);

  if (req.method === "OPTIONS" || crawlerPolicyPaths.has(pathname) || isWebhookPath(pathname)) {
    return null;
  }

  if (isApiPath(pathname)) {
    if (isExpensiveApiPath(pathname)) {
      return expensiveApiRule;
    }

    return isMutationMethod(req.method) ? apiMutationRule : apiReadRule;
  }

  return startsWithAny(pathname, protectedPrefixes) || startsWithAny(pathname, authPrefixes)
    ? protectedPageRule
    : publicPageRule;
}

function rateLimit(req: NextRequest, rule: RateLimitRule) {
  const now = Date.now();
  pruneRateLimitBuckets(now);

  const key = `${rule.name}:${getClientKey(req)}`;
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + rule.windowMs,
      lastSeenAt: now,
    });
    return null;
  }

  current.count += 1;
  current.lastSeenAt = now;

  if (current.count <= rule.limit) {
    return null;
  }

  return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
}

function guardedResponse(req: NextRequest, status: number, message: string, retryAfterSeconds?: number) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  if (retryAfterSeconds) {
    headers.set("Retry-After", String(retryAfterSeconds));
  }

  if (isApiPath(normalizePath(req.nextUrl.pathname))) {
    return NextResponse.json({ error: message }, { status, headers });
  }

  return new NextResponse(message, { status, headers });
}

export function enforceTrafficGuard(req: NextRequest) {
  const pathname = normalizePath(req.nextUrl.pathname);

  if (crawlerPolicyPaths.has(pathname) || isWebhookPath(pathname)) {
    return null;
  }

  if (isScannerPath(pathname)) {
    return guardedResponse(req, 404, "Not found");
  }

  const userAgent = req.headers.get("user-agent")?.trim() || "";
  const shouldSkipUserAgentBlock = isMobileApiPath(pathname);

  if (!shouldSkipUserAgentBlock && userAgent && hasBlockedUserAgent(userAgent)) {
    return guardedResponse(req, 403, "Automated traffic is not allowed");
  }

  const rule = selectRateLimitRule(req);
  if (!rule) {
    return null;
  }

  const retryAfterSeconds = rateLimit(req, rule);
  if (retryAfterSeconds) {
    return guardedResponse(req, 429, "Too many requests", retryAfterSeconds);
  }

  return null;
}

export function withTrafficSecurityHeaders(req: NextRequest, response: NextResponse) {
  const pathname = normalizePath(req.nextUrl.pathname);

  if (isApiPath(pathname) || startsWithAny(pathname, protectedPrefixes) || startsWithAny(pathname, authPrefixes)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  if (isApiPath(pathname)) {
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
}

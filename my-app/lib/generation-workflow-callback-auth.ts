const GENERATION_WORKFLOW_CALLBACK_HEADER = "x-hairfit-generation-secret";
const CALLBACK_PROOF_MESSAGE = new TextEncoder().encode(
  "hairfit-generation-workflow-callback-v1",
);
const GENERATION_ID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const GENERATION_DETAIL_CALLBACK_PATTERN = new RegExp(
  `^/api/generations/${GENERATION_ID_PATTERN}/(?:notify|cleanup-original)/?$`,
  "i",
);
const STYLING_DETAIL_CALLBACK_PATTERN = new RegExp(
  `^/api/styling/${GENERATION_ID_PATTERN}/notify/?$`,
  "i",
);
const EXACT_GENERATION_CALLBACK_PATHS = new Set([
  "/api/generations/run",
  "/api/generations/prepare",
  "/api/generations/workflow-dispatch",
  "/api/generations/cleanup-stale-originals",
  "/api/generations/notifications/drain",
  "/api/styling/run",
  "/api/styling/fail",
  "/api/styling/workflow-dispatch",
  "/api/styling/notifications/drain",
]);
const MIN_CALLBACK_SECRET_BYTES = 32;
const UNSAFE_SECRET_PATTERN = /^(?:your_|change[_-]?me|example|placeholder|test|secret)/i;
const LOCAL_CALLBACK_DERIVATION_PREFIX = "hairfit-local-generation-callback-v1:";
const CALLBACK_SECRET_FINGERPRINT_PREFIX = "hairfit-generation-callback-fingerprint-v1:";
const CALLBACK_SECRET_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

function isLoopbackHostname(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}

export async function getLocalGenerationWorkflowCallbackSecret() {
  if (process.env.NODE_ENV !== "development") return null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (serviceRoleKey.length < 32) return null;

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${LOCAL_CALLBACK_DERIVATION_PREFIX}${serviceRoleKey}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isStrongGenerationWorkflowCallbackSecret(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (
    new TextEncoder().encode(normalized).byteLength < MIN_CALLBACK_SECRET_BYTES ||
    UNSAFE_SECRET_PATTERN.test(normalized)
  ) {
    return false;
  }

  return new Set(normalized).size >= 12;
}

export function isGenerationWorkflowCallbackSecretFingerprint(value: string | null | undefined) {
  return CALLBACK_SECRET_FINGERPRINT_PATTERN.test(value?.trim().toLowerCase() ?? "");
}

export async function getGenerationWorkflowCallbackSecretFingerprint(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${CALLBACK_SECRET_FINGERPRINT_PREFIX}${value.trim()}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function matchesConfiguredCallbackSecretFingerprint(secret: string) {
  const configured = process.env.GENERATION_WORKFLOW_CALLBACK_SECRET_FINGERPRINT?.trim().toLowerCase() ?? "";
  if (!configured) return process.env.NODE_ENV !== "production";
  if (!isGenerationWorkflowCallbackSecretFingerprint(configured)) return false;
  return (await getGenerationWorkflowCallbackSecretFingerprint(secret)) === configured;
}

export function isGenerationWorkflowCallbackPath(pathname: string) {
  const normalizedPath = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;

  return (
    EXACT_GENERATION_CALLBACK_PATHS.has(normalizedPath) ||
    GENERATION_DETAIL_CALLBACK_PATTERN.test(normalizedPath) ||
    STYLING_DETAIL_CALLBACK_PATTERN.test(normalizedPath)
  );
}

async function verifySecretWithWebCrypto(supplied: string, expected: string) {
  try {
    const encoder = new TextEncoder();
    const algorithm = { name: "HMAC", hash: "SHA-256" } as const;
    const [expectedKey, suppliedKey] = await Promise.all([
      crypto.subtle.importKey(
        "raw",
        encoder.encode(expected),
        algorithm,
        false,
        ["verify"],
      ),
      crypto.subtle.importKey(
        "raw",
        encoder.encode(supplied),
        algorithm,
        false,
        ["sign"],
      ),
    ]);
    const suppliedProof = await crypto.subtle.sign(
      "HMAC",
      suppliedKey,
      CALLBACK_PROOF_MESSAGE,
    );

    return crypto.subtle.verify(
      "HMAC",
      expectedKey,
      suppliedProof,
      CALLBACK_PROOF_MESSAGE,
    );
  } catch {
    return false;
  }
}

export async function hasValidGenerationWorkflowCallbackSecret(
  request: Request,
  expectedSecret?: string,
) {
  const supplied = request.headers.get(GENERATION_WORKFLOW_CALLBACK_HEADER)?.trim() ?? "";
  if (!supplied) return false;

  const configuredExpected = (
    expectedSecret ?? process.env.GENERATION_WORKFLOW_CALLBACK_SECRET
  )?.trim() ?? "";
  const candidates = isStrongGenerationWorkflowCallbackSecret(configuredExpected)
    ? [configuredExpected]
    : [];

  if (
    expectedSecret === undefined &&
    candidates.length > 0 &&
    !(await matchesConfiguredCallbackSecretFingerprint(candidates[0]))
  ) {
    candidates.length = 0;
  }

  if (expectedSecret === undefined && isLoopbackHostname(new URL(request.url).hostname)) {
    const localExpected = await getLocalGenerationWorkflowCallbackSecret();
    if (localExpected) candidates.push(localExpected);
  }

  for (const candidate of candidates) {
    if (await verifySecretWithWebCrypto(supplied, candidate)) return true;
  }
  return false;
}

export async function isAuthorizedGenerationWorkflowCallback(
  request: Request,
  expectedSecret = process.env.GENERATION_WORKFLOW_CALLBACK_SECRET,
) {
  const pathname = new URL(request.url).pathname;
  return (
    isGenerationWorkflowCallbackPath(pathname) &&
    hasValidGenerationWorkflowCallbackSecret(request, expectedSecret)
  );
}

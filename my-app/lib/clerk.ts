import { validateResumeTargetPath } from "@hairfit/shared/auth/resume-target";

type KeyType = "test" | "live" | null;

export type ClerkConfigIssue = "missing_keys" | "mismatched_key_types" | "non_live_production_keys" | null;

export type ClerkConfigState = {
  publishableKey: string | null;
  secretKey: string | null;
  publishableKeyType: KeyType;
  secretKeyType: KeyType;
  isLocalDevelopment: boolean;
  canUseClerkFrontend: boolean;
  canUseClerkServer: boolean;
  issue: ClerkConfigIssue;
};

function isLocalDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function requiresLiveClerkKeys() {
  return process.env.NODE_ENV === "production";
}

function readEnvKey(name: string) {
  const key = process.env[name];
  if (typeof key !== "string") {
    return null;
  }

  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLivePublishableKey(value: string | null) {
  return typeof value === "string" && value.startsWith("pk_live_");
}

function readPublishableKey() {
  const publicKey = readEnvKey("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const serverKey = readEnvKey("CLERK_PUBLISHABLE_KEY");

  if (requiresLiveClerkKeys()) {
    return (
      (isLivePublishableKey(serverKey) ? serverKey : null) ??
      (isLivePublishableKey(publicKey) ? publicKey : null) ??
      serverKey ??
      publicKey
    );
  }

  return publicKey ?? serverKey;
}

function readSecretKey() {
  return readSecretKeyFromEnv("CLERK_SECRET_KEY");
}

function readSecretKeyFromEnv(name: string) {
  return readEnvKey(name);
}

function isPlaceholder(value: string | null) {
  return typeof value === "string" && value.includes("YOUR_");
}

function getPublishableKeyType(value: string | null): KeyType {
  if (!value) {
    return null;
  }
  if (value.startsWith("pk_test_")) {
    return "test";
  }
  if (value.startsWith("pk_live_")) {
    return "live";
  }
  return null;
}

function getSecretKeyType(value: string | null): KeyType {
  if (!value) {
    return null;
  }
  if (value.startsWith("sk_test_")) {
    return "test";
  }
  if (value.startsWith("sk_live_")) {
    return "live";
  }
  return null;
}

export function getClerkConfigState(): ClerkConfigState {
  const publishableKey = readPublishableKey();
  const secretKey = readSecretKey();
  const publishableKeyType = getPublishableKeyType(publishableKey);
  const secretKeyType = getSecretKeyType(secretKey);
  const localDevelopment = isLocalDevelopment();
  const liveKeysRequired = requiresLiveClerkKeys();

  const hasValidPublishableKey = Boolean(publishableKeyType) && !isPlaceholder(publishableKey);
  const hasValidSecretKey = Boolean(secretKeyType) && !isPlaceholder(secretKey);
  const hasProductionPublishableKey = !liveKeysRequired || publishableKeyType === "live";
  const hasProductionSecretKey = !liveKeysRequired || secretKeyType === "live";

  const usesMismatchedKeyTypes = Boolean(
    publishableKeyType &&
      secretKeyType &&
      publishableKeyType !== secretKeyType,
  );
  const usesNonLiveProductionKeys = Boolean(
    liveKeysRequired &&
      ((publishableKeyType && publishableKeyType !== "live") ||
        (secretKeyType && secretKeyType !== "live")),
  );

  const canUseClerkFrontend =
    hasValidPublishableKey &&
    hasProductionPublishableKey &&
    (!liveKeysRequired || (hasValidSecretKey && hasProductionSecretKey));
  const canUseClerkServer =
    hasValidPublishableKey &&
    hasValidSecretKey &&
    hasProductionPublishableKey &&
    hasProductionSecretKey &&
    !usesMismatchedKeyTypes;

  let issue: ClerkConfigIssue = null;
  if (!hasValidPublishableKey || !hasValidSecretKey) {
    issue = "missing_keys";
  } else if (usesNonLiveProductionKeys) {
    issue = "non_live_production_keys";
  } else if (usesMismatchedKeyTypes) {
    issue = "mismatched_key_types";
  }

  return {
    publishableKey,
    secretKey,
    publishableKeyType,
    secretKeyType,
    isLocalDevelopment: localDevelopment,
    canUseClerkFrontend,
    canUseClerkServer,
    issue,
  };
}

export function getDevClerkSalonUserIds() {
  if (!isLocalDevelopment()) {
    return [];
  }

  const raw = process.env.DEV_CLERK_SALON_USER_IDS?.trim() || process.env.DEV_CLERK_SALON_USER_ID?.trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isDevClerkSalonUserId(userId: string | null | undefined) {
  if (!userId) {
    return false;
  }

  return getDevClerkSalonUserIds().includes(userId);
}

export function isClerkConfigured() {
  return getClerkConfigState().canUseClerkServer;
}

export function getProductionClerkSecretKey() {
  const explicitProductionKey =
    readSecretKeyFromEnv("CLERK_SOCIAL_PROOF_SECRET_KEY") ?? readSecretKeyFromEnv("CLERK_PRODUCTION_SECRET_KEY");
  const candidate = explicitProductionKey ?? readSecretKey();

  if (getSecretKeyType(candidate) !== "live" || isPlaceholder(candidate)) {
    return null;
  }

  return candidate;
}

export function getClerkSignInPath() {
  return "/login";
}

export function getClerkSignUpPath() {
  return "/signup";
}

const CLERK_RETURN_PATH_ORIGIN = "https://hairfit.invalid";
const MAX_CLERK_RETURN_PATH_LENGTH = 2048;
const UNSAFE_RETURN_PATH_CHARACTERS = /[\\\u0000-\u001f\u007f]/;

function decodeReturnPathForSafety(value: string) {
  let decoded = value;

  try {
    for (let index = 0; index < 2; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return null;
  }

  return decoded;
}

export function getSafeClerkReturnPath(returnBackPath?: string | null) {
  const normalized = (returnBackPath ?? "").trim();
  if (!normalized || normalized.length > MAX_CLERK_RETURN_PATH_LENGTH) return null;
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return null;
  if (UNSAFE_RETURN_PATH_CHARACTERS.test(normalized)) return null;

  const decoded = decodeReturnPathForSafety(normalized);
  if (!decoded || decoded.startsWith("//") || UNSAFE_RETURN_PATH_CHARACTERS.test(decoded)) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalized, CLERK_RETURN_PATH_ORIGIN);
  } catch {
    return null;
  }

  if (parsed.origin !== CLERK_RETURN_PATH_ORIGIN || parsed.username || parsed.password) return null;

  let pathname = parsed.pathname;
  if (pathname.startsWith("/generate/")) {
    const generationPath = validateResumeTargetPath(pathname);
    if (!generationPath) return null;
    pathname = generationPath;
  }

  return `${pathname}${parsed.search}${parsed.hash}`;
}

export function buildSignInRedirectUrl(returnBackPath?: string | null) {
  const basePath = getClerkSignInPath();
  const safeReturnPath = getSafeClerkReturnPath(returnBackPath);
  if (!safeReturnPath) {
    return basePath;
  }

  const encoded = encodeURIComponent(safeReturnPath);
  return `${basePath}?redirect_url=${encoded}`;
}

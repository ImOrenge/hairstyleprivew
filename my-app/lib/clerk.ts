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

export function buildSignInRedirectUrl(returnBackPath?: string | null) {
  const basePath = getClerkSignInPath();
  const normalized = (returnBackPath ?? "").trim();
  if (!normalized) {
    return basePath;
  }

  // Prevent external open redirects; only allow app-relative paths.
  if (!normalized.startsWith("/")) {
    return basePath;
  }

  const encoded = encodeURIComponent(normalized);
  return `${basePath}?redirect_url=${encoded}`;
}

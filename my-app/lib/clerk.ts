type KeyType = "test" | "live" | null;

export type ClerkConfigIssue = "missing_keys" | "mismatched_key_types" | null;

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

function readPublishableKey() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY;
  if (typeof key !== "string") {
    return null;
  }

  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readSecretKey() {
  const key = process.env.CLERK_SECRET_KEY;
  if (typeof key !== "string") {
    return null;
  }

  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  const isLocalDevelopment = process.env.NODE_ENV !== "production";

  const hasValidPublishableKey = Boolean(publishableKeyType) && !isPlaceholder(publishableKey);
  const hasValidSecretKey = Boolean(secretKeyType) && !isPlaceholder(secretKey);

  const usesMismatchedKeyTypes = Boolean(
    publishableKeyType &&
      secretKeyType &&
      publishableKeyType !== secretKeyType,
  );

  const canUseClerkFrontend = hasValidPublishableKey;
  const canUseClerkServer = hasValidPublishableKey && hasValidSecretKey && !usesMismatchedKeyTypes;

  let issue: ClerkConfigIssue = null;
  if (!hasValidPublishableKey || !hasValidSecretKey) {
    issue = "missing_keys";
  } else if (usesMismatchedKeyTypes) {
    issue = "mismatched_key_types";
  }

  return {
    publishableKey,
    secretKey,
    publishableKeyType,
    secretKeyType,
    isLocalDevelopment,
    canUseClerkFrontend,
    canUseClerkServer,
    issue,
  };
}

export function isClerkConfigured() {
  return getClerkConfigState().canUseClerkServer;
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

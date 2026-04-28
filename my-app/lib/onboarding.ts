export const ACCOUNT_TYPES = ["member", "salon_owner", "admin"] as const;
export const ONBOARDING_ACCOUNT_TYPES = ["member", "salon_owner"] as const;
export const MEMBER_STYLE_TARGETS = ["male", "female", "neutral"] as const;
export const MEMBER_STYLE_TONES = ["natural", "trendy", "soft", "bold"] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type OnboardingAccountType = (typeof ONBOARDING_ACCOUNT_TYPES)[number];
export type MemberStyleTarget = (typeof MEMBER_STYLE_TARGETS)[number];
export type MemberStyleTone = (typeof MEMBER_STYLE_TONES)[number];

const DEFAULT_RETURN_URL = "/mypage";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === "string" && ACCOUNT_TYPES.includes(value as AccountType);
}

export function isOnboardingAccountType(value: unknown): value is OnboardingAccountType {
  return typeof value === "string" && ONBOARDING_ACCOUNT_TYPES.includes(value as OnboardingAccountType);
}

export function isMemberStyleTarget(value: unknown): value is MemberStyleTarget {
  return typeof value === "string" && MEMBER_STYLE_TARGETS.includes(value as MemberStyleTarget);
}

export function isMemberStyleTone(value: unknown): value is MemberStyleTone {
  return typeof value === "string" && MEMBER_STYLE_TONES.includes(value as MemberStyleTone);
}

export function normalizeAppPath(value: string | null | undefined, fallback = DEFAULT_RETURN_URL): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  return trimmed;
}

export function buildOnboardingRedirectUrl(returnBackPath?: string | null) {
  const normalized = normalizeAppPath(returnBackPath, DEFAULT_RETURN_URL);
  if (normalized === DEFAULT_RETURN_URL) {
    return "/onboarding";
  }

  return `/onboarding?return_url=${encodeURIComponent(normalized)}`;
}

export function parseOnboardingMetadata(metadata: unknown) {
  if (!isPlainObject(metadata)) {
    return {
      accountType: null as AccountType | null,
      onboardingComplete: false,
    };
  }

  return {
    accountType: isAccountType(metadata.accountType) ? metadata.accountType : null,
    onboardingComplete: metadata.onboardingComplete === true,
  };
}

export function trimText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

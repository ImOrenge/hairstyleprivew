export type GenerationEntryPlatform = "web" | "native";
export type GenerationEntryAccountType = "member" | "salon_owner" | "admin" | null;
export type GenerationEntryStyleTarget = "male" | "female";
export type AccountSetupContinuation = "generation-upload" | "generation-submit";

export type GenerationEntryDecision =
  | Readonly<{ kind: "allow" }>
  | Readonly<{ kind: "account-setup"; path: string }>
  | Readonly<{ kind: "role-home"; path: string }>;

export const ACCOUNT_SETUP_CONTINUATION_QUERY_KEY = "continue" as const;

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseAccountSetupContinuation(value: unknown): AccountSetupContinuation | null {
  const candidate = firstQueryValue(value);
  return candidate === "generation-upload" || candidate === "generation-submit"
    ? candidate
    : null;
}

export function getGenerationAccountSetupPath(continuation: AccountSetupContinuation) {
  const query = new URLSearchParams({
    tab: "account",
    setup: "1",
    [ACCOUNT_SETUP_CONTINUATION_QUERY_KEY]: continuation,
  });
  return `/mypage?${query.toString()}`;
}

export function getGenerationContinuationPath(
  continuation: AccountSetupContinuation,
  platform: GenerationEntryPlatform,
) {
  if (continuation === "generation-submit") {
    return platform === "web" ? "/workspace?nextStep=generate" : "/generate";
  }

  return platform === "web" ? "/workspace" : "/upload";
}

export function resolveGenerationEntryDecision({
  accountSetupComplete,
  accountType,
  continuation = "generation-upload",
  styleTarget,
}: {
  accountSetupComplete: boolean;
  accountType: GenerationEntryAccountType;
  continuation?: AccountSetupContinuation;
  /** `undefined` means the profile field could not be loaded and metadata is the best available source. */
  styleTarget?: GenerationEntryStyleTarget | null;
}): GenerationEntryDecision {
  if (accountType === "salon_owner") {
    return { kind: "role-home", path: "/salon/customers" };
  }

  if (accountType === "admin") {
    return { kind: "allow" };
  }

  const hasKnownRequiredProfile = styleTarget === undefined || styleTarget === "male" || styleTarget === "female";
  if (accountType === "member" && accountSetupComplete && hasKnownRequiredProfile) {
    return { kind: "allow" };
  }

  return {
    kind: "account-setup",
    path: getGenerationAccountSetupPath(continuation),
  };
}

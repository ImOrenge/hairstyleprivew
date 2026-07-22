import { CANONICAL_GENERATION_STEP_PATH } from "./canonical-generation-entry.ts";

export const DEFAULT_BILLING_RETURN_TARGET = "/mypage";

const SALON_WORKSPACE_RETURN_TARGET_PATTERN =
  /^\/salon\/customers\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})\/workspace$/;
const RESULT_RETURN_TARGET_PATTERN =
  /^\/result\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})\?variant=([A-Za-z0-9._~-]{1,128})$/;
const STYLER_RETURN_TARGET_PATTERN =
  /^\/styler\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/;

/**
 * Keeps paid-action checkout redirects on an exact, server-owned allowlist.
 * The framework has already decoded one normal query-string layer; decoding
 * again here would turn double-encoded attacker input into a valid path.
 */
export function normalizeBillingReturnTarget(value: unknown): string {
  if (value === "/generate" || value === CANONICAL_GENERATION_STEP_PATH) {
    return CANONICAL_GENERATION_STEP_PATH;
  }
  if (typeof value !== "string") {
    return DEFAULT_BILLING_RETURN_TARGET;
  }

  const resultMatch = value.match(RESULT_RETURN_TARGET_PATTERN);
  if (resultMatch) {
    return `/result/${resultMatch[1].toLowerCase()}?variant=${resultMatch[2]}`;
  }

  const stylerMatch = value.match(STYLER_RETURN_TARGET_PATTERN);
  if (stylerMatch) {
    return `/styler/${stylerMatch[1].toLowerCase()}`;
  }

  const salonWorkspaceMatch = value.match(SALON_WORKSPACE_RETURN_TARGET_PATTERN);
  if (!salonWorkspaceMatch) {
    return DEFAULT_BILLING_RETURN_TARGET;
  }

  return `/salon/customers/${salonWorkspaceMatch[1].toLowerCase()}/workspace`;
}

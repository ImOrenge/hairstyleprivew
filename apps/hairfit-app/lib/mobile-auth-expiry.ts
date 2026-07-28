import { isMobileAuthExpired } from "./mobile-user-message";

export const MOBILE_AUTH_RETRY_LIMIT = 1;
export const MOBILE_AUTH_RETRY_DELAY_MS = 600;

export type MobileAuthRecoveryDecision = "ignore" | "retry" | "reconnect";

export function resolveMobileAuthRecovery(
  error: unknown,
  retryCount: number,
): MobileAuthRecoveryDecision {
  if (!isMobileAuthExpired(error)) return "ignore";
  return retryCount < MOBILE_AUTH_RETRY_LIMIT ? "retry" : "reconnect";
}

export function waitForMobileAuthRetry(delayMs = MOBILE_AUTH_RETRY_DELAY_MS) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

import { isMobileAuthExpired } from "./mobile-user-message";

export interface MobileAuthExpiryActions {
  navigateToLogin(): void;
  signOut(): Promise<unknown>;
}

export function recoverMobileAuthExpiry(
  error: unknown,
  actions: MobileAuthExpiryActions,
) {
  if (!isMobileAuthExpired(error)) return false;

  actions.navigateToLogin();
  void actions.signOut().catch(() => undefined);
  return true;
}

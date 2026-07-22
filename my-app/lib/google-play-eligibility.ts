import type { GooglePlayProductType } from "@hairfit/shared";

export type GooglePlayEligibilityReason =
  | "eligible"
  | "subscription_required"
  | "active_subscription"
  | "portone_recurring";

export function evaluateGooglePlayEligibility(
  productType: GooglePlayProductType,
  subscription: {
    active: boolean;
    provider: "google_play" | "portone" | null;
    hasPortoneBillingKey: boolean;
    isLegacyMobile: boolean;
  },
): { eligible: boolean; reason: GooglePlayEligibilityReason } {
  if (productType === "consumable") {
    return subscription.active
      ? { eligible: true, reason: "eligible" }
      : { eligible: false, reason: "subscription_required" };
  }
  if (!subscription.active) return { eligible: true, reason: "eligible" };
  if (subscription.provider === "google_play") {
    return { eligible: false, reason: "active_subscription" };
  }
  if (!subscription.hasPortoneBillingKey && subscription.isLegacyMobile) {
    return { eligible: true, reason: "eligible" };
  }
  return { eligible: false, reason: "portone_recurring" };
}

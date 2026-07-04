export const SUBSCRIPTION_ACCESS_MODES = ["waitlist", "checkout"] as const;

export type SubscriptionAccessMode = (typeof SUBSCRIPTION_ACCESS_MODES)[number];

export function isSubscriptionAccessMode(value: unknown): value is SubscriptionAccessMode {
  return typeof value === "string" && SUBSCRIPTION_ACCESS_MODES.includes(value as SubscriptionAccessMode);
}

export function getSubscriptionAccessMode(): SubscriptionAccessMode {
  const raw =
    process.env.SUBSCRIPTION_ACCESS_MODE?.trim().toLowerCase() ||
    process.env.NEXT_PUBLIC_SUBSCRIPTION_ACCESS_MODE?.trim().toLowerCase();

  return raw === "checkout" ? "checkout" : "waitlist";
}

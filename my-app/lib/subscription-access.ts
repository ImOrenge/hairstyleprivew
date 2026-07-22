export const SUBSCRIPTION_ACCESS_MODES = ["waitlist", "checkout"] as const;

export type SubscriptionAccessMode = (typeof SUBSCRIPTION_ACCESS_MODES)[number];

export function isSubscriptionAccessMode(value: unknown): value is SubscriptionAccessMode {
  return typeof value === "string" && SUBSCRIPTION_ACCESS_MODES.includes(value as SubscriptionAccessMode);
}

export function getSubscriptionAccessMode(): SubscriptionAccessMode {
  // PG 심사와 실결제 운영 전환을 위해 웨잇리스트 진입을 비활성화한다.
  return "checkout";
}

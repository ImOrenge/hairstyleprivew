import type { SelfServeBillingPlanKey } from "./billing-plan";

export const PORTONE_PAYMENT_ID_MAX_LENGTH = 32;
export const PORTONE_BILLING_KEY_ISSUE_ID_MAX_LENGTH = 40;

type PortonePaymentIdSource = "sub" | "mob" | "ren";

const PLAN_CODE: Record<SelfServeBillingPlanKey, string> = {
  basic: "b",
  standard: "s",
  pro: "p",
};

function randomToken(length: number): string {
  const uuid = globalThis.crypto?.randomUUID?.().replaceAll("-", "");
  if (uuid) return uuid.slice(0, length);

  return Math.random()
    .toString(36)
    .slice(2)
    .padEnd(length, "0")
    .slice(0, length);
}

export function buildPortonePaymentId(
  source: PortonePaymentIdSource,
  plan: SelfServeBillingPlanKey,
): string {
  const value = `${source}-${PLAN_CODE[plan]}-${Date.now().toString(36)}-${randomToken(12)}`;
  if (value.length > PORTONE_PAYMENT_ID_MAX_LENGTH) {
    throw new Error(`PortOne paymentId exceeds ${PORTONE_PAYMENT_ID_MAX_LENGTH} characters`);
  }
  return value;
}

export function buildPortoneBillingKeyIssueId(plan: SelfServeBillingPlanKey): string {
  const value = `bki-${PLAN_CODE[plan]}-${Date.now().toString(36)}-${randomToken(16)}`;
  if (value.length > PORTONE_BILLING_KEY_ISSUE_ID_MAX_LENGTH) {
    throw new Error(
      `PortOne billing key issueId exceeds ${PORTONE_BILLING_KEY_ISSUE_ID_MAX_LENGTH} characters`,
    );
  }
  return value;
}

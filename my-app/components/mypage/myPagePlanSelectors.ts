import type {
  PaymentTransactionRow,
  RefundRequestRow,
  SubscriptionRow,
} from "./myPageTypes";

export function isActiveSubscription(subscription: SubscriptionRow | null) {
  if (!subscription) return false;
  const status = subscription.status?.trim().toLowerCase();
  if (status !== "active" && status !== "trialing") return false;
  if (!subscription.current_period_end) return true;

  const end = new Date(subscription.current_period_end);
  return Number.isNaN(end.getTime()) || end.getTime() >= Date.now();
}

function hasStoredBillingKey(subscription: SubscriptionRow | null) {
  return Boolean(subscription?.has_stored_billing_key);
}

export function isPendingConfirmationSubscription(
  subscription: SubscriptionRow | null,
) {
  const status = subscription?.status?.trim().toLowerCase();
  return (
    (status === "canceled" || status === "expired") &&
    hasStoredBillingKey(subscription)
  );
}

export function canStartNewSubscription(subscription: SubscriptionRow | null) {
  const status = subscription?.status?.trim().toLowerCase();
  if (isPendingConfirmationSubscription(subscription)) return false;
  if (!status || status === "canceled" || status === "expired") return true;
  if (status === "active" || status === "trialing") {
    return !isActiveSubscription(subscription);
  }
  return false;
}

export function isCancellationScheduled(subscription: SubscriptionRow | null) {
  return Boolean(subscription?.cancel_at_period_end);
}

export function isPastDueSubscription(subscription: SubscriptionRow | null) {
  return subscription?.status?.trim().toLowerCase() === "past_due";
}

export function getCurrentSubscriptionPlanKey(
  subscription: SubscriptionRow | null,
): string | null {
  if (!subscription?.plan_key || !isActiveSubscription(subscription)) return null;
  return subscription.plan_key;
}

export function canRequestRefund(
  payment: PaymentTransactionRow,
  refundRequest: RefundRequestRow | null,
) {
  if (refundRequest) return false;
  return payment.status?.trim().toLowerCase() === "paid";
}

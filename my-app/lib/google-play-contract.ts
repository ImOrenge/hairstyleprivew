import type { GooglePlayCatalogProduct } from "@hairfit/shared";

export type GooglePlayNormalizedState =
  | "pending"
  | "active"
  | "canceled"
  | "grace_period"
  | "on_hold"
  | "paused"
  | "expired"
  | "revoked";

export interface NormalizedGooglePlayPurchase {
  productId: string;
  orderId: string | null;
  state: GooglePlayNormalizedState;
  entitled: boolean;
  acknowledged: boolean;
  consumed: boolean;
  obfuscatedAccountId: string | null;
  obfuscatedProfileId: string | null;
  expiryTime: string | null;
  autoRenewing: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstRecord(value: unknown) {
  return Array.isArray(value) ? record(value[0]) : {};
}

export function normalizeGooglePlayPurchase(
  product: GooglePlayCatalogProduct,
  payload: unknown,
): NormalizedGooglePlayPurchase {
  const root = record(payload);
  if (product.productType === "consumable") {
    const purchaseState = Number(root.purchaseState);
    const state: GooglePlayNormalizedState = purchaseState === 0
      ? "active"
      : purchaseState === 2
        ? "pending"
        : "revoked";
    return {
      productId: text(root.productId) ?? product.productId,
      orderId: text(root.orderId),
      state,
      entitled: state === "active",
      acknowledged: Number(root.acknowledgementState) === 1,
      consumed: Number(root.consumptionState) === 1,
      obfuscatedAccountId: text(root.obfuscatedExternalAccountId),
      obfuscatedProfileId: text(root.obfuscatedExternalProfileId),
      expiryTime: null,
      autoRenewing: false,
    };
  }

  const lineItem = firstRecord(root.lineItems);
  const account = record(root.externalAccountIdentifiers);
  const autoRenewingPlan = record(lineItem.autoRenewingPlan);
  const rawState = text(root.subscriptionState) ?? "SUBSCRIPTION_STATE_UNSPECIFIED";
  const stateMap: Record<string, GooglePlayNormalizedState> = {
    SUBSCRIPTION_STATE_PENDING: "pending",
    SUBSCRIPTION_STATE_ACTIVE: "active",
    SUBSCRIPTION_STATE_PAUSED: "paused",
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "grace_period",
    SUBSCRIPTION_STATE_ON_HOLD: "on_hold",
    SUBSCRIPTION_STATE_CANCELED: "canceled",
    SUBSCRIPTION_STATE_EXPIRED: "expired",
  };
  const state = stateMap[rawState] ?? "revoked";
  return {
    productId: text(lineItem.productId) ?? product.productId,
    orderId:
      text(root.latestOrderId) ??
      text(root.latestSuccessfulOrderId) ??
      text(lineItem.latestSuccessfulOrderId),
    state,
    entitled: state === "active" || state === "canceled" || state === "grace_period",
    acknowledged: text(root.acknowledgementState) === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    consumed: false,
    obfuscatedAccountId: text(account.obfuscatedExternalAccountId),
    obfuscatedProfileId: text(account.obfuscatedExternalProfileId),
    expiryTime: text(lineItem.expiryTime),
    autoRenewing: autoRenewingPlan.autoRenewEnabled === true,
  };
}

export function mapGooglePlaySubscriptionState(state: GooglePlayNormalizedState) {
  if (state === "active" || state === "grace_period" || state === "canceled") {
    return {
      status: "active" as const,
      cancelAtPeriodEnd: state === "canceled",
    };
  }
  if (state === "on_hold" || state === "paused") {
    return { status: "past_due" as const, cancelAtPeriodEnd: false };
  }
  return { status: "expired" as const, cancelAtPeriodEnd: false };
}

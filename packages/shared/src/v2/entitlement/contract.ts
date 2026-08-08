import type { OfferingCapabilities, OfferingKey } from "../catalog/contract";

export type EntitlementDecisionReason =
  | "allowed"
  | "no_grant"
  | "expired"
  | "exhausted"
  | "offering_inactive"
  | "legacy_bridge_unavailable";

export interface EntitlementGrantV2 {
  id: string;
  userId: string;
  offeringKey: OfferingKey;
  offeringVersion: number;
  capabilities: OfferingCapabilities;
  quantityGranted: number;
  quantityConsumed: number;
  status: "active" | "exhausted" | "expired" | "revoked";
  source: "portone" | "google_play" | "manual" | "legacy_credit_bridge";
  sourceTransactionId: string | null;
  validFrom: string;
  expiresAt: string | null;
}

export interface EntitlementDecisionV2 {
  schemaVersion: "entitlement-decision-v1";
  allowed: boolean;
  reason: EntitlementDecisionReason;
  offeringKey: OfferingKey;
  grantId: string | null;
  remainingSessions: number;
  capabilities: OfferingCapabilities | null;
  decisionVersion: number;
  decidedAt: string;
  source: "v2" | "legacy_bridge";
}

export interface EntitlementQuoteRequestV2 {
  offeringKey: OfferingKey;
  consultationId?: string | null;
  idempotencyKey: string;
}

export interface EntitlementConsumptionReceiptV2 {
  id: string;
  grantId: string;
  consultationId: string;
  idempotencyKey: string;
  quantity: 1;
  state: "reserved" | "consumed" | "restored";
  createdAt: string;
  settledAt: string | null;
}

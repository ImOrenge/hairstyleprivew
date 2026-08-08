import "server-only";

import { getSupabaseAdminClient } from "../supabase";
import { grantEntitlementFromPaidTransactionV2 } from "./entitlement-server";
import { isHairfitV2Enabled } from "./feature-flags";
import { recordV2Event } from "./observability";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function resolveOfferingV2(input: {
  source: "portone" | "google_play";
  providerProductId?: string | null;
  metadata?: unknown;
}) {
  const metadata = object(input.metadata);
  const explicitKey = typeof metadata.hairfit_v2_offering_key === "string"
    ? metadata.hairfit_v2_offering_key.trim()
    : "";
  const explicitVersion = Number(metadata.hairfit_v2_offering_version);
  if (explicitKey && Number.isInteger(explicitVersion) && explicitVersion > 0) {
    return { offeringKey: explicitKey, offeringVersion: explicitVersion };
  }
  const providerProductId = input.providerProductId?.trim() ||
    (typeof metadata.hairfit_v2_provider_product_id === "string"
      ? metadata.hairfit_v2_provider_product_id.trim()
      : "");
  if (!providerProductId) return null;
  const { data, error } = await getSupabaseAdminClient()
    .from("product_prices_v2")
    .select("product_offerings_v2!inner(offering_key,version,status)")
    .eq("provider", input.source)
    .eq("provider_product_id", providerProductId)
    .eq("status", "active")
    .eq("product_offerings_v2.status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const offering = object((data as Record<string, unknown> | null)?.product_offerings_v2);
  return typeof offering.offering_key === "string" && Number.isInteger(offering.version)
    ? { offeringKey: offering.offering_key, offeringVersion: Number(offering.version) }
    : null;
}

export async function dualWritePaidEntitlementV2(input: {
  userId: string;
  source: "portone" | "google_play";
  sourceTransactionId: string;
  providerProductId?: string | null;
  metadata?: unknown;
}) {
  if (!isHairfitV2Enabled("ENTITLEMENT_V2_DUAL_WRITE_ENABLED")) {
    return { state: "disabled" as const };
  }
  try {
    const offering = await resolveOfferingV2(input);
    if (!offering) {
      await recordV2Event({
        userId: input.userId,
        eventType: "entitlement.dual_write_skipped",
        payload: { source: input.source, sourceTransactionId: input.sourceTransactionId, reason: "mapping_missing" },
      });
      return { state: "mapping_missing" as const };
    }
    const metadata = object(input.metadata);
    const quantity = Number.isInteger(metadata.hairfit_v2_quantity) && Number(metadata.hairfit_v2_quantity) > 0
      ? Math.min(100, Number(metadata.hairfit_v2_quantity))
      : 1;
    await grantEntitlementFromPaidTransactionV2({
      userId: input.userId,
      offeringKey: offering.offeringKey,
      offeringVersion: offering.offeringVersion,
      source: input.source,
      sourceTransactionId: input.sourceTransactionId,
      quantity,
    });
    return { state: "granted" as const, ...offering, quantity };
  } catch (error) {
    await recordV2Event({
      userId: input.userId,
      eventType: "entitlement.dual_write_failed",
      payload: {
        source: input.source,
        sourceTransactionId: input.sourceTransactionId,
        errorCode: error instanceof Error ? error.name : "unknown",
      },
    });
    return { state: "failed" as const };
  }
}

export async function revokePaidEntitlementV2(input: {
  userId: string;
  source: "portone" | "google_play";
  sourceTransactionId: string;
}) {
  if (!isHairfitV2Enabled("ENTITLEMENT_V2_DUAL_WRITE_ENABLED")) return { state: "disabled" as const };
  const db = getSupabaseAdminClient();
  const grants = await db
    .from("customer_entitlement_grants_v2")
    .select("id")
    .eq("user_id", input.userId)
    .eq("source", input.source)
    .eq("source_transaction_id", input.sourceTransactionId);
  if (grants.error) throw new Error(grants.error.message);
  const ids = (grants.data ?? []).map((item) => String((item as { id: string }).id));
  if (!ids.length) return { state: "not_found" as const };
  const revoked = await db
    .from("customer_entitlement_grants_v2")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("user_id", input.userId);
  if (revoked.error) throw new Error(revoked.error.message);
  return { state: "revoked" as const, grantCount: ids.length };
}

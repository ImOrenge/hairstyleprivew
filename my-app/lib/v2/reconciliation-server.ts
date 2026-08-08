import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import { resolveOfferingV2 } from "./payment-entitlement-adapter";

export async function reconcileEntitlementsV2(options: { limit?: number } = {}) {
  const db = getSupabaseAdminClient();
  const runId = randomUUID();
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  await db.from("hairfit_v2_reconciliation_runs").insert({ id: runId, scope: "entitlement", status: "running" });
  const payments = await db
    .from("payment_transactions")
    .select("id,user_id,provider,provider_order_id,metadata")
    .in("provider", ["portone", "google_play"])
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(limit);
  if (payments.error) throw new Error(payments.error.message);
  const mismatches: Array<Record<string, unknown>> = [];
  for (const raw of payments.data ?? []) {
    const payment = raw as unknown as Record<string, unknown>;
    const metadata = payment.metadata && typeof payment.metadata === "object"
      ? payment.metadata as Record<string, unknown>
      : {};
    const source = String(payment.provider) as "portone" | "google_play";
    const providerProductId = typeof metadata.hairfit_v2_provider_product_id === "string"
      ? metadata.hairfit_v2_provider_product_id
      : typeof metadata.productId === "string"
        ? metadata.productId
        : null;
    const offering = await resolveOfferingV2({ source, providerProductId, metadata });
    if (!offering) {
      if (typeof metadata.hairfit_v2_offering_key === "string") {
        mismatches.push({ paymentId: payment.id, provider: payment.provider, reason: "offering_mapping_missing" });
      }
      continue;
    }
    const grant = await db
      .from("customer_entitlement_grants_v2")
      .select("id,offering_version")
      .eq("user_id", String(payment.user_id))
      .eq("source", String(payment.provider))
      .eq("source_transaction_id", String(payment.id))
      .eq("offering_key", offering.offeringKey)
      .maybeSingle();
    if (grant.error) throw new Error(grant.error.message);
    if (!grant.data || Number((grant.data as { offering_version?: number }).offering_version) !== offering.offeringVersion) {
      mismatches.push({ paymentId: payment.id, provider: payment.provider, reason: "grant_missing_or_version_mismatch" });
    }
  }
  const finishedAt = new Date().toISOString();
  const update = await db.from("hairfit_v2_reconciliation_runs").update({
    status: mismatches.length ? "failed" : "passed",
    checked_count: (payments.data ?? []).length,
    mismatch_count: mismatches.length,
    mismatch_sample: mismatches.slice(0, 20),
    finished_at: finishedAt,
  }).eq("id", runId);
  if (update.error) throw new Error(update.error.message);
  return { runId, checkedCount: (payments.data ?? []).length, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 20), finishedAt };
}

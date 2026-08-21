import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import { resolveOfferingV2 } from "./payment-entitlement-adapter";
import { projectConsultationReportReceiptV1 } from "@hairfit/shared/consulting/report-observability";
import type { ConsultationReportViewModelV2 } from "@hairfit/shared/consulting/report-v2";

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

export async function reconcileCapabilityReceiptsV2(options: { limit?: number } = {}) {
  const db = getSupabaseAdminClient();
  const runId = randomUUID();
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  await db.from("hairfit_v2_reconciliation_runs").insert({ id: runId, scope: "consultation", status: "running" });
  const tasks = await db.from("consultation_capability_tasks_v2")
    .select("id,state,cost_receipt")
    .in("state", ["completed", "failed", "cancelled"])
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (tasks.error) throw new Error(tasks.error.message);

  const rows = (tasks.data ?? []) as Array<{ id: string; state: string; cost_receipt: Record<string, unknown> | null }>;
  const receiptIds = [...new Set(rows.map((row) => row.cost_receipt?.entitlementConsumptionReceiptId).filter((value): value is string => typeof value === "string" && value.length > 0))];
  const consumptions = receiptIds.length
    ? await db.from("entitlement_consumptions_v2").select("id,grant_id,state").in("id", receiptIds)
    : { data: [], error: null };
  if (consumptions.error) throw new Error(consumptions.error.message);
  const consumptionById = new Map(((consumptions.data ?? []) as Array<{ id: string; grant_id: string; state: string }>).map((row) => [row.id, row]));
  const mismatches: Array<Record<string, unknown>> = [];

  for (const task of rows) {
    const receipt = task.cost_receipt ?? {};
    const receiptState = typeof receipt.state === "string" ? receipt.state : "unknown";
    const receiptId = typeof receipt.entitlementConsumptionReceiptId === "string" ? receipt.entitlementConsumptionReceiptId : null;
    if (receiptState === "not_required") continue;
    if (!receiptId) {
      mismatches.push({ taskId: task.id, reason: "consumption_receipt_missing", receiptState });
      continue;
    }
    const consumption = consumptionById.get(receiptId);
    if (!consumption || consumption.state !== receiptState) {
      mismatches.push({ taskId: task.id, reason: "consumption_state_mismatch", receiptState, persistedState: consumption?.state ?? "missing" });
    }
  }

  const grantIds = [...new Set(((consumptions.data ?? []) as Array<{ grant_id: string }>).map((row) => row.grant_id))];
  if (grantIds.length) {
    const [grants, settled] = await Promise.all([
      db.from("customer_entitlement_grants_v2").select("id,quantity_consumed").in("id", grantIds),
      db.from("entitlement_consumptions_v2").select("grant_id,state").in("grant_id", grantIds).eq("state", "consumed"),
    ]);
    if (grants.error) throw new Error(grants.error.message);
    if (settled.error) throw new Error(settled.error.message);
    const consumedByGrant = new Map<string, number>();
    for (const row of (settled.data ?? []) as Array<{ grant_id: string }>) consumedByGrant.set(row.grant_id, (consumedByGrant.get(row.grant_id) ?? 0) + 1);
    for (const grant of (grants.data ?? []) as Array<{ id: string; quantity_consumed: number }>) {
      if (grant.quantity_consumed !== (consumedByGrant.get(grant.id) ?? 0)) mismatches.push({ grantId: grant.id, reason: "grant_balance_mismatch" });
    }
  }

  const finishedAt = new Date().toISOString();
  const update = await db.from("hairfit_v2_reconciliation_runs").update({
    status: mismatches.length ? "failed" : "passed",
    checked_count: rows.length,
    mismatch_count: mismatches.length,
    mismatch_sample: mismatches.slice(0, 20),
    finished_at: finishedAt,
  }).eq("id", runId);
  if (update.error) throw new Error(update.error.message);
  return { runId, checkedCount: rows.length, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 20), finishedAt };
}

function safeEntityFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export async function reconcilePersonalColorMakeupV2(options: { limit?: number } = {}) {
  const db = getSupabaseAdminClient();
  const runId = randomUUID();
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  const inserted = await db.from("hairfit_v2_reconciliation_runs").insert({ id: runId, scope: "output_snapshot", status: "running" });
  if (inserted.error) throw new Error(inserted.error.message);
  const [directions, routines, briefs, hairSelections, fashionSets] = await Promise.all([
    db.from("makeup_direction_snapshots").select("id,consultation_id,status,personal_color_profile_id,selected_style_snapshot_id,snapshot").in("status", ["confirmed", "routine_ready", "brief_ready"]).order("created_at", { ascending: false }).limit(limit),
    db.from("makeup_routines").select("makeup_direction_snapshot_id,personal_color_profile_id,selected_style_snapshot_id").order("created_at", { ascending: false }).limit(limit * 2),
    db.from("makeup_artist_briefs").select("makeup_direction_snapshot_id,personal_color_profile_id,selected_style_snapshot_id,source_photo_included").order("created_at", { ascending: false }).limit(limit * 2),
    db.from("color_selection_snapshots_v2").select("consultation_id,personal_color_profile_id").order("created_at", { ascending: false }).limit(limit * 2),
    db.from("fashion_preview_sets_v2").select("consultation_id,personal_color_profile_id").order("created_at", { ascending: false }).limit(limit * 2),
  ]);
  for (const result of [directions, routines, briefs, hairSelections, fashionSets]) if (result.error) throw new Error(result.error.message);
  const routineByDirection = new Map((routines.data ?? []).map((row) => [String(row.makeup_direction_snapshot_id), row]));
  const briefByDirection = new Map((briefs.data ?? []).map((row) => [String(row.makeup_direction_snapshot_id), row]));
  const hairProfileByConsultation = new Map((hairSelections.data ?? []).filter((row) => row.personal_color_profile_id).map((row) => [String(row.consultation_id), String(row.personal_color_profile_id)]));
  const fashionProfileByConsultation = new Map((fashionSets.data ?? []).filter((row) => row.personal_color_profile_id).map((row) => [String(row.consultation_id), String(row.personal_color_profile_id)]));
  const mismatches: Array<{ entity: string; reason: string }> = [];
  for (const row of directions.data ?? []) {
    const id = String(row.id); const consultationId = String(row.consultation_id); const profileId = String(row.personal_color_profile_id); const styleId = String(row.selected_style_snapshot_id);
    const snapshot = row.snapshot && typeof row.snapshot === "object" ? row.snapshot as { modules?: unknown[]; source?: { personalColorProfileId?: string; selectedStyleId?: string } } : {};
    const add = (reason: string) => mismatches.push({ entity: safeEntityFingerprint(id), reason });
    if (snapshot.modules?.length !== 7) add("makeup_module_count_mismatch");
    if (snapshot.source?.personalColorProfileId !== profileId || snapshot.source?.selectedStyleId !== styleId) add("makeup_source_projection_mismatch");
    const routine = routineByDirection.get(id); const brief = briefByDirection.get(id);
    if (!routine || !brief) add("execution_artifact_missing");
    if (routine && (String(routine.personal_color_profile_id) !== profileId || String(routine.selected_style_snapshot_id) !== styleId)) add("routine_source_mismatch");
    if (brief && (String(brief.personal_color_profile_id) !== profileId || String(brief.selected_style_snapshot_id) !== styleId || brief.source_photo_included === true)) add("brief_source_or_privacy_mismatch");
    const hairProfile = hairProfileByConsultation.get(consultationId); const fashionProfile = fashionProfileByConsultation.get(consultationId);
    if ((hairProfile && hairProfile !== profileId) || (fashionProfile && fashionProfile !== profileId)) add("cross_domain_profile_mismatch");
  }
  const finishedAt = new Date().toISOString();
  const update = await db.from("hairfit_v2_reconciliation_runs").update({ status: mismatches.length ? "failed" : "passed", checked_count: directions.data?.length ?? 0, mismatch_count: mismatches.length, mismatch_sample: mismatches.slice(0, 20), finished_at: finishedAt }).eq("id", runId);
  if (update.error) throw new Error(update.error.message);
  return { runId, checkedCount: directions.data?.length ?? 0, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 20), allowedStructuralMismatchCount: 0, canaryStatus: (directions.data?.length ?? 0) === 0 ? "insufficient_data" : mismatches.length ? "fail" : "pass", finishedAt };
}

export async function reconcileConsultationReportProjectionsV3(options: { limit?: number } = {}) {
  const db = getSupabaseAdminClient();
  const runId = randomUUID();
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  const inserted = await db.from("hairfit_v2_reconciliation_runs").insert({ id: runId, scope: "output_snapshot", status: "running" });
  if (inserted.error) throw new Error(inserted.error.message);
  const snapshots = await db.from("consultation_report_snapshots_v2")
    .select("id,view_model,source_fingerprint")
    .eq("view_model_version", 2)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (snapshots.error) throw new Error(snapshots.error.message);
  const mismatches: Array<{ entity: string; reason: string }> = [];
  for (const row of snapshots.data ?? []) {
    const report = row.view_model as unknown as ConsultationReportViewModelV2;
    const add = (reason: string) => mismatches.push({ entity: safeEntityFingerprint(String(row.id)), reason });
    if (report?.schemaVersion !== "consultation-report-view-model-v2" || report.provenance?.schemaVersion !== "consulting-result-provenance-v3") {
      add("report_provenance_v3_missing");
      continue;
    }
    const receipt = projectConsultationReportReceiptV1(report, "web");
    if (receipt.mismatch) add("report_generated_content_mismatch");
    if (String(row.source_fingerprint) !== report.provenance.fingerprint) add("report_fingerprint_mismatch");
  }
  const finishedAt = new Date().toISOString();
  const update = await db.from("hairfit_v2_reconciliation_runs").update({
    status: mismatches.length ? "failed" : "passed",
    checked_count: snapshots.data?.length ?? 0,
    mismatch_count: mismatches.length,
    mismatch_sample: mismatches.slice(0, 20),
    finished_at: finishedAt,
  }).eq("id", runId);
  if (update.error) throw new Error(update.error.message);
  return {
    runId,
    checkedCount: snapshots.data?.length ?? 0,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 20),
    canaryStatus: (snapshots.data?.length ?? 0) === 0 ? "insufficient_data" : mismatches.length ? "fail" : "pass",
    finishedAt,
  };
}

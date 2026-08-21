import "server-only";

import type { MakeupDirectionSnapshot } from "@hairfit/shared/makeup";
import type { PersonalColorProfileV2 } from "@hairfit/shared/personal-color-v2";
import type { AnalysisEvidenceV2, FashionPreviewSetV2, SalonBriefV2 } from "@hairfit/shared/v2";
import { projectConsultationReportV2, type ConsultationReportProfileV2, type ConsultationReportViewModelV2 } from "@hairfit/shared/consulting/report-v2";
import { projectConsultationReportReceiptV1, type ConsultationReportSurfaceV1 } from "@hairfit/shared/consulting/report-observability";
import { getSupabaseAdminClient } from "../supabase";
import { getFashionPreviewStateV2 } from "../v2/outputs-server";
import { readServerConsultation } from "./server-store";
import { isMissingOptionalTableError } from "./supabase-errors";
import type { ConsultationSnapshot } from "./contracts";
import { readHairDiagnosisState } from "./hair-profile-server";
import { readMakeupSimulation } from "../makeup/makeup-simulation-server";
import { readLatestHairRecommendationV1 } from "./hair-recommendation-server";
import { readFashionBatch } from "./fashion-batch-server";
import { listFashionOfferSnapshotsV2 } from "./fashion-product-offer-server";
import { recordConsultationReportProjectionEvent } from "../v2/observability";

function analysisEvidence(row: Record<string, unknown> | null): AnalysisEvidenceV2 | null {
  if (!row) return null;
  return {
    schemaVersion: "analysis-evidence-v1",
    id: String(row.id),
    consultationId: String(row.consultation_id),
    sourceImageFingerprint: String(row.source_image_fingerprint),
    sourceTransform: row.source_transform as AnalysisEvidenceV2["sourceTransform"],
    model: { provider: String(row.model_provider), name: String(row.model_name), version: String(row.model_version) },
    quality: row.quality as AnalysisEvidenceV2["quality"],
    landmarks: (row.landmarks ?? []) as AnalysisEvidenceV2["landmarks"],
    contours: (row.contours ?? []) as AnalysisEvidenceV2["contours"],
    hairline: (row.hairline ?? null) as AnalysisEvidenceV2["hairline"],
    measurements: (row.measurements ?? []) as AnalysisEvidenceV2["measurements"],
    faceShape: row.face_shape as AnalysisEvidenceV2["faceShape"],
    skinSampleRegions: (row.skin_sample_regions ?? []) as AnalysisEvidenceV2["skinSampleRegions"],
    excludedRegions: (row.excluded_regions ?? []) as AnalysisEvidenceV2["excludedRegions"],
    correctionRevision: Number(row.correction_revision ?? 0),
    manualCorrections: (row.manual_corrections ?? []) as AnalysisEvidenceV2["manualCorrections"],
    correctedAt: typeof row.corrected_at === "string" ? row.corrected_at : null,
    createdAt: String(row.created_at),
  };
}

function optionalData<T>(result: { data: unknown; error: { code?: string; message?: string } | null | undefined }) {
  if (!result.error) return result.data as T | null;
  if (isMissingOptionalTableError(result.error)) return null;
  return null;
}

async function optionalFashionState(userId: string, consultationId: string) {
  try {
    return await getFashionPreviewStateV2(userId, consultationId);
  } catch {
    return null;
  }
}

async function optionalHairDiagnosis(userId: string, consultationId: string) {
  try { return await readHairDiagnosisState(userId, consultationId); } catch { return null; }
}

async function optionalMakeupSimulation(userId: string, consultationId: string) {
  try { return await readMakeupSimulation(userId, consultationId); } catch { return null; }
}

async function optionalHairRecommendation(userId: string, consultationId: string) {
  try { return await readLatestHairRecommendationV1(userId, consultationId); } catch { return null; }
}

async function optionalFashionBatch(userId: string, consultationId: string) {
  try { return (await readFashionBatch(userId, consultationId)).batch; } catch { return null; }
}

async function optionalFashionOffers(userId: string, consultationId: string) {
  try { return await listFashionOfferSnapshotsV2(userId, consultationId); } catch { return []; }
}

export async function readConsultationReportV2(input: {
  userId: string;
  consultationId: string;
  snapshot?: ConsultationSnapshot;
  profile?: ConsultationReportProfileV2;
  surface?: ConsultationReportSurfaceV1;
}): Promise<ConsultationReportViewModelV2 | null> {
  const snapshot = input.snapshot ?? await readServerConsultation(input.userId, input.consultationId);
  if (!snapshot) return null;
  const db = getSupabaseAdminClient();
  const [analysis, personalColor, salonBrief, makeup, fashion, fashionState, hairDiagnosis, makeupSimulation, hairRecommendation, fashionBatch, fashionOffers, fashionPersonalization] = await Promise.all([
    db.from("analysis_evidence_v2")
      .select("id,consultation_id,source_image_fingerprint,source_transform,model_provider,model_name,model_version,quality,landmarks,contours,hairline,measurements,face_shape,skin_sample_regions,excluded_regions,correction_revision,manual_corrections,corrected_at,created_at")
      .eq("consultation_id", input.consultationId).eq("user_id", input.userId).maybeSingle(),
    db.from("personal_color_profiles_v2").select("profile")
      .eq("consultation_id", input.consultationId).eq("user_id", input.userId).neq("status", "superseded")
      .order("profile_version", { ascending: false }).limit(1).maybeSingle(),
    db.from("salon_brief_versions_v2").select("brief")
      .eq("consultation_id", input.consultationId).eq("user_id", input.userId)
      .order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("makeup_direction_snapshots").select("snapshot")
      .eq("consultation_id", input.consultationId).eq("user_id", input.userId).neq("status", "superseded")
      .order("snapshot_version", { ascending: false }).limit(1).maybeSingle(),
    db.from("fashion_preview_sets_v2").select("preview_set")
      .eq("consultation_id", input.consultationId).eq("user_id", input.userId)
      .order("version", { ascending: false }).limit(1).maybeSingle(),
    snapshot.fashion.selectedAt || snapshot.fashion.lookId
      ? optionalFashionState(input.userId, input.consultationId)
      : Promise.resolve(null),
    optionalHairDiagnosis(input.userId, input.consultationId),
    optionalMakeupSimulation(input.userId, input.consultationId),
    optionalHairRecommendation(input.userId, input.consultationId),
    optionalFashionBatch(input.userId, input.consultationId),
    optionalFashionOffers(input.userId, input.consultationId),
    db.from("fashion_personalization_snapshots_v2").select("id")
      .eq("consultation_id", input.consultationId).eq("user_id", input.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const analysisRow = optionalData<Record<string, unknown>>(analysis as never);
  const personalColorRow = optionalData<{ profile?: PersonalColorProfileV2 }>(personalColor as never);
  const salonBriefRow = optionalData<{ brief?: SalonBriefV2 }>(salonBrief as never);
  const makeupRow = optionalData<{ snapshot?: MakeupDirectionSnapshot }>(makeup as never);
  const fashionRow = optionalData<{ preview_set?: FashionPreviewSetV2 }>(fashion as never);
  const fashionPersonalizationRow = optionalData<{ id?: string }>(fashionPersonalization as never);
  const selectedMakeupOutput = makeupSimulation?.selection
    ? makeupSimulation.outputs.find((item) => item.id === makeupSimulation.selection?.outputId) ?? null
    : null;
  const report = projectConsultationReportV2(snapshot, {
    analysisEvidence: analysisEvidence(analysisRow),
    personalColorProfile: personalColorRow?.profile ?? null,
    salonBrief: salonBriefRow?.brief ?? null,
    makeupDirection: makeupRow?.snapshot ?? null,
    makeupMoodImageUrl: selectedMakeupOutput?.imageUrl ?? null,
    hairProfile: hairDiagnosis?.profile ?? null,
    hairRecommendation,
    fashionBatch: fashionBatch ?? snapshot.fashionBatch,
    fashionPreviewSet: fashionState?.previewSet ?? fashionRow?.preview_set ?? null,
    fashionCandidates: fashionState?.previews ?? [],
    fashionOfferSnapshots: fashionOffers,
    fashionPersonalizationSnapshotId: fashionPersonalizationRow?.id ?? null,
  }, input.profile ?? "full_journey");
  const receipt = projectConsultationReportReceiptV1(report, input.surface ?? "web");
  await recordConsultationReportProjectionEvent({
    consultationId: input.consultationId,
    userId: input.userId,
    surface: receipt.surface,
    reportRevision: receipt.reportRevision,
    reportFingerprint: receipt.fingerprint,
    hairGeneratedCount: receipt.hairGeneratedCount,
    fashionGeneratedCount: receipt.fashionGeneratedCount,
    fashionRequestedCount: receipt.fashionRequestedCount,
    mismatch: receipt.mismatch,
  });
  return report;
}

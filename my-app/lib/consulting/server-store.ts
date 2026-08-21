import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import { resolveGenerationImageUrl } from "../generation-image-storage";
import type { ConsultationActiveTask, ConsultationAnalysisRun, ConsultationLifecycleState, ConsultationPatch, ConsultationSnapshot, ConsultationStage, FashionPreviewBatch, HairColorGenerationRun, HairColorPreviewRun, SelectedStyleSnapshot } from "./contracts";
import { CONSULTATION_STAGE_SLUGS, deriveConsultationJourney, isConsultationStage } from "./contracts";
import { createConsultationSnapshot, createPreviewSlots } from "./defaults";
import { validateConsultationPatch } from "./stage-guards";
import { isHairfitV2Enabled } from "../v2/feature-flags";
import { isMissingOptionalTableError } from "./supabase-errors";
import { enrichPersonalColorEvidenceFromCapabilityResult, mapPersonalColorDiagnosis } from "./personal-color-mapping";
import type { PersonalColorEvidenceV2 } from "@hairfit/shared/v2";
import { compileConsultationResultV2, isResultCompilationReady } from "./result-compiler-server";
import { isColorStudioEnabled, isConsultationResultEnabled, isMakeupStyleSimulationEnabled, isPersonalColorSceneEnabled } from "./feature-flag";
import { mapColorSelection, mapResultSnapshot, type ColorSelectionRow, type HairMaskRow, type ResultSnapshotRow } from "./color-persistence-mapping";
import { readHairDiagnosisState } from "./hair-profile-server";

type Row = { id: string; user_id: string; version: number; lifecycle_state?: string; current_stage: string; snapshot: unknown; created_at: string; updated_at: string };

function applySceneFlagRollback(snapshot: ConsultationSnapshot): ConsultationSnapshot {
  const resultDisabled = !isConsultationResultEnabled();
  const disabled = new Set<ConsultationStage>([
    ...(!isPersonalColorSceneEnabled() ? ["personal-color" as const] : []),
    ...(!isColorStudioEnabled() ? ["color-studio" as const] : []),
    ...(resultDisabled ? ["result" as const] : []),
    ...(!isHairfitV2Enabled("MAKEUP_DIRECTION_V1") ? ["makeup" as const] : []),
  ]);
  if (!disabled.size) return snapshot;
  const actualServiceReady = Boolean(snapshot.actualService.confirmedAt && snapshot.actualService.serviceDate);
  const allowedStages = snapshot.journey.allowedStages.filter((stage) => !disabled.has(stage));
  if (resultDisabled && actualServiceReady && !allowedStages.includes("aftercare")) allowedStages.push("aftercare");
  if (disabled.has("makeup") && snapshot.salonBrief.createdAt && !allowedStages.includes("fashion")) allowedStages.push("fashion");
  allowedStages.sort((left, right) => CONSULTATION_STAGE_SLUGS.indexOf(left) - CONSULTATION_STAGE_SLUGS.indexOf(right));
  const preferred = snapshot.journey.recommendedStage === "personal-color" ? ["direction", "analysis"] as const
    : snapshot.journey.recommendedStage === "color-studio" ? ["salon-brief", "decision"] as const
      : snapshot.journey.recommendedStage === "makeup" ? ["fashion", "salon-brief"] as const
      : snapshot.journey.recommendedStage === "result" ? (actualServiceReady ? ["aftercare", "fashion", "salon-brief"] as const : ["fashion", "salon-brief"] as const) : [];
  const recommendedStage = disabled.has(snapshot.journey.recommendedStage)
    ? preferred.find((stage) => allowedStages.includes(stage)) ?? allowedStages.at(-1) ?? "discovery"
    : snapshot.journey.recommendedStage;
  const stageStatus = { ...snapshot.journey.stageStatus };
  for (const stage of disabled) stageStatus[stage] = "locked";
  if (disabled.has("makeup") && allowedStages.includes("fashion")) stageStatus.fashion = recommendedStage === "fashion" ? "recommended" : "available";
  if (resultDisabled && actualServiceReady) stageStatus.aftercare = snapshot.careProgram.today.length ? "complete" : recommendedStage === "aftercare" ? "recommended" : "available";
  const blockingActions = disabled.has("makeup")
    ? snapshot.journey.blockingActions.filter((action) => action.stage !== "makeup" && action.code !== "MAKEUP_DIRECTION_REQUIRED")
    : snapshot.journey.blockingActions;
  return { ...snapshot, journey: { ...snapshot.journey, recommendedStage, allowedStages, stageStatus, blockingActions } };
}

function lifecycleState(value: string | undefined): ConsultationLifecycleState {
  const states: ConsultationLifecycleState[] = ["draft","photo_validated","analysis_ready","preview_board_queued","preview_board_ready","shortlisted","style_selected","selection_confirmed","salon_brief_ready","aftercare_ready","fashion_ready","completed","cancelled"];
  return states.includes(value as ConsultationLifecycleState) ? value as ConsultationLifecycleState : "draft";
}

function normalizeRow(row: Row): ConsultationSnapshot {
  const snapshot = row.snapshot as ConsultationSnapshot;
  const defaults = createConsultationSnapshot({ sessionId: row.id, userId: row.user_id, now: row.created_at });
  const normalized = {
    ...defaults,
    ...snapshot,
    discovery: { ...defaults.discovery, ...snapshot.discovery },
    personalColorDiagnosis: { ...defaults.personalColorDiagnosis, ...snapshot.personalColorDiagnosis, axes: { ...defaults.personalColorDiagnosis.axes, ...snapshot.personalColorDiagnosis?.axes }, palette: { ...defaults.personalColorDiagnosis.palette, ...snapshot.personalColorDiagnosis?.palette } },
    colorDecision: { ...defaults.colorDecision, ...snapshot.colorDecision },
    makeupDirection: { ...defaults.makeupDirection!, ...(snapshot.makeupDirection ?? {}) } as NonNullable<ConsultationSnapshot["makeupDirection"]>,
    result: { ...defaults.result, ...snapshot.result },
    careProgram: { ...defaults.careProgram, ...snapshot.careProgram },
    fashion: {
      ...defaults.fashion,
      ...snapshot.fashion,
      directionSnapshot: {
        ...defaults.fashion.directionSnapshot,
        ...snapshot.fashion?.directionSnapshot,
      },
    },
    sessionId: row.id,
    userId: row.user_id,
    version: row.version,
    lifecycleState: lifecycleState(row.lifecycle_state),
    currentStage: isConsultationStage(row.current_stage) ? row.current_stage : "discovery",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  const journey = deriveConsultationJourney(normalized, normalized.lifecycleState);
  return { ...normalized, completedStages: journey.completedStages, journey };
}

type AnalysisRunRow = {
  id: string; state: ConsultationAnalysisRun["state"]; pipeline: ConsultationAnalysisRun["pipeline"] | null;
  error_code: string | null; error_message: string | null; attempt_count: number;
  started_at: string | null; completed_at: string | null; updated_at: string;
};

type FashionBatchRow = {
  id: string; state: FashionPreviewBatch["state"]; requested_count: number; completed_count: number; failed_count: number;
  quote_id: string | null; slot_state: Record<string, string> | null;
  slot_progress: FashionPreviewBatch["slotProgress"] | null; last_heartbeat_at: string | null;
  error_code: string | null; error_message: string | null; updated_at: string;
  generation_input_fingerprint: string | null; color_selection_snapshot_id: string | null;
  base_batch_id: string | null; expansion_level: number; recommended_preview_id: string | null; selected_preview_id: string | null;
  consumption_receipt_ids: string[] | null; revision: number; slot_roles: FashionPreviewBatch["slotRoles"] | null;
};
type HairColorRunRow = {
  id: string; state: string; attempt_count: number; heartbeat_at: string | null; error_code: string | null; error_message: string | null;
  started_at: string | null; completed_at: string | null; updated_at: string; output_path: string | null; input_fingerprint: string | null;
  quality_result: { request?: Partial<Pick<HairColorPreviewRun, "candidateKey" | "purpose" | "quality" | "colorName" | "swatchHex" | "technique" | "targetLevel" | "rationale" | "bleachPolicy" | "maintenance" | "cautions">> } | null;
};

function mapAnalysisRun(row: AnalysisRunRow | null): ConsultationAnalysisRun | null {
  return row ? {
    id: row.id,
    state: row.state,
    pipeline: row.pipeline ?? {},
    errorCode: row.error_code,
    errorMessage: row.error_message,
    attemptCount: row.attempt_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  } : null;
}

function mapFashionBatch(row: FashionBatchRow | null): FashionPreviewBatch | null {
  if (!row) return null;
  const slotProgress = row.slot_progress ?? {};
  return {
    schemaVersion: "fashion-preview-batch-v2",
    id: row.id,
    baseBatchId: row.base_batch_id ?? row.id,
    state: row.state,
    requestedCount: row.requested_count as FashionPreviewBatch["requestedCount"],
    completedCount: row.completed_count,
    failedCount: row.failed_count,
    terminalCount: row.completed_count + row.failed_count,
    stalledCount: Object.values(slotProgress).filter((item) => item.status === "stalled").length,
    retryingCount: Object.values(slotProgress).filter((item) => item.status === "retrying").length,
    quoteId: row.quote_id,
    generationInputFingerprint: row.generation_input_fingerprint,
    colorSelectionSnapshotId: row.color_selection_snapshot_id,
    expansionLevel: row.expansion_level as 0 | 1 | 2,
    recommendedPreviewId: row.recommended_preview_id,
    selectedPreviewId: row.selected_preview_id,
    usageReceiptIds: row.consumption_receipt_ids ?? [],
    revision: row.revision,
    slotRoles: row.slot_roles ?? {},
    slotState: row.slot_state ?? {},
    slotProgress,
    lastHeartbeatAt: row.last_heartbeat_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    updatedAt: row.updated_at,
  };
}

function mapHairColorRun(row: HairColorRunRow | null): HairColorGenerationRun | null {
  if (!row) return null;
  return { id: row.id, state: (row.state === "retry_required" ? "retry-required" : row.state) as HairColorGenerationRun["state"], attemptCount: row.attempt_count, heartbeatAt: row.heartbeat_at, errorCode: row.error_code, errorMessage: row.error_message, startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at };
}

function mapHairColorPreviewRun(row: HairColorRunRow, outputUrl: string | null): HairColorPreviewRun | null {
  const request = row.quality_result?.request;
  if (!request || !["best-match", "natural", "accent"].includes(String(request.candidateKey))) return null;
  return {
    ...mapHairColorRun(row)!,
    candidateKey: request.candidateKey as HairColorPreviewRun["candidateKey"],
    purpose: request.purpose === "final" ? "final" : "exploration",
    quality: request.quality === "medium" ? "medium" : "low",
    colorName: String(request.colorName || "컬러 후보"),
    swatchHex: String(request.swatchHex || "#4D3426"),
    technique: (request.technique || "full") as HairColorPreviewRun["technique"],
    targetLevel: typeof request.targetLevel === "number" ? request.targetLevel : null,
    rationale: Array.isArray(request.rationale) ? request.rationale : [],
    bleachPolicy: String(request.bleachPolicy || "현장 모발 진단 후 결정"),
    maintenance: String(request.maintenance || "컬러 전용 케어"),
    cautions: Array.isArray(request.cautions) ? request.cautions : [],
    outputUrl,
    outputPath: row.output_path,
    inputFingerprint: row.input_fingerprint,
  };
}

async function hydrateTaskState(snapshot: ConsultationSnapshot) {
  const db = getSupabaseAdminClient();
  const [analysis, fashion, personalColor, personalColorCapabilityResult, hairColor, colorSelection, hairMasks, resultSnapshot, makeupDirection, makeupSimulationRun, makeupSimulationSelection, hairDiagnosis] = await Promise.all([
    db.from("consultation_analysis_runs_v2")
      .select("id,state,pipeline,error_code,error_message,attempt_count,started_at,completed_at,updated_at")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("fashion_preview_batches_v2")
      .select("id,state,requested_count,completed_count,failed_count,quote_id,slot_state,slot_progress,last_heartbeat_at,error_code,error_message,generation_input_fingerprint,color_selection_snapshot_id,base_batch_id,expansion_level,recommended_preview_id,selected_preview_id,consumption_receipt_ids,revision,slot_roles,updated_at")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("personal_color_evidence_v2")
      .select("id,consultation_id,source_analysis_evidence_id,model,quality,result,created_at")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("consultation_capability_results_v2")
      .select("output,created_at")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId)
      .eq("capability", "personal-color-analysis")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("hair_color_generation_runs_v2")
      .select("id,state,attempt_count,heartbeat_at,error_code,error_message,started_at,completed_at,updated_at,output_path,input_fingerprint,quality_result")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId)
      .order("created_at", { ascending: false }).limit(10),
    db.from("color_selection_snapshots_v2")
      .select("id,snapshot_version,status,input_fingerprint,hair_mask_id,snapshot,confirmed_at")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId)
      .neq("status", "superseded")
      .order("confirmed_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("hair_mask_artifacts_v2")
      .select("id,mask_version,storage_path,source_image_fingerprint,width,height,confidence,boundary_score,created_at")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId)
      .order("created_at", { ascending: false }).limit(8),
    db.from("consultation_result_snapshots_v2")
      .select("id,snapshot_version,snapshot,compiled_at")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId)
      .order("compiled_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("makeup_direction_snapshots")
      .select("id,status,confirmed_at,source_fingerprint")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId).neq("status", "superseded")
      .order("snapshot_version", { ascending: false }).limit(1).maybeSingle(),
    db.from("makeup_simulation_runs_v2").select("id,state").eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("makeup_simulation_selections_v2").select("id,output_id").eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId).order("revision", { ascending: false }).limit(1).maybeSingle(),
    readHairDiagnosisState(snapshot.userId, snapshot.sessionId),
  ]);
  if (analysis.error && !isMissingOptionalTableError(analysis.error)) throw new Error(analysis.error.message);
  if (fashion.error && !isMissingOptionalTableError(fashion.error)) throw new Error(fashion.error.message);
  if (personalColor.error && !isMissingOptionalTableError(personalColor.error)) throw new Error(personalColor.error.message);
  if (personalColorCapabilityResult.error && !isMissingOptionalTableError(personalColorCapabilityResult.error)) throw new Error(personalColorCapabilityResult.error.message);
  if (hairColor.error && !isMissingOptionalTableError(hairColor.error)) throw new Error(hairColor.error.message);
  if (colorSelection.error && !isMissingOptionalTableError(colorSelection.error)) throw new Error(colorSelection.error.message);
  if (hairMasks.error && !isMissingOptionalTableError(hairMasks.error)) throw new Error(hairMasks.error.message);
  if (resultSnapshot.error && !isMissingOptionalTableError(resultSnapshot.error)) throw new Error(resultSnapshot.error.message);
  if (makeupDirection.error && !isMissingOptionalTableError(makeupDirection.error)) throw new Error(makeupDirection.error.message);
  if (makeupSimulationRun.error && !isMissingOptionalTableError(makeupSimulationRun.error)) throw new Error(makeupSimulationRun.error.message);
  if (makeupSimulationSelection.error && !isMissingOptionalTableError(makeupSimulationSelection.error)) throw new Error(makeupSimulationSelection.error.message);
  const personalColorRow = personalColor.error ? null : personalColor.data as unknown as Record<string, unknown> | null;
  const persistedEvidence = personalColorRow ? {
    schemaVersion: (personalColorRow.result as Record<string, unknown> | null)?.axes ? "personal-color-evidence-v2" : "personal-color-evidence-v1",
    id: String(personalColorRow.id),
    consultationId: String(personalColorRow.consultation_id),
    sourceAnalysisEvidenceId: String(personalColorRow.source_analysis_evidence_id),
    model: personalColorRow.model,
    quality: personalColorRow.quality,
    result: personalColorRow.result,
    createdAt: String(personalColorRow.created_at),
  } as PersonalColorEvidenceV2 : null;
  const capabilityOutput = personalColorCapabilityResult.error
    ? null
    : (personalColorCapabilityResult.data as unknown as { output?: unknown } | null)?.output;
  const evidence = persistedEvidence
    ? enrichPersonalColorEvidenceFromCapabilityResult(persistedEvidence, capabilityOutput)
    : null;
  const persistedColor = mapColorSelection(snapshot.colorDecision, colorSelection.error ? null : colorSelection.data as unknown as ColorSelectionRow | null, hairMasks.error ? [] : hairMasks.data as unknown as HairMaskRow[]);
  const persistedFashionBatch = (fashion.error ? null : fashion.data) as unknown as FashionBatchRow | null;
  const currentFashionBatch = persistedFashionBatch && (persistedFashionBatch.color_selection_snapshot_id ?? null) === (persistedColor.id ?? null) ? persistedFashionBatch : null;
  const hairColorRows = hairColor.error ? [] : hairColor.data as unknown as HairColorRunRow[];
  const finalHairColorRun = hairColorRows.find((row) => row.quality_result?.request?.purpose !== "exploration") ?? null;
  const hairColorPreviewRuns = (await Promise.all(hairColorRows.map(async (row) => {
    const outputUrl = row.output_path
      ? await resolveGenerationImageUrl(db, { outputUrl: null, generatedImagePath: row.output_path }).catch(() => null)
      : null;
    return mapHairColorPreviewRun(row, outputUrl);
  }))).filter((row): row is HairColorPreviewRun => row !== null);
  const next = {
    ...snapshot,
    analysisRun: mapAnalysisRun((analysis.error ? null : analysis.data) as unknown as AnalysisRunRow | null),
    fashionBatch: mapFashionBatch(currentFashionBatch),
    hairColorGenerationRun: mapHairColorRun(finalHairColorRun),
    hairColorPreviewRuns,
    colorDecision: persistedColor,
    result: mapResultSnapshot(snapshot.result, resultSnapshot.error ? null : resultSnapshot.data as unknown as ResultSnapshotRow | null),
    makeupDirection: makeupDirection.error || !makeupDirection.data ? snapshot.makeupDirection : {
      id: String(makeupDirection.data.id),
      status: String(makeupDirection.data.status) as NonNullable<ConsultationSnapshot["makeupDirection"]>["status"],
      confirmedAt: typeof makeupDirection.data.confirmed_at === "string" ? makeupDirection.data.confirmed_at : null,
      sourceFingerprint: typeof makeupDirection.data.source_fingerprint === "string" ? makeupDirection.data.source_fingerprint : null,
      simulationRequired: isMakeupStyleSimulationEnabled(),
      simulationRunState: makeupSimulationRun.error || !makeupSimulationRun.data ? null : String(makeupSimulationRun.data.state),
      simulationSelectionId: makeupSimulationSelection.error || !makeupSimulationSelection.data ? null : String(makeupSimulationSelection.data.id),
    },
    hairTraitAnalysisRun: hairDiagnosis.run,
    hairProfile: hairDiagnosis.profile,
    diagnosticQuestions: hairDiagnosis.questions,
    personalColorDiagnosis: evidence ? mapPersonalColorDiagnosis(evidence) : snapshot.personalColorDiagnosis,
  };
  const hairTraitTasks: ConsultationActiveTask[] = hairDiagnosis.run && hairDiagnosis.run.state !== "completed" && hairDiagnosis.run.state !== "cancelled" ? [{
    id: hairDiagnosis.run.id,
    kind: "hair-trait-analysis",
    stage: "scan",
    originStage: "photo",
    transitionHostStage: "scan",
    destinationStage: "analysis",
    readinessKey: "hair-profile-terminal",
    status: hairDiagnosis.run.state === "failed" ? "failed" : hairDiagnosis.run.state === "retry_required" ? "waiting" : hairDiagnosis.run.state === "partial_ready" ? "partial" : "running",
    phaseKey: hairDiagnosis.run.state,
    phaseIndex: ({ queued: 0, preflight: 0, segmenting: 1, extracting: 2, reconciling: 3, partial_ready: 3 } as Record<string, number>)[hairDiagnosis.run.state] ?? null,
    phaseCount: 4,
    completedUnits: hairDiagnosis.run.completedTraitCount,
    totalUnits: hairDiagnosis.run.totalTraitCount,
    messageSetKey: `hair-trait-analysis.${hairDiagnosis.run.state}`,
    partialOutputCount: hairDiagnosis.run.completedTraitCount,
    label: "모질 특성 분석",
    detail: hairDiagnosis.run.errorMessage ?? `${hairDiagnosis.run.completedTraitCount}개 관찰 근거가 준비되었습니다.`,
    startedAt: hairDiagnosis.run.startedAt,
    updatedAt: hairDiagnosis.run.updatedAt,
    completedAt: hairDiagnosis.run.completedAt,
    retryable: hairDiagnosis.run.state === "failed" || hairDiagnosis.run.state === "retry_required",
  }] : [];
  const makeupSimulationState = makeupSimulationRun.error || !makeupSimulationRun.data ? null : String(makeupSimulationRun.data.state);
  const makeupSimulationTasks: ConsultationActiveTask[] = makeupSimulationState && !["completed", "cancelled"].includes(makeupSimulationState) ? [{
    id: String(makeupSimulationRun.data!.id), kind: "makeup-simulation-generation", stage: "makeup", originStage: "makeup",
    transitionHostStage: "makeup", destinationStage: "makeup", readinessKey: "makeup-simulation-review-ready",
    status: makeupSimulationState === "failed" ? "failed" : makeupSimulationState === "retry_required" ? "waiting" : makeupSimulationState === "partial_ready" ? "partial" : "running",
    phaseKey: makeupSimulationState, phaseIndex: ({ queued: 0, preparing: 0, generating: 1, quality_review: 2, partial_ready: 3 } as Record<string, number>)[makeupSimulationState] ?? null,
    phaseCount: 4, completedUnits: makeupSimulationState === "partial_ready" ? 1 : 0, totalUnits: 1, messageSetKey: `makeup-simulation-generation.${makeupSimulationState}`,
    partialOutputCount: makeupSimulationState === "partial_ready" ? 1 : 0, label: "메이크업 스타일 시뮬레이션", detail: "얼굴과 헤어를 유지하며 확정 메이크업 방향을 적용합니다.",
    startedAt: null, updatedAt: snapshot.updatedAt, completedAt: null, retryable: ["failed", "retry_required"].includes(makeupSimulationState),
  }] : [];
  const journey = deriveConsultationJourney(next, next.lifecycleState, [...hairTraitTasks, ...makeupSimulationTasks]);
  return applySceneFlagRollback({ ...next, completedStages: journey.completedStages, journey });
}

export async function createServerConsultation(userId: string, idempotencyKey?: string) {
  if (idempotencyKey && idempotencyKey.length < 8) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const db = getSupabaseAdminClient();
  if (idempotencyKey) {
    const existing = await db.from("consultation_sessions")
      .select("id,user_id,version,lifecycle_state,current_stage,snapshot,created_at,updated_at")
      .eq("user_id", userId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return hydrateTaskState(normalizeRow(existing.data as unknown as Row));
  }
  const sessionId = randomUUID();
  const snapshot = createConsultationSnapshot({ sessionId, userId });
  const { data, error } = await db.from("consultation_sessions").insert({
    id: sessionId, user_id: userId, version: snapshot.version, current_stage: snapshot.currentStage, snapshot,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  }).select("id,user_id,version,lifecycle_state,current_stage,snapshot,created_at,updated_at").single();
  if (error?.code === "23505" && idempotencyKey) {
    const replay = await db.from("consultation_sessions")
      .select("id,user_id,version,lifecycle_state,current_stage,snapshot,created_at,updated_at")
      .eq("user_id", userId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (replay.error) throw new Error(replay.error.message);
    if (replay.data) return hydrateTaskState(normalizeRow(replay.data as unknown as Row));
  }
  if (error) throw new Error(error.message);
  return normalizeRow(data as unknown as Row);
}

export async function readLatestServerConsultation(userId: string) {
  const { data, error } = await getSupabaseAdminClient().from("consultation_sessions")
    .select("id,user_id,version,lifecycle_state,current_stage,snapshot,created_at,updated_at")
    .eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? hydrateTaskState(normalizeRow(data as unknown as Row)) : null;
}

export async function readServerConsultation(userId: string, sessionId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("consultation_sessions")
    .select("id,user_id,version,lifecycle_state,current_stage,snapshot,created_at,updated_at")
    .eq("id", sessionId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const snapshot = await hydrateTaskState(normalizeRow(data as unknown as Row));
  const sign = async (imageUrl: string | null, generatedImagePath: string | null) => generatedImagePath
    ? (await resolveGenerationImageUrl(supabase, { outputUrl: null, generatedImagePath }).catch(() => null)) ?? imageUrl
    : imageUrl;
  const signed = {
    ...snapshot,
    previews: await Promise.all(snapshot.previews.map(async (preview) => ({ ...preview, imageUrl: await sign(preview.imageUrl, preview.generatedImagePath) }))),
    selectedStyleHistory: await Promise.all(snapshot.selectedStyleHistory.map(async (style) => ({ ...style, imageUrl: await sign(style.imageUrl, style.generatedImagePath) }))),
    colorDecision: { ...snapshot.colorDecision, finalImageUrl: await sign(snapshot.colorDecision.finalImageUrl, snapshot.colorDecision.finalImagePath), hairMask: snapshot.colorDecision.hairMask ? { ...snapshot.colorDecision.hairMask, signedUrl: await sign(snapshot.colorDecision.hairMask.signedUrl, snapshot.colorDecision.hairMask.storagePath) } : null },
    result: { ...snapshot.result, heroImageUrl: await sign(snapshot.result.heroImageUrl, snapshot.result.heroImagePath) },
  };
  const journey = deriveConsultationJourney(signed, signed.lifecycleState);
  return applySceneFlagRollback({ ...signed, completedStages: journey.completedStages, journey });
}

function buildSelectedStyle(current: ConsultationSnapshot, patch: NonNullable<ConsultationPatch["selectedStyle"]>, now: string): SelectedStyleSnapshot {
  const previous = current.selectedStyleHistory.at(-1) ?? null;
  if (previous?.serviceConfirmedAt) throw new Error("STYLE_LOCKED");
  return {
    ...patch,
    id: randomUUID(),
    revision: (previous?.revision ?? 0) + 1,
    selectedAt: now,
    supersedesSnapshotId: previous?.id ?? null,
    serviceConfirmedAt: null,
  };
}

function applyPatch(current: ConsultationSnapshot, patch: ConsultationPatch, now: string) {
  const next: ConsultationSnapshot = { ...current, updatedAt: now };
  const keys = ["startContext", "discovery", "photo", "evidence", "faceAnalysis", "personalColor", "personalColorDiagnosis", "strategyRecommendations", "strategy", "previews", "shortlist", "finalist", "colorDecision", "salonBrief", "result", "actualService", "careProgram", "fashion"] as const;
  for (const key of keys) {
    if (patch[key] !== undefined) Object.assign(next, { [key]: patch[key] });
  }
  if (patch.currentStage) next.currentStage = patch.currentStage;
  if (patch.completeStage && !next.completedStages.includes(patch.completeStage)) next.completedStages = [...next.completedStages, patch.completeStage];
  if (patch.selectedStyle) next.selectedStyleHistory = [...next.selectedStyleHistory, buildSelectedStyle(current, patch.selectedStyle, now)];
  if (patch.actualService?.confirmedAt && next.selectedStyleHistory.length) {
    next.selectedStyleHistory = next.selectedStyleHistory.map((style, index, all) => index === all.length - 1 ? { ...style, serviceConfirmedAt: patch.actualService?.confirmedAt ?? null } : style);
  }
  if (patch.strategy?.confirmedAt && patch.strategy.revision > current.strategy.revision) {
    const clean = createConsultationSnapshot({ sessionId: current.sessionId, userId: current.userId, now });
    next.currentStage = "previews";
    next.completedStages = next.completedStages.filter((stage) => ["discovery","photo","scan","analysis","personal-color","direction"].includes(stage));
    next.previews = createPreviewSlots();
    next.shortlist = clean.shortlist;
    next.finalist = clean.finalist;
    next.colorDecision = clean.colorDecision;
    next.salonBrief = clean.salonBrief;
    next.result = clean.result;
    next.actualService = clean.actualService;
    next.careProgram = clean.careProgram;
    next.fashion = clean.fashion;
  }
  const journey = deriveConsultationJourney(next, next.lifecycleState);
  return { ...next, completedStages: journey.completedStages, journey };
}

export type ConsultationUpdateResult = { status: "updated"; snapshot: ConsultationSnapshot } | { status: "conflict"; snapshot: ConsultationSnapshot };

async function assertPersistedPhotoGeometry(userId: string, sessionId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("analysis_evidence_v2")
    .select("id,landmarks,contours,measurements")
    .eq("consultation_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as unknown as { landmarks?: unknown; contours?: unknown; measurements?: unknown } | null;
  if (!row
    || !Array.isArray(row.landmarks)
    || row.landmarks.length < 5
    || !Array.isArray(row.contours)
    || row.contours.length < 1
    || !Array.isArray(row.measurements)
    || row.measurements.length < 4) {
    throw new Error("INVALID_PATCH:저장된 얼굴 랜드마크 분석을 완료한 뒤 다음 단계로 이동해 주세요.");
  }
}

export async function updateServerConsultation(userId: string, sessionId: string, patch: ConsultationPatch): Promise<ConsultationUpdateResult> {
  const current = await readServerConsultation(userId, sessionId);
  if (!current) throw new Error("NOT_FOUND");
  if (current.version !== patch.expectedVersion) {
    const stored = await getSupabaseAdminClient()
      .from("consultation_sessions")
      .select("snapshot")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (stored.error) throw new Error(stored.error.message);
    const storedSnapshotVersion = Number((stored.data?.snapshot as { version?: unknown } | null)?.version);
    if (storedSnapshotVersion !== patch.expectedVersion) return { status: "conflict", snapshot: current };
  }
  if (patch.completeStage === "photo" && isHairfitV2Enabled("ANALYSIS_EVIDENCE_V2_ENABLED")) {
    await assertPersistedPhotoGeometry(userId, sessionId);
  }
  validateConsultationPatch(current, patch);
  const now = new Date().toISOString();
  let next = applyPatch(current, patch, now);
  if (isConsultationResultEnabled() && isResultCompilationReady(next) && (!next.result.compiledAt || patch.salonBrief || patch.colorDecision || patch.personalColorDiagnosis || patch.selectedStyle || patch.fashion)) {
    next = { ...next, result: await compileConsultationResultV2(next) };
    const journey = deriveConsultationJourney(next, next.lifecycleState);
    next = { ...next, completedStages: journey.completedStages, journey };
  }
  const nextVersion = current.version + 1;
  if (
    isHairfitV2Enabled("CONSULTATION_SESSION_V2_ENABLED") &&
    patch.photo?.generationId
  ) {
    const generationLink = await getSupabaseAdminClient()
      .from("generations")
      .update({ consultation_id: sessionId })
      .eq("id", patch.photo.generationId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (generationLink.error) throw new Error(generationLink.error.message);
    if (!generationLink.data) throw new Error("GENERATION_NOT_FOUND");
  }
  const v2Patch = isHairfitV2Enabled("CONSULTATION_SESSION_V2_ENABLED")
    ? {
        source_generation_id: next.photo.generationId,
        preferences: {
          currentHair: {
            description: next.discovery.currentHair,
            length: next.discovery.hairLength,
            density: next.discovery.hairDensity,
            strandThickness: next.discovery.strandThickness,
            texture: next.discovery.hairTexture,
            treatmentHistory: next.discovery.treatmentHistory,
            damageLevel: next.discovery.damageLevel,
          },
          styleGoal: {
            imageKeywords: [next.discovery.purpose, ...next.discovery.goals].filter(Boolean),
            changeLevel: next.discovery.changeLevel,
            desiredServices: next.discovery.allowedServices.length
              ? next.discovery.allowedServices
              : next.discovery.desiredServices.filter((service) => service !== "아직 모름"),
            notes: next.discovery.notes,
          },
          maintenance: {
            morningMinutes: next.discovery.morningMinutes,
            heatStyling: next.discovery.heatStyling,
            salonCycleWeeks: next.discovery.salonCycleWeeks,
            maintenanceLevel: next.discovery.maintenanceLevel,
          },
          avoidConditions: next.discovery.avoid,
        },
      }
    : {};
  const { data, error } = await getSupabaseAdminClient().from("consultation_sessions").update({
    version: nextVersion, current_stage: next.currentStage, snapshot: { ...next, version: nextVersion }, updated_at: now, ...v2Patch,
  }).eq("id", sessionId).eq("user_id", userId).eq("version", current.version)
    .select("id,user_id,version,lifecycle_state,current_stage,snapshot,created_at,updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const latest = await readServerConsultation(userId, sessionId);
    if (!latest) throw new Error("NOT_FOUND");
    return { status: "conflict", snapshot: latest };
  }
  return { status: "updated", snapshot: normalizeRow(data as unknown as Row) };
}

export async function refreshServerConsultationAssets(userId: string, sessionId: string, expectedVersion: number): Promise<ConsultationUpdateResult> {
  const current = await readServerConsultation(userId, sessionId);
  if (!current) throw new Error("NOT_FOUND");
  if (current.version !== expectedVersion) return { status: "conflict", snapshot: current };
  const supabase = getSupabaseAdminClient();
  const sign = async (imageUrl: string | null, generatedImagePath: string | null) => generatedImagePath
    ? (await resolveGenerationImageUrl(supabase, { outputUrl: null, generatedImagePath }).catch(() => null)) ?? imageUrl
    : imageUrl;
  const previews = await Promise.all(current.previews.map(async (preview) => ({ ...preview, imageUrl: await sign(preview.imageUrl, preview.generatedImagePath) })));
  const selectedStyleHistory = await Promise.all(current.selectedStyleHistory.map(async (style) => ({ ...style, imageUrl: await sign(style.imageUrl, style.generatedImagePath) })));
  const now = new Date().toISOString();
  const nextVersion = current.version + 1;
  const colorDecision = { ...current.colorDecision, finalImageUrl: await sign(current.colorDecision.finalImageUrl, current.colorDecision.finalImagePath), hairMask: current.colorDecision.hairMask ? { ...current.colorDecision.hairMask, signedUrl: await sign(current.colorDecision.hairMask.signedUrl, current.colorDecision.hairMask.storagePath) } : null };
  const result = { ...current.result, heroImageUrl: await sign(current.result.heroImageUrl, current.result.heroImagePath) };
  const snapshot = { ...current, previews, selectedStyleHistory, colorDecision, result, version: nextVersion, updatedAt: now };
  const { data, error } = await supabase.from("consultation_sessions").update({ version: nextVersion, snapshot, updated_at: now })
    .eq("id", sessionId).eq("user_id", userId).eq("version", current.version)
    .select("id,user_id,version,lifecycle_state,current_stage,snapshot,created_at,updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const latest = await readServerConsultation(userId, sessionId);
    if (!latest) throw new Error("NOT_FOUND");
    return { status: "conflict", snapshot: latest };
  }
  return { status: "updated", snapshot: normalizeRow(data as unknown as Row) };
}

import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import { resolveGenerationImageUrl } from "../generation-image-storage";
import type { ConsultationAnalysisRun, ConsultationLifecycleState, ConsultationPatch, ConsultationSnapshot, FashionPreviewBatch, SelectedStyleSnapshot } from "./contracts";
import { deriveConsultationJourney, isConsultationStage } from "./contracts";
import { createConsultationSnapshot, createPreviewSlots } from "./defaults";
import { validateConsultationPatch } from "./stage-guards";
import { isHairfitV2Enabled } from "../v2/feature-flags";
import { isMissingOptionalTableError } from "./supabase-errors";

type Row = { id: string; user_id: string; version: number; lifecycle_state?: string; current_stage: string; snapshot: unknown; created_at: string; updated_at: string };

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
  id: string; state: FashionPreviewBatch["state"]; completed_count: number; failed_count: number;
  quote_id: string | null; slot_state: Record<string, string> | null;
  error_code: string | null; error_message: string | null; updated_at: string;
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
  return row ? {
    id: row.id,
    state: row.state,
    requestedCount: 9,
    completedCount: row.completed_count,
    failedCount: row.failed_count,
    quoteId: row.quote_id,
    slotState: row.slot_state ?? {},
    errorCode: row.error_code,
    errorMessage: row.error_message,
    updatedAt: row.updated_at,
  } : null;
}

async function hydrateTaskState(snapshot: ConsultationSnapshot) {
  const db = getSupabaseAdminClient();
  const [analysis, fashion] = await Promise.all([
    db.from("consultation_analysis_runs_v2")
      .select("id,state,pipeline,error_code,error_message,attempt_count,started_at,completed_at,updated_at")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("fashion_preview_batches_v2")
      .select("id,state,completed_count,failed_count,quote_id,slot_state,error_code,error_message,updated_at")
      .eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (analysis.error && !isMissingOptionalTableError(analysis.error)) throw new Error(analysis.error.message);
  if (fashion.error && !isMissingOptionalTableError(fashion.error)) throw new Error(fashion.error.message);
  const next = {
    ...snapshot,
    analysisRun: mapAnalysisRun((analysis.error ? null : analysis.data) as unknown as AnalysisRunRow | null),
    fashionBatch: mapFashionBatch((fashion.error ? null : fashion.data) as unknown as FashionBatchRow | null),
  };
  const journey = deriveConsultationJourney(next, next.lifecycleState);
  return { ...next, completedStages: journey.completedStages, journey };
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
    ? (await resolveGenerationImageUrl(supabase, { outputUrl: imageUrl, generatedImagePath }).catch(() => null)) ?? imageUrl
    : imageUrl;
  const signed = {
    ...snapshot,
    previews: await Promise.all(snapshot.previews.map(async (preview) => ({ ...preview, imageUrl: await sign(preview.imageUrl, preview.generatedImagePath) }))),
    selectedStyleHistory: await Promise.all(snapshot.selectedStyleHistory.map(async (style) => ({ ...style, imageUrl: await sign(style.imageUrl, style.generatedImagePath) }))),
  };
  const journey = deriveConsultationJourney(signed, signed.lifecycleState);
  return { ...signed, completedStages: journey.completedStages, journey };
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
  const keys = ["discovery", "photo", "evidence", "faceAnalysis", "personalColor", "strategyRecommendations", "strategy", "previews", "shortlist", "finalist", "salonBrief", "actualService", "careProgram", "fashion"] as const;
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
    next.completedStages = next.completedStages.filter((stage) => ["discovery","photo","scan","analysis","direction"].includes(stage));
    next.previews = createPreviewSlots();
    next.shortlist = clean.shortlist;
    next.finalist = clean.finalist;
    next.salonBrief = clean.salonBrief;
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
  const next = applyPatch(current, patch, now);
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
    ? (await resolveGenerationImageUrl(supabase, { outputUrl: imageUrl, generatedImagePath }).catch(() => null)) ?? imageUrl
    : imageUrl;
  const previews = await Promise.all(current.previews.map(async (preview) => ({ ...preview, imageUrl: await sign(preview.imageUrl, preview.generatedImagePath) })));
  const selectedStyleHistory = await Promise.all(current.selectedStyleHistory.map(async (style) => ({ ...style, imageUrl: await sign(style.imageUrl, style.generatedImagePath) })));
  const now = new Date().toISOString();
  const nextVersion = current.version + 1;
  const snapshot = { ...current, previews, selectedStyleHistory, version: nextVersion, updatedAt: now };
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

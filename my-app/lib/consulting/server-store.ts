import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import { resolveGenerationImageUrl } from "../generation-image-storage";
import type { ConsultationPatch, ConsultationSnapshot, SelectedStyleSnapshot } from "./contracts";
import { isConsultationStage } from "./contracts";
import { createConsultationSnapshot, createPreviewSlots } from "./defaults";
import { validateConsultationPatch } from "./stage-guards";
import { isHairfitV2Enabled } from "../v2/feature-flags";

type Row = { id: string; user_id: string; version: number; current_stage: string; snapshot: unknown; created_at: string; updated_at: string };

function normalizeRow(row: Row): ConsultationSnapshot {
  const snapshot = row.snapshot as ConsultationSnapshot;
  const defaults = createConsultationSnapshot({ sessionId: row.id, userId: row.user_id, now: row.created_at });
  return {
    ...defaults,
    ...snapshot,
    discovery: { ...defaults.discovery, ...snapshot.discovery },
    sessionId: row.id,
    userId: row.user_id,
    version: row.version,
    currentStage: isConsultationStage(row.current_stage) ? row.current_stage : "discovery",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createServerConsultation(userId: string) {
  const sessionId = randomUUID();
  const snapshot = createConsultationSnapshot({ sessionId, userId });
  const { data, error } = await getSupabaseAdminClient().from("consultation_sessions").insert({
    id: sessionId, user_id: userId, version: snapshot.version, current_stage: snapshot.currentStage, snapshot,
  }).select("id,user_id,version,current_stage,snapshot,created_at,updated_at").single();
  if (error) throw new Error(error.message);
  return normalizeRow(data as unknown as Row);
}

export async function readLatestServerConsultation(userId: string) {
  const { data, error } = await getSupabaseAdminClient().from("consultation_sessions")
    .select("id,user_id,version,current_stage,snapshot,created_at,updated_at")
    .eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeRow(data as unknown as Row) : null;
}

export async function readServerConsultation(userId: string, sessionId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("consultation_sessions")
    .select("id,user_id,version,current_stage,snapshot,created_at,updated_at")
    .eq("id", sessionId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const snapshot = normalizeRow(data as unknown as Row);
  const sign = async (imageUrl: string | null, generatedImagePath: string | null) => generatedImagePath
    ? (await resolveGenerationImageUrl(supabase, { outputUrl: imageUrl, generatedImagePath }).catch(() => null)) ?? imageUrl
    : imageUrl;
  return {
    ...snapshot,
    previews: await Promise.all(snapshot.previews.map(async (preview) => ({ ...preview, imageUrl: await sign(preview.imageUrl, preview.generatedImagePath) }))),
    selectedStyleHistory: await Promise.all(snapshot.selectedStyleHistory.map(async (style) => ({ ...style, imageUrl: await sign(style.imageUrl, style.generatedImagePath) }))),
  };
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
  if (patch.currentStage) {
    const currentIndex = ["discovery","photo","scan","analysis","direction","previews","compare","decision","salon-brief","aftercare","fashion"].indexOf(current.currentStage);
    const requestedIndex = ["discovery","photo","scan","analysis","direction","previews","compare","decision","salon-brief","aftercare","fashion"].indexOf(patch.currentStage);
    if (requestedIndex >= currentIndex) next.currentStage = patch.currentStage;
  }
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
  return next;
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
    .select("id,user_id,version,current_stage,snapshot,created_at,updated_at").maybeSingle();
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
    .select("id,user_id,version,current_stage,snapshot,created_at,updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const latest = await readServerConsultation(userId, sessionId);
    if (!latest) throw new Error("NOT_FOUND");
    return { status: "conflict", snapshot: latest };
  }
  return { status: "updated", snapshot: normalizeRow(data as unknown as Row) };
}

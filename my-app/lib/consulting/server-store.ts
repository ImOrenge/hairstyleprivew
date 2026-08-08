import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import { resolveGenerationImageUrl } from "../generation-image-storage";
import type { ConsultationPatch, ConsultationSnapshot, SelectedStyleSnapshot } from "./contracts";
import { isConsultationStage } from "./contracts";
import { createConsultationSnapshot, createPreviewSlots } from "./defaults";
import { validateConsultationPatch } from "./stage-guards";

type Row = { id: string; user_id: string; version: number; current_stage: string; snapshot: unknown; created_at: string; updated_at: string };

function normalizeRow(row: Row): ConsultationSnapshot {
  const snapshot = row.snapshot as ConsultationSnapshot;
  return { ...snapshot, sessionId: row.id, userId: row.user_id, version: row.version, currentStage: isConsultationStage(row.current_stage) ? row.current_stage : "discovery", createdAt: row.created_at, updatedAt: row.updated_at };
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
  const keys = ["discovery", "photo", "evidence", "faceAnalysis", "personalColor", "strategy", "previews", "shortlist", "finalist", "salonBrief", "actualService", "careProgram", "fashion"] as const;
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

export async function updateServerConsultation(userId: string, sessionId: string, patch: ConsultationPatch): Promise<ConsultationUpdateResult> {
  const current = await readServerConsultation(userId, sessionId);
  if (!current) throw new Error("NOT_FOUND");
  if (current.version !== patch.expectedVersion) return { status: "conflict", snapshot: current };
  validateConsultationPatch(current, patch);
  const now = new Date().toISOString();
  const next = applyPatch(current, patch, now);
  const nextVersion = current.version + 1;
  const { data, error } = await getSupabaseAdminClient().from("consultation_sessions").update({
    version: nextVersion, current_stage: next.currentStage, snapshot: { ...next, version: nextVersion }, updated_at: now,
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

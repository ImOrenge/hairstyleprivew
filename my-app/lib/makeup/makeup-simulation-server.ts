import "server-only";

import { randomUUID } from "node:crypto";
import { assessMakeupSimulationQuality, deriveMakeupWorkspaceState, type MakeupSimulationInputV1, type MakeupSimulationOutputV1, type MakeupSimulationRunV1, type MakeupSimulationSelectionSnapshotV1 } from "@hairfit/shared/makeup";
import { capabilityFingerprint } from "../capabilities/runtime";
import { runMakeupSimulationCapability } from "../capabilities/makeup-simulation-service";
import { uploadGenerationResultImage, resolveGenerationImageUrl } from "../generation-image-storage";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";
import { readMakeupDirection } from "./makeup-direction-server";
import { readMakeupInterview } from "./makeup-interview-server";
import { readMakeupSourceImageDataUrl } from "./makeup-source-image-server";

function mapRun(row: Record<string, unknown>): MakeupSimulationRunV1 { return { id: String(row.id), consultationId: String(row.consultation_id), state: row.state as MakeupSimulationRunV1["state"], purpose: "makeup_style_simulation", requestedOutputCount: Number(row.requested_output_count) as 1 | 2, terminalOutputCount: Number(row.terminal_output_count), sourceAssetId: String(row.source_asset_id), sourceFingerprint: String(row.source_fingerprint), inputFingerprint: String(row.input_fingerprint), makeupInterviewRevision: Number(row.makeup_interview_revision), rationaleRevision: Number(row.rationale_revision), directionRevision: Number(row.direction_revision), personalColorProfileId: row.personal_color_profile_id ? String(row.personal_color_profile_id) : null, selectedHairSnapshotId: String(row.selected_hair_snapshot_id), selectedColorSnapshotId: row.selected_color_snapshot_id ? String(row.selected_color_snapshot_id) : null, attemptCount: Number(row.attempt_count), leaseOwner: row.lease_owner ? String(row.lease_owner) : null, leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : null, fencingToken: Number(row.fencing_token), errorCode: row.error_code ? String(row.error_code) : null, errorMessage: row.error_message ? String(row.error_message) : null, startedAt: row.started_at ? String(row.started_at) : null, updatedAt: String(row.updated_at), completedAt: row.completed_at ? String(row.completed_at) : null }; }
async function mapOutput(row: Record<string, unknown>): Promise<MakeupSimulationOutputV1> { const imagePath = row.image_path ? String(row.image_path) : null; return { id: String(row.id), runId: String(row.run_id), variant: row.variant as "primary" | "alternative", state: row.state as MakeupSimulationOutputV1["state"], imagePath, imageUrl: imagePath ? await resolveGenerationImageUrl(getSupabaseAdminClient(), { outputUrl: null, generatedImagePath: imagePath }).catch(() => null) : null, width: row.width == null ? null : Number(row.width), height: row.height == null ? null : Number(row.height), moduleSummary: (row.module_summary as MakeupSimulationOutputV1["moduleSummary"]) ?? [], quality: row.quality as MakeupSimulationOutputV1["quality"], provider: row.provider ? String(row.provider) : null, model: row.model ? String(row.model) : null, modelVersion: row.model_version ? String(row.model_version) : null, createdAt: String(row.created_at) }; }
function mapSelection(row: Record<string, unknown>): MakeupSimulationSelectionSnapshotV1 { return row.snapshot as MakeupSimulationSelectionSnapshotV1; }

export async function readMakeupSimulation(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const [runResult, selectionResult, direction, interview] = await Promise.all([
    db.from("makeup_simulation_runs_v2").select("*").eq("user_id", userId).eq("consultation_id", consultationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("makeup_simulation_selections_v2").select("*").eq("user_id", userId).eq("consultation_id", consultationId).order("revision", { ascending: false }).limit(1).maybeSingle(),
    readMakeupDirection(userId, consultationId), readMakeupInterview(userId, consultationId),
  ]);
  if (runResult.error) throw new Error(runResult.error.message); if (selectionResult.error) throw new Error(selectionResult.error.message);
  const run = runResult.data ? mapRun(runResult.data as unknown as Record<string, unknown>) : null;
  const outputsResult = run ? await db.from("makeup_simulation_outputs_v2").select("*").eq("user_id", userId).eq("run_id", run.id).order("created_at", { ascending: true }) : { data: [], error: null };
  if (outputsResult.error) throw new Error(outputsResult.error.message);
  const outputs = await Promise.all((outputsResult.data ?? []).map((row) => mapOutput(row as unknown as Record<string, unknown>)));
  const selection = selectionResult.data ? mapSelection(selectionResult.data as unknown as Record<string, unknown>) : null;
  return { run, outputs, selection, workspaceState: deriveMakeupWorkspaceState({ interviewConfirmed: interview.confirmed, recommendationDecision: direction.snapshot?.rationale?.decision ?? null, directionStatus: direction.snapshot?.status ?? null, run, selection }) };
}

export async function queueMakeupSimulation(userId: string, consultationId: string) {
  const [direction, interview] = await Promise.all([readMakeupDirection(userId, consultationId), readMakeupInterview(userId, consultationId)]);
  const snapshot = direction.snapshot;
  if (!snapshot || !["confirmed", "routine_ready", "brief_ready"].includes(snapshot.status)) throw new HairfitV2Error("MAKEUP_DIRECTION_REQUIRED", 409, "메이크업 방향을 먼저 확정해 주세요.");
  if (!interview.confirmed || !snapshot.rationale || snapshot.rationale.decision === "pending") throw new HairfitV2Error("MAKEUP_RECOMMENDATION_DECISION_REQUIRED", 409, "메이크업 추천 검토를 먼저 완료해 주세요.");
  const session = await getSupabaseAdminClient().from("consultation_sessions").select("source_photo_id,snapshot").eq("id", consultationId).eq("user_id", userId).maybeSingle();
  if (session.error || !session.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾을 수 없습니다.");
  const sessionSnapshot = session.data.snapshot as { colorDecision?: { id?: string | null }; personalColorDiagnosis?: { evidenceId?: string | null; stylingPalette?: string[]; qualityConfidence?: number | null } };
  const modules = snapshot.modules.map((item) => ({ module: item.module, color: item.direction.colorFamily ?? "neutral", intensity: Math.round(item.direction.intensity * 100), finish: item.direction.texture ?? snapshot.context.finishPreference, reasonCodes: snapshot.rationale?.modules.find((reason) => reason.module === item.module)?.reasonCodes ?? [] }));
  const input: MakeupSimulationInputV1 = { schemaVersion: "makeup-simulation-input-v1", consultationId, sourceAsset: { id: String(session.data.source_photo_id ?? "source-photo"), fingerprint: direction.sourceFingerprint ?? capabilityFingerprint(snapshot.source) }, personalColor: { profileId: snapshot.source.personalColorProfileId, evidenceId: sessionSnapshot.personalColorDiagnosis?.evidenceId ?? null, palette: sessionSnapshot.personalColorDiagnosis?.stylingPalette ?? [], confidence: sessionSnapshot.personalColorDiagnosis?.qualityConfidence ?? null }, makeup: { interviewRevision: interview.profile.confirmedRevision ?? interview.profile.revision, selectedMode: snapshot.rationale.acceptedMode ?? snapshot.rationale.requestedMode, rationaleRevision: snapshot.rationale.revision, adjustmentDecision: snapshot.rationale.decision, modules, exclusions: interview.profile.exclusions }, stylingContext: { hairSnapshotId: snapshot.source.selectedStyleId, colorSnapshotId: sessionSnapshot.colorDecision?.id ?? null, fashionDirectionId: null }, preserve: { identity: true, faceGeometry: true, hair: true, background: true, pose: true, lightingIntent: true }, prohibit: ["skin_shape_change", "face_slimming", "eye_enlargement", "nose_reshaping", "hair_restyle", "background_replacement", "beauty_retouching"] };
  const inputFingerprint = capabilityFingerprint(input);
  const existing = await getSupabaseAdminClient().from("makeup_simulation_runs_v2").select("*").eq("user_id", userId).eq("consultation_id", consultationId).eq("input_fingerprint", inputFingerprint).in("state", ["queued", "preparing", "generating", "quality_review", "partial_ready", "completed"]).maybeSingle();
  if (existing.error) throw new Error(existing.error.message); if (existing.data) return mapRun(existing.data as unknown as Record<string, unknown>);
  const timestamp = new Date().toISOString();
  const inserted = await getSupabaseAdminClient().from("makeup_simulation_runs_v2").insert({ id: randomUUID(), consultation_id: consultationId, user_id: userId, state: "queued", purpose: "makeup_style_simulation", requested_output_count: 1, terminal_output_count: 0, source_asset_id: input.sourceAsset.id, source_fingerprint: input.sourceAsset.fingerprint, input_fingerprint: inputFingerprint, input_snapshot: input, makeup_interview_revision: input.makeup.interviewRevision, rationale_revision: input.makeup.rationaleRevision, direction_revision: snapshot.version, personal_color_profile_id: input.personalColor.profileId, selected_hair_snapshot_id: input.stylingContext.hairSnapshotId, selected_color_snapshot_id: input.stylingContext.colorSnapshotId, attempt_count: 1, started_at: timestamp, updated_at: timestamp }).select("*").single();
  if (inserted.error) throw new Error(inserted.error.message); return mapRun(inserted.data as unknown as Record<string, unknown>);
}

export async function processMakeupSimulation(userId: string, consultationId: string, runId: string) {
  const db = getSupabaseAdminClient(); const rowResult = await db.from("makeup_simulation_runs_v2").select("*").eq("id", runId).eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle();
  if (rowResult.error || !rowResult.data) return; const row = rowResult.data as unknown as Record<string, unknown>; if (!["queued", "retry_required"].includes(String(row.state))) return;
  const input = row.input_snapshot as MakeupSimulationInputV1; const timestamp = new Date().toISOString();
  await db.from("makeup_simulation_runs_v2").update({ state: "generating", updated_at: timestamp }).eq("id", runId).eq("user_id", userId);
  try {
    const imageDataUrl = await readMakeupSourceImageDataUrl(userId, consultationId);
    const result = await runMakeupSimulationCapability({ userId, consultationId, idempotencyKey: `${consultationId}:${input.sourceAsset.fingerprint}:${row.input_fingerprint}`, imageDataUrl, mode: input.makeup.selectedMode, palette: input.personalColor.palette, modules: input.makeup.modules, exclusions: input.makeup.exclusions });
    if (result.state !== "completed" || !result.output?.outputUrl) throw new Error(result.failure?.message || "MAKEUP_SIMULATION_GENERATION_FAILED");
    await db.from("makeup_simulation_runs_v2").update({ state: "quality_review", updated_at: new Date().toISOString() }).eq("id", runId).eq("user_id", userId);
    const uploaded = await uploadGenerationResultImage(db, { userId, generationId: consultationId, variantId: `makeup-simulation-${runId}`, imageDataUrl: result.output.outputUrl });
    const quality = assessMakeupSimulationQuality({ identityPreservation: null, faceGeometryPreservation: null, moduleAdherence: null, colorAdherence: null, backgroundPreservation: null, hairPreservation: null, retouchingRisk: null });
    const output = await db.from("makeup_simulation_outputs_v2").insert({ id: randomUUID(), run_id: runId, consultation_id: consultationId, user_id: userId, variant: "primary", state: quality.status === "reject" ? "quality_rejected" : "ready", image_path: uploaded.path, width: null, height: null, module_summary: input.makeup.modules, quality, provider: result.provenance.provider, model: result.provenance.model, model_version: result.provenance.engineVersion }).select("id").single();
    if (output.error) throw new Error(output.error.message);
    await db.from("makeup_simulation_runs_v2").update({ state: quality.status === "reject" ? "retry_required" : "completed", terminal_output_count: 1, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", runId).eq("user_id", userId);
  } catch (error) { await db.from("makeup_simulation_runs_v2").update({ state: "retry_required", error_code: "MAKEUP_SIMULATION_GENERATION_FAILED", error_message: error instanceof Error ? error.message : "생성 실패", updated_at: new Date().toISOString() }).eq("id", runId).eq("user_id", userId); }
}

export async function confirmMakeupSimulation(userId: string, consultationId: string, runId: string, outputId: string) {
  const db = getSupabaseAdminClient(); const state = await readMakeupSimulation(userId, consultationId); const run = state.run; const output = state.outputs.find((item) => item.id === outputId);
  if (!run || run.id !== runId || !output || output.state !== "ready" || output.quality.status === "reject") throw new HairfitV2Error("MAKEUP_SIMULATION_OUTPUT_NOT_READY", 409, "품질 확인을 통과한 시뮬레이션만 확정할 수 있습니다.");
  const direction = await readMakeupDirection(userId, consultationId); if (!direction.snapshot?.rationale) throw new HairfitV2Error("MAKEUP_DIRECTION_REQUIRED", 409, "메이크업 방향을 찾을 수 없습니다.");
  const latest = await db.from("makeup_simulation_selections_v2").select("id,revision").eq("consultation_id", consultationId).eq("user_id", userId).order("revision", { ascending: false }).limit(1).maybeSingle(); if (latest.error) throw new Error(latest.error.message);
  const timestamp = new Date().toISOString(); const selection: MakeupSimulationSelectionSnapshotV1 = { schemaVersion: "makeup-simulation-selection-v1", id: randomUUID(), consultationId, revision: Number(latest.data?.revision ?? 0) + 1, runId, outputId, sourceAssetId: run.sourceAssetId, inputFingerprint: run.inputFingerprint, makeupInterviewRevision: run.makeupInterviewRevision, rationaleRevision: run.rationaleRevision, directionRevision: run.directionRevision, adjustmentDecision: direction.snapshot.rationale.decision as "accept_adjustment" | "keep_selection", confirmedModuleValues: output.moduleSummary, limitations: output.quality.warnings, confirmedAt: timestamp, supersedesSnapshotId: latest.data?.id ? String(latest.data.id) : null };
  const inserted = await db.from("makeup_simulation_selections_v2").insert({ id: selection.id, consultation_id: consultationId, user_id: userId, revision: selection.revision, run_id: runId, output_id: outputId, input_fingerprint: selection.inputFingerprint, snapshot: selection, confirmed_at: timestamp }).select("*").single(); if (inserted.error) throw new Error(inserted.error.message); return selection;
}

export async function retryMakeupSimulation(userId: string, consultationId: string, runId: string) { const result = await getSupabaseAdminClient().from("makeup_simulation_runs_v2").update({ state: "queued", attempt_count: 2, error_code: null, error_message: null, updated_at: new Date().toISOString() }).eq("id", runId).eq("consultation_id", consultationId).eq("user_id", userId).in("state", ["retry_required", "failed"]).select("*").maybeSingle(); if (result.error) throw new Error(result.error.message); if (!result.data) throw new HairfitV2Error("MAKEUP_SIMULATION_RETRY_NOT_ALLOWED", 409, "현재 상태에서는 다시 시도할 수 없습니다."); return mapRun(result.data as unknown as Record<string, unknown>); }

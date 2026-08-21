import "server-only";

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import type { ConsultationSnapshot, HairMaskArtifact } from "./contracts";
import type { PersonalColorEvidenceV2 } from "@hairfit/shared/v2";
import { measureHairMaskGeometry, normalizeClientHairMask } from "./hair-mask-image";
import { measureReferenceRecolorQuality } from "./color-preview-quality";
import { findHairColorPreviewCandidate, type HairColorCandidateKey } from "./color-preview-candidates";
import { mapPersonalColorDiagnosis } from "./personal-color-mapping";
import { createGenerationImageSignedUrl, downloadGenerationImageDataUrl, GENERATION_RESULTS_BUCKET } from "../generation-image-storage";
import { uploadGenerationResultImage } from "../generation-image-storage";
import { getOpenAIHairColorImageModel, runOpenAIHairColorChangeV2 } from "../openai-image";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";

const MASK_VERSION = "mediapipe-hair-segmenter-float32-v1";

function safeId(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, "_"); }

function dataUrlBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new HairfitV2Error("SELECTED_IMAGE_INVALID", 409, "확정 헤어 이미지를 읽을 수 없습니다.");
  return Buffer.from(match[1], "base64");
}

function mapMask(row: Record<string, unknown>, signedUrl: string | null): HairMaskArtifact {
  return { id: String(row.id), modelVersion: String(row.mask_version), storagePath: String(row.storage_path), signedUrl, sourceImageFingerprint: String(row.source_image_fingerprint), width: Number(row.width), height: Number(row.height), confidence: Number(row.confidence), boundaryScore: Number(row.boundary_score), createdAt: String(row.created_at) };
}

export interface HairMaskArtifactOptions { force?: boolean; maskDataUrl?: string; modelVersion?: string }

export async function ensureHairMaskArtifactV2(userId: string, consultationId: string, options: HairMaskArtifactOptions = {}) {
  const force = options.force === true;
  const db = getSupabaseAdminClient();
  const selection = await db.from("style_selection_snapshots_v2").select("id,snapshot").eq("consultation_id", consultationId).eq("user_id", userId).eq("status", "confirmed").maybeSingle();
  if (selection.error) throw new Error(selection.error.message);
  if (!selection.data) throw new HairfitV2Error("STYLE_SELECTION_REQUIRED", 409, "확정한 헤어스타일이 필요합니다.");
  const selectionRow = selection.data as unknown as { id: string; snapshot: { previewImage?: { path?: string; fingerprint?: string } } };
  const sourcePath = selectionRow.snapshot.previewImage?.path;
  const sourceFingerprint = selectionRow.snapshot.previewImage?.fingerprint;
  if (!sourcePath || !sourceFingerprint) throw new HairfitV2Error("SELECTED_IMAGE_REQUIRED", 409, "확정 헤어 이미지 원본이 필요합니다.");
  const existing = await db.from("hair_mask_artifacts_v2").select("id,mask_version,storage_path,source_image_fingerprint,width,height,confidence,boundary_score,created_at").eq("user_id", userId).eq("selection_snapshot_id", selectionRow.id).eq("source_image_fingerprint", sourceFingerprint).like("mask_version", `${MASK_VERSION}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data && !force) {
    const row = existing.data as unknown as Record<string, unknown>;
    return mapMask(row, await createGenerationImageSignedUrl(db, String(row.storage_path)));
  }
  const imageDataUrl = await downloadGenerationImageDataUrl(db, { generatedImagePath: sourcePath });
  if (!imageDataUrl) throw new HairfitV2Error("SELECTED_IMAGE_REQUIRED", 409, "확정 헤어 이미지를 불러오지 못했습니다.");
  if (!options.maskDataUrl || options.modelVersion !== MASK_VERSION) throw new HairfitV2Error("HAIR_MASK_AI_REQUIRED", 409, "전용 AI 모발 분할을 다시 실행해 주세요.");
  const artifactVersion = force ? `${MASK_VERSION}-retry-${randomUUID()}` : MASK_VERSION;
  const metadata = await sharp(dataUrlBuffer(imageDataUrl)).metadata();
  const width = metadata.width || 1024; const height = metadata.height || 1280;
  let mask: Buffer;
  try { mask = await normalizeClientHairMask(options.maskDataUrl, width, height); }
  catch { throw new HairfitV2Error("HAIR_MASK_AI_INVALID", 422, "AI 모발 마스크가 원본 좌표와 일치하지 않습니다."); }
  const geometryQuality = await measureHairMaskGeometry(mask);
  if (!geometryQuality.passed) throw new HairfitV2Error("HAIR_MASK_GEOMETRY_INVALID", 422, "AI 모발 영역이 비정상적으로 감지되어 다시 분석해야 합니다.");
  const boundaryScore = geometryQuality.boundaryScore;
  const id = randomUUID();
  const digest = createHash("sha256").update(`${sourceFingerprint}:${artifactVersion}`).digest("hex");
  const path = `${safeId(userId)}/consultations/${consultationId}/color-studio/masks/${digest}.png`;
  const uploaded = await db.storage.from(GENERATION_RESULTS_BUCKET).upload(path, mask, { contentType: "image/png", upsert: false });
  if (uploaded.error && !/already exists/i.test(uploaded.error.message)) throw new Error(uploaded.error.message);
  const inserted = await db.from("hair_mask_artifacts_v2").insert({ id, consultation_id: consultationId, user_id: userId, selection_snapshot_id: selectionRow.id, source_image_fingerprint: sourceFingerprint, mask_version: artifactVersion, storage_path: path, width, height, confidence: geometryQuality.confidence, boundary_score: boundaryScore, quality_state: boundaryScore >= 0.7 ? "usable" : boundaryScore >= 0.45 ? "warning" : "retry_required", quality_details: { method: MASK_VERSION, source: "on-device-semantic-segmentation", coordinateSpace: "confirmed-preview", coverage: geometryQuality.coverage, coveragePolicy: geometryQuality.policy } }).select("id,mask_version,storage_path,source_image_fingerprint,width,height,confidence,boundary_score,created_at").single();
  if (inserted.error) throw new Error(inserted.error.message);
  const row = inserted.data as unknown as Record<string, unknown>;
  return mapMask(row, await createGenerationImageSignedUrl(db, path));
}

export type HairColorGenerationPurposeV1 = "exploration" | "final";
export type HairColorGenerationQualityV1 = "low" | "medium";
export interface HairColorGenerationInputV1 { candidateKey: HairColorCandidateKey; purpose: HairColorGenerationPurposeV1 }
export interface HairColorRequestV1 {
  candidateKey: HairColorCandidateKey;
  purpose: HairColorGenerationPurposeV1;
  quality: HairColorGenerationQualityV1;
  colorName: string;
  swatchHex: string;
  technique: "full" | "root" | "highlight" | "balayage" | "ombre";
  targetLevel: number | null;
  intensity: number;
  temperature: number;
  saturation: number;
  rootDepth: number;
  rationale: string[];
  bleachPolicy: string;
  maintenance: string;
  cautions: string[];
}

const HAIR_COLOR_QUALITY_BY_PURPOSE: Record<HairColorGenerationPurposeV1, HairColorGenerationQualityV1> = {
  exploration: "low",
  final: "medium",
};

function isCandidateKey(value: unknown): value is HairColorCandidateKey {
  return value === "best-match" || value === "natural" || value === "accent";
}

function readStoredHairColorRequest(qualityResult: unknown): HairColorRequestV1 {
  const request = (qualityResult as { request?: Partial<HairColorRequestV1> } | null)?.request;
  if (!request) throw new Error("COLOR_REQUEST_MISSING");
  if (!isCandidateKey(request.candidateKey)) throw new Error("COLOR_CANDIDATE_KEY_MISSING");
  const purpose: HairColorGenerationPurposeV1 = request.purpose === "exploration" ? "exploration" : "final";
  return { ...request, purpose, quality: HAIR_COLOR_QUALITY_BY_PURPOSE[purpose] } as HairColorRequestV1;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function activePersonalColorProfileId(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("active_personal_color_profiles_v2").select("profile_id").eq("user_id", userId).eq("consultation_id", consultationId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data as { profile_id?: string } | null)?.profile_id ?? null;
}

export async function queueHairColorGenerationV2(userId: string, consultationId: string, input: HairColorGenerationInputV1) {
  if (!isCandidateKey(input.candidateKey)) throw new HairfitV2Error("COLOR_CANDIDATE_INVALID", 400, "컬러 후보를 다시 선택해 주세요.");
  if (!Object.hasOwn(HAIR_COLOR_QUALITY_BY_PURPOSE, input.purpose)) throw new HairfitV2Error("COLOR_GENERATION_PURPOSE_INVALID", 400, "탐색 또는 최종 생성 목적을 확인해 주세요.");
  const db = getSupabaseAdminClient();
  const [selection, session, personalColor, personalColorProfileId] = await Promise.all([
    db.from("style_selection_snapshots_v2").select("id,snapshot").eq("consultation_id", consultationId).eq("user_id", userId).eq("status", "confirmed").single(),
    db.from("consultation_sessions").select("snapshot").eq("id", consultationId).eq("user_id", userId).single(),
    db.from("personal_color_evidence_v2").select("id,consultation_id,source_analysis_evidence_id,model,quality,result,created_at").eq("consultation_id", consultationId).eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    activePersonalColorProfileId(userId, consultationId),
  ]);
  if (selection.error) throw new Error(selection.error.message); if (session.error) throw new Error(session.error.message); if (personalColor.error) throw new Error(personalColor.error.message);
  const row = selection.data as unknown as { id: string; snapshot: { previewImage?: { fingerprint?: string } } };
  const consultation = structuredClone((session.data as unknown as { snapshot: ConsultationSnapshot }).snapshot);
  if (personalColor.data) {
    const evidenceRow = personalColor.data as unknown as Record<string, unknown>;
    const evidence = {
      schemaVersion: (evidenceRow.result as Record<string, unknown> | null)?.axes ? "personal-color-evidence-v2" : "personal-color-evidence-v1",
      id: String(evidenceRow.id), consultationId: String(evidenceRow.consultation_id), sourceAnalysisEvidenceId: String(evidenceRow.source_analysis_evidence_id),
      model: evidenceRow.model, quality: evidenceRow.quality, result: evidenceRow.result, createdAt: String(evidenceRow.created_at),
    } as PersonalColorEvidenceV2;
    consultation.personalColorDiagnosis = mapPersonalColorDiagnosis(evidence);
  }
  if (consultation.personalColorDiagnosis.state !== "ready") throw new HairfitV2Error("PERSONAL_COLOR_REQUIRED", 409, "퍼스널 컬러 진단을 먼저 완료해 주세요.");
  const candidate = findHairColorPreviewCandidate(consultation, input.candidateKey);
  if (!candidate) throw new HairfitV2Error("COLOR_CANDIDATE_INVALID", 400, "컬러 후보를 다시 선택해 주세요.");
  const request: HairColorRequestV1 = {
    candidateKey: candidate.key, purpose: input.purpose, quality: HAIR_COLOR_QUALITY_BY_PURPOSE[input.purpose],
    colorName: candidate.salonName, swatchHex: candidate.swatchHex, technique: candidate.technique, targetLevel: candidate.targetLevel,
    intensity: candidate.intensity, temperature: candidate.temperature, saturation: candidate.saturation, rootDepth: candidate.rootDepth,
    rationale: candidate.rationale, bleachPolicy: candidate.bleachPolicy, maintenance: candidate.maintenance, cautions: candidate.cautions,
  };
  const inputFingerprint = createHash("sha256").update(stable({ policy: "hair-color-reference-recolor-v3", selectionId: row.id, source: row.snapshot.previewImage?.fingerprint, evidenceId: consultation.personalColorDiagnosis.evidenceId, personalColorProfileId, request })).digest("hex");
  const idempotencyKey = `${consultationId}:${row.id}:hair-color:${inputFingerprint}`;
  const replay = await db.from("hair_color_generation_runs_v2").select("*").eq("user_id", userId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (replay.error) throw new Error(replay.error.message);
  if (replay.data) return replay.data as unknown as Record<string, unknown>;
  const inserted = await db.from("hair_color_generation_runs_v2").insert({ consultation_id: consultationId, user_id: userId, selection_snapshot_id: row.id, personal_color_profile_id: personalColorProfileId, hair_mask_id: null, idempotency_key: idempotencyKey, input_fingerprint: inputFingerprint, state: "queued", prompt_policy_version: "hair-color-reference-recolor-v3", model: getOpenAIHairColorImageModel(), attempt_count: 0, heartbeat_at: new Date().toISOString(), quality_result: { request } }).select("*").single();
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data as unknown as Record<string, unknown>;
}

export async function processHairColorGenerationV2(userId: string, runId: string) {
  const db = getSupabaseAdminClient(); const now = new Date().toISOString();
  const pending = await db.from("hair_color_generation_runs_v2").select("attempt_count").eq("id", runId).eq("user_id", userId).eq("state", "queued").maybeSingle();
  if (pending.error) throw new Error(pending.error.message); if (!pending.data) return;
  const attemptCount = Number((pending.data as { attempt_count?: number }).attempt_count ?? 0) + 1;
  const claimed = await db.from("hair_color_generation_runs_v2").update({ state: "generating", attempt_count: attemptCount, started_at: now, heartbeat_at: now, lease_expires_at: new Date(Date.now() + 120_000).toISOString(), updated_at: now }).eq("id", runId).eq("user_id", userId).eq("state", "queued").select("*").maybeSingle();
  if (claimed.error) throw new Error(claimed.error.message); if (!claimed.data) return;
  const run = claimed.data as unknown as Record<string, unknown>;
  let request: HairColorRequestV1 | null = null;
  const heartbeat = setInterval(() => { const at = new Date().toISOString(); void db.from("hair_color_generation_runs_v2").update({ heartbeat_at: at, lease_expires_at: new Date(Date.now() + 120_000).toISOString(), updated_at: at }).eq("id", runId).eq("user_id", userId).eq("state", "generating"); }, 20_000);
  try {
    const selection = await db.from("style_selection_snapshots_v2").select("snapshot").eq("id", String(run.selection_snapshot_id)).eq("user_id", userId).single();
    if (selection.error) throw new Error(selection.error.message);
    const selectionSnapshot = (selection.data as unknown as { snapshot: { previewImage: { path: string } } }).snapshot;
    request = readStoredHairColorRequest(run.quality_result);
    const imageDataUrl = await downloadGenerationImageDataUrl(db, { generatedImagePath: selectionSnapshot.previewImage.path });
    if (!imageDataUrl) throw new Error("COLOR_SOURCE_ASSET_MISSING");
    const generated = await runOpenAIHairColorChangeV2({ imageDataUrl, ...request });
    const quality = await measureReferenceRecolorQuality(imageDataUrl, generated.outputUrl);
    await db.from("hair_color_generation_runs_v2").update({ state: "quality", quality_result: { request, purpose: request.purpose, quality: request.quality, usage: generated.usage, lockPolicy: "hair-color-reference-recolor-v3", ...quality }, heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", runId).eq("user_id", userId).eq("state", "generating");
    if (!quality.passed) throw new Error(`REFERENCE_RECOLOR_QUALITY_FAILED:${quality.aspectRatioDelta.toFixed(4)}:${quality.globalChange.toFixed(4)}`);
    const uploaded = await uploadGenerationResultImage(db, { userId, generationId: String(run.consultation_id), variantId: `hair-color-${runId}`, imageDataUrl: generated.outputUrl });
    const completedAt = new Date().toISOString();
    const finished = await db.from("hair_color_generation_runs_v2").update({ state: "completed", provider: "openai", model: generated.model, output_bucket: GENERATION_RESULTS_BUCKET, output_path: uploaded.path, quality_result: { request, purpose: request.purpose, quality: request.quality, usage: generated.usage, lockPolicy: "hair-color-reference-recolor-v3", ...quality }, heartbeat_at: completedAt, lease_expires_at: null, completed_at: completedAt, updated_at: completedAt }).eq("id", runId).eq("user_id", userId).eq("state", "quality");
    if (finished.error) throw new Error(finished.error.message);
  } catch (error) {
    const failedAt = new Date().toISOString(); const message = error instanceof Error ? error.message : "컬러 확정본 생성 실패";
    const retry = request?.purpose === "final" && attemptCount < 2;
    await db.from("hair_color_generation_runs_v2").update({ state: retry ? "queued" : "retry_required", error_code: "HAIR_COLOR_GENERATION_FAILED", error_message: message, heartbeat_at: failedAt, lease_expires_at: null, updated_at: failedAt }).eq("id", runId).eq("user_id", userId);
    if (retry) { clearInterval(heartbeat); await processHairColorGenerationV2(userId, runId); }
  } finally { clearInterval(heartbeat); }
}

export async function getHairColorGenerationV2(userId: string, consultationId: string, runId?: string, purpose?: HairColorGenerationPurposeV1, candidateKey?: HairColorCandidateKey) {
  const db = getSupabaseAdminClient(); let query = db.from("hair_color_generation_runs_v2").select("*").eq("consultation_id", consultationId).eq("user_id", userId);
  if (!runId && purpose) query = query.contains("quality_result", { request: { purpose } });
  if (!runId && candidateKey) query = query.contains("quality_result", { request: { candidateKey } });
  query = runId ? query.eq("id", runId) : query.order("created_at", { ascending: false }).limit(1);
  const result = await query.maybeSingle(); if (result.error) throw new Error(result.error.message); if (!result.data) return null;
  let row = result.data as unknown as Record<string, unknown>;
  if (["generating", "quality"].includes(String(row.state)) && typeof row.lease_expires_at === "string" && Date.parse(row.lease_expires_at) <= Date.now()) {
    const request = readStoredHairColorRequest(row.quality_result);
    const canRetry = request.purpose === "final" && Number(row.attempt_count || 0) < 2; const at = new Date().toISOString();
    const recovered = await db.from("hair_color_generation_runs_v2").update({ state: canRetry ? "queued" : "retry_required", error_code: "HAIR_COLOR_LEASE_EXPIRED", error_message: canRetry ? "정체된 생성 작업을 자동 복구합니다." : "자동 재시도 횟수를 모두 사용했습니다.", lease_expires_at: null, updated_at: at }).eq("id", String(row.id)).eq("user_id", userId).eq("state", String(row.state)).select("*").maybeSingle();
    if (recovered.error) throw new Error(recovered.error.message); if (recovered.data) row = recovered.data as unknown as Record<string, unknown>;
  }
  const outputPath = typeof row.output_path === "string" ? row.output_path : null;
  return { ...row, outputUrl: outputPath ? await createGenerationImageSignedUrl(db, outputPath) : null } as Record<string, unknown>;
}

export async function confirmColorSelectionV2(userId: string, consultationId: string, runId: string) {
  const db = getSupabaseAdminClient();
  const runResult = await db.from("hair_color_generation_runs_v2").select("*").eq("id", runId).eq("consultation_id", consultationId).eq("user_id", userId).eq("state", "completed").maybeSingle();
  if (runResult.error) throw new Error(runResult.error.message); if (!runResult.data) throw new HairfitV2Error("HAIR_COLOR_RESULT_NOT_READY", 409, "고품질 컬러 결과가 완료되지 않았습니다.");
  const run = runResult.data as unknown as Record<string, unknown>; const inputFingerprint = String(run.input_fingerprint);
  const personalColorProfileId = await activePersonalColorProfileId(userId, consultationId);
  if ((run.personal_color_profile_id ?? null) !== personalColorProfileId) throw new HairfitV2Error("PERSONAL_COLOR_PROFILE_CHANGED", 409, "퍼스널 컬러 결과가 업데이트되어 컬러 프리뷰를 다시 계산해야 합니다.");
  const replay = await db.from("color_selection_snapshots_v2").select("*").eq("user_id", userId).eq("input_fingerprint", inputFingerprint).maybeSingle();
  if (replay.error) throw new Error(replay.error.message); if (replay.data) return replay.data as unknown as Record<string, unknown>;
  const latest = await db.from("color_selection_snapshots_v2").select("snapshot_version").eq("consultation_id", consultationId).order("snapshot_version", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new Error(latest.error.message);
  const request = readStoredHairColorRequest(run.quality_result);
  if (request.purpose !== "final") throw new HairfitV2Error("FINAL_HAIR_COLOR_REQUIRED", 409, "최종 품질로 생성한 컬러 결과만 확정할 수 있습니다.");
  const personalColor = await db.from("personal_color_evidence_v2").select("id").eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle();
  if (personalColor.error) throw new Error(personalColor.error.message);
  const snapshotVersion = Number((latest.data as { snapshot_version?: number } | null)?.snapshot_version ?? 0) + 1; const confirmedAt = new Date().toISOString();
  const implementation = { bleachPolicy: request.bleachPolicy, maintenance: request.maintenance, warnings: request.cautions };
  const snapshot = { schemaVersion: "color-selection-snapshot-v2", consultationId, selectionSnapshotId: run.selection_snapshot_id, personalColorEvidenceId: (personalColor.data as { id?: string } | null)?.id ?? null, personalColorProfileId, hairMaskId: run.hair_mask_id, generationRunId: run.id, inputFingerprint, color: request, implementation, output: { bucket: run.output_bucket, path: run.output_path }, promptPolicyVersion: run.prompt_policy_version, provider: run.provider, model: run.model, confirmedAt };
  const inserted = await db.from("color_selection_snapshots_v2").insert({ consultation_id: consultationId, user_id: userId, selection_snapshot_id: run.selection_snapshot_id, personal_color_evidence_id: snapshot.personalColorEvidenceId, personal_color_profile_id: personalColorProfileId, hair_mask_id: run.hair_mask_id, generation_run_id: run.id, snapshot_version: snapshotVersion, status: "confirmed", input_fingerprint: inputFingerprint, snapshot, confirmed_at: confirmedAt }).select("*").single();
  if (inserted.error) throw new Error(inserted.error.message); return inserted.data as unknown as Record<string, unknown>;
}

export async function confirmColorTerminalV2(userId: string, consultationId: string, state: "keep-current" | "deferred" | "salon-review") {
  const db = getSupabaseAdminClient();
  const selection = await db.from("style_selection_snapshots_v2").select("id,snapshot").eq("consultation_id", consultationId).eq("user_id", userId).eq("status", "confirmed").single();
  if (selection.error) throw new Error(selection.error.message);
  const row = selection.data as unknown as { id: string; snapshot: { previewImage?: { fingerprint?: string } } };
  const inputFingerprint = createHash("sha256").update(stable({ policy: "hair-color-terminal-v1", selectionId: row.id, source: row.snapshot.previewImage?.fingerprint, state })).digest("hex");
  const replay = await db.from("color_selection_snapshots_v2").select("*").eq("user_id", userId).eq("input_fingerprint", inputFingerprint).maybeSingle();
  if (replay.error) throw new Error(replay.error.message); if (replay.data) return replay.data as unknown as Record<string, unknown>;
  const [latest, personalColor, personalColorProfileId] = await Promise.all([
    db.from("color_selection_snapshots_v2").select("snapshot_version").eq("consultation_id", consultationId).order("snapshot_version", { ascending: false }).limit(1).maybeSingle(),
    db.from("personal_color_evidence_v2").select("id").eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle(),
    activePersonalColorProfileId(userId, consultationId),
  ]);
  if (latest.error) throw new Error(latest.error.message); if (personalColor.error) throw new Error(personalColor.error.message);
  const snapshotVersion = Number((latest.data as { snapshot_version?: number } | null)?.snapshot_version ?? 0) + 1; const confirmedAt = new Date().toISOString();
  const snapshot = { schemaVersion: "color-selection-snapshot-v2", consultationId, selectionSnapshotId: row.id, personalColorEvidenceId: (personalColor.data as { id?: string } | null)?.id ?? null, personalColorProfileId, hairMaskId: null, generationRunId: null, inputFingerprint, terminalState: state, output: null, promptPolicyVersion: "hair-color-terminal-v1", provider: null, model: null, confirmedAt };
  const inserted = await db.from("color_selection_snapshots_v2").insert({ consultation_id: consultationId, user_id: userId, selection_snapshot_id: row.id, personal_color_evidence_id: snapshot.personalColorEvidenceId, personal_color_profile_id: personalColorProfileId, hair_mask_id: null, generation_run_id: null, snapshot_version: snapshotVersion, status: state.replace("-", "_"), input_fingerprint: inputFingerprint, snapshot, confirmed_at: confirmedAt }).select("*").single();
  if (inserted.error) throw new Error(inserted.error.message); return inserted.data as unknown as Record<string, unknown>;
}

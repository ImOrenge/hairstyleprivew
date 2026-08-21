import type { ColorDecisionSnapshot, ConsultationResultSummary, HairMaskArtifact } from "./contracts";

export type ColorSelectionRow = { id: string; snapshot_version: number; status: string; input_fingerprint: string; hair_mask_id: string | null; snapshot: Record<string, unknown>; confirmed_at: string };
export type HairMaskRow = { id: string; mask_version: string; storage_path: string; source_image_fingerprint: string; width: number; height: number; confidence: number; boundary_score: number; created_at: string };
export type ResultSnapshotRow = { id: string; snapshot_version: number; snapshot: ConsultationResultSummary; compiled_at: string };

function mapHairMask(row: HairMaskRow | undefined): HairMaskArtifact | null {
  return row ? { id: row.id, modelVersion: row.mask_version, storagePath: row.storage_path, signedUrl: null, sourceImageFingerprint: row.source_image_fingerprint, width: row.width, height: row.height, confidence: row.confidence, boundaryScore: row.boundary_score, createdAt: row.created_at } : null;
}

export function mapColorSelection(base: ColorDecisionSnapshot, row: ColorSelectionRow | null, masks: HairMaskRow[]): ColorDecisionSnapshot {
  if (!row) return base;
  const payload = row.snapshot ?? {};
  const request = payload.color && typeof payload.color === "object" ? payload.color as Partial<ColorDecisionSnapshot> : {};
  const implementation = payload.implementation && typeof payload.implementation === "object" ? payload.implementation as Partial<ColorDecisionSnapshot> : {};
  const output = payload.output && typeof payload.output === "object" ? payload.output as { path?: unknown } : {};
  const terminalState = row.status === "confirmed" ? "confirmed" : row.status.replaceAll("_", "-") as ColorDecisionSnapshot["state"];
  const terminalColorName = terminalState === "keep-current" ? "현재 색상 유지"
    : terminalState === "deferred" ? "염색 결정 보류"
      : terminalState === "salon-review" ? "살롱 최종 검토" : base.colorName;
  const mask = row.hair_mask_id ? mapHairMask(masks.find((item) => item.id === row.hair_mask_id)) : null;
  const finalImagePath = typeof output.path === "string" ? output.path : null;
  return {
    ...base,
    ...request,
    id: row.id,
    revision: row.snapshot_version,
    state: terminalState,
    selectionSnapshotId: typeof payload.selectionSnapshotId === "string" ? payload.selectionSnapshotId : base.selectionSnapshotId,
    personalColorEvidenceId: typeof payload.personalColorEvidenceId === "string" ? payload.personalColorEvidenceId : null,
    hairMask: mask,
    colorName: typeof request.colorName === "string" ? request.colorName : terminalColorName,
    bleachPolicy: typeof implementation.bleachPolicy === "string" ? implementation.bleachPolicy : base.bleachPolicy,
    maintenance: typeof implementation.maintenance === "string" ? implementation.maintenance : base.maintenance,
    warnings: Array.isArray(implementation.warnings) ? implementation.warnings.filter((item): item is string => typeof item === "string") : base.warnings,
    finalImagePath,
    finalImageUrl: finalImagePath === base.finalImagePath ? base.finalImageUrl : null,
    generationAttemptId: typeof payload.generationRunId === "string" ? payload.generationRunId : null,
    inputFingerprint: row.input_fingerprint,
    confirmedAt: row.confirmed_at,
    updatedAt: row.confirmed_at,
  };
}

export function mapResultSnapshot(base: ConsultationResultSummary, row: ResultSnapshotRow | null): ConsultationResultSummary {
  if (!row || row.snapshot_version < base.version) return base;
  return { ...base, ...row.snapshot, id: row.id, version: row.snapshot_version, compiledAt: row.compiled_at };
}

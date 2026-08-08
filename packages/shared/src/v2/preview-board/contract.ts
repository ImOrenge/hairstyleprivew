import type { PromptSpecV2, PreviewStrategyBucketV2 } from "../prompt/contract";

export type AttemptStatusV2 = "queued" | "leased" | "generating" | "accepted" | "rejected" | "failed";
export type AttemptRejectionCodeV2 = "provider_timeout" | "face_identity_drift" | "face_geometry_artifact" | "hair_mask_failure" | "style_mismatch" | "background_damage" | "near_duplicate" | "safety_policy" | "unknown";
export interface PreviewQualityMetricsV2 { identitySimilarity: number; styleMatch: number; geometryIntegrity: number; artifactFreedom: number; backgroundPreservation: number; hairBoundary: number; safety: boolean; exactDuplicate: boolean; nearDuplicate: boolean }
export interface PreviewQualityDecisionV2 { accepted: boolean; rejectionCodes: AttemptRejectionCodeV2[] }
export interface GenerationAttemptV2 { id: string; previewVariantId: string; attemptNumber: number; provider: string; model: string; promptVersion: string; promptHash: string; slotIntent: string; status: AttemptStatusV2; rejectionCodes: AttemptRejectionCodeV2[]; outputUrl: string | null; outputFingerprint: string | null; latencyMs: number | null; createdAt: string; finishedAt: string | null }
export interface GenerationAttemptAuditV2 extends Omit<GenerationAttemptV2, "outputUrl"> { promptInputSnapshot: PromptSpecV2["normalizedInput"]; outputPath: string | null; providerCostMinor: number | null; leaseToken: string | null; leaseExpiresAt: string | null }
export interface PreviewVariantV2 { id: string; boardId: string; slot: number; bucket: PreviewStrategyBucketV2; intent: string; catalogItemId: string | null; acceptedAttemptId: string | null; status: "pending" | "generating" | "accepted"; attempts: GenerationAttemptV2[] }
export interface PreviewBoardV2 { schemaVersion: "preview-board-v1"; id: string; consultationId: string; version: number; strategyVersion: string; requestedCount: 9; acceptedCount: number; state: "queued" | "generating" | "ready" | "failed"; variants: PreviewVariantV2[]; createdAt: string; readyAt: string | null }

export function assertPreviewBoardInvariant(board: PreviewBoardV2) {
  if (board.variants.length !== 9 || new Set(board.variants.map((item) => item.slot)).size !== 9) throw new Error("PREVIEW_BOARD_REQUIRES_NINE_UNIQUE_SLOTS");
  const accepted = board.variants.filter((item) => item.acceptedAttemptId).length;
  if (accepted !== board.acceptedCount) throw new Error("PREVIEW_BOARD_ACCEPTED_COUNT_MISMATCH");
  if (board.state === "ready" && accepted !== 9) throw new Error("PREVIEW_BOARD_READY_REQUIRES_NINE_ACCEPTED");
}

export function evaluatePreviewQualityV2(metrics: PreviewQualityMetricsV2): PreviewQualityDecisionV2 {
  const rejectionCodes: AttemptRejectionCodeV2[] = [];
  if (!metrics.safety) rejectionCodes.push("safety_policy");
  if (metrics.identitySimilarity < 0.88) rejectionCodes.push("face_identity_drift");
  if (metrics.geometryIntegrity < 0.82 || metrics.artifactFreedom < 0.82) rejectionCodes.push("face_geometry_artifact");
  if (metrics.hairBoundary < 0.8) rejectionCodes.push("hair_mask_failure");
  if (metrics.styleMatch < 0.75) rejectionCodes.push("style_mismatch");
  if (metrics.backgroundPreservation < 0.9) rejectionCodes.push("background_damage");
  if (metrics.exactDuplicate || metrics.nearDuplicate) rejectionCodes.push("near_duplicate");
  return { accepted: rejectionCodes.length === 0, rejectionCodes };
}

function perceptualHashFromFingerprint(value: string) {
  return /^sha256:[a-f0-9]{64};dhash:([a-f0-9]{64})$/.exec(value)?.[1] ?? null;
}

export function perceptualHashDistanceV2(left: string, right: string) {
  const leftHash = perceptualHashFromFingerprint(left);
  const rightHash = perceptualHashFromFingerprint(right);
  if (!leftHash || !rightHash) return null;
  let difference = BigInt(`0x${leftHash}`) ^ BigInt(`0x${rightHash}`);
  let distance = 0;
  while (difference > BigInt(0)) {
    distance += Number(difference & BigInt(1));
    difference >>= BigInt(1);
  }
  return distance;
}

export function isNearDuplicateFingerprintV2(candidate: string, accepted: string[], maximumDistance = 6) {
  return accepted.some((fingerprint) => {
    if (fingerprint === candidate) return false;
    const distance = perceptualHashDistanceV2(candidate, fingerprint);
    return distance !== null && distance <= maximumDistance;
  });
}

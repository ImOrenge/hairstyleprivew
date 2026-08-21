import type { MakeupMode } from "./interview.ts";
import type { MakeupModule } from "./contract.ts";

export type MakeupSimulationRunState = "idle" | "queued" | "preparing" | "generating" | "quality_review" | "partial_ready" | "completed" | "retry_required" | "failed" | "cancelled";
export type MakeupSimulationOutputState = "pending" | "generated" | "quality_rejected" | "ready" | "failed";
export type MakeupWorkspaceStateV2 = "interview" | "recommendation_preparing" | "recommendation_review" | "direction_review" | "simulation_queued" | "simulation_generating" | "simulation_partial" | "simulation_review" | "simulation_retry_required" | "simulation_failed" | "confirmed";

export interface MakeupSimulationModuleSummaryV1 { module: MakeupModule; color: string; intensity: number; finish: string; reasonCodes: string[] }
export interface MakeupSimulationQualityV1 { identityPreservation: number | null; faceGeometryPreservation: number | null; moduleAdherence: number | null; colorAdherence: number | null; backgroundPreservation: number | null; hairPreservation: number | null; retouchingRisk: number | null; status: "pending" | "pass" | "warning" | "reject"; warnings: string[] }
export interface MakeupSimulationRunV1 { id: string; consultationId: string; state: MakeupSimulationRunState; purpose: "makeup_style_simulation"; requestedOutputCount: 1 | 2; terminalOutputCount: number; sourceAssetId: string; sourceFingerprint: string; inputFingerprint: string; makeupInterviewRevision: number; rationaleRevision: number; directionRevision: number; personalColorProfileId: string | null; selectedHairSnapshotId: string; selectedColorSnapshotId: string | null; attemptCount: number; leaseOwner: string | null; leaseExpiresAt: string | null; fencingToken: number; errorCode: string | null; errorMessage: string | null; startedAt: string | null; updatedAt: string; completedAt: string | null }
export interface MakeupSimulationOutputV1 { id: string; runId: string; variant: "primary" | "alternative"; state: MakeupSimulationOutputState; imagePath: string | null; imageUrl: string | null; width: number | null; height: number | null; moduleSummary: MakeupSimulationModuleSummaryV1[]; quality: MakeupSimulationQualityV1; provider: string | null; model: string | null; modelVersion: string | null; createdAt: string }
export interface MakeupSimulationSelectionSnapshotV1 { schemaVersion: "makeup-simulation-selection-v1"; id: string; consultationId: string; revision: number; runId: string; outputId: string; sourceAssetId: string; inputFingerprint: string; makeupInterviewRevision: number; rationaleRevision: number; directionRevision: number; adjustmentDecision: "accept_adjustment" | "keep_selection"; confirmedModuleValues: MakeupSimulationModuleSummaryV1[]; limitations: string[]; confirmedAt: string; supersedesSnapshotId: string | null }
export interface MakeupSimulationInputV1 { schemaVersion: "makeup-simulation-input-v1"; consultationId: string; sourceAsset: { id: string; fingerprint: string }; personalColor: { profileId: string | null; evidenceId: string | null; palette: string[]; confidence: number | null }; makeup: { interviewRevision: number; selectedMode: MakeupMode; rationaleRevision: number; adjustmentDecision: "accept_adjustment" | "keep_selection"; modules: MakeupSimulationModuleSummaryV1[]; exclusions: string[] }; stylingContext: { hairSnapshotId: string; colorSnapshotId: string | null; fashionDirectionId: string | null }; preserve: { identity: true; faceGeometry: true; hair: true; background: true; pose: true; lightingIntent: true }; prohibit: readonly ["skin_shape_change", "face_slimming", "eye_enlargement", "nose_reshaping", "hair_restyle", "background_replacement", "beauty_retouching"] }

export function deriveMakeupWorkspaceState(input: { interviewConfirmed: boolean; recommendationDecision: "pending" | "accept_adjustment" | "keep_selection" | null; directionStatus: string | null; run: MakeupSimulationRunV1 | null; selection: MakeupSimulationSelectionSnapshotV1 | null }): MakeupWorkspaceStateV2 {
  if (input.selection) return "confirmed";
  if (!input.interviewConfirmed) return "interview";
  if (!input.recommendationDecision) return "recommendation_preparing";
  if (input.recommendationDecision === "pending") return "recommendation_review";
  if (!input.directionStatus || ["context_draft", "geometry_building"].includes(input.directionStatus)) return "direction_review";
  if (!input.run || ["idle", "queued"].includes(input.run.state)) return "simulation_queued";
  if (["preparing", "generating", "quality_review"].includes(input.run.state)) return "simulation_generating";
  if (input.run.state === "partial_ready") return "simulation_partial";
  if (input.run.state === "completed") return "simulation_review";
  if (input.run.state === "retry_required") return "simulation_retry_required";
  if (input.run.state === "failed") return "simulation_failed";
  return "direction_review";
}

export function assessMakeupSimulationQuality(metrics: Omit<MakeupSimulationQualityV1, "status" | "warnings">): MakeupSimulationQualityV1 {
  const warnings: string[] = [];
  const reject = [metrics.identityPreservation, metrics.faceGeometryPreservation, metrics.backgroundPreservation, metrics.hairPreservation].some((value) => value !== null && value < 0.75) || (metrics.retouchingRisk !== null && metrics.retouchingRisk > 0.45);
  if (metrics.identityPreservation === null || metrics.faceGeometryPreservation === null) warnings.push("자동 identity·geometry 확인이 제한되어 원본과 직접 비교해 주세요.");
  if (metrics.colorAdherence === null) warnings.push("조명과 화면에 따라 실제 발색은 달라질 수 있습니다.");
  return { ...metrics, status: reject ? "reject" : warnings.length ? "warning" : "pass", warnings };
}

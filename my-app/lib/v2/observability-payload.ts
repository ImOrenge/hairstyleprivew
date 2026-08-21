const ALLOWED_PAYLOAD_KEYS = new Set([
  "attempt", "boardId", "capability", "catalogCycleId", "completedUnits", "conflictCount",
  "coverageCount", "durationMs", "engineVersion", "errorCode", "fallbackMode", "generationId",
  "interviewKind", "latencyMs", "legacyAllowed", "legacyProjectionHash", "matched", "model",
  "offeringVersion", "projectionHash", "promptPolicyVersion", "provider", "providerCostMinor",
  "readyCount", "reason", "receiptState", "rejectionCode", "rejectionCodes", "revision",
  "schemaVersion", "skipCount", "slotCount", "snapshotId", "snapshotVersion", "source",
  "sourceRevision", "state", "taskId", "topicId", "totalUnits", "units", "v2Allowed",
  "v2ProjectionHash", "v2Reason", "variantId", "module", "moduleCount", "presentation",
  "preparationMinutes", "skillLevel", "directionPolicyVersion", "geometryAdjusted", "directionAdjusted",
  "policyVersion", "requestedCount", "acceptedCount", "confidence", "rank",
  "surface", "reportRevision", "reportFingerprint", "hairGeneratedCount",
  "fashionGeneratedCount", "fashionRequestedCount", "mismatch", "rolloutFlag",
]);
const SAFE_STRING = /^[a-zA-Z0-9_.:@/+\-]{1,160}$/;

export function sanitizeV2EventPayload(payload: Record<string, unknown>) {
  const safe: Record<string, string | number | boolean | null | string[]> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) continue;
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      safe[key] = value;
      continue;
    }
    if (typeof value === "string" && SAFE_STRING.test(value)) {
      safe[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.length <= 20 && value.every((item) => typeof item === "string" && SAFE_STRING.test(item))) {
      safe[key] = value;
    }
  }
  return safe;
}

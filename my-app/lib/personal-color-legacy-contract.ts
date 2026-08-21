import type { PersonalColorResult } from "./fashion-types";

export const LEGACY_PERSONAL_COLOR_MAX_DATA_URL_LENGTH = 12_000_000;

export type LegacyPersonalColorRequestValidation =
  | { ok: true; referenceImageDataUrl: string }
  | { ok: false; error: "referenceImageDataUrl is required" | "referenceImageDataUrl is too large" };

export function validateLegacyPersonalColorAnalyzeRequest(body: unknown): LegacyPersonalColorRequestValidation {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const referenceImageDataUrl = typeof source.referenceImageDataUrl === "string" ? source.referenceImageDataUrl.trim() : "";
  if (!referenceImageDataUrl) return { ok: false, error: "referenceImageDataUrl is required" };
  if (referenceImageDataUrl.length > LEGACY_PERSONAL_COLOR_MAX_DATA_URL_LENGTH) return { ok: false, error: "referenceImageDataUrl is too large" };
  return { ok: true, referenceImageDataUrl };
}

export interface LegacyPersonalColorCapabilityEnvelope {
  taskId: string;
  state: string;
  provenance: unknown;
}

export function buildLegacyPersonalColorSuccessResponse(
  personalColor: PersonalColorResult,
  capability: LegacyPersonalColorCapabilityEnvelope,
) {
  return { personalColor, capability: { taskId: capability.taskId, state: capability.state, provenance: capability.provenance } };
}

import { createHash } from "node:crypto";
import type { PersonalColorResult } from "./fashion-types";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalize(item)]));
}

export function hashPersonalColorProjection(result: PersonalColorResult) {
  return createHash("sha256").update(JSON.stringify(canonicalize(result))).digest("hex");
}

export function comparePersonalColorProjectionHashes(legacy: PersonalColorResult, v2Projection: PersonalColorResult | null) {
  const legacyProjectionHash = hashPersonalColorProjection(legacy);
  const v2ProjectionHash = v2Projection ? hashPersonalColorProjection(v2Projection) : null;
  return {
    legacyProjectionHash,
    v2ProjectionHash,
    matched: v2ProjectionHash === null ? null : legacyProjectionHash === v2ProjectionHash,
  };
}

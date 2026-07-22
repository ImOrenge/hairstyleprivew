import { getConfirmedStyleVariantMediaSummary } from "@hairfit/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function relatedGeneration(value: unknown) {
  if (Array.isArray(value)) {
    return value.find(isRecord) ?? null;
  }
  return isRecord(value) ? value : null;
}

export function getConfirmedStyleMediaFromRelation(value: unknown) {
  const generation = relatedGeneration(value);
  return getConfirmedStyleVariantMediaSummary(
    generation?.options,
    generation?.selected_variant_id,
  );
}

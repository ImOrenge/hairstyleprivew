import type { ConsultationGenerationInputSnapshotV2, PromptInputV2 } from "@hairfit/shared/v2";
import type { ConsultationSnapshot } from "../consulting/contracts";
import type { RecommendationCandidate } from "../recommendation-types";

export type ConsultationPromptInputRow = {
  id: string;
  snapshot: ConsultationSnapshot;
  preferences: Record<string, unknown>;
  generationInput?: ConsultationGenerationInputSnapshotV2;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "unknown";
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function enumText<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : fallback;
}

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

export function buildPromptInputV2(
  row: ConsultationPromptInputRow,
  analysisEvidence: PromptInputV2["analysisEvidence"],
  personalColor: PromptInputV2["personalColor"],
  recommendations: RecommendationCandidate[],
): PromptInputV2 {
  const snapshot = row.snapshot;
  const preferences = object(row.preferences);
  const currentHair = object(preferences.currentHair);
  const styleGoal = object(preferences.styleGoal);
  const maintenance = object(preferences.maintenance);
  const strategyConfirmed = Boolean(snapshot.strategy.confirmedAt);

  return {
    schemaVersion: "prompt-input-v2",
    consultationId: row.id,
    styleTarget: row.generationInput?.styleTarget ?? "neutral",
    generationInputFingerprint: row.generationInput?.inputFingerprint ?? "legacy-consultation-input",
    analysisEvidence,
    personalColor,
    currentHair: {
      description: optionalText(currentHair.description ?? snapshot.discovery.currentHair),
      length: optionalText(currentHair.length ?? snapshot.discovery.hairLength),
      density: optionalText(currentHair.density ?? snapshot.discovery.hairDensity),
      strandThickness: optionalText(currentHair.strandThickness ?? snapshot.discovery.strandThickness),
      texture: optionalText(currentHair.texture ?? snapshot.discovery.hairTexture),
      treatmentHistory: stringList(currentHair.treatmentHistory ?? snapshot.discovery.treatmentHistory),
      damageLevel: optionalText(currentHair.damageLevel ?? snapshot.discovery.damageLevel),
    },
    styleGoal: {
      imageKeywords: stringList(styleGoal.imageKeywords ?? [snapshot.discovery.purpose, ...snapshot.discovery.goals]),
      desiredLength: optionalText(
        styleGoal.desiredLength ?? (strategyConfirmed ? snapshot.strategy.length : undefined),
      ),
      changeLevel: enumText(
        styleGoal.changeLevel ?? snapshot.discovery.changeLevel,
        ["subtle", "moderate", "bold", "unknown"] as const,
        "unknown",
      ),
      desiredServices: stringList(styleGoal.desiredServices ?? snapshot.discovery.allowedServices),
      notes: optionalText(styleGoal.notes ?? snapshot.discovery.notes),
    },
    maintenance: {
      morningMinutes: finiteNumber(maintenance.morningMinutes ?? snapshot.discovery.morningMinutes, 0, 240),
      heatStyling: enumText(
        maintenance.heatStyling ?? snapshot.discovery.heatStyling,
        ["avoid", "sometimes", "comfortable", "unknown"] as const,
        "unknown",
      ),
      salonCycleWeeks: finiteNumber(maintenance.salonCycleWeeks ?? snapshot.discovery.salonCycleWeeks, 1, 52),
      maintenanceLevel: enumText(
        maintenance.maintenanceLevel ?? snapshot.discovery.maintenanceLevel,
        ["low", "medium", "high", "unknown"] as const,
        "unknown",
      ),
    },
    avoidConditions: stringList(preferences.avoidConditions ?? snapshot.discovery.avoid),
    catalogCycleId: recommendations[0]?.catalogCycleId ?? "unknown",
    catalog: recommendations.map((candidate) => ({
      id: candidate.catalogItemId ?? candidate.id,
      cycleId: candidate.catalogCycleId ?? "unknown",
      name: candidate.label,
      promptTemplateVersion: candidate.promptTemplateVersion ?? "unknown",
      design: {
        providerPrompt: candidate.prompt,
        providerNegativePrompt: candidate.negativePrompt,
        reason: candidate.reason,
        tags: candidate.tags,
        lengthBucket: candidate.lengthBucket,
        correctionFocus: candidate.correctionFocus,
      },
    })),
  };
}

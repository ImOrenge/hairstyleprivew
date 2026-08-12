import type { ConsultationGenerationInputSnapshotV2, StyleSelectionSnapshotV2 } from "@hairfit/shared/v2";
import type { SelectedStyleSnapshot } from "./contracts.ts";

type HairDecision = ConsultationGenerationInputSnapshotV2["hairDecision"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

export function resolveConfirmedHairDecisionV2(input: {
  selectionSnapshot: StyleSelectionSnapshotV2 | null | undefined;
  selectionId?: string | null;
  selectionConfirmedAt?: string | null;
  activeStyle: SelectedStyleSnapshot | null;
}): HairDecision {
  const { selectionSnapshot, activeStyle } = input;
  if (selectionSnapshot) {
    const design = record(selectionSnapshot.style.design);
    const selectedServices = strings(design.services);
    const selectedLimitations = strings(design.limitations);
    return {
      selectionSnapshotId: input.selectionId ?? selectionSnapshot.id,
      label: selectionSnapshot.style.name,
      reason: selectionSnapshot.style.recommendationReason,
      services: selectedServices.length ? selectedServices : activeStyle?.services ?? [],
      maintenance: text(design.maintenance, activeStyle?.maintenance ?? "확인 전"),
      limitations: selectedLimitations.length ? selectedLimitations : activeStyle?.limitations ?? [],
      design: {
        length: text(design.length, activeStyle?.strategy.length ?? "확인 전"),
        fringe: text(design.fringe, activeStyle?.strategy.fringe ?? "확인 전"),
        parting: text(design.parting, activeStyle?.strategy.parting ?? "확인 전"),
        crownVolume: text(design.crownVolume, activeStyle?.strategy.crownVolume ?? "확인 전"),
        sideVolume: text(design.sideVolume, activeStyle?.strategy.sideVolume ?? "확인 전"),
        texture: text(design.texture, activeStyle?.strategy.texture ?? "확인 전"),
        color: text(record(selectionSnapshot.style.color).direction, activeStyle?.strategy.color ?? "확인 전"),
      },
      selectedAt: input.selectionConfirmedAt ?? selectionSnapshot.confirmedAt ?? selectionSnapshot.selectedAt,
    };
  }
  if (!activeStyle) return null;
  return {
    selectionSnapshotId: activeStyle.id,
    label: activeStyle.label,
    reason: activeStyle.reason,
    services: activeStyle.services,
    maintenance: activeStyle.maintenance,
    limitations: activeStyle.limitations,
    design: {
      length: activeStyle.strategy.length,
      fringe: activeStyle.strategy.fringe,
      parting: activeStyle.strategy.parting,
      crownVolume: activeStyle.strategy.crownVolume,
      sideVolume: activeStyle.strategy.sideVolume,
      texture: activeStyle.strategy.texture,
      color: activeStyle.strategy.color,
    },
    selectedAt: input.selectionConfirmedAt ?? activeStyle.selectedAt,
  };
}

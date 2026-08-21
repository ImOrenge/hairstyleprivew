export type ConsultationStyleTargetV2 = "male" | "female" | "neutral";

export type ConsultationInputProvenanceSourceV2 =
  | "member-profile"
  | "discovery-interview"
  | "photo-analysis"
  | "hair-trait-analysis"
  | "personal-color-analysis"
  | "strategy-confirmation"
  | "style-selection"
  | "hair-color-selection"
  | "fashion-interview"
  | "body-profile"
  | "actual-service";

export interface ConsultationInputProvenanceV2 {
  source: ConsultationInputProvenanceSourceV2;
  sourceId: string;
  capturedAt: string;
  fieldPaths: string[];
}

export interface ConsultationGenerationInputSnapshotV2 {
  schemaVersion: "consultation-generation-input-v1";
  consultationId: string;
  consultationVersion: number;
  capturedAt: string;
  inputFingerprint: string;
  styleTarget: ConsultationStyleTargetV2;
  currentHair: {
    description: string;
    length: string;
    density: string;
    strandThickness: string;
    texture: string;
    treatmentHistory: string[];
    damageLevel: string;
    profile?: {
      id: string;
      revision: number;
      sourceFingerprint: string;
      observations: Array<{ traitId: string; value: string; confidence: number }>;
      reported: Record<string, unknown>;
      inferred: Array<{ traitId: string; value: string; confidence: number }>;
      unknownFieldIds: string[];
      unresolvedFieldIds: string[];
    } | null;
  };
  goals: {
    purpose: string;
    imageKeywords: string[];
    changeLevel: string;
    desiredServices: string[];
    notes: string;
  };
  maintenance: {
    morningMinutes: number | null;
    heatStyling: string;
    salonCycleWeeks: number | null;
    maintenanceLevel: string;
  };
  avoidConditions: string[];
  analysis: {
    evidenceId: string | null;
    faceShape: string;
    faceShapeBlend: Record<string, number>;
    summary: string;
  };
  personalColor: {
    evidenceId: string | null;
    profileV2?: {
      id: string;
      version: number;
      axes: Record<string, { value: number; confidence: number }>;
      harmonyPalette: { best: string[]; base: string[]; accent: string[]; challenge: string[]; metals: string[] };
    };
    season: string;
    undertone: string;
    confidence: number | null;
    bestColors: string[];
    avoidColors: string[];
  } | null;
  hairDecision: {
    selectionSnapshotId: string;
    label: string;
    reason: string;
    services: string[];
    maintenance: string;
    limitations: string[];
    design: {
      length: string;
      fringe: string;
      parting: string;
      crownVolume: string;
      sideVolume: string;
      texture: string;
      color: string;
    };
    selectedAt: string;
  } | null;
  hairColorDecision?: {
    colorSelectionSnapshotId: string;
    state: string;
    colorName: string;
    swatchHex: string;
    technique: string;
    targetLevel: number | null;
    finalImagePath: string | null;
    confirmedAt: string;
  } | null;
  fashion: {
    direction: {
      situation: string;
      genre: string;
      season: string;
      fit: string;
      exposure: string;
      budget: string;
      avoidItems: string[];
    };
    bodyProfile: {
      heightCm: number | null;
      bodyShape: string | null;
      topSize: string | null;
      bottomSize: string | null;
      fitPreference: string | null;
      exposurePreference: string | null;
      avoidItems: string[];
    } | null;
  };
  actualService: {
    services: string[];
    serviceDate: string | null;
    designerNotes: string;
    confirmedAt: string;
  } | null;
  provenance: ConsultationInputProvenanceV2[];
}

export interface ConsultationGenerationInputLinkV2 {
  schemaVersion: "consultation-generation-input-v1";
  inputFingerprint: string;
  styleTarget: ConsultationStyleTargetV2;
  capturedAt: string;
  provenance: ConsultationInputProvenanceV2[];
}

export function projectConsultationGenerationInputV2(snapshot: ConsultationGenerationInputSnapshotV2): ConsultationGenerationInputLinkV2 {
  return {
    schemaVersion: snapshot.schemaVersion,
    inputFingerprint: snapshot.inputFingerprint,
    styleTarget: snapshot.styleTarget,
    capturedAt: snapshot.capturedAt,
    provenance: snapshot.provenance,
  };
}

export function validateConsultationGenerationInputV2(snapshot: ConsultationGenerationInputSnapshotV2) {
  const errors: string[] = [];
  if (snapshot.schemaVersion !== "consultation-generation-input-v1") errors.push("schemaVersion");
  if (!/^[a-f0-9]{64}$/.test(snapshot.inputFingerprint)) errors.push("inputFingerprint");
  if (!["male", "female", "neutral"].includes(snapshot.styleTarget)) errors.push("styleTarget");
  if (!Number.isFinite(Date.parse(snapshot.capturedAt))) errors.push("capturedAt");
  if (!snapshot.provenance.length) errors.push("provenance");
  for (const [index, item] of snapshot.provenance.entries()) {
    if (!item.source || !item.sourceId || !Number.isFinite(Date.parse(item.capturedAt)) || !item.fieldPaths.length) errors.push(`provenance[${index}]`);
  }
  if (snapshot.personalColor?.profileV2 && (!snapshot.personalColor.profileV2.id || snapshot.personalColor.profileV2.version < 1)) errors.push("personalColor.profileV2");
  if (snapshot.currentHair.profile && (!snapshot.currentHair.profile.id || snapshot.currentHair.profile.revision < 1 || !snapshot.currentHair.profile.sourceFingerprint)) errors.push("currentHair.profile");
  return errors;
}

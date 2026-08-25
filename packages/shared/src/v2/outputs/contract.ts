import type { FashionCategory, FashionDirectionSnapshot, FashionLookItem } from "../../consulting/contract.ts";
import type { ConsultationGenerationInputLinkV2 } from "../generation-input/contract.ts";

export interface SnapshotLinkedOutputV2 { consultationId: string; selectionSnapshotId: string; version: number; createdAt: string }
export interface SalonBriefV2 extends SnapshotLinkedOutputV2 {
  schemaVersion: "salon-brief-v2";
  audience: "customer" | "designer";
  summary: string;
  cut: Record<string, unknown>;
  volumeTexture: Record<string, unknown>;
  color: Record<string, unknown> | null;
  styling: string[];
  cautions: string[];
  engine: { id: "legacy-designer-brief-v1"; mode: "recycled-blueprint" | "structured-fallback" };
  inputSnapshot: ConsultationGenerationInputLinkV2;
  recommendationSources: {
    cut: string[];
    volumeTexture: string[];
    color: string[];
    styling: string[];
    cautions: string[];
    maintenance: string[];
    aftercare: string[];
    fashion: string[];
  };
  details: {
    consultationGoals: string[];
    currentHair: string[];
    decisionRationale: string[];
    evidence: string[];
    personalColor: string[];
    services: { cut: string[]; perm: string[]; color: string[] };
    design: { length: string; volume: string; fringeParting: string; texture: string };
    maintenance: string[];
    aftercare: string[];
    fashionLink: string[];
    designerNotes: string[];
    unresolved: string[];
  };
}
export interface AftercareProgramV2 extends SnapshotLinkedOutputV2 {
  schemaVersion: "aftercare-program-v2";
  actualServiceId: string;
  today: string[];
  checkpoints: Array<{ offset: "D+1" | "D+3" | "D+7" | "D+30" | "D+45" | "D+90"; action: string; complete: boolean }>;
  concerns: string[];
  satisfaction: number | null;
  inputSnapshot: ConsultationGenerationInputLinkV2;
}
export interface FashionPreviewCandidateV2 {
  stylingSessionId: string;
  selectionSnapshotId: string;
  slotId: string;
  category: FashionCategory;
  genre: string;
  direction: FashionDirectionSnapshot;
  status: "recommended" | "generating" | "completed" | "failed" | string;
  headline: string;
  summary: string;
  palette: string[];
  silhouette: string;
  neckline: string;
  items: FashionLookItem[];
  shoppingKeywords: string[];
  imageUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string | null;
}
export interface FashionPreviewSetV2 extends SnapshotLinkedOutputV2 {
  schemaVersion: "fashion-preview-set-v2";
  personalColorEvidenceId: string | null;
  personalColorProfileId?: string | null;
  colorSelectionSnapshotId: string | null;
  selectedHairSnapshotId: string;
  stylingSessionIds: string[];
  selectedStylingSessionId: string;
  directionSnapshot: FashionDirectionSnapshot;
  inputSnapshot: ConsultationGenerationInputLinkV2;
  selectedLook: {
    slotId: string;
    category: FashionCategory;
    genre: string;
    label: string;
    items: FashionLookItem[];
    palette: string[];
    neckline: string;
    silhouette: string;
    shoppingKeywords: string[];
  };
}

const REQUIRED_SALON_BRIEF_DETAIL_LISTS: Array<keyof Pick<SalonBriefV2["details"],
  "consultationGoals" | "currentHair" | "decisionRationale" | "evidence" | "maintenance" | "aftercare" | "fashionLink"
>> = ["consultationGoals", "currentHair", "decisionRationale", "evidence", "maintenance", "aftercare", "fashionLink"];

export function validateSalonBriefV2(brief: SalonBriefV2) {
  const errors: string[] = [];
  if (brief.schemaVersion !== "salon-brief-v2") errors.push("schemaVersion");
  if (!brief.summary.trim()) errors.push("summary");
  if (brief.engine.id !== "legacy-designer-brief-v1") errors.push("engine.id");
  if (!/^[a-f0-9]{64}$/.test(brief.inputSnapshot.inputFingerprint)) errors.push("inputSnapshot.inputFingerprint");
  if (!["male", "female", "neutral"].includes(brief.inputSnapshot.styleTarget)) errors.push("inputSnapshot.styleTarget");
  if (!brief.inputSnapshot.provenance.length) errors.push("inputSnapshot.provenance");
  for (const section of ["cut", "volumeTexture", "color", "styling", "cautions", "maintenance", "aftercare", "fashion"] as const) {
    if (!brief.recommendationSources[section].length) errors.push(`recommendationSources.${section}`);
  }
  if (!Object.keys(brief.cut).length) errors.push("cut");
  if (!Object.keys(brief.volumeTexture).length) errors.push("volumeTexture");
  if (!brief.styling.length) errors.push("styling");
  if (!brief.cautions.length) errors.push("cautions");
  for (const field of REQUIRED_SALON_BRIEF_DETAIL_LISTS) {
    if (!brief.details[field].length) errors.push(`details.${field}`);
  }
  for (const service of ["cut", "perm", "color"] as const) {
    if (!Array.isArray(brief.details.services[service])) errors.push(`details.services.${service}`);
  }
  for (const field of ["length", "volume", "fringeParting", "texture"] as const) {
    if (!brief.details.design[field].trim()) errors.push(`details.design.${field}`);
  }
  return errors;
}

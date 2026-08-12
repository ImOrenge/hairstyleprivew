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
  checkpoints: Array<{ offset: "D+3" | "W+2" | "W+6" | "W+10"; action: string; complete: boolean }>;
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

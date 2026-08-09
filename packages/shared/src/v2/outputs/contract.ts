import type { FashionCategory, FashionDirectionSnapshot, FashionLookItem } from "../../consulting/contract.ts";

export interface SnapshotLinkedOutputV2 { consultationId: string; selectionSnapshotId: string; version: number; createdAt: string }
export interface SalonBriefV2 extends SnapshotLinkedOutputV2 { schemaVersion: "salon-brief-v2"; audience: "customer" | "designer"; summary: string; cut: Record<string, unknown>; volumeTexture: Record<string, unknown>; color: Record<string, unknown> | null; styling: string[]; cautions: string[] }
export interface AftercareProgramV2 extends SnapshotLinkedOutputV2 {
  schemaVersion: "aftercare-program-v2";
  actualServiceId: string;
  today: string[];
  checkpoints: Array<{ offset: "D+3" | "W+2" | "W+6" | "W+10"; action: string; complete: boolean }>;
  concerns: string[];
  satisfaction: number | null;
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

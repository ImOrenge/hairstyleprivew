import type { FashionCategory, FashionLookItem } from "./consulting/contract.ts";

export type CustomerStylebookViewV2 = "hair" | "fashion";

export interface CustomerStylebookHairEntryV2 {
  kind: "hair";
  id: string;
  consultationId: string;
  previewVariantId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  confirmedAt: string;
}

export interface CustomerStylebookFashionEntryV2 {
  kind: "fashion";
  id: string;
  consultationId: string;
  selectionSnapshotId: string;
  selectedStylingSessionId: string;
  title: string;
  category: FashionCategory;
  genre: string;
  palette: string[];
  silhouette: string;
  neckline: string;
  items: FashionLookItem[];
  shoppingKeywords: string[];
  imageUrl: string | null;
  confirmedAt: string;
}

export interface CustomerStylebookV2 {
  schemaVersion: "customer-stylebook-v2";
  hair: CustomerStylebookHairEntryV2[];
  fashion: CustomerStylebookFashionEntryV2[];
}

import type { FashionCategory, FashionLookItem } from "./consulting/contract.ts";

export type CustomerStylebookItemKindV2 = "hair" | "fashion";
export type CustomerStylebookViewV2 = CustomerStylebookItemKindV2 | "sets";
export type CustomerStylebookSortV2 = "recent" | "confirmed" | "favorite" | "satisfaction";
export type CustomerStylebookCollectionColorV2 = "champagne" | "ivory" | "graphite" | "rose" | "sage";

export interface CustomerStylebookItemStateV2 {
  customTitle: string | null;
  note: string;
  tags: string[];
  favorite: boolean;
  archivedAt: string | null;
  updatedAt: string | null;
}

export interface CustomerStylebookItemRefV2 {
  kind: CustomerStylebookItemKindV2;
  id: string;
  consultationId: string;
}

export interface CustomerStylebookHairEntryV2 {
  kind: "hair";
  id: string;
  consultationId: string;
  previewVariantId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  confirmedAt: string;
  strategyBucket: string;
  length: string;
  bang: string;
  texture: string;
  volume: string[];
  maintenanceLevel: string;
  state: CustomerStylebookItemStateV2;
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
  state: CustomerStylebookItemStateV2;
}

export interface CustomerStylebookSetV2 {
  id: string;
  consultationId: string;
  hairEntryId: string;
  fashionEntryId: string;
  title: string;
  mood: string;
  palette: string[];
  confirmedAt: string;
}

export interface CustomerStylebookCollectionV2 {
  id: string;
  name: string;
  colorKey: CustomerStylebookCollectionColorV2;
  sortOrder: number;
  itemRefs: CustomerStylebookItemRefV2[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerStylebookWearLogV2 {
  id: string;
  item: CustomerStylebookItemRefV2;
  appliedOn: string;
  applicationType: "hair_service" | "outfit_worn" | "other";
  satisfaction: number;
  convenience: number;
  reactionNote: string;
  note: string;
  wouldRepeat: boolean;
  photoUrl: string | null;
  photoConsentedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerStylebookShareV2 {
  id: string;
  item: CustomerStylebookItemRefV2;
  includePrivateNote: boolean;
  includeActualPhoto: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface CustomerStylebookReferenceV2 {
  id: string;
  source: CustomerStylebookItemRefV2;
  newConsultationId: string;
  createdAt: string;
}

export interface CustomerStylebookConsultationReferenceContextV2 {
  item: CustomerStylebookItemRefV2 & {
    title: string;
    imageUrl: string | null;
  };
  createdAt: string;
}

export interface CustomerStylebookV2 {
  schemaVersion: "customer-stylebook-v2";
  hair: CustomerStylebookHairEntryV2[];
  fashion: CustomerStylebookFashionEntryV2[];
  sets: CustomerStylebookSetV2[];
  collections: CustomerStylebookCollectionV2[];
  wearLogs: CustomerStylebookWearLogV2[];
  activeShares: CustomerStylebookShareV2[];
  references: CustomerStylebookReferenceV2[];
  metadataAvailable: boolean;
}

export interface CustomerStylebookItemStatePatchV2 {
  kind: CustomerStylebookItemKindV2;
  itemId: string;
  customTitle?: string | null;
  note?: string;
  tags?: string[];
  favorite?: boolean;
  archived?: boolean;
}

export interface CustomerStylebookCollectionMutationV2 {
  action: "create_collection" | "update_collection" | "delete_collection" | "set_collection_item";
  collectionId?: string;
  name?: string;
  colorKey?: CustomerStylebookCollectionColorV2;
  item?: CustomerStylebookItemRefV2;
  included?: boolean;
}

export interface CustomerStylebookShareRequestV2 {
  item: CustomerStylebookItemRefV2;
  hours: 24 | 168 | 720;
  includePrivateNote: boolean;
  includeActualPhoto: boolean;
}

export interface CustomerStylebookWearLogRequestV2 {
  item: CustomerStylebookItemRefV2;
  appliedOn: string;
  applicationType: CustomerStylebookWearLogV2["applicationType"];
  satisfaction: number;
  convenience: number;
  reactionNote: string;
  note: string;
  wouldRepeat: boolean;
}

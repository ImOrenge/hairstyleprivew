import type { FaceAnalysisSummary, GeneratedVariant } from "./recommendation-types";

export type FashionOccasion = "daily" | "work" | "date" | "formal";
export type FashionMood = "minimal" | "trendy" | "soft" | "classic";
export type FashionGenre =
  | "minimal"
  | "street"
  | "casual"
  | "classic"
  | "office"
  | "date"
  | "formal"
  | "athleisure";
export type BodyShape = "straight" | "hourglass" | "triangle" | "inverted_triangle" | "round";
export type FitPreference = "regular" | "slim" | "relaxed" | "oversized";
export type ExposurePreference = "low" | "balanced" | "bold";
export type FashionItemSlot = "outer" | "top" | "bottom" | "shoes" | "accessory";
export type FashionCatalogStatus = "active" | "archived";
export type FashionCatalogCycleStatus = "running" | "succeeded" | "failed";
export type PersonalColorTone = "warm" | "cool" | "neutral";
export type PersonalColorContrast = "low" | "medium" | "high";

export interface PersonalColorSwatch {
  nameKo: string;
  nameEn: string;
  hex: string;
  reason: string;
}

export interface PersonalColorResult {
  tone: PersonalColorTone;
  contrast: PersonalColorContrast;
  confidence: number;
  bestColors: PersonalColorSwatch[];
  avoidColors: PersonalColorSwatch[];
  stylingPalette: string[];
  hairColorHints: string[];
  summary: string;
  diagnosedAt: string;
  model: string;
}

export interface StyleProfile {
  userId: string;
  heightCm: number | null;
  bodyShape: BodyShape | null;
  topSize: string | null;
  bottomSize: string | null;
  fitPreference: FitPreference | null;
  colorPreference: string | null;
  exposurePreference: ExposurePreference | null;
  avoidItems: string[];
  personalColor: PersonalColorResult | null;
  bodyPhotoPath: string | null;
  bodyPhotoUrl?: string | null;
  bodyPhotoConsentAt: string | null;
  updatedAt: string | null;
}

export interface FashionRecommendationItem {
  slot: FashionItemSlot;
  name: string;
  description: string;
  color: string;
  fit: string;
  material: string;
  brandName: string | null;
  productUrl: string | null;
}

export interface FashionCatalogSourceSummary {
  mode: "seeded-weekly" | "researched-weekly";
  queries: string[];
  notes: string;
  providers?: string[];
  documentsCollected?: number;
  documentsUsed?: number;
  sourceNames?: string[];
  topGenreSignals?: Array<{
    genre: FashionGenre;
    labelKo: string;
    signalCount: number;
  }>;
}

export interface FashionCatalogCycle {
  cycleId: string;
  status: FashionCatalogCycleStatus;
  market: string;
  startedAt: string;
  finishedAt: string | null;
  itemCount: number;
  sourceSummary: FashionCatalogSourceSummary | null;
  errorLog: string | null;
}

export interface FashionCatalogRow {
  id: string;
  slug: string;
  genre: FashionGenre;
  headline: string;
  summary: string;
  market: string;
  palette: string[];
  silhouette: string;
  items: FashionRecommendationItem[];
  stylingNotes: string[];
  tags: string[];
  trendScore: number;
  freshnessScore: number;
  status: FashionCatalogStatus;
  sourceCycleId: string;
  sourceSummary: FashionCatalogSourceSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface FashionRecommendation {
  headline: string;
  summary: string;
  genre: FashionGenre;
  occasion?: FashionOccasion;
  mood?: FashionMood;
  palette: string[];
  silhouette: string;
  items: FashionRecommendationItem[];
  stylingNotes: string[];
  catalogItemId?: string | null;
  catalogCycleId?: string | null;
  sourceSummary?: FashionCatalogSourceSummary | null;
  generatedAt: string;
}

export interface FashionRecommendationInput {
  profile: StyleProfile;
  hairVariant: GeneratedVariant;
  analysis: FaceAnalysisSummary | null;
  genre: FashionGenre;
  catalogItem: FashionCatalogRow;
}

export const FASHION_OCCASIONS: FashionOccasion[] = ["daily", "work", "date", "formal"];
export const FASHION_MOODS: FashionMood[] = ["minimal", "trendy", "soft", "classic"];
export const FASHION_GENRES: FashionGenre[] = [
  "minimal",
  "street",
  "casual",
  "classic",
  "office",
  "date",
  "formal",
  "athleisure",
];
export const BODY_SHAPES: BodyShape[] = [
  "straight",
  "hourglass",
  "triangle",
  "inverted_triangle",
  "round",
];
export const FIT_PREFERENCES: FitPreference[] = ["regular", "slim", "relaxed", "oversized"];
export const EXPOSURE_PREFERENCES: ExposurePreference[] = ["low", "balanced", "bold"];

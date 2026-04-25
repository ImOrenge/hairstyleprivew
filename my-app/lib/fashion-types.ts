import type { FaceAnalysisSummary, GeneratedVariant } from "./recommendation-types";

export type FashionOccasion = "daily" | "work" | "date" | "formal";
export type FashionMood = "minimal" | "trendy" | "soft" | "classic";
export type BodyShape = "straight" | "hourglass" | "triangle" | "inverted_triangle" | "round";
export type FitPreference = "regular" | "slim" | "relaxed" | "oversized";
export type ExposurePreference = "low" | "balanced" | "bold";
export type FashionItemSlot = "outer" | "top" | "bottom" | "shoes" | "accessory";

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

export interface FashionRecommendation {
  headline: string;
  summary: string;
  occasion: FashionOccasion;
  mood: FashionMood;
  palette: string[];
  silhouette: string;
  items: FashionRecommendationItem[];
  stylingNotes: string[];
  generatedAt: string;
}

export interface FashionRecommendationInput {
  profile: StyleProfile;
  hairVariant: GeneratedVariant;
  analysis: FaceAnalysisSummary | null;
  occasion: FashionOccasion;
  mood: FashionMood;
}

export const FASHION_OCCASIONS: FashionOccasion[] = ["daily", "work", "date", "formal"];
export const FASHION_MOODS: FashionMood[] = ["minimal", "trendy", "soft", "classic"];
export const BODY_SHAPES: BodyShape[] = [
  "straight",
  "hourglass",
  "triangle",
  "inverted_triangle",
  "round",
];
export const FIT_PREFERENCES: FitPreference[] = ["regular", "slim", "relaxed", "oversized"];
export const EXPOSURE_PREFERENCES: ExposurePreference[] = ["low", "balanced", "bold"];

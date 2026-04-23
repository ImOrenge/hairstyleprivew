import type { AIEvaluationResult } from "./ai-evaluation";

export type RecommendationLengthBucket = "short" | "medium" | "long";
export type RecommendationCorrectionFocus = "crown" | "temple" | "jawline";
export type RecommendationVariantStatus = "queued" | "generating" | "completed" | "failed";
export type HairstyleCatalogStatus = "active" | "archived";
export type HairstyleCatalogCycleStatus = "running" | "succeeded" | "failed";

export interface HairstyleCatalogSourceSummary {
  mode: "seeded-weekly" | "researched-weekly";
  queries: string[];
  notes: string;
  providers?: string[];
  documentsCollected?: number;
  documentsUsed?: number;
  sourceNames?: string[];
  topStyleSignals?: Array<{
    slug: string;
    nameKo: string;
    signalCount: number;
  }>;
}

export interface FaceAnalysisSummary {
  faceShape: string;
  headShape: string;
  foreheadExposure: string;
  balance: string;
  bestLengthStrategy: string;
  volumeFocus: string[];
  avoidNotes: string[];
  summary: string;
}

export interface HairstyleCatalogCycle {
  cycleId: string;
  status: HairstyleCatalogCycleStatus;
  market: string;
  startedAt: string;
  finishedAt: string | null;
  itemCount: number;
  sourceSummary: HairstyleCatalogSourceSummary | null;
  errorLog: string | null;
}

export interface HairstyleCatalogRow {
  id: string;
  slug: string;
  nameKo: string;
  description: string;
  market: string;
  lengthBucket: RecommendationLengthBucket;
  silhouette: string;
  texture: string;
  bangType: string;
  volumeFocusTags: string[];
  faceShapeFitTags: string[];
  avoidTags: string[];
  trendScore: number;
  freshnessScore: number;
  promptTemplate: string;
  negativePrompt: string;
  promptTemplateVersion: string;
  status: HairstyleCatalogStatus;
  sourceCycleId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogSelectionContext {
  analysis: FaceAnalysisSummary;
  faceShapeTags: string[];
  volumeFocusTags: string[];
  avoidTags: string[];
  preferredLengthBuckets: RecommendationLengthBucket[];
}

export interface RecommendationCandidate {
  id: string;
  rank: number;
  label: string;
  reason: string;
  prompt: string;
  negativePrompt: string;
  tags: string[];
  lengthBucket: RecommendationLengthBucket;
  correctionFocus: RecommendationCorrectionFocus;
  promptArtifactToken?: string;
  catalogItemId?: string;
  catalogCycleId?: string;
  selectionScore?: number;
  promptTemplateVersion?: string;
}

export interface CatalogBackedRecommendationCandidate extends RecommendationCandidate {
  catalogItemId: string;
  catalogCycleId: string;
  selectionScore: number;
  promptTemplateVersion: string;
}

export interface GeneratedVariant extends RecommendationCandidate {
  status: RecommendationVariantStatus;
  outputUrl: string | null;
  generatedImagePath: string | null;
  evaluation: AIEvaluationResult | null;
  error: string | null;
  generatedAt: string | null;
}

export interface RecommendationSet {
  generatedAt: string;
  analysis: FaceAnalysisSummary;
  variants: GeneratedVariant[];
  selectedVariantId: string | null;
  catalogCycleId?: string | null;
  creditChargedAt?: string | null;
  creditChargeAmount?: number | null;
}

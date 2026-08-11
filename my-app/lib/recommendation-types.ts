import type { AIEvaluationResult } from "./ai-evaluation";

export type RecommendationLengthBucket = "short" | "medium" | "long";
export type RecommendationCorrectionFocus = "crown" | "temple" | "jawline";
export type RecommendationVariantStatus = "queued" | "generating" | "completed" | "failed";
export type MemberStyleTarget = "male" | "female";
export type HairTextureProfile = "straight" | "wavy_curly" | "tight_curly_frizzy";
export type HairStrandThickness = "fine" | "medium" | "coarse";
export type HairConditionTag = "untreated" | "damaged" | "bleached" | "colored" | "permed" | "severely_damaged";
export type HairDamageLevel = "low" | "medium" | "high" | "unknown";
export type HairstyleMaintenanceLevel = "low" | "medium" | "high";
export type HairstyleRequiredService =
  | "cut"
  | "perm"
  | "straightening"
  | "color"
  | "bleach"
  | "low_heat_styling"
  | "texture_styling"
  | "curl_definition";
export type HairstyleCatalogStatus = "active" | "archived";
export type HairstyleCatalogCycleStatus = "running" | "succeeded" | "failed";

export interface HairstyleCatalogSourceSummary {
  mode: "seeded-weekly" | "researched-weekly";
  rssTransport?: "direct" | "supabase-edge";
  queries: string[];
  notes: string;
  providers?: string[];
  primaryLookbackDays?: number;
  fallbackLookbackDays?: number;
  effectiveLookbackDays?: number;
  freshnessWindowDays?: number;
  freshnessStatus?: "fresh" | "lowFreshness" | "fallback" | "seeded";
  documentsCollected?: number;
  documentsUsed?: number;
  queryCount?: number;
  querySuccessCount?: number;
  queryFailureCount?: number;
  querySuccessRatio?: number;
  rssFacetEmptyCount?: number;
  distinctSourceCount?: number;
  maxSourceConcentration?: number;
  sourceConcentrationCappedSignalCount?: number;
  qualityGateStatus?: "pass" | "warn" | "blocked";
  coverageWarnings?: string[];
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
  observedPartingShape: string;
  recommendedPartingShape: string;
  partingStrategy: string;
  balance: string;
  bestLengthStrategy: string;
  volumeFocus: string[];
  avoidNotes: string[];
  summary: string;
}

export interface HairDesignerBrief {
  headline: string;
  consultationSummary: string;
  cutDirection: string;
  volumeTextureDirection: string;
  stylingDirection: string;
  cautionNotes: string[];
  salonKeywords: string[];
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

export interface HairstyleCatalogActiveCycle {
  market: string;
  activeCycleId: string;
  previousCycleId: string | null;
  activatedAt: string;
  expiresAt: string;
  rotationPeriod: string;
  rotationSeed: string;
  lastRebuildCycleId: string | null;
  lastRebuildStatus: string;
  lastErrorLog: string | null;
  sourceSummary: HairstyleCatalogSourceSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface HairstyleCatalogLineupRow {
  id: string;
  cycleId: string;
  market: string;
  styleTarget: MemberStyleTarget;
  slotKey: "trend" | "face_fit" | "evergreen" | "experimental";
  rank: number;
  catalogItemId: string;
  rotationScore: number;
  selectionReason: string;
  createdAt: string;
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
  styleTargets: MemberStyleTarget[];
  styleFamily: string;
  variantKey: string;
  primaryTexture: HairTextureProfile;
  compatibleTextureTags: HairTextureProfile[];
  avoidTextureTags: HairTextureProfile[];
  primaryStrandThickness: HairStrandThickness;
  compatibleStrandThicknessTags: HairStrandThickness[];
  avoidStrandThicknessTags: HairStrandThickness[];
  primaryCondition: Exclude<HairConditionTag, "permed" | "severely_damaged">;
  compatibleConditionTags: HairConditionTag[];
  avoidConditionTags: HairConditionTag[];
  requiredServices: HairstyleRequiredService[];
  serviceConstraints: string[];
  maintenanceLevel: HairstyleMaintenanceLevel;
  introducedIn: "legacy-32" | "expansion-a" | "expansion-b" | "expansion-c";
  status: HairstyleCatalogStatus;
  sourceCycleId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentHairProfile {
  currentLength: RecommendationLengthBucket | "unknown";
  textureType: HairTextureProfile | "unknown";
  strandThickness: HairStrandThickness | "unknown";
  conditionTags: HairConditionTag[];
  damageLevel: HairDamageLevel;
  desiredLength?: RecommendationLengthBucket | null;
  source?: "user" | "salon" | "image_estimate" | "unknown";
}

export type HairProfilePersonalizationMode = "off" | "shadow" | "live";

export interface HairProfilePersonalizationRolloutDecision {
  mode: HairProfilePersonalizationMode;
  reason:
    | "master_flag_off"
    | "profile_unknown"
    | "mode_off"
    | "invalid_mode"
    | "shadow"
    | "internal_allowlist"
    | "percentage_canary"
    | "percentage_control";
  bucket: number;
  rolloutPercentage: number;
}

export interface HairProfilePersonalizationEvaluation {
  mode: HairProfilePersonalizationMode;
  baselineResultCount: number;
  personalizedResultCount: number;
  overlapCount: number;
  changedCount: number;
  hardConflictCandidateCount: number;
  profileCompatibleResultCount: number;
  profileFallbackUsed: boolean;
}

export interface CatalogSelectionContext {
  analysis: FaceAnalysisSummary;
  styleTarget: MemberStyleTarget;
  faceShapeTags: string[];
  volumeFocusTags: string[];
  partingPreferenceTags: string[];
  avoidTags: string[];
  preferredLengthBuckets: RecommendationLengthBucket[];
  hairProfile: CurrentHairProfile | null;
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
  styleTarget?: MemberStyleTarget;
  strategyBucket?: "face_balance" | "image_change" | "manageability";
  slotIntent?: string;
  promptPolicyVersion?: string;
  promptHash?: string;
  v2PreviewVariantId?: string;
  v2AttemptId?: string;
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
  designerBrief: HairDesignerBrief | null;
  error: string | null;
  generatedAt: string | null;
}

export interface RecommendationSet {
  generatedAt: string;
  analysis: FaceAnalysisSummary;
  variants: GeneratedVariant[];
  selectedVariantId: string | null;
  styleTarget?: MemberStyleTarget | null;
  hairProfile?: CurrentHairProfile | null;
  hairProfilePersonalizationEnabled?: boolean;
  hairProfileRollout?: HairProfilePersonalizationRolloutDecision;
  hairProfileEvaluation?: HairProfilePersonalizationEvaluation | null;
  catalogCycleId?: string | null;
  creditChargedAt?: string | null;
  creditChargeAmount?: number | null;
}

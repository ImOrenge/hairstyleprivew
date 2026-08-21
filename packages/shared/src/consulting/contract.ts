import type { InterviewNormalizedMetadata } from "./interview.ts";
import type { PersonalColorSwatchV2 } from "../v2/analysis/contract.ts";
import type { DiagnosticQuestionInstanceV1, HairProfileV2, HairTraitAnalysisRunV1 } from "./hair-profile.ts";
import type { FashionLookRoleV2, FashionRequestedCountV2 } from "./fashion-generation.ts";
import type { ConsultationStartContextV1 } from "./start-context.ts";

export const CONSULTATION_STAGE_SLUGS = ["discovery","photo","scan","analysis","personal-color","direction","previews","compare","decision","color-studio","salon-brief","makeup","fashion","result","aftercare"] as const;
export type ConsultationStage = (typeof CONSULTATION_STAGE_SLUGS)[number];
export type Confidence = "low" | "medium" | "high";
export type ConsultationLifecycleState = "draft" | "photo_validated" | "analysis_ready" | "preview_board_queued" | "preview_board_ready" | "shortlisted" | "style_selected" | "selection_confirmed" | "salon_brief_ready" | "aftercare_ready" | "fashion_ready" | "completed" | "cancelled";
export type ConsultationStageStatus = "locked" | "available" | "active" | "recommended" | "waiting" | "complete";
export type ConsultationTaskStatus = "pending" | "running" | "waiting" | "partial" | "failed" | "complete" | "cancelled";
export type ConsultationTaskKind = "analysis" | "hair-trait-analysis" | "personal-color-analysis" | "preview-generation" | "hair-mask-extraction" | "hair-color-generation" | "brief" | "result-compilation" | "fashion-generation" | "makeup-simulation-generation" | "aftercare-preparation";

export interface ConsultationActiveTask {
  id: string;
  kind: ConsultationTaskKind;
  stage: ConsultationStage;
  originStage: ConsultationStage;
  transitionHostStage: ConsultationStage;
  destinationStage: ConsultationStage;
  readinessKey: string;
  status: ConsultationTaskStatus;
  phaseKey: string;
  phaseIndex: number | null;
  phaseCount: number | null;
  completedUnits: number | null;
  totalUnits: number | null;
  messageSetKey: string;
  partialOutputCount: number;
  label: string;
  detail: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  retryable: boolean;
}

export interface ConsultationBlockingAction {
  stage: ConsultationStage;
  code: string;
  reason: string;
  recoveryStage: ConsultationStage;
}

export type ConsultationAnalysisRunState = "queued" | "preflight" | "landmarks" | "analyzing" | "completed" | "retry_required" | "failed" | "cancelled";
export interface ConsultationAnalysisRun {
  id: string;
  state: ConsultationAnalysisRunState;
  pipeline: Record<string, "pending" | "running" | "complete" | "failed">;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export type FashionPreviewBatchState = "draft" | "quoted" | "approved" | "generating" | "partial" | "ready" | "failed" | "selected" | "cancelled";
export type FashionPreviewSlotRuntimeState = "queued" | "running" | "completed" | "stalled" | "failed" | "retrying";
export interface FashionPreviewSlotProgress {
  status: FashionPreviewSlotRuntimeState;
  attemptCount: number;
  heartbeatAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export type PersonalColorDiagnosisState = "pending" | "queued" | "quality-check" | "analyzing" | "ready" | "retry-required" | "deferred" | "unavailable";
export interface PersonalColorDiagnosis {
  state: PersonalColorDiagnosisState;
  evidenceId: string | null;
  qualityStatus: "unknown" | "reliable" | "usable-with-warning" | "unreliable-retry";
  qualityConfidence: number | null;
  warnings: string[];
  primaryType: string | null;
  secondaryType: string | null;
  blend: Record<string, number>;
  axes: { temperature: number | null; value: number | null; chroma: number | null; contrast: number | null };
  palette: { best: string[]; neutrals: string[]; accents: string[]; caution: string[]; metals: string[] };
  detailVersion: "color-detail-v1" | "color-detail-v2" | null;
  summary: string;
  bestColors: PersonalColorSwatchV2[];
  avoidColors: PersonalColorSwatchV2[];
  stylingPalette: string[];
  hairColorHints: string[];
  model: string | null;
  hairColorDirections: Array<{ id: string; name: string; reason: string; targetLevel: number | null; bleachPolicy: string; maintenance: string }>;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export type ColorDecisionState = "not-applicable" | "editing" | "masking" | "generating" | "confirmed" | "keep-current" | "deferred" | "salon-review";
export interface HairMaskArtifact {
  id: string;
  modelVersion: string;
  storagePath: string;
  signedUrl: string | null;
  sourceImageFingerprint: string;
  width: number;
  height: number;
  confidence: number;
  boundaryScore: number;
  createdAt: string;
}
export interface ColorSimulationCandidate {
  id: string;
  colorName: string;
  swatchHex: string;
  technique: "full" | "root" | "highlight" | "balayage" | "ombre";
  targetLevel: number | null;
  intensity: number;
  temperature: number;
  saturation: number;
  rootDepth: number;
  createdAt: string;
}
export interface ColorDecisionSnapshot {
  id: string | null;
  revision: number;
  state: ColorDecisionState;
  selectionSnapshotId: string | null;
  personalColorEvidenceId: string | null;
  hairMask: HairMaskArtifact | null;
  catalogItemId: string | null;
  colorName: string;
  swatchHex: string;
  technique: "full" | "root" | "highlight" | "balayage" | "ombre";
  targetLevel: number | null;
  intensity: number;
  temperature: number;
  saturation: number;
  rootDepth: number;
  candidates: ColorSimulationCandidate[];
  bleachPolicy: string;
  maintenance: string;
  fadeDirection: string;
  warnings: string[];
  instantSimulationPath: string | null;
  finalImageUrl: string | null;
  finalImagePath: string | null;
  generationAttemptId: string | null;
  inputFingerprint: string | null;
  confirmedAt: string | null;
  updatedAt: string | null;
}
export type HairColorGenerationState = "idle" | "masking" | "queued" | "generating" | "quality" | "completed" | "retry-required" | "failed";
export type HairColorCandidateKey = "best-match" | "natural" | "accent";
export interface HairColorGenerationRun {
  id: string;
  state: HairColorGenerationState;
  attemptCount: number;
  heartbeatAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}
export interface HairColorPreviewRun extends HairColorGenerationRun {
  candidateKey: HairColorCandidateKey;
  purpose: "exploration" | "final";
  quality: "low" | "medium";
  colorName: string;
  swatchHex: string;
  technique: "full" | "root" | "highlight" | "balayage" | "ombre";
  targetLevel: number | null;
  rationale: string[];
  bleachPolicy: string;
  maintenance: string;
  cautions: string[];
  outputUrl: string | null;
  outputPath: string | null;
  inputFingerprint: string | null;
}
export type ConsultationResultState = "not-started" | "assembling" | "core-ready" | "updated" | "attention-required";
export interface ConsultationResultSummary {
  id: string | null;
  version: number;
  state: ConsultationResultState;
  heroImageUrl: string | null;
  heroImagePath: string | null;
  headline: string;
  rationale: string[];
  limitations: string[];
  nextActions: string[];
  selectionSnapshotId: string | null;
  colorSelectionSnapshotId: string | null;
  personalColorProfileId?: string | null;
  personalColorEvidenceId: string | null;
  salonBriefVersion: number | null;
  fashionLookId: string | null;
  fashionSelectedAt: string | null;
  fashionSourceColorSelectionId: string | null;
  compiledAt: string | null;
}
export interface FashionPreviewBatch {
  schemaVersion: "fashion-preview-batch-v2";
  id: string;
  baseBatchId: string;
  state: FashionPreviewBatchState;
  requestedCount: FashionRequestedCountV2;
  completedCount: number;
  failedCount: number;
  terminalCount: number;
  stalledCount: number;
  retryingCount: number;
  quoteId: string | null;
  generationInputFingerprint: string | null;
  colorSelectionSnapshotId: string | null;
  personalColorProfileId?: string | null;
  expansionLevel: 0 | 1 | 2;
  recommendedPreviewId: string | null;
  selectedPreviewId: string | null;
  usageReceiptIds: string[];
  revision: number;
  slotRoles: Record<string, FashionLookRoleV2>;
  slotState: Record<string, string>;
  slotProgress: Record<string, FashionPreviewSlotProgress>;
  lastHeartbeatAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

export interface ConsultationJourney {
  recommendedStage: ConsultationStage;
  allowedStages: ConsultationStage[];
  completedStages: ConsultationStage[];
  stageStatus: Record<ConsultationStage, ConsultationStageStatus>;
  activeTasks: ConsultationActiveTask[];
  blockingActions: ConsultationBlockingAction[];
}

export interface ConsultationInputProfile extends InterviewNormalizedMetadata {
  intent?: ConsultationIntentV2 | null;
  purpose: string;
  goals: string[];
  currentHair: string;
  hairLength: string;
  hairDensity: string;
  strandThickness: string;
  hairTexture: string;
  damageLevel: string;
  treatmentHistory: string[];
  desiredServices: string[];
  allowedServices: string[];
  maintenanceLevel: "low" | "medium" | "high";
  morningMinutes: number;
  heatStyling: "avoid" | "sometimes" | "comfortable";
  salonCycleWeeks: number;
  changeLevel: "subtle" | "moderate" | "bold";
  avoid: string[];
  notes: string;
}

export interface ConsultationIntentV2 {
  schemaVersion: "consultation-intent-v2";
  scope: "hair" | "hair_color" | "total_styling";
  changeLevel: "maintain" | "natural_change" | "clear_change";
  exclusions: string[];
  exclusionsConfirmed: boolean;
  styleTarget: "male" | "female" | "neutral";
  sourceProfileId: string | null;
  interviewRevision: number;
  confirmedAt: string | null;
}
export interface PhotoQualityDiagnostic { id: "faceVisible" | "frontal" | "lighting" | "resolution" | "hairline" | "occlusion" | "color" | "background"; label: string; status: "pending" | "pass" | "warning"; message: string }
export interface PhotoCropTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
}
export interface PhotoSnapshot {
  generationId: string | null;
  draftId?: string | null;
  clientRequestId?: string | null;
  uploadedAt?: string | null;
  expiresAt?: string | null;
  primaryUrl: string | null;
  colorAssistUrl: string | null;
  colorAssistDraftId?: string | null;
  colorAssistUploadedAt?: string | null;
  colorAssistExpiresAt?: string | null;
  colorPrimaryCaptureAssetId?: string | null;
  colorAssistCaptureAssetId?: string | null;
  crop?: PhotoCropTransform | null;
  quality: PhotoQualityDiagnostic[];
  usageScopes: string[];
  retentionDays: 1 | 7 | 30;
  capturedAt: string | null;
}
export interface EvidenceItem { id: string; layer: "contour" | "hairline" | "measurement" | "skin" | "excluded" | "direction"; evidence: string; meaning: string; action: string; confidence: Confidence; manuallyCorrected: boolean }
export interface AnalysisEvidenceDraft { pipelineStatus: "idle" | "linked" | "reviewed"; items: EvidenceItem[]; reviewedAt: string | null }
export interface FaceAnalysis { faceShape: string; balance: string; hairline: string; density: string; confidence: Confidence }
export interface PersonalColorProfile { season: string; undertone: string; palette: string[]; confidence: Confidence }
export interface StrategySnapshot { revision: number; length: string; fringe: string; parting: string; layerStart: string; crownVolume: string; sideVolume: string; texture: string; color: string; confirmedAt: string | null }
export type StrategyAxis = keyof Pick<StrategySnapshot, "length" | "fringe" | "parting" | "layerStart" | "crownVolume" | "sideVolume" | "texture" | "color">;
export interface StrategyRecommendation { axis: StrategyAxis; recommendedValue: string; evidenceId: string; reason: string; impact: string; tradeoff: string }
export type PreviewAxis = "BALANCE" | "IMAGE" | "LIFESTYLE";
export interface ConsultationPreview { id: string; axis: PreviewAxis; label: string; reason: string; imageUrl: string | null; generatedImagePath: string | null; status: "pending" | "generating" | "accepted" | "failed"; sourceVariantId: string | null }
export interface HairShortlist { previewIds: string[]; updatedAt: string | null }
export interface FinalistSelection { finalistPreviewId: string | null; backupPreviewId: string | null; decidedAt: string | null }
export interface SelectedStyleSnapshot { id: string; revision: number; previewId: string; label: string; reason: string; imageUrl: string | null; generatedImagePath: string | null; feasibility: string; currentHairGap: string; services: string[]; maintenance: string; limitations: string[]; strategy: StrategySnapshot; selectedAt: string; supersedesSnapshotId: string | null; serviceConfirmedAt: string | null }
export interface SalonBriefVersion { version: number; mode: "customer" | "designer"; summary: string; cut: string; volumeTexture: string; styling: string; caution: string[]; shareExpiryHours: 24 | 168 | 720; shareRevokedAt: string | null; rawFaceIncluded: false; designerFeedback?: { status: "feasible" | "adjustment-needed" | "in-person-review"; note: string; revision: number; receivedAt: string } | null; createdAt: string | null }
export interface MakeupDirectionSummary { id: string | null; status: "not-started" | "context_draft" | "geometry_building" | "map_ready" | "partial_ready" | "user_adjusted" | "confirmed" | "routine_ready" | "brief_ready" | "failed_retryable" | "superseded"; confirmedAt: string | null; sourceFingerprint: string | null; simulationRequired?: boolean; simulationRunState?: string | null; simulationSelectionId?: string | null; simulationImagePath?: string | null }
export interface ActualServiceRecord { services: string[]; serviceDate: string | null; designerNotes: string; confirmedAt: string | null }
export interface CareProgram { actualServiceId: string | null; programVersion: number; today: string[]; checkpoints: Array<{ offset: "D+3" | "W+2" | "W+6" | "W+10"; action: string; complete: boolean }>; concerns: string[]; afterPhotoUrl: string | null; afterPhotoUpload?: { actualServiceId: string; fingerprint: string; uploadedAt: string } | null; satisfaction: number | null }
export type FashionCategory = "DAILY" | "WORK" | "STATEMENT";
export interface FashionDirectionSnapshot extends InterviewNormalizedMetadata {
  situation: "daily" | "work" | "date" | "formal";
  genre: string;
  season: "spring" | "summer" | "autumn" | "winter" | "all-season";
  fit: "slim" | "regular" | "relaxed" | "oversized";
  exposure: "low" | "balanced" | "bold";
  budget: string;
  avoidItems: string[];
}
export interface FashionLookItem { slot: string; name: string; color: string; fit: string; material: string }
export interface SelectedFashionLook {
  direction: string;
  directionSnapshot: FashionDirectionSnapshot;
  shortlistIds: string[];
  lookId: string | null;
  category: FashionCategory | null;
  label: string;
  items: FashionLookItem[];
  palette: string[];
  neckline: string;
  silhouette: string;
  avoidCombinations: string[];
  shoppingKeywords: string[];
  selectedAt: string | null;
  sourceColorSelectionId?: string | null;
  staleReason?: "color-selection-changed" | null;
}

export interface ConsultationSnapshot {
  schemaVersion: 1; sessionId: string; userId: string; version: number; lifecycleState: ConsultationLifecycleState; currentStage: ConsultationStage; completedStages: ConsultationStage[]; journey: ConsultationJourney; analysisRun: ConsultationAnalysisRun | null; fashionBatch: FashionPreviewBatch | null; hairColorGenerationRun: HairColorGenerationRun | null; hairColorPreviewRuns: HairColorPreviewRun[];
  startContext: ConsultationStartContextV1 | null;
  discovery: ConsultationInputProfile; photo: PhotoSnapshot; evidence: AnalysisEvidenceDraft; faceAnalysis: FaceAnalysis; personalColor: PersonalColorProfile; personalColorDiagnosis: PersonalColorDiagnosis;
  strategyRecommendations: StrategyRecommendation[]; strategy: StrategySnapshot; previews: ConsultationPreview[]; shortlist: HairShortlist; finalist: FinalistSelection; selectedStyleHistory: SelectedStyleSnapshot[];
  colorDecision: ColorDecisionSnapshot; salonBrief: SalonBriefVersion; makeupDirection?: MakeupDirectionSummary; hairTraitAnalysisRun?: HairTraitAnalysisRunV1 | null; hairProfile?: HairProfileV2 | null; diagnosticQuestions?: DiagnosticQuestionInstanceV1[]; result: ConsultationResultSummary; actualService: ActualServiceRecord; careProgram: CareProgram; fashion: SelectedFashionLook; createdAt: string; updatedAt: string;
}

export interface ConsultationPatch {
  expectedVersion: number; currentStage?: ConsultationStage; completeStage?: ConsultationStage; startContext?: ConsultationStartContextV1; discovery?: ConsultationInputProfile; photo?: PhotoSnapshot;
  evidence?: AnalysisEvidenceDraft; faceAnalysis?: FaceAnalysis; personalColor?: PersonalColorProfile; personalColorDiagnosis?: PersonalColorDiagnosis; strategyRecommendations?: StrategyRecommendation[]; strategy?: StrategySnapshot; previews?: ConsultationPreview[];
  shortlist?: HairShortlist; finalist?: FinalistSelection; selectedStyle?: Omit<SelectedStyleSnapshot, "id" | "revision" | "selectedAt" | "supersedesSnapshotId" | "serviceConfirmedAt">;
  colorDecision?: ColorDecisionSnapshot; salonBrief?: SalonBriefVersion; result?: ConsultationResultSummary; actualService?: ActualServiceRecord; careProgram?: CareProgram; fashion?: SelectedFashionLook;
}

export function isConsultationStage(value: string): value is ConsultationStage { return CONSULTATION_STAGE_SLUGS.includes(value as ConsultationStage) }
export function selectedStyle(snapshot: ConsultationSnapshot) {
  for (let index = snapshot.selectedStyleHistory.length - 1; index >= 0; index -= 1) {
    const style = snapshot.selectedStyleHistory[index];
    if (style.strategy.revision === snapshot.strategy.revision) return style;
  }
  return null;
}

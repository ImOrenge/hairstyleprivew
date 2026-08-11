import type { InterviewNormalizedMetadata } from "./interview.ts";

export const CONSULTATION_STAGE_SLUGS = ["discovery","photo","scan","analysis","direction","previews","compare","decision","salon-brief","aftercare","fashion"] as const;
export type ConsultationStage = (typeof CONSULTATION_STAGE_SLUGS)[number];
export type Confidence = "low" | "medium" | "high";
export type ConsultationLifecycleState = "draft" | "photo_validated" | "analysis_ready" | "preview_board_queued" | "preview_board_ready" | "shortlisted" | "style_selected" | "selection_confirmed" | "salon_brief_ready" | "aftercare_ready" | "fashion_ready" | "completed" | "cancelled";
export type ConsultationStageStatus = "locked" | "available" | "active" | "recommended" | "waiting" | "complete";
export type ConsultationTaskStatus = "pending" | "running" | "waiting" | "partial" | "failed" | "complete" | "cancelled";
export type ConsultationTaskKind = "analysis" | "preview-generation" | "brief" | "fashion-generation" | "aftercare-preparation";

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
export interface FashionPreviewBatch {
  id: string;
  state: FashionPreviewBatchState;
  requestedCount: 9;
  completedCount: number;
  failedCount: number;
  quoteId: string | null;
  slotState: Record<string, string>;
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
}

export interface ConsultationSnapshot {
  schemaVersion: 1; sessionId: string; userId: string; version: number; lifecycleState: ConsultationLifecycleState; currentStage: ConsultationStage; completedStages: ConsultationStage[]; journey: ConsultationJourney; analysisRun: ConsultationAnalysisRun | null; fashionBatch: FashionPreviewBatch | null;
  discovery: ConsultationInputProfile; photo: PhotoSnapshot; evidence: AnalysisEvidenceDraft; faceAnalysis: FaceAnalysis; personalColor: PersonalColorProfile;
  strategyRecommendations: StrategyRecommendation[]; strategy: StrategySnapshot; previews: ConsultationPreview[]; shortlist: HairShortlist; finalist: FinalistSelection; selectedStyleHistory: SelectedStyleSnapshot[];
  salonBrief: SalonBriefVersion; actualService: ActualServiceRecord; careProgram: CareProgram; fashion: SelectedFashionLook; createdAt: string; updatedAt: string;
}

export interface ConsultationPatch {
  expectedVersion: number; currentStage?: ConsultationStage; completeStage?: ConsultationStage; discovery?: ConsultationInputProfile; photo?: PhotoSnapshot;
  evidence?: AnalysisEvidenceDraft; faceAnalysis?: FaceAnalysis; personalColor?: PersonalColorProfile; strategyRecommendations?: StrategyRecommendation[]; strategy?: StrategySnapshot; previews?: ConsultationPreview[];
  shortlist?: HairShortlist; finalist?: FinalistSelection; selectedStyle?: Omit<SelectedStyleSnapshot, "id" | "revision" | "selectedAt" | "supersedesSnapshotId" | "serviceConfirmedAt">;
  salonBrief?: SalonBriefVersion; actualService?: ActualServiceRecord; careProgram?: CareProgram; fashion?: SelectedFashionLook;
}

export function isConsultationStage(value: string): value is ConsultationStage { return CONSULTATION_STAGE_SLUGS.includes(value as ConsultationStage) }
export function selectedStyle(snapshot: ConsultationSnapshot) {
  for (let index = snapshot.selectedStyleHistory.length - 1; index >= 0; index -= 1) {
    const style = snapshot.selectedStyleHistory[index];
    if (style.strategy.revision === snapshot.strategy.revision) return style;
  }
  return null;
}

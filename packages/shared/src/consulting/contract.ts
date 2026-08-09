export const CONSULTATION_STAGE_SLUGS = ["discovery","photo","scan","analysis","direction","previews","compare","decision","salon-brief","aftercare","fashion"] as const;
export type ConsultationStage = (typeof CONSULTATION_STAGE_SLUGS)[number];
export type Confidence = "low" | "medium" | "high";

export interface ConsultationInputProfile {
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
export interface PhotoSnapshot {
  generationId: string | null;
  draftId?: string | null;
  clientRequestId?: string | null;
  uploadedAt?: string | null;
  expiresAt?: string | null;
  primaryUrl: string | null;
  colorAssistUrl: string | null;
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
export interface SalonBriefVersion { version: number; mode: "customer" | "designer"; summary: string; cut: string; volumeTexture: string; styling: string; caution: string[]; shareExpiryHours: 24 | 168 | 720; shareRevokedAt: string | null; rawFaceIncluded: false; createdAt: string | null }
export interface ActualServiceRecord { services: string[]; serviceDate: string | null; designerNotes: string; confirmedAt: string | null }
export interface CareProgram { today: string[]; checkpoints: Array<{ offset: "D+3" | "W+2" | "W+6" | "W+10"; action: string; complete: boolean }>; concerns: string[]; afterPhotoUrl: string | null; afterPhotoUpload?: { actualServiceId: string; fingerprint: string; uploadedAt: string } | null; satisfaction: number | null }
export interface SelectedFashionLook { direction: string; shortlistIds: string[]; lookId: string | null; category: "DAILY" | "WORK" | "STATEMENT" | null; label: string; selectedAt: string | null }

export interface ConsultationSnapshot {
  schemaVersion: 1; sessionId: string; userId: string; version: number; currentStage: ConsultationStage; completedStages: ConsultationStage[];
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

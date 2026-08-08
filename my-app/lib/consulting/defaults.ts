import type { ConsultationPreview, ConsultationSnapshot } from "./contracts";

const QUALITY = [
  ["faceVisible", "얼굴 전체 노출"], ["frontal", "정면 각도"], ["lighting", "균일한 조명"], ["resolution", "충분한 해상도"],
  ["hairline", "헤어라인 노출"], ["occlusion", "가림 없음"], ["color", "색상 왜곡 없음"], ["background", "배경 분리"],
] as const;

export function createPreviewSlots(): ConsultationPreview[] {
  const axes = ["BALANCE", "IMAGE", "LIFESTYLE"] as const;
  return axes.flatMap((axis) => [1, 2, 3].map((position) => ({
    id: `${axis.toLowerCase()}-${position}`,
    axis,
    label: `${axis} ${position}`,
    reason: "generation 결과를 연결하면 전략 근거가 표시됩니다.",
    imageUrl: null,
    generatedImagePath: null,
    status: "pending" as const,
    sourceVariantId: null,
  })));
}

export function createConsultationSnapshot(input: { sessionId: string; userId: string; now?: string }): ConsultationSnapshot {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: 1,
    sessionId: input.sessionId,
    userId: input.userId,
    version: 1,
    currentStage: "discovery",
    completedStages: [],
    discovery: { goals: [], currentHair: "", desiredServices: [], maintenanceLevel: "medium", avoid: [], notes: "" },
    photo: {
      generationId: null, primaryUrl: null, colorAssistUrl: null,
      quality: QUALITY.map(([id, label]) => ({ id, label, status: "pending", message: "확인 전" })),
      usageScopes: ["analysis", "preview"], retentionDays: 7, capturedAt: null,
    },
    evidence: { pipelineStatus: "idle", items: [], reviewedAt: null },
    faceAnalysis: { faceShape: "확인 전", balance: "확인 전", hairline: "확인 전", density: "확인 전", confidence: "low" },
    personalColor: { season: "확인 전", undertone: "확인 전", palette: [], confidence: "low" },
    strategy: { revision: 1, length: "medium", fringe: "open", parting: "natural", layerStart: "cheek", crownVolume: "medium", sideVolume: "low", texture: "natural", color: "natural", confirmedAt: null },
    previews: createPreviewSlots(),
    shortlist: { previewIds: [], updatedAt: null },
    finalist: { finalistPreviewId: null, backupPreviewId: null, decidedAt: null },
    selectedStyleHistory: [],
    salonBrief: { version: 1, mode: "customer", summary: "", cut: "", volumeTexture: "", styling: "", caution: [], shareExpiryHours: 24, shareRevokedAt: null, rawFaceIncluded: false, createdAt: null },
    actualService: { services: [], serviceDate: null, designerNotes: "", confirmedAt: null },
    careProgram: { today: [], checkpoints: ["D+3", "W+2", "W+6", "W+10"].map((offset) => ({ offset: offset as "D+3" | "W+2" | "W+6" | "W+10", action: "상태를 확인하고 필요한 관리만 기록해 주세요.", complete: false })), concerns: [], afterPhotoUrl: null, satisfaction: null },
    fashion: { direction: "", shortlistIds: [], lookId: null, category: null, label: "", selectedAt: null },
    createdAt: now,
    updatedAt: now,
  };
}

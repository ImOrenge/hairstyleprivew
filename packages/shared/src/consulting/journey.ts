const CONSULTATION_STAGE_SLUGS = ["discovery","photo","scan","analysis","direction","previews","compare","decision","salon-brief","aftercare","fashion"] as const;
type ConsultationStage = (typeof CONSULTATION_STAGE_SLUGS)[number];
type ConsultationLifecycleState = "draft" | "photo_validated" | "analysis_ready" | "preview_board_queued" | "preview_board_ready" | "shortlisted" | "style_selected" | "selection_confirmed" | "salon_brief_ready" | "aftercare_ready" | "fashion_ready" | "completed" | "cancelled";
type ConsultationStageStatus = "locked" | "available" | "active" | "recommended" | "waiting" | "complete";
type ConsultationTaskStatus = "pending" | "running" | "waiting" | "partial" | "failed" | "complete" | "cancelled";
type ConsultationTaskKind = "analysis" | "preview-generation" | "brief" | "fashion-generation" | "aftercare-preparation";
interface ConsultationActiveTask {
  id: string; kind: ConsultationTaskKind; stage: ConsultationStage; originStage: ConsultationStage;
  transitionHostStage: ConsultationStage; destinationStage: ConsultationStage; readinessKey: string;
  status: ConsultationTaskStatus; phaseKey: string; phaseIndex: number | null; phaseCount: number | null;
  completedUnits: number | null; totalUnits: number | null; messageSetKey: string; partialOutputCount: number;
  label: string; detail: string; startedAt: string | null; updatedAt: string; completedAt: string | null; retryable: boolean;
}
interface ConsultationBlockingAction { stage: ConsultationStage; code: string; reason: string; recoveryStage: ConsultationStage }
interface ConsultationJourney {
  recommendedStage: ConsultationStage;
  allowedStages: ConsultationStage[];
  completedStages: ConsultationStage[];
  stageStatus: Record<ConsultationStage, ConsultationStageStatus>;
  activeTasks: ConsultationActiveTask[];
  blockingActions: ConsultationBlockingAction[];
}

type JourneySource = {
  currentStage: ConsultationStage;
  discovery: { purpose: string; goals: string[]; currentHair: string; allowedServices: string[] };
  photo: { draftId?: string | null; capturedAt: string | null };
  evidence: { items: unknown[] };
  strategy: { revision: number; confirmedAt: string | null };
  previews: Array<{ status: string }>;
  shortlist: { previewIds: string[] };
  finalist: { finalistPreviewId: string | null };
  selectedStyleHistory: Array<{ strategy: { revision: number } }>;
  salonBrief: { createdAt: string | null };
  actualService: { confirmedAt: string | null; serviceDate: string | null };
  careProgram: { today: string[] };
  fashion: { selectedAt: string | null; lookId: string | null };
  analysisRun: { id: string; state: string; errorMessage: string | null } | null;
  fashionBatch: { id: string; state: string; completedCount: number; failedCount: number } | null;
  updatedAt?: string;
};

const ANALYSIS_READY_STATES = new Set<ConsultationLifecycleState>([
  "analysis_ready",
  "preview_board_queued",
  "preview_board_ready",
  "shortlisted",
  "style_selected",
  "selection_confirmed",
  "salon_brief_ready",
  "aftercare_ready",
  "fashion_ready",
  "completed",
]);

function hasDiscovery(source: JourneySource) {
  return Boolean(
    source.discovery.purpose.trim()
    && source.discovery.goals.length
    && source.discovery.currentHair.trim()
    && source.discovery.allowedServices.length,
  );
}

function activeStyle(source: JourneySource) {
  for (let index = source.selectedStyleHistory.length - 1; index >= 0; index -= 1) {
    const style = source.selectedStyleHistory[index];
    if (style.strategy.revision === source.strategy.revision) return style;
  }
  return null;
}

function block(
  actions: ConsultationBlockingAction[],
  stage: ConsultationStage,
  code: string,
  reason: string,
  recoveryStage: ConsultationStage,
) {
  actions.push({ stage, code, reason, recoveryStage });
}

export function deriveConsultationJourney(
  source: JourneySource,
  lifecycleState: ConsultationLifecycleState,
  externalTasks: ConsultationActiveTask[] = [],
): ConsultationJourney {
  const discoveryReady = hasDiscovery(source);
  const photoReady = Boolean(source.photo.draftId || source.photo.capturedAt) || lifecycleState !== "draft";
  const evidenceReady = source.evidence.items.length > 0 || ANALYSIS_READY_STATES.has(lifecycleState);
  const strategyReady = Boolean(source.strategy.confirmedAt);
  const acceptedPreviewCount = source.previews.filter((preview) => preview.status === "accepted").length;
  const shortlistReady = source.shortlist.previewIds.length >= 2;
  const finalistReady = Boolean(source.finalist.finalistPreviewId);
  const style = activeStyle(source);
  const selectionReady = Boolean(style);
  const briefReady = Boolean(source.salonBrief.createdAt);
  const serviceReady = Boolean(source.actualService.confirmedAt && source.actualService.serviceDate);
  const careReady = serviceReady && source.careProgram.today.length > 0;
  const fashionReady = Boolean(source.fashion.selectedAt && source.fashion.lookId);

  const completed = new Set<ConsultationStage>();
  if (discoveryReady) completed.add("discovery");
  if (photoReady) completed.add("photo");
  if (evidenceReady) {
    completed.add("scan");
    completed.add("analysis");
  }
  if (strategyReady) completed.add("direction");
  if (shortlistReady) completed.add("previews");
  if (finalistReady) completed.add("compare");
  if (selectionReady) completed.add("decision");
  if (briefReady) completed.add("salon-brief");
  if (careReady) completed.add("aftercare");
  if (fashionReady) completed.add("fashion");

  const allowed = new Set<ConsultationStage>(["discovery"]);
  if (discoveryReady) allowed.add("photo");
  if (photoReady) allowed.add("scan");
  if (evidenceReady) {
    allowed.add("analysis");
    allowed.add("direction");
  }
  if (strategyReady) allowed.add("previews");
  if (acceptedPreviewCount >= 2 || shortlistReady) allowed.add("compare");
  if (finalistReady) allowed.add("decision");
  if (selectionReady) {
    allowed.add("salon-brief");
    allowed.add("fashion");
  }
  if (serviceReady) allowed.add("aftercare");
  for (const stage of completed) allowed.add(stage);

  let recommendedStage: ConsultationStage;
  if (!discoveryReady) recommendedStage = "discovery";
  else if (!photoReady) recommendedStage = "photo";
  else if (source.analysisRun?.state === "retry_required" || source.analysisRun?.state === "failed") recommendedStage = "photo";
  else if (!evidenceReady || lifecycleState === "photo_validated") recommendedStage = "scan";
  else if (!strategyReady) recommendedStage = source.currentStage === "scan" ? "analysis" : "direction";
  else if (!shortlistReady) recommendedStage = "previews";
  else if (!finalistReady) recommendedStage = "compare";
  else if (!selectionReady) recommendedStage = "decision";
  else if (!briefReady) recommendedStage = "salon-brief";
  else if (!fashionReady) recommendedStage = "fashion";
  else if (serviceReady && !careReady) recommendedStage = "aftercare";
  else recommendedStage = source.currentStage;

  const activeTasks: ConsultationActiveTask[] = [...externalTasks];
  if (source.analysisRun && ["queued", "preflight", "landmarks", "analyzing", "failed", "retry_required"].includes(source.analysisRun.state)) {
    const phaseIndex = { queued: 0, preflight: 1, landmarks: 2, analyzing: 3, failed: null, retry_required: null }[source.analysisRun.state] ?? null;
    activeTasks.push({
      id: source.analysisRun.id,
      kind: "analysis",
      stage: source.analysisRun.state === "failed" || source.analysisRun.state === "retry_required" ? "photo" : "scan",
      originStage: "photo",
      transitionHostStage: "scan",
      destinationStage: "analysis",
      readinessKey: "analysis-evidence-ready",
      status: source.analysisRun.state === "failed" ? "failed" : source.analysisRun.state === "retry_required" ? "waiting" : "running",
      phaseKey: source.analysisRun.state,
      phaseIndex,
      phaseCount: 4,
      completedUnits: phaseIndex,
      totalUnits: 4,
      messageSetKey: `analysis.${source.analysisRun.state}`,
      partialOutputCount: source.evidence.items.length,
      label: "얼굴·헤어 분석",
      detail: source.analysisRun.errorMessage ?? `분석 단계: ${source.analysisRun.state}`,
      startedAt: null,
      updatedAt: source.updatedAt ?? new Date(0).toISOString(),
      completedAt: null,
      retryable: source.analysisRun.state === "failed" || source.analysisRun.state === "retry_required",
    });
  }
  if (photoReady && !evidenceReady && !activeTasks.some((task) => task.stage === "scan" || task.id === source.analysisRun?.id)) {
    activeTasks.push({
      id: "analysis-pipeline",
      kind: "analysis",
      stage: "scan",
      originStage: "photo",
      transitionHostStage: "scan",
      destinationStage: "analysis",
      readinessKey: "analysis-evidence-ready",
      status: lifecycleState === "photo_validated" ? "running" : "pending",
      phaseKey: lifecycleState === "photo_validated" ? "queued" : "waiting-for-upload",
      phaseIndex: lifecycleState === "photo_validated" ? 0 : null,
      phaseCount: 4,
      completedUnits: lifecycleState === "photo_validated" ? 0 : null,
      totalUnits: 4,
      messageSetKey: "analysis.queued",
      partialOutputCount: 0,
      label: "얼굴·헤어 분석",
      detail: "사진 사전검사, 랜드마크, 구조 측정과 AI 상담 분석을 처리합니다.",
      startedAt: null,
      updatedAt: source.updatedAt ?? new Date(0).toISOString(),
      completedAt: null,
      retryable: false,
    });
  }
  if (strategyReady && !shortlistReady && !activeTasks.some((task) => task.stage === "previews")) {
    activeTasks.push({
      id: "preview-board",
      kind: "preview-generation",
      stage: "previews",
      originStage: "direction",
      transitionHostStage: "previews",
      destinationStage: "previews",
      readinessKey: "accepted-previews>=2",
      status: acceptedPreviewCount > 0 ? "partial" : lifecycleState === "preview_board_queued" ? "running" : "waiting",
      phaseKey: acceptedPreviewCount > 0 ? "quality" : lifecycleState === "preview_board_queued" ? "generation" : "approval",
      phaseIndex: acceptedPreviewCount > 0 ? 2 : lifecycleState === "preview_board_queued" ? 1 : null,
      phaseCount: 3,
      completedUnits: acceptedPreviewCount,
      totalUnits: 9,
      messageSetKey: acceptedPreviewCount > 0 ? "preview.quality" : "preview.generation",
      partialOutputCount: acceptedPreviewCount,
      label: "헤어 프리뷰 보드",
      detail: `${acceptedPreviewCount} / 9 결과가 준비되었습니다.`,
      startedAt: null,
      updatedAt: source.updatedAt ?? new Date(0).toISOString(),
      completedAt: null,
      retryable: false,
    });
  }
  if (source.fashionBatch && ["approved", "generating", "partial", "failed"].includes(source.fashionBatch.state)) {
    activeTasks.push({
      id: source.fashionBatch.id,
      kind: "fashion-generation",
      stage: "fashion",
      originStage: "fashion",
      transitionHostStage: "fashion",
      destinationStage: "fashion",
      readinessKey: "accepted-fashion-previews>=2",
      status: source.fashionBatch.state === "failed" ? "failed" : source.fashionBatch.completedCount > 0 ? "partial" : "running",
      phaseKey: source.fashionBatch.state,
      phaseIndex: source.fashionBatch.completedCount > 0 ? 2 : 1,
      phaseCount: 3,
      completedUnits: source.fashionBatch.completedCount,
      totalUnits: 9,
      messageSetKey: source.fashionBatch.completedCount > 0 ? "fashion.quality" : "fashion.generation",
      partialOutputCount: source.fashionBatch.completedCount,
      label: "9개 패션 룩 배치",
      detail: `${source.fashionBatch.completedCount} / 9 완료 · ${source.fashionBatch.failedCount} 실패`,
      startedAt: null,
      updatedAt: source.updatedAt ?? new Date(0).toISOString(),
      completedAt: null,
      retryable: source.fashionBatch.state === "failed" || source.fashionBatch.failedCount > 0,
    });
  }

  const blockingActions: ConsultationBlockingAction[] = [];
  if (!discoveryReady) block(blockingActions, "photo", "DISCOVERY_REQUIRED", "상담 목표와 현재 모발 조건을 먼저 저장해 주세요.", "discovery");
  if (!photoReady) block(blockingActions, "scan", "PHOTO_REQUIRED", "분석할 정면 사진이 필요합니다.", "photo");
  if (!evidenceReady) {
    block(blockingActions, "analysis", "ANALYSIS_PENDING", "사진 분석 근거를 준비하고 있습니다.", "scan");
    block(blockingActions, "direction", "ANALYSIS_REQUIRED", "AI 분석 근거가 준비되어야 전략을 조정할 수 있습니다.", "scan");
  }
  if (!strategyReady) block(blockingActions, "previews", "STRATEGY_REQUIRED", "추천 전략을 확정해 주세요.", "direction");
  if (!shortlistReady) block(blockingActions, "compare", "SHORTLIST_REQUIRED", "완료된 프리뷰를 2~3개 선택해 주세요.", "previews");
  if (!finalistReady) block(blockingActions, "decision", "FINALIST_REQUIRED", "비교 화면에서 최종 후보를 지정해 주세요.", "compare");
  if (!selectionReady) {
    block(blockingActions, "salon-brief", "SELECTION_REQUIRED", "최종 스타일을 먼저 확정해 주세요.", "decision");
    block(blockingActions, "fashion", "SELECTION_REQUIRED", "확정된 헤어 스타일이 필요합니다.", "decision");
  }
  if (!serviceReady) block(blockingActions, "aftercare", "ACTUAL_SERVICE_REQUIRED", "실제 시술 유형과 날짜가 기록된 뒤 애프터케어가 활성화됩니다.", "salon-brief");

  const stageStatus = Object.fromEntries(CONSULTATION_STAGE_SLUGS.map((stage) => [stage, "locked"])) as Record<ConsultationStage, ConsultationStageStatus>;
  for (const stage of allowed) stageStatus[stage] = "available";
  for (const stage of completed) stageStatus[stage] = "complete";
  if (allowed.has(source.currentStage) && !completed.has(source.currentStage)) stageStatus[source.currentStage] = "active";
  if (activeTasks.some((task) => task.stage === recommendedStage && ["pending", "running", "waiting"].includes(task.status))) stageStatus[recommendedStage] = "waiting";
  else if (!completed.has(recommendedStage)) stageStatus[recommendedStage] = "recommended";

  return {
    recommendedStage,
    allowedStages: CONSULTATION_STAGE_SLUGS.filter((stage) => allowed.has(stage)),
    completedStages: CONSULTATION_STAGE_SLUGS.filter((stage) => completed.has(stage)),
    stageStatus,
    activeTasks,
    blockingActions,
  };
}

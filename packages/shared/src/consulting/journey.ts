const CONSULTATION_STAGE_SLUGS = ["discovery","photo","scan","analysis","personal-color","direction","previews","compare","decision","color-studio","salon-brief","makeup","fashion","result","aftercare"] as const;
type ConsultationStage = (typeof CONSULTATION_STAGE_SLUGS)[number];
type ConsultationLifecycleState = "draft" | "photo_validated" | "analysis_ready" | "preview_board_queued" | "preview_board_ready" | "shortlisted" | "style_selected" | "selection_confirmed" | "salon_brief_ready" | "aftercare_ready" | "fashion_ready" | "completed" | "cancelled";
type ConsultationStageStatus = "locked" | "available" | "active" | "recommended" | "waiting" | "complete";
type ConsultationTaskStatus = "pending" | "running" | "waiting" | "partial" | "failed" | "complete" | "cancelled";
type ConsultationTaskKind = "analysis" | "hair-trait-analysis" | "personal-color-analysis" | "preview-generation" | "hair-mask-extraction" | "hair-color-generation" | "brief" | "result-compilation" | "fashion-generation" | "makeup-simulation-generation" | "aftercare-preparation";
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
  startContext?: { schemaVersion?: string; disposition?: string; revision?: number; startedAt?: string; updatedAt?: string } | null;
  discovery: {
    purpose: string; goals: string[]; currentHair: string; allowedServices: string[];
    intent?: { scope?: string; changeLevel?: string; exclusionsConfirmed?: boolean; confirmedAt?: string | null } | null;
  };
  photo: { draftId?: string | null; capturedAt: string | null };
  evidence: { items: unknown[] };
  personalColorDiagnosis: { state: string; evidenceId: string | null; errorMessage: string | null };
  strategy: { revision: number; confirmedAt: string | null };
  previews: Array<{ status: string }>;
  shortlist: { previewIds: string[] };
  finalist: { finalistPreviewId: string | null };
  selectedStyleHistory: Array<{ strategy: { revision: number } }>;
  colorDecision: { id?: string | null; state: string; hairMask: unknown | null; finalImagePath: string | null };
  salonBrief: { createdAt: string | null };
  makeupDirection?: { status: string; confirmedAt: string | null; simulationRequired?: boolean; simulationSelectionId?: string | null };
  result: { state: string; compiledAt: string | null };
  actualService: { confirmedAt: string | null; serviceDate: string | null };
  careProgram: { today: string[] };
  fashion: { selectedAt: string | null; lookId: string | null; sourceColorSelectionId?: string | null; staleReason?: string | null };
  analysisRun: { id: string; state: string; errorMessage: string | null } | null;
  hairColorGenerationRun: { id: string; state: string; attemptCount: number; errorMessage: string | null; updatedAt: string } | null;
  hairColorPreviewRuns: Array<{ id: string; candidateKey: string; purpose: "exploration" | "final"; state: string; errorMessage: string | null; updatedAt: string }>;
  fashionBatch: { id: string; state: string; requestedCount: number; completedCount: number; failedCount: number; terminalCount: number; stalledCount: number; retryingCount: number } | null;
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
  if (source.startContext?.schemaVersion === "consultation-start-context-v1"
    && ["direct_analysis", "optional_intent_answered", "legacy_intent_confirmed"].includes(source.startContext.disposition ?? "")
    && Number.isInteger(source.startContext.revision)
    && (source.startContext.revision ?? 0) > 0
    && source.startContext.startedAt
    && source.startContext.updatedAt) return true;
  const intent = source.discovery.intent;
  if (intent) {
    return Boolean(
      ["hair", "hair_color", "total_styling"].includes(intent.scope ?? "")
      && ["maintain", "natural_change", "clear_change"].includes(intent.changeLevel ?? "")
      && intent.exclusionsConfirmed
      && intent.confirmedAt,
    );
  }
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
  const personalColorTerminal = ["ready", "deferred", "unavailable"].includes(source.personalColorDiagnosis.state);
  const strategyReady = Boolean(source.strategy.confirmedAt);
  const acceptedPreviewCount = source.previews.filter((preview) => preview.status === "accepted").length;
  const shortlistReady = source.shortlist.previewIds.length >= 2;
  const finalistReady = Boolean(source.finalist.finalistPreviewId);
  const style = activeStyle(source);
  const selectionReady = Boolean(style);
  const wantsColor = source.discovery.allowedServices.includes("염색") || (source.discovery as { desiredServices?: string[] }).desiredServices?.includes("염색") === true;
  const colorDecisionReady = !wantsColor || ["confirmed", "keep-current", "deferred", "salon-review"].includes(source.colorDecision.state);
  const briefReady = Boolean(source.salonBrief.createdAt);
  const makeupReady = source.makeupDirection === undefined || (["confirmed", "routine_ready", "brief_ready"].includes(source.makeupDirection.status) && Boolean(source.makeupDirection.confirmedAt) && (!source.makeupDirection.simulationRequired || Boolean(source.makeupDirection.simulationSelectionId)));
  const resultReady = ["core-ready", "updated"].includes(source.result.state) && Boolean(source.result.compiledAt);
  const serviceReady = Boolean(source.actualService.confirmedAt && source.actualService.serviceDate);
  const careReady = serviceReady && source.careProgram.today.length > 0;
  const fashionMatchesColor = !source.colorDecision.id || source.fashion.sourceColorSelectionId === source.colorDecision.id;
  const fashionReady = Boolean(source.fashion.selectedAt && source.fashion.lookId && !source.fashion.staleReason && fashionMatchesColor);

  const completed = new Set<ConsultationStage>();
  if (discoveryReady) completed.add("discovery");
  if (photoReady) completed.add("photo");
  if (evidenceReady) {
    completed.add("scan");
    completed.add("analysis");
  }
  if (personalColorTerminal) completed.add("personal-color");
  if (strategyReady) completed.add("direction");
  if (shortlistReady || selectionReady) completed.add("previews");
  if (finalistReady || selectionReady) completed.add("compare");
  if (selectionReady) completed.add("decision");
  if (selectionReady && colorDecisionReady) completed.add("color-studio");
  if (briefReady) completed.add("salon-brief");
  if (source.makeupDirection !== undefined && makeupReady) completed.add("makeup");
  if (fashionReady) completed.add("fashion");
  if (fashionReady && resultReady) completed.add("result");
  if (fashionReady && resultReady && careReady) completed.add("aftercare");

  const allowed = new Set<ConsultationStage>(["discovery"]);
  if (discoveryReady) allowed.add("photo");
  if (photoReady) allowed.add("scan");
  if (evidenceReady) {
    allowed.add("analysis");
    allowed.add("personal-color");
  }
  if (personalColorTerminal) allowed.add("direction");
  if (strategyReady) allowed.add("previews");
  if (acceptedPreviewCount >= 2 || shortlistReady) allowed.add("compare");
  if (finalistReady) allowed.add("decision");
  if (selectionReady) {
    if (wantsColor) allowed.add("color-studio");
  }
  if (selectionReady && colorDecisionReady) allowed.add("salon-brief");
  if (briefReady && personalColorTerminal && colorDecisionReady) allowed.add("makeup");
  if (briefReady && personalColorTerminal && colorDecisionReady && makeupReady) allowed.add("fashion");
  if (briefReady && personalColorTerminal && colorDecisionReady && fashionReady) allowed.add("result");
  if (resultReady && fashionReady && serviceReady) allowed.add("aftercare");
  for (const stage of completed) allowed.add(stage);

  let recommendedStage: ConsultationStage;
  if (!discoveryReady) recommendedStage = "discovery";
  else if (!photoReady) recommendedStage = "photo";
  else if (source.analysisRun?.state === "retry_required" || source.analysisRun?.state === "failed") recommendedStage = "photo";
  else if (!evidenceReady || lifecycleState === "photo_validated") recommendedStage = "scan";
  else if (!personalColorTerminal) recommendedStage = source.currentStage === "scan" ? "analysis" : "personal-color";
  else if (!strategyReady) recommendedStage = "direction";
  else if (!selectionReady && !shortlistReady) recommendedStage = "previews";
  else if (!selectionReady && !finalistReady) recommendedStage = "compare";
  else if (!selectionReady) recommendedStage = "decision";
  else if (!colorDecisionReady) recommendedStage = "color-studio";
  else if (!briefReady) recommendedStage = "salon-brief";
  else if (!makeupReady) recommendedStage = "makeup";
  else if (!fashionReady) recommendedStage = "fashion";
  else if (!resultReady) recommendedStage = "result";
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
  if (evidenceReady && !personalColorTerminal) {
    const failed = ["retry-required", "unavailable"].includes(source.personalColorDiagnosis.state);
    activeTasks.push({
      id: source.personalColorDiagnosis.evidenceId ?? "personal-color-analysis",
      kind: "personal-color-analysis",
      stage: "personal-color",
      originStage: "analysis",
      transitionHostStage: "personal-color",
      destinationStage: "direction",
      readinessKey: "personal-color-terminal",
      status: failed ? "waiting" : source.personalColorDiagnosis.state === "pending" ? "pending" : "running",
      phaseKey: source.personalColorDiagnosis.state,
      phaseIndex: { pending: 0, queued: 0, "quality-check": 1, analyzing: 2 }[source.personalColorDiagnosis.state] ?? null,
      phaseCount: 3,
      completedUnits: null,
      totalUnits: 3,
      messageSetKey: `personal-color.${source.personalColorDiagnosis.state}`,
      partialOutputCount: 0,
      label: "퍼스널 컬러 분석",
      detail: source.personalColorDiagnosis.errorMessage ?? "촬영 품질과 피부색 기준을 확인해 컬러 방향을 정리합니다.",
      startedAt: null,
      updatedAt: source.updatedAt ?? new Date(0).toISOString(),
      completedAt: null,
      retryable: failed,
    });
  }
  if (strategyReady && !selectionReady && !shortlistReady && !activeTasks.some((task) => task.stage === "previews")) {
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
      readinessKey: "fashion-slots-terminal=9",
      status: source.fashionBatch.state === "failed" ? "failed" : source.fashionBatch.completedCount > 0 ? "partial" : source.fashionBatch.stalledCount > 0 ? "waiting" : "running",
      phaseKey: source.fashionBatch.retryingCount > 0 ? "retrying" : source.fashionBatch.stalledCount > 0 ? "stalled" : source.fashionBatch.state,
      phaseIndex: source.fashionBatch.completedCount > 0 ? 2 : 1,
      phaseCount: 3,
      completedUnits: source.fashionBatch.terminalCount,
      totalUnits: source.fashionBatch.requestedCount,
      messageSetKey: source.fashionBatch.completedCount > 0 ? "fashion.quality" : "fashion.generation",
      partialOutputCount: source.fashionBatch.completedCount,
      label: "9개 패션 룩 배치",
      detail: `${source.fashionBatch.completedCount} 완료 · ${source.fashionBatch.failedCount} 종결 실패 · ${source.fashionBatch.stalledCount} 정체 · ${source.fashionBatch.retryingCount} 재시도`,
      startedAt: null,
      updatedAt: source.updatedAt ?? new Date(0).toISOString(),
      completedAt: null,
      retryable: source.fashionBatch.state === "failed" || source.fashionBatch.failedCount > 0,
    });
  }
  if (selectionReady && wantsColor && !colorDecisionReady) {
    const runs = source.hairColorPreviewRuns ?? [];
    const activeRun = runs.find((item) => ["queued", "generating", "quality"].includes(item.state));
    const finalRun = runs.find((item) => item.purpose === "final");
    const failedRun = runs.find((item) => ["failed", "retry-required"].includes(item.state));
    const run = activeRun ?? finalRun ?? failedRun ?? source.hairColorGenerationRun;
    const completedExploration = runs.filter((item) => item.purpose === "exploration" && item.state === "completed").length;
    const finalCompleted = Boolean(finalRun?.state === "completed");
    const failed = Boolean(failedRun && !activeRun);
    activeTasks.push({
      id: run?.id ?? "hair-color-generation-pending", kind: "hair-color-generation", stage: "color-studio", originStage: "decision",
      transitionHostStage: "color-studio", destinationStage: "salon-brief",
      readinessKey: "color-decision-terminal", status: failed ? "waiting" : completedExploration > 0 && !finalRun ? "partial" : run ? "running" : "pending",
      phaseKey: run?.state ?? "queue", phaseIndex: finalRun ? 3 : completedExploration > 0 ? 2 : activeRun ? 1 : 0, phaseCount: 4,
      completedUnits: completedExploration + (finalCompleted ? 1 : 0), totalUnits: 4, messageSetKey: `hair-color-generation.${run?.state ?? "pending"}`,
      partialOutputCount: completedExploration + (finalCompleted ? 1 : 0), label: "염색 후보·최종본 생성",
      detail: run?.errorMessage ?? `${completedExploration} / 3 탐색 후보가 준비되었습니다.`, startedAt: null,
      updatedAt: run?.updatedAt ?? source.updatedAt ?? new Date(0).toISOString(), completedAt: null, retryable: failed,
    });
  }
  if (briefReady && personalColorTerminal && colorDecisionReady && fashionReady && !resultReady) {
    activeTasks.push({
      id: "result-compilation", kind: "result-compilation", stage: "result", originStage: "fashion",
      transitionHostStage: "result", destinationStage: "result", readinessKey: "result-with-fashion-ready",
      status: source.result.state === "attention-required" ? "failed" : "running", phaseKey: source.result.state,
      phaseIndex: source.result.state === "assembling" ? 1 : 0, phaseCount: 3, completedUnits: null, totalUnits: 3,
      messageSetKey: `result.${source.result.state}`, partialOutputCount: 0, label: "상담 결과 정리",
      detail: "분석, 헤어·컬러 선택, Salon Brief와 확정 패션 룩을 하나의 결과로 정리합니다.", startedAt: null,
      updatedAt: source.updatedAt ?? new Date(0).toISOString(), completedAt: null,
      retryable: source.result.state === "attention-required",
    });
  }

  const blockingActions: ConsultationBlockingAction[] = [];
  if (!discoveryReady) block(blockingActions, "photo", "DISCOVERY_REQUIRED", "사진 진단 시작 기준을 먼저 저장해 주세요.", "discovery");
  if (!photoReady) block(blockingActions, "scan", "PHOTO_REQUIRED", "분석할 정면 사진이 필요합니다.", "photo");
  if (!evidenceReady) {
    block(blockingActions, "analysis", "ANALYSIS_PENDING", "사진 분석 근거를 준비하고 있습니다.", "scan");
    block(blockingActions, "personal-color", "ANALYSIS_REQUIRED", "사진 분석 근거가 준비되어야 퍼스널 컬러를 진단할 수 있습니다.", "scan");
    block(blockingActions, "direction", "ANALYSIS_REQUIRED", "AI 분석 근거가 준비되어야 전략을 조정할 수 있습니다.", "scan");
  }
  if (evidenceReady && !personalColorTerminal) block(blockingActions, "direction", "PERSONAL_COLOR_PENDING", "퍼스널 컬러를 완료하거나 나중에 진단을 선택해 주세요.", "personal-color");
  if (!strategyReady) block(blockingActions, "previews", "STRATEGY_REQUIRED", "추천 전략을 확정해 주세요.", "direction");
  if (!selectionReady && !shortlistReady) block(blockingActions, "compare", "SHORTLIST_REQUIRED", "완료된 프리뷰를 2~3개 선택해 주세요.", "previews");
  if (!selectionReady && !finalistReady) block(blockingActions, "decision", "FINALIST_REQUIRED", "비교 화면에서 최종 후보를 지정해 주세요.", "compare");
  if (!selectionReady) {
    block(blockingActions, "color-studio", "SELECTION_REQUIRED", "최종 스타일을 먼저 확정해 주세요.", "decision");
    block(blockingActions, "salon-brief", "SELECTION_REQUIRED", "최종 스타일을 먼저 확정해 주세요.", "decision");
    block(blockingActions, "fashion", "SELECTION_REQUIRED", "확정된 헤어 스타일이 필요합니다.", "decision");
  }
  if (selectionReady && wantsColor && !colorDecisionReady) block(blockingActions, "salon-brief", "COLOR_DECISION_REQUIRED", "염색 컬러를 확정하거나 현재 색 유지·보류를 선택해 주세요.", "color-studio");
  if (!briefReady) {
    block(blockingActions, "makeup", "BRIEF_REQUIRED", "Salon Brief가 준비되면 메이크업 방향을 이어갑니다.", "salon-brief");
    block(blockingActions, "fashion", "BRIEF_REQUIRED", "Salon Brief가 준비되면 패션 방향을 이어갑니다.", "salon-brief");
    block(blockingActions, "result", "BRIEF_REQUIRED", "Salon Brief가 준비되면 패션을 거쳐 최종 결과를 정리합니다.", "salon-brief");
  } else if (!makeupReady) {
    block(blockingActions, "fashion", "MAKEUP_DIRECTION_REQUIRED", "메이크업 방향을 확정하면 패션 방향을 이어갑니다.", "makeup");
    block(blockingActions, "result", "MAKEUP_DIRECTION_REQUIRED", "메이크업 방향을 확정한 뒤 패션을 거쳐 최종 결과를 정리합니다.", "makeup");
  } else if (!fashionReady) {
    block(blockingActions, "result", "FASHION_SELECTION_REQUIRED", "패션 후보를 비교하고 최종 룩을 선택하면 상담 결과를 마무리합니다.", "fashion");
  }
  if (!resultReady) block(blockingActions, "aftercare", "RESULT_REQUIRED", "패션까지 반영한 상담 결과를 먼저 마무리해 주세요.", "result");
  else if (!serviceReady) block(blockingActions, "aftercare", "ACTUAL_SERVICE_REQUIRED", "실제 시술 유형과 날짜가 기록된 뒤 애프터케어가 활성화됩니다.", "result");

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

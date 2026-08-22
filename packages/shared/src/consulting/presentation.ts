import type { ConsultationBlockingAction, ConsultationActiveTask, ConsultationSnapshot, ConsultationStage, ConsultationTaskKind, ConsultationTaskStatus } from "./contract.ts";

export const CONSULTATION_CHAPTERS = ["intake", "diagnosis", "design", "report"] as const;
export type ConsultationChapter = (typeof CONSULTATION_CHAPTERS)[number];
export type ConsultationChapterStatus = "locked" | "available" | "active" | "waiting" | "attention" | "complete";
export type ConsultationDomain = "intake" | "hair" | "color" | "makeup" | "fashion" | "report";

export interface RecommendedConsultationTaskV2 {
  stage: ConsultationStage;
  kind: ConsultationTaskKind | "user-decision";
  domain: ConsultationDomain;
  label: string;
  href: string;
  reasonCode: string;
}

export interface ConsultationChapterPresentationV2 {
  schemaVersion: "consultation-chapter-presentation-v2";
  activeChapter: ConsultationChapter;
  recommendedTask: RecommendedConsultationTaskV2;
  chapters: Array<{
    id: ConsultationChapter;
    status: ConsultationChapterStatus;
    isCurrent: boolean;
    isRecommended: boolean;
    customerStatusLabel: string;
    completedTaskCount: number;
    totalTaskCount: number;
    availableDomains: Array<"hair" | "color" | "makeup" | "fashion">;
  }>;
  visibleBlockingAction: ConsultationBlockingAction | null;
  resumableHref: string;
}

const CHAPTER_STATUS_LABELS: Record<ConsultationChapterStatus, string> = {
  locked: "아직 열리지 않음",
  available: "진행 가능",
  active: "현재 확인 중",
  waiting: "준비 중",
  attention: "확인 필요",
  complete: "완료",
};

export const CONSULTATION_DOMAIN_LABELS: Record<ConsultationDomain, string> = {
  intake: "상담 준비",
  hair: "헤어",
  color: "컬러",
  makeup: "메이크업",
  fashion: "패션",
  report: "최종 결과",
};

export function consultationConfidenceLabel(value: string | null | undefined) {
  if (value === "high") return "높음";
  if (value === "medium") return "보통";
  if (value === "low") return "낮음";
  return "확인 중";
}

export function consultationChangeIntensityLabel(value: string | null | undefined) {
  if (["bold", "clear_change"].includes(value ?? "")) return "확실한 변화";
  if (["moderate", "natural_change"].includes(value ?? "")) return "자연스러운 변화";
  if (["subtle", "maintain"].includes(value ?? "")) return "현재 인상 유지";
  return "상담에서 확인";
}

export function consultationMaintenanceLabel(value: string | null | undefined) {
  if (value === "high") return "세심한 관리 필요";
  if (value === "medium") return "보통";
  if (value === "low") return "간편함";
  return "상담에서 확인";
}

export function consultationEvidenceLayerLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    contour: "얼굴 윤곽",
    hairline: "헤어라인",
    measurement: "얼굴 비율",
    skin: "피부색",
    excluded: "제외 조건",
    direction: "추천 방향",
  };
  return value ? (labels[value] ?? "분석 근거") : "선택 전";
}

export type ConsultationChapterSurfaceMode = "input" | "waiting" | "result" | "revision" | "attention";

export interface ConsultationChapterSurfaceV1 {
  schemaVersion: "consultation-chapter-surface-v1";
  chapter: ConsultationChapter;
  domain: ConsultationDomain;
  mode: ConsultationChapterSurfaceMode;
  hostStage: ConsultationStage;
  inputTask: RecommendedConsultationTaskV2 | null;
  activeTaskIds: string[];
  resultArtifactIds: string[];
  readOnlyInputSnapshotId: string | null;
  returnToResultHref: string | null;
  reasonCode: string;
}

export const CONSULTATION_STAGE_CHAPTER: Record<ConsultationStage, ConsultationChapter | "aftercare"> = {
  discovery: "intake",
  photo: "intake",
  scan: "diagnosis",
  analysis: "diagnosis",
  "personal-color": "diagnosis",
  direction: "design",
  previews: "design",
  compare: "design",
  decision: "design",
  "color-studio": "design",
  "salon-brief": "design",
  makeup: "design",
  fashion: "design",
  result: "report",
  aftercare: "aftercare",
};

const CHAPTER_USER_STAGES: Record<ConsultationChapter, readonly ConsultationStage[]> = {
  intake: ["discovery", "photo"],
  diagnosis: ["scan", "analysis", "personal-color"],
  design: ["direction", "previews", "compare", "decision", "color-studio", "makeup", "fashion"],
  report: ["result"],
};

const STAGE_DOMAIN: Record<ConsultationStage, ConsultationDomain> = {
  discovery: "intake",
  photo: "intake",
  scan: "hair",
  analysis: "hair",
  "personal-color": "color",
  direction: "hair",
  previews: "hair",
  compare: "hair",
  decision: "hair",
  "color-studio": "color",
  "salon-brief": "hair",
  makeup: "makeup",
  fashion: "fashion",
  result: "report",
  aftercare: "report",
};

const STAGE_ACTION_LABEL: Record<ConsultationStage, string> = {
  discovery: "상담 목표 정하기",
  photo: "사진 제출하고 분석 시작",
  scan: "분석 진행 확인",
  analysis: "진단 결과 확인",
  "personal-color": "퍼스널 컬러 확인",
  direction: "추천 방향 확인",
  previews: "헤어 후보 확인",
  compare: "후보 비교하기",
  decision: "헤어 스타일 확정",
  "color-studio": "헤어 컬러 결정",
  "salon-brief": "Salon Brief 확인",
  makeup: "메이크업 추천 검토",
  fashion: "패션 방향 정하기",
  result: "최종 리포트 확인",
  aftercare: "Aftercare 열기",
};

export function consultationChapterForStage(stage: ConsultationStage): ConsultationChapter {
  const chapter = CONSULTATION_STAGE_CHAPTER[stage];
  return chapter === "aftercare" ? "report" : chapter;
}

export function deriveConsultationChapterPresentation(snapshot: ConsultationSnapshot, stage: ConsultationStage = snapshot.currentStage): ConsultationChapterPresentationV2 {
  const recommendedStage = snapshot.journey.recommendedStage;
  const recommendedTask = snapshot.journey.activeTasks.find((task) => task.stage === recommendedStage || task.transitionHostStage === recommendedStage);
  const recommendedChapter = consultationChapterForStage(recommendedStage);
  const activeChapter = consultationChapterForStage(stage);
  const chapters = CONSULTATION_CHAPTERS.map((id) => {
    const stages = CHAPTER_USER_STAGES[id];
    const completedTaskCount = stages.filter((item) => snapshot.journey.completedStages.includes(item)).length;
    const hasAttention = snapshot.journey.activeTasks.some((task) => consultationChapterForStage(task.stage) === id && task.status === "failed") || snapshot.journey.blockingActions.some((action) => consultationChapterForStage(action.stage) === id && action.stage === recommendedStage);
    const hasWaiting = snapshot.journey.activeTasks.some((task) => consultationChapterForStage(task.transitionHostStage) === id && ["pending", "running", "waiting", "partial"].includes(task.status) && task.phaseKey !== "approval" && task.phaseKey !== "waiting-for-upload");
    const hasAvailable = stages.some((item) => snapshot.journey.allowedStages.includes(item));
    const isComplete = completedTaskCount === stages.length;
    const status: ConsultationChapterStatus = hasAttention ? "attention" : hasWaiting ? "waiting" : activeChapter === id || recommendedChapter === id ? "active" : isComplete ? "complete" : hasAvailable ? "available" : "locked";
    const availableDomains = (["hair", "color", "makeup", "fashion"] as const).filter((domain) => stages.some((item) => STAGE_DOMAIN[item] === domain && snapshot.journey.allowedStages.includes(item)));
    const isCurrent = activeChapter === id;
    const isRecommended = !isCurrent && recommendedChapter === id;
    const customerStatusLabel = isCurrent ? (hasAttention ? "현재 · 확인 필요" : hasWaiting ? "현재 · 준비 중" : "현재") : isRecommended ? (hasAttention ? "다음 추천 · 확인 필요" : hasWaiting ? "다음 추천 · 준비 중" : "다음 추천") : CHAPTER_STATUS_LABELS[status];
    return {
      id,
      status,
      isCurrent,
      isRecommended,
      customerStatusLabel,
      completedTaskCount,
      totalTaskCount: stages.length,
      availableDomains,
    };
  });
  const href = `/consulting/${encodeURIComponent(snapshot.sessionId)}/${recommendedStage}`;
  return {
    schemaVersion: "consultation-chapter-presentation-v2",
    activeChapter,
    recommendedTask: {
      stage: recommendedStage,
      kind: recommendedTask?.kind ?? "user-decision",
      domain: STAGE_DOMAIN[recommendedStage],
      label: recommendedTask?.label ?? STAGE_ACTION_LABEL[recommendedStage],
      href,
      reasonCode: recommendedTask ? `task_${recommendedTask.status}` : `stage_${snapshot.journey.stageStatus[recommendedStage]}`,
    },
    chapters,
    visibleBlockingAction: snapshot.journey.blockingActions.find((action) => action.stage === recommendedStage) ?? null,
    resumableHref: href,
  };
}

function resultArtifacts(snapshot: ConsultationSnapshot, stage: ConsultationStage) {
  if (stage === "analysis") return snapshot.evidence.items.map((item) => item.id);
  if (stage === "personal-color") return snapshot.personalColorDiagnosis.evidenceId ? [snapshot.personalColorDiagnosis.evidenceId] : [];
  if (stage === "previews" || stage === "compare") return snapshot.previews.filter((item) => item.status === "accepted").map((item) => item.id);
  if (stage === "decision") return snapshot.selectedStyleHistory.at(-1)?.id ? [snapshot.selectedStyleHistory.at(-1)!.id] : [];
  if (stage === "color-studio") return snapshot.colorDecision.id ? [snapshot.colorDecision.id] : [];
  if (stage === "salon-brief") return snapshot.salonBrief.createdAt ? [`salon-brief-v${snapshot.salonBrief.version}`] : [];
  if (stage === "makeup") return snapshot.makeupDirection?.id ? [snapshot.makeupDirection.id] : [];
  if (stage === "fashion") return snapshot.fashion.lookId ? [snapshot.fashion.lookId] : [];
  if (stage === "result") return snapshot.result.id ? [snapshot.result.id] : [];
  return [];
}

export function deriveConsultationChapterSurface(snapshot: ConsultationSnapshot, stage: ConsultationStage = snapshot.currentStage): ConsultationChapterSurfaceV1 {
  const presentation = deriveConsultationChapterPresentation(snapshot, stage);
  const blocking = snapshot.journey.blockingActions.find((action) => action.stage === stage);
  const activeTasks = snapshot.journey.activeTasks.filter((task) => (task.stage === stage || task.transitionHostStage === stage) && ["pending", "running", "waiting", "partial", "failed"].includes(task.status));
  const artifacts = resultArtifacts(snapshot, stage);
  const visibleQuestions = stage === "analysis" ? (snapshot.diagnosticQuestions ?? []).filter((question) => question.state === "visible") : [];
  const mode: ConsultationChapterSurfaceMode = blocking || activeTasks.some((task) => task.status === "failed") ? "attention" : visibleQuestions.length ? "input" : activeTasks.length ? "waiting" : artifacts.length ? "result" : "input";
  const href = `/consulting/${encodeURIComponent(snapshot.sessionId)}/${stage}`;
  return {
    schemaVersion: "consultation-chapter-surface-v1",
    chapter: consultationChapterForStage(stage),
    domain: STAGE_DOMAIN[stage],
    mode,
    hostStage: stage,
    inputTask: (["input", "revision"] as ConsultationChapterSurfaceMode[]).includes(mode) ? presentation.recommendedTask : null,
    activeTaskIds: activeTasks.map((task) => task.id),
    resultArtifactIds: artifacts,
    readOnlyInputSnapshotId: artifacts.length ? (snapshot.startContext ? `start-context-r${snapshot.startContext.revision}` : snapshot.discovery.intent?.confirmedAt ? `legacy-intent-r${snapshot.discovery.intent.interviewRevision}` : null) : null,
    returnToResultHref: (mode as ConsultationChapterSurfaceMode) === "revision" && artifacts.length ? href : null,
    reasonCode: blocking ? blocking.code : visibleQuestions.length ? "CLARIFICATION_REQUIRED" : activeTasks.length ? `TASK_${activeTasks[0]?.status.toUpperCase()}` : artifacts.length ? "RESULT_READY" : "INPUT_REQUIRED",
  };
}

export const CONSULTATION_TASK_KINDS = ["analysis", "hair-trait-analysis", "personal-color-analysis", "preview-generation", "hair-mask-extraction", "hair-color-generation", "brief", "result-compilation", "fashion-generation", "makeup-simulation-generation", "aftercare-preparation"] as const satisfies readonly ConsultationTaskKind[];

export const CONSULTATION_TASK_PHASES: Record<ConsultationTaskKind, readonly string[]> = {
  analysis: ["preflight", "landmarks", "analyzing", "evidence"],
  "hair-trait-analysis": ["preflight", "segmenting", "extracting", "reconciling"],
  "personal-color-analysis": ["quality-check", "analyzing", "evidence"],
  "preview-generation": ["queue", "generation", "quality"],
  "hair-mask-extraction": ["queue", "segmentation", "boundary-quality"],
  "hair-color-generation": ["queue", "generation", "quality", "ready"],
  brief: ["summary", "services", "constraints"],
  "result-compilation": ["sources", "synthesis", "ready"],
  "fashion-generation": ["direction", "generation", "quality"],
  "makeup-simulation-generation": ["preparing", "generating", "quality-review", "ready"],
  "aftercare-preparation": ["actual-service", "schedule", "checkpoints"],
};

export const CONSULTATION_TASK_MESSAGES: Record<ConsultationTaskKind, readonly string[]> = {
  analysis: ["사진의 각도와 밝기가 분석에 충분한지 먼저 확인하고 있어요.", "얼굴 윤곽과 주요 기준점을 사진 위에 연결하고 있어요.", "손상도와 아침 손질 시간까지 함께 비교하고 있어요.", "관리하기 어려운 방향은 추천 전에 미리 걸러낼게요."],
  "hair-trait-analysis": ["사진에서 모발 영역을 얼굴과 배경에서 구분하고 있어요.", "결·밀도·볼륨처럼 사진으로 관찰 가능한 특성을 살펴보고 있어요.", "사진만으로 알 수 없는 항목은 단정하지 않고 질문으로 남길게요.", "기존 답변과 관찰 결과가 충돌하지 않는지 맞추고 있어요."],
  "personal-color-analysis": ["자연광과 색 왜곡이 진단에 영향을 주지 않는지 확인하고 있어요.", "온도·명도·채도·대비 축을 함께 비교하고 있어요.", "헤어 컬러와 옷에 바로 쓸 수 있는 기준으로 정리할게요."],
  "preview-generation": ["확정한 전략과 피하고 싶은 조건을 생성 기준에 반영했어요.", "먼저 완성된 결과부터 바로 보여드릴게요.", "어울림뿐 아니라 실제 시술 가능성도 함께 확인하고 있어요."],
  "hair-mask-extraction": ["확정한 스타일에서 머리카락 영역을 분리하고 있어요.", "잔머리와 얼굴 경계가 자연스럽게 이어지는지 확인하고 있어요.", "색상이 피부나 배경으로 번지지 않도록 경계를 다듬고 있어요."],
  "hair-color-generation": ["선택한 색을 확정 헤어의 결에 맞춰 적용하고 있어요.", "커트와 얼굴은 유지하고 뿌리·반사광·음영만 다시 만들고 있어요.", "피부색과 배경이 바뀌지 않았는지 마지막으로 확인하고 있어요.", "고품질 컬러 결과를 저장하고 있어요."],
  brief: ["미용사가 바로 이해할 수 있도록 핵심 요청을 정리하고 있어요.", "시술 항목과 현장 조정 범위를 분리하고 있어요.", "손상·관리·회피 조건이 빠지지 않았는지 다시 확인하고 있어요."],
  "result-compilation": ["분석과 최종 선택의 근거를 한곳에 모으고 있어요.", "퍼스널 컬러와 Salon Brief가 같은 결론을 말하는지 확인하고 있어요.", "나중에 다시 열어도 이어질 수 있는 결과를 저장하고 있어요."],
  "fashion-generation": ["확정한 헤어와 상황별 옷의 균형을 연결하고 있어요.", "DAILY·WORK·STATEMENT 결과를 완성되는 순서대로 준비하고 있어요.", "헤어가 가려지거나 왜곡된 결과는 후보에서 제외할게요."],
  "makeup-simulation-generation": ["확정한 메이크업 방향과 퍼스널 컬러를 정리하고 있어요.", "얼굴·헤어·배경을 유지한 채 메이크업만 적용하고 있어요.", "얼굴 형태와 피부 질감이 과도하게 바뀌지 않았는지 확인하고 있어요.", "비교할 수 있는 시뮬레이션을 준비하고 있어요."],
  "aftercare-preparation": ["실제 시술 기록을 기준으로 첫 관리 일정을 준비하고 있어요.", "오늘 필요한 행동과 다음 확인 시점을 나누고 있어요.", "디자이너 안내와 충돌하지 않는 관리 항목만 남기고 있어요."],
};

export function isConsultationTaskKind(value: string | null | undefined): value is ConsultationTaskKind {
  return CONSULTATION_TASK_KINDS.includes(value as ConsultationTaskKind);
}

export function isConsultationTaskReady(snapshot: ConsultationSnapshot, kind: ConsultationTaskKind) {
  if (kind === "analysis") return snapshot.evidence.items.length > 0 && snapshot.strategyRecommendations.length === 8;
  if (kind === "hair-trait-analysis") return ["ready", "confirmed"].includes(snapshot.hairProfile?.state ?? "");
  if (kind === "personal-color-analysis") return ["ready", "deferred", "unavailable"].includes(snapshot.personalColorDiagnosis.state);
  if (kind === "preview-generation") return snapshot.previews.filter((item) => item.status === "accepted").length >= 2;
  if (kind === "hair-mask-extraction") return Boolean(snapshot.colorDecision.hairMask);
  if (kind === "hair-color-generation") return Boolean(snapshot.colorDecision.finalImagePath || snapshot.colorDecision.state === "keep-current" || snapshot.colorDecision.state === "deferred" || snapshot.colorDecision.state === "salon-review");
  if (kind === "brief") return Boolean(snapshot.salonBrief.createdAt);
  if (kind === "result-compilation") return ["core-ready", "updated"].includes(snapshot.result.state) && Boolean(snapshot.result.compiledAt);
  if (kind === "fashion-generation") return Boolean(snapshot.fashionBatch && snapshot.fashionBatch.terminalCount >= snapshot.fashionBatch.requestedCount);
  if (kind === "makeup-simulation-generation") return Boolean((snapshot.makeupDirection as { simulationSelectionId?: string | null } | undefined)?.simulationSelectionId);
  return Boolean(snapshot.actualService.confirmedAt && snapshot.careProgram.actualServiceId && snapshot.careProgram.today.length);
}

function completedTask(snapshot: ConsultationSnapshot, kind: ConsultationTaskKind, stage: ConsultationStage): ConsultationActiveTask {
  const completedAt = kind === "analysis" ? snapshot.analysisRun?.completedAt : kind === "personal-color-analysis" ? snapshot.personalColorDiagnosis.completedAt : kind === "brief" ? snapshot.salonBrief.createdAt : kind === "result-compilation" ? snapshot.result.compiledAt : kind === "hair-color-generation" ? snapshot.colorDecision.confirmedAt : kind === "aftercare-preparation" ? snapshot.actualService.confirmedAt : snapshot.updatedAt;
  const definitions: Record<ConsultationTaskKind, Pick<ConsultationActiveTask, "id" | "originStage" | "transitionHostStage" | "destinationStage" | "readinessKey" | "label" | "completedUnits" | "totalUnits" | "partialOutputCount">> = {
    analysis: {
      id: snapshot.analysisRun?.id ?? "analysis-complete",
      originStage: "photo",
      transitionHostStage: "scan",
      destinationStage: "analysis",
      readinessKey: "analysis-evidence-ready",
      label: "얼굴·헤어 분석",
      completedUnits: 4,
      totalUnits: 4,
      partialOutputCount: snapshot.evidence.items.length,
    },
    "hair-trait-analysis": {
      id: snapshot.hairTraitAnalysisRun?.id ?? "hair-trait-complete",
      originStage: "photo",
      transitionHostStage: "scan",
      destinationStage: "analysis",
      readinessKey: "hair-profile-terminal",
      label: "모질 특성 분석",
      completedUnits: snapshot.hairProfile?.observed.length ?? 0,
      totalUnits: 12,
      partialOutputCount: snapshot.hairProfile?.observed.length ?? 0,
    },
    "personal-color-analysis": {
      id: snapshot.personalColorDiagnosis.evidenceId ?? "personal-color-complete",
      originStage: "analysis",
      transitionHostStage: "personal-color",
      destinationStage: "direction",
      readinessKey: "personal-color-terminal",
      label: "퍼스널 컬러 분석",
      completedUnits: 3,
      totalUnits: 3,
      partialOutputCount: snapshot.personalColorDiagnosis.state === "ready" ? 1 : 0,
    },
    "preview-generation": {
      id: snapshot.photo.generationId ?? "preview-complete",
      originStage: "direction",
      transitionHostStage: "previews",
      destinationStage: "previews",
      readinessKey: "accepted-previews>=2",
      label: "헤어 프리뷰 보드",
      completedUnits: snapshot.previews.filter((item) => item.status === "accepted").length,
      totalUnits: 9,
      partialOutputCount: snapshot.previews.filter((item) => item.status === "accepted").length,
    },
    "hair-mask-extraction": {
      id: snapshot.colorDecision.hairMask?.id ?? "hair-mask-complete",
      originStage: "decision",
      transitionHostStage: "color-studio",
      destinationStage: "color-studio",
      readinessKey: "hair-mask-ready",
      label: "헤어 영역 준비",
      completedUnits: 3,
      totalUnits: 3,
      partialOutputCount: snapshot.colorDecision.hairMask ? 1 : 0,
    },
    "hair-color-generation": {
      id: snapshot.colorDecision.generationAttemptId ?? "hair-color-complete",
      originStage: "color-studio",
      transitionHostStage: "color-studio",
      destinationStage: "salon-brief",
      readinessKey: "color-decision-terminal",
      label: "염색 확정본 생성",
      completedUnits: 4,
      totalUnits: 4,
      partialOutputCount: snapshot.colorDecision.finalImagePath ? 1 : 0,
    },
    brief: {
      id: `brief-v${snapshot.salonBrief.version}`,
      originStage: "decision",
      transitionHostStage: "salon-brief",
      destinationStage: "salon-brief",
      readinessKey: "salon-brief-version-ready",
      label: "Salon Brief",
      completedUnits: 3,
      totalUnits: 3,
      partialOutputCount: snapshot.salonBrief.createdAt ? 3 : 0,
    },
    "result-compilation": {
      id: snapshot.result.id ?? "result-complete",
      originStage: "fashion",
      transitionHostStage: "result",
      destinationStage: "result",
      readinessKey: "result-with-fashion-ready",
      label: "상담 결과 정리",
      completedUnits: 3,
      totalUnits: 3,
      partialOutputCount: snapshot.result.state === "core-ready" || snapshot.result.state === "updated" ? 1 : 0,
    },
    "fashion-generation": {
      id: snapshot.fashionBatch?.id ?? "fashion-complete",
      originStage: "fashion",
      transitionHostStage: "fashion",
      destinationStage: "fashion",
      readinessKey: `fashion-slots-terminal=${snapshot.fashionBatch?.requestedCount ?? 3}`,
      label: `${snapshot.fashionBatch?.requestedCount ?? 3}개 패션 룩 배치`,
      completedUnits: snapshot.fashionBatch?.terminalCount ?? 0,
      totalUnits: snapshot.fashionBatch?.requestedCount ?? 3,
      partialOutputCount: snapshot.fashionBatch?.completedCount ?? 0,
    },
    "makeup-simulation-generation": {
      id: "makeup-simulation-complete",
      originStage: "makeup",
      transitionHostStage: "makeup",
      destinationStage: "makeup",
      readinessKey: "makeup-simulation-review-ready",
      label: "메이크업 스타일 시뮬레이션",
      completedUnits: 1,
      totalUnits: 1,
      partialOutputCount: 1,
    },
    "aftercare-preparation": {
      id: snapshot.careProgram.actualServiceId ?? "aftercare-complete",
      originStage: "result",
      transitionHostStage: "aftercare",
      destinationStage: "aftercare",
      readinessKey: "aftercare-program-ready",
      label: "Aftercare 프로그램",
      completedUnits: snapshot.careProgram.today.length + snapshot.careProgram.checkpoints.length,
      totalUnits: snapshot.careProgram.today.length + snapshot.careProgram.checkpoints.length,
      partialOutputCount: snapshot.careProgram.today.length,
    },
  };
  const definition = definitions[kind];
  return {
    ...definition,
    kind,
    stage,
    status: "complete",
    phaseKey: "complete",
    phaseIndex: CONSULTATION_TASK_PHASES[kind].length,
    phaseCount: CONSULTATION_TASK_PHASES[kind].length,
    messageSetKey: `${kind}.complete`,
    detail: "서버에 저장된 결과가 준비되었습니다.",
    startedAt: null,
    updatedAt: snapshot.updatedAt,
    completedAt: completedAt ?? snapshot.updatedAt,
    retryable: false,
  };
}

export function resolveConsultationTransitionTask(snapshot: ConsultationSnapshot, stage: ConsultationStage, requestedKind?: ConsultationTaskKind | null): ConsultationActiveTask | null {
  const matching = snapshot.journey.activeTasks.find((task) => task.transitionHostStage === stage && (!requestedKind || task.kind === requestedKind) && task.phaseKey !== "approval" && task.phaseKey !== "waiting-for-upload");
  if (matching && isConsultationTaskReady(snapshot, matching.kind)) return requestedKind ? completedTask(snapshot, matching.kind, stage) : null;
  if (matching) return matching;
  if (requestedKind && isConsultationTaskReady(snapshot, requestedKind)) return completedTask(snapshot, requestedKind, stage);
  return null;
}

export function createClientConsultationTask(input: { id: string; kind: ConsultationTaskKind; stage: ConsultationStage; originStage: ConsultationStage; destinationStage: ConsultationStage; phaseKey: string; label: string; detail: string; status?: ConsultationTaskStatus; completedUnits?: number | null; totalUnits?: number | null }): ConsultationActiveTask {
  const now = new Date().toISOString();
  const phases = CONSULTATION_TASK_PHASES[input.kind];
  const phaseIndex = phases.indexOf(input.phaseKey);
  return {
    id: input.id,
    kind: input.kind,
    stage: input.stage,
    originStage: input.originStage,
    transitionHostStage: input.stage,
    destinationStage: input.destinationStage,
    readinessKey: `${input.kind}-server-response-ready`,
    status: input.status ?? "running",
    phaseKey: input.phaseKey,
    phaseIndex: phaseIndex >= 0 ? phaseIndex : null,
    phaseCount: phases.length,
    completedUnits: input.completedUnits ?? null,
    totalUnits: input.totalUnits ?? null,
    messageSetKey: `${input.kind}.${input.phaseKey}`,
    partialOutputCount: 0,
    label: input.label,
    detail: input.detail,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    retryable: false,
  };
}

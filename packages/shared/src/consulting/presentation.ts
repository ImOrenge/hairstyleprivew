import type {
  ConsultationActiveTask,
  ConsultationSnapshot,
  ConsultationStage,
  ConsultationTaskKind,
  ConsultationTaskStatus,
} from "./contract.ts";

export const CONSULTATION_TASK_KINDS = [
  "analysis",
  "preview-generation",
  "brief",
  "fashion-generation",
  "aftercare-preparation",
] as const satisfies readonly ConsultationTaskKind[];

export const CONSULTATION_TASK_PHASES: Record<ConsultationTaskKind, readonly string[]> = {
  analysis: ["preflight", "landmarks", "analyzing", "evidence"],
  "preview-generation": ["queue", "generation", "quality"],
  brief: ["summary", "services", "constraints"],
  "fashion-generation": ["direction", "generation", "quality"],
  "aftercare-preparation": ["actual-service", "schedule", "checkpoints"],
};

export const CONSULTATION_TASK_MESSAGES: Record<ConsultationTaskKind, readonly string[]> = {
  analysis: [
    "사진의 각도와 밝기가 분석에 충분한지 먼저 확인하고 있어요.",
    "얼굴 윤곽과 주요 기준점을 사진 위에 연결하고 있어요.",
    "손상도와 아침 손질 시간까지 함께 비교하고 있어요.",
    "관리하기 어려운 방향은 추천 전에 미리 걸러낼게요.",
  ],
  "preview-generation": [
    "확정한 전략과 피하고 싶은 조건을 생성 기준에 반영했어요.",
    "먼저 완성된 결과부터 바로 보여드릴게요.",
    "어울림뿐 아니라 실제 시술 가능성도 함께 확인하고 있어요.",
  ],
  brief: [
    "미용사가 바로 이해할 수 있도록 핵심 요청을 정리하고 있어요.",
    "시술 항목과 현장 조정 범위를 분리하고 있어요.",
    "손상·관리·회피 조건이 빠지지 않았는지 다시 확인하고 있어요.",
  ],
  "fashion-generation": [
    "확정한 헤어와 상황별 옷의 균형을 연결하고 있어요.",
    "DAILY·WORK·STATEMENT 결과를 완성되는 순서대로 준비하고 있어요.",
    "헤어가 가려지거나 왜곡된 결과는 후보에서 제외할게요.",
  ],
  "aftercare-preparation": [
    "실제 시술 기록을 기준으로 첫 관리 일정을 준비하고 있어요.",
    "오늘 필요한 행동과 다음 확인 시점을 나누고 있어요.",
    "디자이너 안내와 충돌하지 않는 관리 항목만 남기고 있어요.",
  ],
};

export function isConsultationTaskKind(value: string | null | undefined): value is ConsultationTaskKind {
  return CONSULTATION_TASK_KINDS.includes(value as ConsultationTaskKind);
}

export function isConsultationTaskReady(snapshot: ConsultationSnapshot, kind: ConsultationTaskKind) {
  if (kind === "analysis") return snapshot.evidence.items.length > 0 && snapshot.strategyRecommendations.length === 8;
  if (kind === "preview-generation") return snapshot.previews.filter((item) => item.status === "accepted").length >= 2;
  if (kind === "brief") return Boolean(snapshot.salonBrief.createdAt);
  if (kind === "fashion-generation") return Boolean(snapshot.fashionBatch && snapshot.fashionBatch.completedCount >= 2);
  return Boolean(snapshot.actualService.confirmedAt && snapshot.careProgram.actualServiceId && snapshot.careProgram.today.length);
}

function completedTask(snapshot: ConsultationSnapshot, kind: ConsultationTaskKind, stage: ConsultationStage): ConsultationActiveTask {
  const completedAt = kind === "analysis" ? snapshot.analysisRun?.completedAt
    : kind === "brief" ? snapshot.salonBrief.createdAt
      : kind === "aftercare-preparation" ? snapshot.actualService.confirmedAt
        : snapshot.updatedAt;
  const definitions: Record<ConsultationTaskKind, Pick<ConsultationActiveTask, "id" | "originStage" | "transitionHostStage" | "destinationStage" | "readinessKey" | "label" | "completedUnits" | "totalUnits" | "partialOutputCount">> = {
    analysis: { id: snapshot.analysisRun?.id ?? "analysis-complete", originStage: "photo", transitionHostStage: "scan", destinationStage: "analysis", readinessKey: "analysis-evidence-ready", label: "얼굴·헤어 분석", completedUnits: 4, totalUnits: 4, partialOutputCount: snapshot.evidence.items.length },
    "preview-generation": { id: snapshot.photo.generationId ?? "preview-complete", originStage: "direction", transitionHostStage: "previews", destinationStage: "previews", readinessKey: "accepted-previews>=2", label: "헤어 프리뷰 보드", completedUnits: snapshot.previews.filter((item) => item.status === "accepted").length, totalUnits: 9, partialOutputCount: snapshot.previews.filter((item) => item.status === "accepted").length },
    brief: { id: `brief-v${snapshot.salonBrief.version}`, originStage: "decision", transitionHostStage: "salon-brief", destinationStage: "salon-brief", readinessKey: "salon-brief-version-ready", label: "Salon Brief", completedUnits: 3, totalUnits: 3, partialOutputCount: snapshot.salonBrief.createdAt ? 3 : 0 },
    "fashion-generation": { id: snapshot.fashionBatch?.id ?? "fashion-complete", originStage: "fashion", transitionHostStage: "fashion", destinationStage: "fashion", readinessKey: "accepted-fashion-previews>=2", label: "9개 패션 룩 배치", completedUnits: snapshot.fashionBatch?.completedCount ?? 0, totalUnits: 9, partialOutputCount: snapshot.fashionBatch?.completedCount ?? 0 },
    "aftercare-preparation": { id: snapshot.careProgram.actualServiceId ?? "aftercare-complete", originStage: "salon-brief", transitionHostStage: "aftercare", destinationStage: "aftercare", readinessKey: "aftercare-program-ready", label: "Aftercare 프로그램", completedUnits: snapshot.careProgram.today.length + snapshot.careProgram.checkpoints.length, totalUnits: snapshot.careProgram.today.length + snapshot.careProgram.checkpoints.length, partialOutputCount: snapshot.careProgram.today.length },
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

export function resolveConsultationTransitionTask(
  snapshot: ConsultationSnapshot,
  stage: ConsultationStage,
  requestedKind?: ConsultationTaskKind | null,
): ConsultationActiveTask | null {
  const matching = snapshot.journey.activeTasks.find((task) => (
    task.transitionHostStage === stage
    && (!requestedKind || task.kind === requestedKind)
    && task.phaseKey !== "approval"
    && task.phaseKey !== "waiting-for-upload"
  ));
  if (matching && isConsultationTaskReady(snapshot, matching.kind)) return requestedKind ? completedTask(snapshot, matching.kind, stage) : null;
  if (matching) return matching;
  if (requestedKind && isConsultationTaskReady(snapshot, requestedKind)) return completedTask(snapshot, requestedKind, stage);
  return null;
}

export function createClientConsultationTask(input: {
  id: string;
  kind: ConsultationTaskKind;
  stage: ConsultationStage;
  originStage: ConsultationStage;
  destinationStage: ConsultationStage;
  phaseKey: string;
  label: string;
  detail: string;
  status?: ConsultationTaskStatus;
  completedUnits?: number | null;
  totalUnits?: number | null;
}): ConsultationActiveTask {
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

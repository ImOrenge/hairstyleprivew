"use client";

import { CONSULTATION_TASK_PHASES, type ConsultationActiveTask } from "../../../lib/consulting/contracts";

const PHASE_LABELS: Record<string, string> = {
  queue: "생성 접수",
  generation: "AI 생성",
  quality: "품질 확인",
  complete: "완료",
  preflight: "사진 확인",
  landmarks: "기준점 추출",
  analyzing: "AI 분석",
  evidence: "근거 저장",
  summary: "요약",
  services: "시술 연결",
  constraints: "제약 확인",
  direction: "방향 확정",
  "actual-service": "시술 기록",
  schedule: "일정 구성",
  checkpoints: "체크포인트",
};

function taskStatusLabel(task: ConsultationActiveTask) {
  const previewContinues = task.kind === "preview-generation"
    && task.completedUnits !== null
    && task.totalUnits !== null
    && task.completedUnits < task.totalUnits;
  if (task.status === "complete" && previewContinues) return "비교 가능 · 생성 계속 중";
  if (task.status === "partial") return task.kind === "preview-generation" ? "일부 완료 · 생성 계속 중" : "일부 완료";
  if (task.status === "running") return task.kind === "preview-generation" ? "프리뷰 생성 중" : "처리 중";
  if (task.status === "pending" || task.status === "waiting") return "처리 대기";
  if (task.status === "failed") return "처리 중단";
  if (task.status === "cancelled") return "취소됨";
  return "완료";
}

export function ConsultantActivityRail({ task }: { task: ConsultationActiveTask }) {
  const phases = CONSULTATION_TASK_PHASES[task.kind];
  const determinate = task.completedUnits !== null && task.totalUnits !== null && task.totalUnits > 0;
  const progress = determinate ? Math.min(100, Math.round((task.completedUnits! / task.totalUnits!) * 100)) : null;
  const statusLabel = taskStatusLabel(task);
  return <section className="f-consultant-activity" aria-labelledby="consultant-activity-title">
    <div className="f-consultant-activity__heading">
      <div><p className="app-kicker">지금 하고 있는 일</p><h2 id="consultant-activity-title">{task.label}</h2></div>
      <span data-task-status={task.status} role="status" aria-live="polite">{statusLabel}</span>
    </div>
    <ol className="f-consultant-activity__phases">
      {phases.map((phase, index) => {
        const state = task.status === "failed" && phase === task.phaseKey ? "failed"
          : task.status === "complete" || (task.phaseIndex !== null && index < task.phaseIndex) ? "complete"
            : task.phaseIndex === index || phase === task.phaseKey ? "active" : "pending";
        return <li key={phase} data-state={state}><span aria-hidden="true" /><strong>{PHASE_LABELS[phase] ?? phase}</strong></li>;
      })}
    </ol>
    <div className="f-consultant-activity__progress">
      <div className="f-consultant-activity__progress-copy"><span>{task.detail}</span><strong>{determinate ? `${task.completedUnits} / ${task.totalUnits}` : "처리 중"}</strong></div>
      {progress !== null ? <progress max={100} value={progress} aria-label={`${task.label} 단위 진행률`}>{progress}%</progress> : <div className="f-consultant-activity__indeterminate" aria-hidden="true" />}
    </div>
  </section>;
}

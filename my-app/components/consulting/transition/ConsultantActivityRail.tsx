"use client";

import { CONSULTATION_TASK_PHASES, type ConsultationActiveTask } from "../../../lib/consulting/contracts";

export function ConsultantActivityRail({ task }: { task: ConsultationActiveTask }) {
  const phases = CONSULTATION_TASK_PHASES[task.kind];
  const determinate = task.completedUnits !== null && task.totalUnits !== null && task.totalUnits > 0;
  const progress = determinate ? Math.min(100, Math.round((task.completedUnits! / task.totalUnits!) * 100)) : null;
  return <section className="f-consultant-activity" aria-labelledby="consultant-activity-title">
    <div className="f-consultant-activity__heading">
      <div><p className="app-kicker">Live task</p><h2 id="consultant-activity-title">{task.label}</h2></div>
      <span data-task-status={task.status}>{task.status}</span>
    </div>
    <ol className="f-consultant-activity__phases">
      {phases.map((phase, index) => {
        const state = task.status === "failed" && phase === task.phaseKey ? "failed"
          : task.status === "complete" || (task.phaseIndex !== null && index < task.phaseIndex) ? "complete"
            : task.phaseIndex === index || phase === task.phaseKey ? "active" : "pending";
        return <li key={phase} data-state={state}><span aria-hidden="true" /><strong>{phase}</strong></li>;
      })}
    </ol>
    <div className="f-consultant-activity__progress">
      <div className="f-consultant-activity__progress-copy"><span>{task.detail}</span><strong>{determinate ? `${task.completedUnits} / ${task.totalUnits}` : "처리 중"}</strong></div>
      {progress !== null ? <progress max={100} value={progress} aria-label={`${task.label} 단위 진행률`}>{progress}%</progress> : <div className="f-consultant-activity__indeterminate" aria-hidden="true" />}
    </div>
  </section>;
}

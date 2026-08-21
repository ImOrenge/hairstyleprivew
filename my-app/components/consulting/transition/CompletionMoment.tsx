"use client";

import type { ConsultationActiveTask } from "../../../lib/consulting/contracts";

export function CompletionMoment({ task }: { task: ConsultationActiveTask }) {
  const previewContinues = task.kind === "preview-generation"
    && task.completedUnits !== null
    && task.totalUnits !== null
    && task.completedUnits < task.totalUnits;
  return <div className="f-consultant-activity__completion" role="status" aria-live="polite">
    <span aria-hidden="true">✓</span><div><p className="app-kicker">{previewContinues ? "Ready to compare" : "Complete"}</p><strong>{previewContinues ? "비교 가능한 프리뷰가 준비됐어요" : `${task.label} 결과가 준비됐어요`}</strong><p>{previewContinues ? "나머지 결과는 프리뷰 화면에서 계속 생성됩니다." : "다음 상담 화면으로 자동으로 이어집니다."}</p></div>
  </div>;
}

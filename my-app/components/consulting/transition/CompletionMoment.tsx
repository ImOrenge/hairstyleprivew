"use client";

import type { ConsultationActiveTask } from "../../../lib/consulting/contracts";

export function CompletionMoment({ task }: { task: ConsultationActiveTask }) {
  return <div className="f-consultant-activity__completion" role="status" aria-live="polite">
    <span aria-hidden="true">✓</span><div><p className="app-kicker">Complete</p><strong>{task.label} 결과가 준비됐어요</strong><p>다음 상담 화면으로 자동으로 이어집니다.</p></div>
  </div>;
}

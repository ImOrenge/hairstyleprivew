"use client";

import Link from "next/link";
import type { ConsultationActiveTask } from "../../../lib/consulting/contracts";
import { consultationStageHref } from "../../../lib/consulting/routes";
import { Button } from "../../ui/Button";

export function RecoverableTaskNotice({ sessionId, task, onRetry, onClear }: { sessionId: string; task: ConsultationActiveTask; onRetry: () => void; onClear: () => void }) {
  return <section className="f-consultant-activity__recovery" role="alert">
    <div><p className="app-kicker">Recovery</p><h2>{task.label}을 완료하지 못했습니다</h2><p>{task.detail}</p><p>이미 저장된 사진과 완료 결과는 유지됩니다.</p></div>
    <div>{task.retryable ? <Button type="button" onClick={onRetry}>실패한 작업 상태 다시 확인</Button> : null}<Link href={consultationStageHref(sessionId, task.originStage)} onClick={onClear}>입력 화면으로 돌아가기</Link></div>
  </section>;
}

"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isConsultationTaskReady, type ConsultationActiveTask, type ConsultationSnapshot, type ConsultationStage } from "../../../lib/consulting/contracts";
import { emitConsultationLivenessEvent } from "../../../lib/consulting/consultation-liveness-events";
import { consultationStageHref } from "../../../lib/consulting/routes";
import { Button } from "../../ui/Button";
import { CompletionMoment } from "./CompletionMoment";
import { ConsultantActivityRail } from "./ConsultantActivityRail";
import { ConsultantKineticCanvas } from "./ConsultantKineticCanvas";
import { ConsultantSmallTalkCarousel } from "./ConsultantSmallTalkCarousel";
import { PartialResultReveal } from "./PartialResultReveal";
import { RecoverableTaskNotice } from "./RecoverableTaskNotice";

export function ConsultationTransitionScreen({ snapshot, stage, task, onPoll, onClear, onInspectPartial }: {
  snapshot: ConsultationSnapshot;
  stage: ConsultationStage;
  task: ConsultationActiveTask;
  onPoll: () => Promise<unknown>;
  onClear: () => void;
  onInspectPartial: () => void;
}) {
  const router = useRouter();
  const polling = useRef(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pollError, setPollError] = useState<string | null>(null);
  const ready = task.status === "complete" || isConsultationTaskReady(snapshot, task.kind);
  const failed = task.status === "failed" || task.status === "cancelled";
  const interrupted = failed || Boolean(pollError);
  const partialVisible = task.partialOutputCount > 0;
  const canInspectPartial = partialVisible && !ready && ["preview-generation", "fashion-generation"].includes(task.kind);
  const previewContinues = ready
    && task.kind === "preview-generation"
    && task.completedUnits !== null
    && task.totalUnits !== null
    && task.completedUnits < task.totalUnits;
  const visibleStatus = previewContinues ? "partial" : ready ? "complete" : interrupted ? "failed" : task.status;
  const activityTask = previewContinues ? { ...task, status: "partial" as const, phaseKey: "quality", phaseIndex: 2, detail: `${task.completedUnits} / ${task.totalUnits} 결과가 준비됐고 나머지는 계속 생성 중입니다.` } : ready ? { ...task, status: "complete" as const, phaseKey: "complete" } : task;
  const reportedTaskId = useRef<string | null>(null);
  const lastPhase = useRef<string | null>(null);
  const firstPartialReported = useRef(false);
  const completionReported = useRef(false);
  const recoveryReported = useRef(false);

  useLayoutEffect(() => {
    const mark = "hairfit:consultant-transition-visible";
    performance.clearMarks(mark);
    performance.mark(mark);
  }, [task.id]);

  useEffect(() => {
    document.getElementById("consultant-transition-title")?.focus();
  }, [task.id]);

  useEffect(() => {
    if (reportedTaskId.current === task.id) return;
    reportedTaskId.current = task.id;
    lastPhase.current = null;
    firstPartialReported.current = false;
    completionReported.current = false;
    recoveryReported.current = false;
    emitConsultationLivenessEvent({ event: "consultant_task_visible", taskKind: task.kind, phaseKey: task.phaseKey });
  }, [task.id, task.kind, task.phaseKey]);

  useEffect(() => {
    if (lastPhase.current === task.phaseKey) return;
    lastPhase.current = task.phaseKey;
    emitConsultationLivenessEvent({ event: "consultant_phase_changed", taskKind: task.kind, phaseKey: task.phaseKey });
  }, [task.kind, task.phaseKey]);

  useEffect(() => {
    if (!partialVisible || firstPartialReported.current) return;
    firstPartialReported.current = true;
    emitConsultationLivenessEvent({ event: "consultant_first_partial_visible", taskKind: task.kind, phaseKey: task.phaseKey });
  }, [partialVisible, task.kind, task.phaseKey]);

  useEffect(() => {
    if (!ready || completionReported.current) return;
    completionReported.current = true;
    emitConsultationLivenessEvent({ event: "consultant_task_completed_visible", taskKind: task.kind, phaseKey: "complete" });
  }, [ready, task.kind]);

  useEffect(() => {
    if (!interrupted || recoveryReported.current) return;
    recoveryReported.current = true;
    emitConsultationLivenessEvent({ event: "consultant_task_recovery_shown", taskKind: task.kind, phaseKey: task.phaseKey });
  }, [interrupted, task.kind, task.phaseKey]);

  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const poll = useCallback(async () => {
    if (polling.current || paused || !visible || ready || interrupted) return;
    polling.current = true;
    try {
      const result = await onPoll() as { ok?: boolean; error?: string } | undefined;
      if (result?.ok === false) setPollError(result.error || "서버 작업 상태를 확인하지 못했습니다.");
      else setPollError(null);
    } catch (cause) {
      setPollError(cause instanceof Error ? cause.message : "서버 작업 상태를 확인하지 못했습니다.");
    } finally {
      polling.current = false;
    }
  }, [interrupted, onPoll, paused, ready, visible]);

  useEffect(() => {
    if (paused || !visible || ready || interrupted) return;
    const initial = window.setTimeout(() => void poll(), 0);
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [interrupted, paused, poll, ready, visible]);

  useEffect(() => {
    if (!ready || failed) return;
    const completionKey = `hairfit:consultation-task-complete:${task.id}:${task.completedAt ?? snapshot.updatedAt}`;
    const alreadyShown = window.sessionStorage.getItem(completionKey) === "shown";
    window.sessionStorage.setItem(completionKey, "shown");
    const timer = window.setTimeout(() => {
      const destination = consultationStageHref(snapshot.sessionId, task.destinationStage);
      emitConsultationLivenessEvent({ event: "consultant_auto_transitioned", taskKind: task.kind, phaseKey: "complete" });
      onClear();
      router.replace(destination);
      if (task.destinationStage === stage) router.refresh();
    }, alreadyShown ? 0 : 800);
    return () => window.clearTimeout(timer);
  }, [failed, onClear, ready, router, snapshot.sessionId, snapshot.updatedAt, stage, task.completedAt, task.destinationStage, task.id, task.kind]);

  const reportFidgetUse = (count: number) => emitConsultationLivenessEvent({
    event: "consultant_fidget_used",
    taskKind: task.kind,
    phaseKey: task.phaseKey,
    fidgetUseCount: count,
  });

  return <section className="f-consultant-transition" data-task-id={task.id} data-task-kind={task.kind} data-task-status={visibleStatus} aria-labelledby="consultant-transition-title">
    <header className="f-consultant-transition__header">
      <div><p className="app-kicker">AI 컨설턴트 진행</p><h2 id="consultant-transition-title" tabIndex={-1}>{previewContinues ? "비교 가능한 프리뷰가 준비됐어요" : ready ? `${task.label}이 준비됐어요` : task.label}</h2><p>{previewContinues ? "준비된 결과로 먼저 비교할 수 있습니다. 나머지 프리뷰도 계속 준비합니다." : ready ? "저장된 결과를 확인하고 다음 화면으로 연결합니다." : task.detail}</p></div>
      {!interrupted && !ready ? <Button type="button" variant="ghost" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>{paused ? "연출 계속" : "연출 멈춤"}</Button> : null}
    </header>
    {interrupted ? <RecoverableTaskNotice sessionId={snapshot.sessionId} task={pollError ? { ...task, detail: pollError, retryable: true } : task} onRetry={() => {
      if (failed) void onPoll();
      else setPollError(null);
    }} onClear={onClear} /> : <>
      <div className="f-consultant-transition__body">
        <ConsultantKineticCanvas task={task} paused={paused || !visible} partialVisible={partialVisible} onFidgetUse={reportFidgetUse} />
        <ConsultantActivityRail task={activityTask} />
      </div>
      {ready ? <CompletionMoment task={task} /> : <ConsultantSmallTalkCarousel task={task} paused={paused || !visible} suppress={partialVisible} />}
      <PartialResultReveal snapshot={snapshot} task={task} />
      {canInspectPartial ? <div className="grid justify-items-start gap-2 border-t border-[var(--app-border)] pt-4"><Button type="button" variant="secondary" onClick={onInspectPartial}>준비된 결과 먼저 보기</Button><p className="text-sm text-[var(--app-muted)]">완료된 결과를 확인하는 동안 나머지 준비 작업은 계속됩니다.</p></div> : null}
    </>}
  </section>;
}

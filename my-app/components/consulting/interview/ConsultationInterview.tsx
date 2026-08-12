"use client";

import type { InterviewAnswerValue, InterviewQuestionSchema } from "@hairfit/shared/consulting/interview";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";

export type InterviewSaveState = "idle" | "saving" | "saved" | "offline" | "conflict";

export function InterviewCoverageIndicator({ completed, total, conflicts }: {
  completed: number;
  total: number;
  conflicts: number;
}) {
  const safeTotal = Math.max(1, total);
  const percent = Math.min(100, Math.max(0, Math.round((completed / safeTotal) * 100)));
  return <div className="f-consulting-interview__coverage" aria-label={`상담 기준 ${completed}/${total} 정리됨`}>
    <div className="flex items-center justify-between gap-3 text-xs font-black">
      <span>상담 기준 {completed}/{total} 정리됨</span>
      <span>{conflicts ? `확인 필요 ${conflicts}` : "충돌 없음"}</span>
    </div>
    <div className="mt-2 h-1.5 overflow-hidden bg-[var(--app-surface-muted)]" aria-hidden="true">
      <div className="h-full bg-[var(--app-accent)]" style={{ width: `${percent}%` }} />
    </div>
  </div>;
}

export function InterviewSaveStatus({ state, savedAt }: { state: InterviewSaveState; savedAt?: string | null }) {
  const labels: Record<InterviewSaveState, string> = {
    idle: "아직 저장할 변경 없음",
    saving: "답변 저장 중",
    saved: savedAt ? `${new Date(savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 저장됨` : "저장됨",
    offline: "오프라인 · 이 화면의 미저장 답변 유지 중",
    conflict: "다른 화면의 변경과 비교가 필요합니다",
  };
  const urgent = state === "offline" || state === "conflict";
  return <p className="f-consulting-interview__save-status text-xs font-bold text-[var(--app-muted)]" role={urgent ? "alert" : "status"} aria-live="polite">{labels[state]}</p>;
}

export function InterviewSummaryDrawer({ open, onOpenChange, title, children, footer }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange} title={title} description="저장된 답변과 확인이 필요한 내용을 한 번에 검토합니다." size="lg" className="f-consulting-interview__summary" footer={footer}>
    {children}
  </Dialog>;
}

export function ConsultationInterviewShell({ kind, title, description, coverage, saveState, savedAt, summaryOpen, onSummaryOpenChange, onExitRequest, children, navigation, summary, footer }: {
  kind: "discovery" | "fashion-direction";
  title: string;
  description: string;
  coverage: { completed: number; total: number; conflicts: number };
  saveState: InterviewSaveState;
  savedAt?: string | null;
  summaryOpen: boolean;
  onSummaryOpenChange: (open: boolean) => void;
  onExitRequest: () => void;
  children: ReactNode;
  navigation?: ReactNode;
  summary: ReactNode;
  footer?: ReactNode;
}) {
  const scrollLabel = kind === "discovery" ? "디스커버리 인터뷰" : "패션 방향 인터뷰";
  return <section className="f-consulting-interview" data-kind={kind} data-save-state={saveState} aria-label={scrollLabel} tabIndex={0}>
    <header className="f-consulting-interview__header">
      <div>
        <p className="app-kicker">Consultant interview</p>
        <h2 className="mt-2 text-2xl font-black">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => onSummaryOpenChange(true)}>전체 답변 보기</Button>
        <Button type="button" variant="ghost" onClick={onExitRequest}>상담 나가기</Button>
      </div>
    </header>
    <div className="f-consulting-interview__body">
      {navigation ? <aside className="f-consulting-interview__navigation">{navigation}</aside> : null}
      <div className="f-consulting-interview__content">
        <InterviewCoverageIndicator {...coverage} />
        <InterviewSaveStatus state={saveState} savedAt={savedAt} />
        <div className="f-consulting-interview__question">{children}</div>
        {footer ? <footer className="f-consulting-interview__footer">{footer}</footer> : null}
      </div>
    </div>
    <InterviewSummaryDrawer open={summaryOpen} onOpenChange={onSummaryOpenChange} title="전체 상담 기준">{summary}</InterviewSummaryDrawer>
  </section>;
}

function selectedValues(value: InterviewAnswerValue) {
  return Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
}

export function InterviewQuestionRenderer({ question, value, onAnswer, onCommit, compound }: {
  question: InterviewQuestionSchema;
  value: InterviewAnswerValue;
  onAnswer: (value: InterviewAnswerValue) => void;
  onCommit?: () => void;
  compound?: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [question.id]);

  const choices = selectedValues(value);
  const isMultiple = question.kind === "multiple";
  return <article data-question-id={question.id} data-question-kind={question.kind}>
    <p className="app-kicker">{question.topicId}</p>
    <h3 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-black outline-none">{question.prompt}</h3>
    {question.description ? <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{question.description}</p> : null}

    {question.kind === "single" || question.kind === "multiple" ? <fieldset className="f-consulting-interview__choices mt-6">
      <legend className="sr-only">{question.prompt}</legend>
      {(question.options ?? []).map((option) => {
        const checked = choices.includes(option.value);
        return <label key={option.value} className="f-consulting-interview__choice">
          <input
            type={isMultiple ? "checkbox" : "radio"}
            name={isMultiple ? `${question.id}-${option.value}` : question.id}
            value={option.value}
            checked={checked}
            onChange={() => onAnswer(isMultiple
              ? checked ? choices.filter((item) => item !== option.value) : [...choices, option.value]
              : option.value)}
          />
          <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
        </label>;
      })}
    </fieldset> : null}

    {question.kind === "text" ? <textarea className="app-input mt-6 min-h-32 w-full resize-y px-4 py-3" value={typeof value === "string" ? value : ""} onChange={(event) => onAnswer(event.target.value)} /> : null}
    {question.kind === "range" ? <input className="mt-6 w-full" type="range" min="0" max="100" value={typeof value === "number" ? value : 50} onChange={(event) => onAnswer(Number(event.target.value))} /> : null}
    {question.kind === "compound" ? <div className="mt-6">{compound}</div> : null}
    {(question.kind === "multiple" || question.kind === "text" || question.kind === "range" || question.kind === "compound") && onCommit
      ? <Button type="button" className="mt-6 min-h-12" onClick={onCommit}>답변 저장</Button>
      : null}
  </article>;
}

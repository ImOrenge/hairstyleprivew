"use client";

import type { ConsultationFashionContextV1, FashionPolicyCoverageV1 } from "@hairfit/shared";
import type { InterviewQuestionSchema } from "@hairfit/shared/consulting/interview";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FashionDirectionSnapshot } from "../../../lib/consulting/contracts";
import { trackConsultationInterviewEvent } from "../../../lib/consulting/interview-observability-client";
import { ConfirmActionDialog } from "../../ui/ConfirmActionDialog";
import { DefinitionRows } from "../workbenches/shared";
import { ConsultationInterviewShell, InterviewQuestionRenderer, type InterviewSaveState } from "./ConsultationInterview";

const TOPICS = ["context", "impression", "season", "budget"] as const;
type TopicId = (typeof TOPICS)[number];

const TOPIC_LABELS: Record<TopicId, string> = {
  context: "착용 상황",
  impression: "원하는 인상",
  season: "계절",
  budget: "예산",
};

const QUESTIONS: Record<TopicId, InterviewQuestionSchema> = {
  context: { id: "fashion-context", topicId: "fashion-context", kind: "single", prompt: "가장 먼저 필요한 룩은 어디에서 입을 예정인가요?", required: true, options: [
    { value: "daily", label: "일상" }, { value: "work", label: "업무" }, { value: "date", label: "데이트·모임" }, { value: "formal", label: "격식 있는 일정" },
  ] },
  impression: { id: "fashion-impression", topicId: "fashion-impression", kind: "single", prompt: "어떤 분위기와 인상을 우선할까요?", required: true, options: [
    { value: "minimal", label: "미니멀" }, { value: "casual", label: "캐주얼" }, { value: "classic", label: "클래식" }, { value: "street", label: "스트릿" }, { value: "office", label: "오피스" }, { value: "date", label: "데이트" },
  ] },
  season: { id: "fashion-season", topicId: "fashion-season", kind: "single", prompt: "어느 계절과 환경을 기준으로 할까요?", required: true, options: [
    { value: "spring", label: "봄" }, { value: "summer", label: "여름" }, { value: "autumn", label: "가을" }, { value: "winter", label: "겨울" }, { value: "all-season", label: "사계절" },
  ] },
  budget: { id: "fashion-budget", topicId: "fashion-budget", kind: "text", prompt: "한 착장에 고려할 예산 범위가 있나요?", description: "금액을 정하지 않았다면 ‘기존 옷 활용’처럼 방향을 적어도 됩니다.", required: true },
};

function marker(direction: FashionDirectionSnapshot, topic: TopicId) {
  return direction.fieldProvenance?.[`topic:${topic}`] !== undefined;
}

function withMarker(direction: FashionDirectionSnapshot, topic: TopicId, field: string): FashionDirectionSnapshot {
  return {
    ...direction,
    fieldProvenance: { ...direction.fieldProvenance, [`topic:${topic}`]: "user", [field]: "user" },
    interviewRevision: (direction.interviewRevision ?? 0) + 1,
  };
}

export function FashionDirectionInterview({ consultationId, direction, selectedHair, personalColor, discoveryAvoid, saving, disabled, onAutosave, onConfirm }: {
  consultationId: string;
  direction: FashionDirectionSnapshot;
  selectedHair: string;
  personalColor: string;
  discoveryAvoid: string[];
  saving: boolean;
  disabled: boolean;
  onAutosave: (direction: FashionDirectionSnapshot) => Promise<{ ok?: boolean; conflict?: boolean } | void>;
  onConfirm: (direction: FashionDirectionSnapshot) => Promise<void>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(direction);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [saveState, setSaveState] = useState<InterviewSaveState>("idle");
  const [editTopic, setEditTopic] = useState<TopicId | null>(null);
  const [personalization, setPersonalization] = useState<"checking" | "ready" | "required" | "legacy" | "error">("checking");
  const [fashionContext, setFashionContext] = useState<ConsultationFashionContextV1 | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const completed = TOPICS.filter((topic) => marker(direction, topic));
  const entryEvent = useRef<"opened" | "resumed">(completed.length ? "resumed" : "opened");
  const entryRevision = useRef(direction.interviewRevision);
  const activeTopic = editTopic ?? TOPICS.find((topic) => !marker(direction, topic)) ?? "budget";
  const question = QUESTIONS[activeTopic];

  useEffect(() => {
    void trackConsultationInterviewEvent({ consultationId, event: entryEvent.current, interviewKind: "fashion-direction", revision: entryRevision.current });
  }, [consultationId]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/v2/me/onboarding/fashion-personalization", { cache: "no-store" }),
      fetch(`/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion/context`, { cache: "no-store" }),
    ]).then(async ([policyResponse, contextResponse]) => {
      if (!active) return;
      if (policyResponse.status === 404 || contextResponse.status === 404) { setPersonalization("legacy"); return; }
      const policyData = await policyResponse.json().catch(() => ({})) as { coverage?: FashionPolicyCoverageV1 };
      const contextData = await contextResponse.json().catch(() => ({})) as { context?: ConsultationFashionContextV1 };
      if (!policyResponse.ok || !contextResponse.ok || !contextData.context) throw new Error("패션 개인화 준비 상태를 불러오지 못했습니다.");
      setFashionContext(contextData.context);
      setPersonalization(policyData.coverage?.complete ? "ready" : "required");
    }).catch((error) => { if (active) { setContextError(error instanceof Error ? error.message : "패션 개인화 준비 상태를 불러오지 못했습니다."); setPersonalization("error"); } });
    return () => { active = false; };
  }, [consultationId]);

  const save = async (topic: TopicId, next: FashionDirectionSnapshot) => {
    if (!navigator.onLine) { setSaveState("offline"); return; }
    const field = topic === "context" ? "situation" : topic === "impression" ? "genre" : topic;
    const normalized = withMarker(next, topic, field);
    setDraft(normalized);
    setSaveState("saving");
    const result = await onAutosave(normalized);
    setSaveState(result?.ok ? "saved" : result?.conflict ? "conflict" : "offline");
    if (result?.ok) {
      setEditTopic(null);
      void trackConsultationInterviewEvent({ consultationId, event: "topic_confirmed", interviewKind: "fashion-direction", topicId: topic, revision: normalized.interviewRevision });
    } else {
      void trackConsultationInterviewEvent({ consultationId, event: "save_failed", interviewKind: "fashion-direction", topicId: topic, revision: normalized.interviewRevision, errorCode: result?.conflict ? "VERSION_CONFLICT" : "SAVE_UNAVAILABLE" });
    }
  };

  const value = activeTopic === "context" ? draft.situation
    : activeTopic === "impression" ? draft.genre
      : activeTopic === "season" ? draft.season
        : draft.budget;
  const apply = (nextValue: unknown) => {
    if (typeof nextValue !== "string") return draft;
    if (activeTopic === "context") return { ...draft, situation: nextValue as FashionDirectionSnapshot["situation"] };
    if (activeTopic === "impression") return { ...draft, genre: nextValue };
    if (activeTopic === "season") return { ...draft, season: nextValue as FashionDirectionSnapshot["season"] };
    if (activeTopic === "budget") return { ...draft, budget: nextValue };
    return draft;
  };

  const confirmDirection = async () => {
    if (personalization === "required") {
      router.push(`/onboarding/fashion-personalization?returnTo=${encodeURIComponent(`/consulting/${consultationId}/fashion`)}`);
      return;
    }
    setContextError(null);
    if (personalization === "ready" && fashionContext) {
      const amounts = draft.budget.match(/\d[\d,]*/g)?.map((value) => Number(value.replace(/,/g, ""))).filter(Number.isFinite) ?? [];
      const patched = await fetch(`/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion/context`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: fashionContext.revision, patch: {
          occasion: draft.situation, season: draft.season, oneTimeGoal: draft.genre,
          oneTimeBudgetOverride: amounts.length ? { minKrw: amounts[0] ?? null, maxKrw: amounts[1] ?? amounts[0] ?? null } : null,
        } }),
      });
      const patchedData = await patched.json().catch(() => ({})) as { context?: ConsultationFashionContextV1; error?: string };
      if (!patched.ok || !patchedData.context) { setContextError(patchedData.error || "이번 상담 맥락을 저장하지 못했습니다."); return; }
      const confirmed = await fetch(`/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion/context/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: patchedData.context.revision }),
      });
      const confirmedData = await confirmed.json().catch(() => ({})) as { context?: ConsultationFashionContextV1; error?: string };
      if (!confirmed.ok || !confirmedData.context) { setContextError(confirmedData.error || "이번 상담 맥락을 확정하지 못했습니다."); return; }
      setFashionContext(confirmedData.context);
      const snapshotResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(consultationId)}/fashion/personalization-snapshot`, { method: "POST" });
      const snapshotData = await snapshotResponse.json().catch(() => ({})) as { error?: string };
      if (!snapshotResponse.ok) { setContextError(snapshotData.error || "패션 추천 근거를 준비하지 못했습니다."); return; }
    }
    void trackConsultationInterviewEvent({ consultationId, event: "confirmed", interviewKind: "fashion-direction", revision: draft.interviewRevision });
    await onConfirm(draft);
  };

  const allComplete = completed.length === TOPICS.length;
  const topicNavigation = <nav aria-label="패션 방향 인터뷰 목록">
    <p className="app-kicker">Interview topics</p>
    <ol className="f-consulting-interview__topic-list mt-3">{TOPICS.map((topic, index) => {
      const complete = marker(direction, topic);
      const active = topic === activeTopic;
      return <li key={topic}><button type="button" className="f-consulting-interview__topic" data-state={complete ? "complete" : active ? "active" : "pending"} aria-current={active ? "true" : undefined} onClick={() => setEditTopic(topic)}><span className="f-consulting-interview__topic-marker" aria-hidden="true">{complete ? "✓" : String(index + 1).padStart(2, "0")}</span><span>{TOPIC_LABELS[topic]}</span><span className="sr-only">{complete ? "완료" : active ? "현재 질문" : "미완료"}</span></button></li>;
    })}</ol>
  </nav>;

  return <>
    <ConsultationInterviewShell
      kind="fashion-direction"
      title="확정한 헤어에 어울릴 옷의 방향을 정해요"
      description={`${selectedHair}과 ${personalColor} 컬러 근거를 먼저 재사용합니다. 이미 정한 헤어·컬러·회피 조건은 다시 묻지 않습니다.`}
      coverage={{ completed: completed.length, total: TOPICS.length, conflicts: 0 }}
      saveState={saving ? "saving" : saveState}
      summaryOpen={summaryOpen}
      onSummaryOpenChange={setSummaryOpen}
      onExitRequest={() => setExitOpen(true)}
      navigation={topicNavigation}
      summary={<div className="grid gap-5"><DefinitionRows items={[
        { label: "확정 헤어", value: selectedHair }, { label: "컬러 근거", value: personalColor },
        { label: "착용 상황", value: draft.situation }, { label: "분위기", value: draft.genre },
        { label: "지속 핏·노출", value: "온보딩 개인화 기준 적용" }, { label: "계절", value: draft.season },
        { label: "일회 예산", value: draft.budget || "미응답" }, { label: "지속 회피", value: [...discoveryAvoid, ...draft.avoidItems].join(", ") || "온보딩 기준 적용" },
      ]} /><div className="flex flex-wrap gap-2">{TOPICS.map((topic) => <button key={topic} type="button" className="min-h-11 border border-[var(--app-border)] px-3 text-sm font-black" onClick={() => { setEditTopic(topic); setSummaryOpen(false); }}>{QUESTIONS[topic].prompt} 수정</button>)}</div></div>}
      footer={allComplete ? <div className="grid gap-2">{contextError ? <p role="alert" className="text-sm text-[var(--app-danger)]">{contextError}</p> : null}<button type="button" className="c-button min-h-12 w-full border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 font-black text-[var(--app-inverse-text)]" disabled={saving || disabled || personalization === "checking" || personalization === "error"} onClick={() => void confirmDirection()}>{personalization === "required" ? "개인화 기준 완성하기" : "AI 패션 추천 준비"}</button></div> : null}
    >
      <InterviewQuestionRenderer
        question={question}
        value={value}
        onAnswer={(next) => {
          const normalized = apply(next);
          setDraft(normalized);
          if (["context", "impression", "season"].includes(activeTopic)) window.setTimeout(() => void save(activeTopic, normalized), 300);
        }}
        onCommit={activeTopic === "budget" ? () => void save(activeTopic, draft) : undefined}
      />
    </ConsultationInterviewShell>
    <ConfirmActionDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={() => { void trackConsultationInterviewEvent({ consultationId, event: "exited", interviewKind: "fashion-direction", revision: draft.interviewRevision, keepalive: true }); router.push("/home"); }} title="상담을 나갈까요?" description="저장된 패션 방향은 유지됩니다. 현재 질문의 미저장 입력은 사라질 수 있습니다." confirmLabel="저장된 상태로 나가기" cancelLabel="계속 인터뷰하기" />
  </>;
}

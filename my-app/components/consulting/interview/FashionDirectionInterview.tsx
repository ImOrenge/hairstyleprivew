"use client";

import type { InterviewQuestionSchema } from "@hairfit/shared/consulting/interview";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FashionDirectionSnapshot } from "../../../lib/consulting/contracts";
import { trackConsultationInterviewEvent } from "../../../lib/consulting/interview-observability-client";
import { ConfirmActionDialog } from "../../ui/ConfirmActionDialog";
import { DefinitionRows } from "../workbenches/shared";
import { ConsultationInterviewShell, InterviewQuestionRenderer, type InterviewSaveState } from "./ConsultationInterview";

const TOPICS = ["context", "impression", "fit", "exposure", "season", "budget", "avoid"] as const;
type TopicId = (typeof TOPICS)[number];

const TOPIC_LABELS: Record<TopicId, string> = {
  context: "착용 상황",
  impression: "원하는 인상",
  fit: "선호 핏",
  exposure: "노출 범위",
  season: "계절",
  budget: "예산",
  avoid: "피하고 싶은 것",
};

const QUESTIONS: Record<TopicId, InterviewQuestionSchema> = {
  context: { id: "fashion-context", topicId: "fashion-context", kind: "single", prompt: "가장 먼저 필요한 룩은 어디에서 입을 예정인가요?", required: true, options: [
    { value: "daily", label: "일상" }, { value: "work", label: "업무" }, { value: "date", label: "데이트·모임" }, { value: "formal", label: "격식 있는 일정" },
  ] },
  impression: { id: "fashion-impression", topicId: "fashion-impression", kind: "single", prompt: "어떤 분위기와 인상을 우선할까요?", required: true, options: [
    { value: "minimal", label: "미니멀" }, { value: "casual", label: "캐주얼" }, { value: "classic", label: "클래식" }, { value: "street", label: "스트릿" }, { value: "office", label: "오피스" }, { value: "date", label: "데이트" },
  ] },
  fit: { id: "fashion-fit", topicId: "fashion-fit", kind: "single", prompt: "어떤 핏이 가장 편한가요?", required: true, options: [
    { value: "slim", label: "슬림" }, { value: "regular", label: "레귤러" }, { value: "relaxed", label: "릴랙스" }, { value: "oversized", label: "오버사이즈" },
  ] },
  exposure: { id: "fashion-exposure", topicId: "fashion-exposure", kind: "single", prompt: "원하는 노출과 넥라인 범위는 어디까지인가요?", required: true, options: [
    { value: "low", label: "낮게" }, { value: "balanced", label: "균형 있게" }, { value: "bold", label: "선명하게" },
  ] },
  season: { id: "fashion-season", topicId: "fashion-season", kind: "single", prompt: "어느 계절과 환경을 기준으로 할까요?", required: true, options: [
    { value: "spring", label: "봄" }, { value: "summer", label: "여름" }, { value: "autumn", label: "가을" }, { value: "winter", label: "겨울" }, { value: "all-season", label: "사계절" },
  ] },
  budget: { id: "fashion-budget", topicId: "fashion-budget", kind: "text", prompt: "한 착장에 고려할 예산 범위가 있나요?", description: "금액을 정하지 않았다면 ‘기존 옷 활용’처럼 방향을 적어도 됩니다.", required: true },
  avoid: { id: "fashion-avoid", topicId: "fashion-avoid", kind: "text", prompt: "입지 않는 색상이나 아이템이 있나요?", description: "쉼표로 구분해 적어주세요. 없다면 ‘없음’으로 저장할 수 있습니다.", required: true },
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
  const completed = TOPICS.filter((topic) => marker(direction, topic));
  const entryEvent = useRef<"opened" | "resumed">(completed.length ? "resumed" : "opened");
  const entryRevision = useRef(direction.interviewRevision);
  const activeTopic = editTopic ?? TOPICS.find((topic) => !marker(direction, topic)) ?? "avoid";
  const question = QUESTIONS[activeTopic];

  useEffect(() => {
    void trackConsultationInterviewEvent({ consultationId, event: entryEvent.current, interviewKind: "fashion-direction", revision: entryRevision.current });
  }, [consultationId]);

  const save = async (topic: TopicId, next: FashionDirectionSnapshot) => {
    if (!navigator.onLine) { setSaveState("offline"); return; }
    const field = topic === "context" ? "situation" : topic === "impression" ? "genre" : topic === "avoid" ? "avoidItems" : topic;
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
      : activeTopic === "fit" ? draft.fit
        : activeTopic === "exposure" ? draft.exposure
          : activeTopic === "season" ? draft.season
            : activeTopic === "budget" ? draft.budget
              : draft.avoidItems.join(", ");
  const apply = (nextValue: unknown) => {
    if (typeof nextValue !== "string") return draft;
    if (activeTopic === "context") return { ...draft, situation: nextValue as FashionDirectionSnapshot["situation"] };
    if (activeTopic === "impression") return { ...draft, genre: nextValue };
    if (activeTopic === "fit") return { ...draft, fit: nextValue as FashionDirectionSnapshot["fit"] };
    if (activeTopic === "exposure") return { ...draft, exposure: nextValue as FashionDirectionSnapshot["exposure"] };
    if (activeTopic === "season") return { ...draft, season: nextValue as FashionDirectionSnapshot["season"] };
    if (activeTopic === "budget") return { ...draft, budget: nextValue };
    return { ...draft, avoidItems: nextValue.split(",").map((item) => item.trim()).filter(Boolean) };
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
        { label: "핏·노출", value: `${draft.fit} · ${draft.exposure}` }, { label: "계절", value: draft.season },
        { label: "예산", value: draft.budget || "미응답" }, { label: "회피", value: [...discoveryAvoid, ...draft.avoidItems].join(", ") || "없음" },
      ]} /><div className="flex flex-wrap gap-2">{TOPICS.map((topic) => <button key={topic} type="button" className="min-h-11 border border-[var(--app-border)] px-3 text-sm font-black" onClick={() => { setEditTopic(topic); setSummaryOpen(false); }}>{QUESTIONS[topic].prompt} 수정</button>)}</div></div>}
      footer={allComplete ? <button type="button" className="c-button min-h-12 w-full border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 font-black text-[var(--app-inverse-text)]" disabled={saving || disabled} onClick={() => { void trackConsultationInterviewEvent({ consultationId, event: "confirmed", interviewKind: "fashion-direction", revision: draft.interviewRevision }); void onConfirm(draft); }}>이 방향으로 9개 룩 준비</button> : null}
    >
      <InterviewQuestionRenderer
        question={question}
        value={value}
        onAnswer={(next) => {
          const normalized = apply(next);
          setDraft(normalized);
          if (["context", "impression", "fit", "exposure", "season"].includes(activeTopic)) window.setTimeout(() => void save(activeTopic, normalized), 300);
        }}
        onCommit={["budget", "avoid"].includes(activeTopic) ? () => void save(activeTopic, draft) : undefined}
      />
    </ConsultationInterviewShell>
    <ConfirmActionDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={() => { void trackConsultationInterviewEvent({ consultationId, event: "exited", interviewKind: "fashion-direction", revision: draft.interviewRevision, keepalive: true }); router.push("/home"); }} title="상담을 나갈까요?" description="저장된 패션 방향은 유지됩니다. 현재 질문의 미저장 입력은 사라질 수 있습니다." confirmLabel="저장된 상태로 나가기" cancelLabel="계속 인터뷰하기" />
  </>;
}

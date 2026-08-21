"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ConsultationInputProfile, ConsultationIntentV2, ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { trackConsultationInterviewEvent } from "../../../lib/consulting/interview-observability-client";
import { ConfirmActionDialog } from "../../ui/ConfirmActionDialog";
import { ConsultationInterviewShell, type InterviewSaveState } from "./ConsultationInterview";

const TOPICS = [
  { id: "scope", label: "상담 범위" },
  { id: "change", label: "변화 정도" },
  { id: "exclusions", label: "피하고 싶은 것" },
] as const;
type TopicId = (typeof TOPICS)[number]["id"];

const SCOPE_OPTIONS: Array<{ value: ConsultationIntentV2["scope"]; label: string; detail: string }> = [
  { value: "hair", label: "헤어 중심", detail: "커트·펌·스타일 방향을 우선해요." },
  { value: "hair_color", label: "헤어와 컬러", detail: "확정 헤어에 어울리는 염색까지 봐요." },
  { value: "total_styling", label: "토탈 스타일링", detail: "헤어·컬러·메이크업·패션을 연결해요." },
];
const CHANGE_OPTIONS: Array<{ value: ConsultationIntentV2["changeLevel"]; label: string; detail: string }> = [
  { value: "maintain", label: "현재 인상 유지", detail: "불편한 점만 정돈해요." },
  { value: "natural_change", label: "자연스러운 변화", detail: "익숙한 인상 안에서 변화를 만들어요." },
  { value: "clear_change", label: "분명한 변화", detail: "눈에 보이는 새로운 방향을 탐색해요." },
];
const EXCLUSION_OPTIONS = ["짧은 앞머리", "과한 볼륨", "강한 컬", "잦은 뿌리 염색", "매일 고데기"];

function initialIntent(profile: ConsultationInputProfile): ConsultationIntentV2 {
  return profile.intent ?? {
    schemaVersion: "consultation-intent-v2",
    scope: profile.allowedServices.includes("염색") ? "hair_color" : "hair",
    changeLevel: profile.changeLevel === "bold" ? "clear_change" : profile.changeLevel === "subtle" ? "maintain" : "natural_change",
    exclusions: profile.avoid,
    exclusionsConfirmed: false,
    styleTarget: "neutral",
    sourceProfileId: null,
    interviewRevision: profile.interviewRevision ?? 0,
    confirmedAt: null,
  };
}

function projectIntent(profile: ConsultationInputProfile, intent: ConsultationIntentV2, topic: TopicId): ConsultationInputProfile {
  const allowedServices = intent.scope === "hair" ? ["커트", "펌"] : ["커트", "펌", "염색"];
  return {
    ...profile,
    intent,
    purpose: intent.scope === "total_styling" ? "토탈 스타일링" : intent.scope === "hair_color" ? "헤어와 컬러" : "헤어 스타일",
    goals: [intent.changeLevel === "maintain" ? "현재 인상 정돈" : intent.changeLevel === "clear_change" ? "새로운 이미지" : "자연스러운 변화"],
    desiredServices: allowedServices,
    allowedServices,
    changeLevel: intent.changeLevel === "maintain" ? "subtle" : intent.changeLevel === "clear_change" ? "bold" : "moderate",
    avoid: intent.exclusions,
    interviewRevision: intent.interviewRevision,
    fieldProvenance: {
      ...profile.fieldProvenance,
      [`intent.${topic === "change" ? "changeLevel" : topic}`]: "user",
    },
  };
}

export function ConsultantIntentInterview({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">, options?: { navigate?: boolean }) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const [intent, setIntent] = useState(() => initialIntent(snapshot.discovery));
  const [active, setActive] = useState<TopicId>(() => snapshot.discovery.intent?.confirmedAt ? "exclusions" : "scope");
  const [saveState, setSaveState] = useState<InterviewSaveState>(snapshot.discovery.intent ? "saved" : "idle");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const entryRevision = useRef(intent.interviewRevision);

  useEffect(() => {
    void trackConsultationInterviewEvent({ consultationId: snapshot.sessionId, event: entryRevision.current ? "resumed" : "opened", interviewKind: "discovery", revision: entryRevision.current });
  }, [snapshot.sessionId]);

  const completed = {
    scope: Boolean(snapshot.discovery.intent?.scope || snapshot.discovery.fieldProvenance?.["intent.scope"]),
    change: Boolean(snapshot.discovery.intent?.changeLevel || snapshot.discovery.fieldProvenance?.["intent.changeLevel"]),
    exclusions: intent.exclusionsConfirmed,
  };
  const save = async (topic: TopicId, next: ConsultationIntentV2, confirm = false) => {
    const normalized: ConsultationIntentV2 = {
      ...next,
      interviewRevision: next.interviewRevision + 1,
      confirmedAt: confirm ? new Date().toISOString() : next.confirmedAt,
    };
    setIntent(normalized);
    setSaveState("saving");
    const result = await mutate({
      discovery: projectIntent(snapshot.discovery, normalized, topic),
      ...(confirm ? { completeStage: "discovery" as const, currentStage: "photo" as const } : { currentStage: "discovery" as const }),
    }, { navigate: confirm });
    const outcome = result as { ok?: boolean; conflict?: boolean } | undefined;
    setSaveState(outcome?.ok ? "saved" : outcome?.conflict ? "conflict" : "offline");
    if (outcome?.ok) {
      void trackConsultationInterviewEvent({ consultationId: snapshot.sessionId, event: confirm ? "confirmed" : "topic_confirmed", interviewKind: "discovery", topicId: topic, revision: normalized.interviewRevision });
      if (!confirm) setActive(topic === "scope" ? "change" : "exclusions");
    }
  };
  const toggleExclusion = (value: string) => setIntent((current) => ({ ...current, exclusions: current.exclusions.includes(value) ? current.exclusions.filter((item) => item !== value) : [...current.exclusions, value], exclusionsConfirmed: false }));
  const navigation = <nav aria-label="상담 목표 목록"><p className="app-kicker">Consultation focus</p><ol className="f-consulting-interview__topic-list mt-3">{TOPICS.map((topic, index) => <li key={topic.id}><button type="button" className="f-consulting-interview__topic" data-state={completed[topic.id] ? "complete" : active === topic.id ? "active" : "pending"} aria-current={active === topic.id ? "true" : undefined} onClick={() => setActive(topic.id)}><span className="f-consulting-interview__topic-marker" aria-hidden="true">{completed[topic.id] ? "✓" : String(index + 1).padStart(2, "0")}</span><span>{topic.label}</span></button></li>)}</ol></nav>;
  const choices = (options: Array<{ value: string; label: string; detail: string }>, selected: string, onSelect: (value: string) => void) => <div className="f-consulting-interview__choices mt-5">{options.map((option) => <label key={option.value} className="f-consulting-interview__choice"><input type="radio" checked={selected === option.value} onChange={() => onSelect(option.value)} /><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</div>;

  return <>
    <ConsultationInterviewShell kind="discovery" title="먼저 상담의 방향만 짧게 맞춰요" description="모발 상태는 사진 분석 뒤 필요한 것만 다시 물어볼게요. 지금은 세 가지 결정만 확인합니다." coverage={{ completed: Object.values(completed).filter(Boolean).length, total: 3, conflicts: saveState === "conflict" ? 1 : 0 }} saveState={saving ? "saving" : saveState} savedAt={snapshot.updatedAt} summaryOpen={summaryOpen} onSummaryOpenChange={setSummaryOpen} onExitRequest={() => setExitOpen(true)} navigation={navigation} summary={<div className="grid gap-3 text-sm"><p><strong>상담 범위</strong> · {SCOPE_OPTIONS.find((item) => item.value === intent.scope)?.label}</p><p><strong>변화 정도</strong> · {CHANGE_OPTIONS.find((item) => item.value === intent.changeLevel)?.label}</p><p><strong>피하고 싶은 것</strong> · {intent.exclusions.join(", ") || "없음"}</p></div>}>
      <article data-question-id={`intent-${active}`}>
        {active === "scope" ? <><p className="app-kicker">상담 범위</p><h2 className="mt-2 text-2xl font-black">이번에 어디까지 함께 볼까요?</h2>{choices(SCOPE_OPTIONS, intent.scope, (value) => { const next = { ...intent, scope: value as ConsultationIntentV2["scope"] }; setIntent(next); window.setTimeout(() => void save("scope", next), 200); })}</> : null}
        {active === "change" ? <><p className="app-kicker">변화 정도</p><h2 className="mt-2 text-2xl font-black">원하는 변화의 크기는 어느 쪽인가요?</h2>{choices(CHANGE_OPTIONS, intent.changeLevel, (value) => { const next = { ...intent, changeLevel: value as ConsultationIntentV2["changeLevel"] }; setIntent(next); window.setTimeout(() => void save("change", next), 200); })}</> : null}
        {active === "exclusions" ? <><p className="app-kicker">피하고 싶은 것</p><h2 className="mt-2 text-2xl font-black">추천에서 꼭 제외할 조건이 있나요?</h2><div className="f-consulting-interview__choices mt-5">{EXCLUSION_OPTIONS.map((value) => <label key={value} className="f-consulting-interview__choice"><input type="checkbox" checked={intent.exclusions.includes(value)} onChange={() => toggleExclusion(value)} /><span><strong>{value}</strong></span></label>)}</div><button type="button" className="c-button mt-6 min-h-12 w-full border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 font-black text-[var(--app-inverse-text)]" disabled={saving || saveState === "saving"} onClick={() => void save("exclusions", { ...intent, exclusionsConfirmed: true }, true)}>사진 제출하고 분석 시작</button></> : null}
      </article>
    </ConsultationInterviewShell>
    <ConfirmActionDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={() => { void trackConsultationInterviewEvent({ consultationId: snapshot.sessionId, event: "exited", interviewKind: "discovery", revision: intent.interviewRevision, keepalive: true }); router.push("/home"); }} title="상담을 나갈까요?" description="저장된 상담 목표는 유지되어 다음에 이어서 진행할 수 있습니다." confirmLabel="저장된 상태로 나가기" cancelLabel="계속 상담하기" />
  </>;
}

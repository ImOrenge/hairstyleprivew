"use client";

import type { InterviewConflict, InterviewQuestionSchema } from "@hairfit/shared/consulting/interview";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConsultationInputProfile, ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { trackConsultationInterviewEvent } from "../../../lib/consulting/interview-observability-client";
import { ConfirmActionDialog } from "../../ui/ConfirmActionDialog";
import { ChoiceGroup, DefinitionRows, TextField } from "../workbenches/shared";
import { ConsultationInterviewShell, InterviewQuestionRenderer, type InterviewSaveState } from "./ConsultationInterview";

const PURPOSES = ["출근·업무 이미지", "일상 이미지 정리", "중요 일정", "큰 스타일 변화"];
const GOALS = ["더 또렷한 인상", "부드러운 인상", "얼굴 균형 보완", "손질 시간 단축", "새로운 이미지"];
const SERVICES = ["커트", "펌", "염색", "클리닉"];
const AVOID = ["짧은 앞머리", "과한 볼륨", "강한 컬", "잦은 뿌리 염색", "매일 고데기"];

const TOPICS = [
  { id: "purpose", prompt: "이번 상담에서 가장 바꾸고 싶은 것은 무엇인가요?", kind: "single" },
  { id: "goals", prompt: "어떤 인상과 결과를 원하나요?", kind: "multiple" },
  { id: "current-hair", prompt: "지금 모발 상태를 알려주세요.", kind: "compound" },
  { id: "history", prompt: "최근 시술과 손상 상태는 어떤가요?", kind: "compound" },
  { id: "services", prompt: "원하는 시술과 실제 가능한 범위는 어디까지인가요?", kind: "compound" },
  { id: "maintenance", prompt: "아침과 미용실에서 어느 정도 관리할 수 있나요?", kind: "compound" },
  { id: "change", prompt: "변화 강도와 피하고 싶은 것을 정리해볼게요.", kind: "compound" },
] as const;

type TopicId = (typeof TOPICS)[number]["id"];

function marker(profile: ConsultationInputProfile, topicId: TopicId) {
  return profile.fieldProvenance?.[`topic:${topicId}`] !== undefined;
}

function topicComplete(profile: ConsultationInputProfile, topicId: TopicId) {
  if (topicId === "purpose") return Boolean(profile.purpose.trim());
  if (topicId === "goals") return profile.goals.length > 0;
  if (topicId === "current-hair") return marker(profile, topicId) && Boolean(profile.currentHair.trim());
  if (topicId === "services") return marker(profile, topicId) && profile.allowedServices.length > 0;
  return marker(profile, topicId);
}

function conflictList(profile: ConsultationInputProfile): InterviewConflict[] {
  const conflicts: InterviewConflict[] = [];
  const unavailableServices = profile.desiredServices.filter((service) => service !== "아직 모름" && !profile.allowedServices.includes(service));
  if (unavailableServices.length) conflicts.push({
    id: "service-scope",
    fieldIds: ["desiredServices", "allowedServices"],
    code: "DESIRED_SERVICE_OUTSIDE_ALLOWED_SCOPE",
    message: `가능한 시술 범위 밖의 희망 항목: ${unavailableServices.join(", ")}`,
    resolutionQuestionId: "services",
    status: "open",
  });
  if (profile.changeLevel === "bold" && profile.maintenanceLevel === "low") conflicts.push({
    id: "change-maintenance",
    fieldIds: ["changeLevel", "maintenanceLevel"],
    code: "BOLD_CHANGE_LOW_MAINTENANCE",
    message: "과감한 변화와 낮은 관리 강도를 함께 선택했습니다. AI는 관리 부담을 우선해 제안 범위를 제한합니다.",
    resolutionQuestionId: null,
    status: "salon_confirmation_required",
  });
  if (profile.damageLevel === "높음" && profile.desiredServices.some((service) => ["탈색", "펌"].includes(service))) conflicts.push({
    id: "damage-service",
    fieldIds: ["damageLevel", "desiredServices"],
    code: "HIGH_DAMAGE_SERVICE_SAFETY",
    message: "높은 손상도와 강한 시술 희망은 미용실에서 모발 상태를 다시 확인해야 합니다.",
    resolutionQuestionId: null,
    status: "salon_confirmation_required",
  });
  return conflicts;
}

function unknownFields(profile: ConsultationInputProfile) {
  return (["hairDensity", "strandThickness", "damageLevel"] as const)
    .filter((field) => profile[field] === "잘 모르겠어요");
}

function withTopicMetadata(profile: ConsultationInputProfile, topicId: TopicId, fields: string[]) {
  const unknown = unknownFields(profile);
  return {
    ...profile,
    unknownFields: unknown,
    fieldProvenance: {
      ...profile.fieldProvenance,
      [`topic:${topicId}`]: "user" as const,
      ...Object.fromEntries(fields.map((field) => [field, unknown.includes(field as never) ? "unknown" : "user"] as const)),
    },
    conflicts: conflictList(profile),
    interviewRevision: (profile.interviewRevision ?? 0) + 1,
  };
}

function schema(topicId: TopicId): InterviewQuestionSchema {
  const topic = TOPICS.find((item) => item.id === topicId) ?? TOPICS[0];
  const options = topic.id === "purpose" ? PURPOSES.map((value) => ({ value, label: value }))
    : topic.id === "goals" ? GOALS.map((value) => ({ value, label: value })) : undefined;
  return {
    id: `discovery-${topic.id}`,
    topicId: `discovery-${topic.id}`,
    kind: topic.kind,
    prompt: topic.prompt,
    description: topic.id === "purpose" ? "선택하면 바로 저장되고 다음으로 필요한 질문이 열립니다." : "지금 확실한 범위만 답해도 됩니다. 모르는 값은 그대로 남길 수 있습니다.",
    required: true,
    options,
  };
}

export function DiscoveryInterview({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(snapshot.discovery);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [saveState, setSaveState] = useState<InterviewSaveState>("idle");
  const [editTopic, setEditTopic] = useState<TopicId | null>(null);
  const completedTopics = TOPICS.filter((topic) => topicComplete(snapshot.discovery, topic.id));
  const entryEvent = useRef<"opened" | "resumed">(completedTopics.length ? "resumed" : "opened");
  const entryRevision = useRef(snapshot.discovery.interviewRevision);
  const activeTopic = editTopic ?? TOPICS.find((topic) => !topicComplete(snapshot.discovery, topic.id))?.id ?? "change";
  const conflicts = useMemo(() => conflictList(draft), [draft]);
  const allComplete = completedTopics.length === TOPICS.length && !conflicts.some((conflict) => conflict.status === "open");

  useEffect(() => {
    void trackConsultationInterviewEvent({ consultationId: snapshot.sessionId, event: entryEvent.current, interviewKind: "discovery", revision: entryRevision.current });
  }, [snapshot.sessionId]);

  const saveTopic = async (topicId: TopicId, fields: string[], nextDraft = draft) => {
    if (!navigator.onLine) { setSaveState("offline"); return; }
    const normalized = withTopicMetadata(nextDraft, topicId, fields);
    setDraft(normalized);
    setSaveState("saving");
    const result = await mutate({ discovery: normalized, currentStage: "discovery" }) as { ok?: boolean; conflict?: boolean } | undefined;
    setSaveState(result?.ok ? "saved" : result?.conflict ? "conflict" : "offline");
    if (result?.ok) {
      setEditTopic(null);
      void trackConsultationInterviewEvent({ consultationId: snapshot.sessionId, event: "topic_confirmed", interviewKind: "discovery", topicId, revision: normalized.interviewRevision });
    } else {
      void trackConsultationInterviewEvent({ consultationId: snapshot.sessionId, event: "save_failed", interviewKind: "discovery", topicId, revision: normalized.interviewRevision, errorCode: result?.conflict ? "VERSION_CONFLICT" : "SAVE_UNAVAILABLE" });
    }
  };

  const question = schema(activeTopic);
  const questionValue = activeTopic === "purpose" ? draft.purpose : activeTopic === "goals" ? draft.goals : null;
  const compound = activeTopic === "current-hair" ? <div className="grid gap-5">
    <TextField label="현재 모발 상태" value={draft.currentHair} onChange={(currentHair) => setDraft({ ...draft, currentHair })} placeholder="예: 어깨 아래 길이, 염색으로 끝부분 손상" />
    <ChoiceGroup label="현재 길이" values={["짧음", "중간", "김"]} selected={[draft.hairLength]} multiple={false} onToggle={(hairLength) => setDraft({ ...draft, hairLength })} />
    <ChoiceGroup label="모발 형태" values={["직모", "약한 웨이브", "곱슬"]} selected={[draft.hairTexture]} multiple={false} onToggle={(hairTexture) => setDraft({ ...draft, hairTexture })} />
    <ChoiceGroup label="모발 양" values={["적음", "보통", "많음", "잘 모르겠어요"]} selected={[draft.hairDensity]} multiple={false} onToggle={(hairDensity) => setDraft({ ...draft, hairDensity })} />
    <ChoiceGroup label="모발 굵기" values={["가늘음", "보통", "굵음", "잘 모르겠어요"]} selected={[draft.strandThickness]} multiple={false} onToggle={(strandThickness) => setDraft({ ...draft, strandThickness })} />
  </div> : activeTopic === "history" ? <div className="grid gap-5">
    <ChoiceGroup label="손상 정도" values={["낮음", "보통", "높음", "잘 모르겠어요"]} selected={[draft.damageLevel]} multiple={false} onToggle={(damageLevel) => setDraft({ ...draft, damageLevel })} />
    <ChoiceGroup label="최근 시술 이력" values={["탈색", "염색", "펌", "매직·스트레이트"]} selected={draft.treatmentHistory} onToggle={(item) => setDraft({ ...draft, treatmentHistory: draft.treatmentHistory.includes(item) ? draft.treatmentHistory.filter((entry) => entry !== item) : [...draft.treatmentHistory, item] })} />
  </div> : activeTopic === "services" ? <div className="grid gap-5">
    <ChoiceGroup label="고려 중인 서비스" values={[...SERVICES, "아직 모름"]} selected={draft.desiredServices} onToggle={(item) => setDraft({ ...draft, desiredServices: draft.desiredServices.includes(item) ? draft.desiredServices.filter((entry) => entry !== item) : [...draft.desiredServices, item] })} />
    <ChoiceGroup label="가능한 시술 범위" values={SERVICES} selected={draft.allowedServices} onToggle={(item) => setDraft({ ...draft, allowedServices: draft.allowedServices.includes(item) ? draft.allowedServices.filter((entry) => entry !== item) : [...draft.allowedServices, item] })} />
  </div> : activeTopic === "maintenance" ? <div className="grid gap-5">
    <ChoiceGroup label="가능한 관리 강도" values={["낮음", "보통", "높음"]} selected={[draft.maintenanceLevel === "low" ? "낮음" : draft.maintenanceLevel === "high" ? "높음" : "보통"]} multiple={false} onToggle={(item) => setDraft({ ...draft, maintenanceLevel: item === "낮음" ? "low" : item === "높음" ? "high" : "medium" })} />
    <ChoiceGroup label="아침 손질 가능 시간" values={["5분", "10분", "20분", "30분"]} selected={[`${draft.morningMinutes}분`]} multiple={false} onToggle={(item) => setDraft({ ...draft, morningMinutes: Number(item.replace("분", "")) })} />
    <ChoiceGroup label="열기구 사용 빈도" values={["사용하지 않음", "가끔 가능", "자주 가능"]} selected={[draft.heatStyling === "avoid" ? "사용하지 않음" : draft.heatStyling === "comfortable" ? "자주 가능" : "가끔 가능"]} multiple={false} onToggle={(item) => setDraft({ ...draft, heatStyling: item === "사용하지 않음" ? "avoid" : item === "자주 가능" ? "comfortable" : "sometimes" })} />
    <ChoiceGroup label="미용실 방문 주기" values={["4주", "8주", "12주"]} selected={[`${draft.salonCycleWeeks}주`]} multiple={false} onToggle={(item) => setDraft({ ...draft, salonCycleWeeks: Number(item.replace("주", "")) })} />
  </div> : activeTopic === "change" ? <div className="grid gap-5">
    <ChoiceGroup label="변화 강도" values={["은은하게", "적당히", "과감하게"]} selected={[draft.changeLevel === "subtle" ? "은은하게" : draft.changeLevel === "bold" ? "과감하게" : "적당히"]} multiple={false} onToggle={(item) => setDraft({ ...draft, changeLevel: item === "은은하게" ? "subtle" : item === "과감하게" ? "bold" : "moderate" })} />
    <ChoiceGroup label="피하고 싶은 것" values={AVOID} selected={draft.avoid} onToggle={(item) => setDraft({ ...draft, avoid: draft.avoid.includes(item) ? draft.avoid.filter((entry) => entry !== item) : [...draft.avoid, item] })} />
    <TextField label="추가로 알려줄 내용" value={draft.notes} onChange={(notes) => setDraft({ ...draft, notes })} />
  </div> : null;

  const fieldsByTopic: Record<TopicId, string[]> = {
    purpose: ["purpose"], goals: ["goals"], "current-hair": ["currentHair", "hairLength", "hairTexture", "hairDensity", "strandThickness"],
    history: ["damageLevel", "treatmentHistory"], services: ["desiredServices", "allowedServices"],
    maintenance: ["maintenanceLevel", "morningMinutes", "heatStyling", "salonCycleWeeks"], change: ["changeLevel", "avoid", "notes"],
  };

  return <>
    <ConsultationInterviewShell
      kind="discovery"
      title="필요한 기준만 대화하듯 정리해요"
      description="순서표를 따라가는 설문이 아닙니다. 저장된 답변은 건너뛰고 아직 필요한 주제와 충돌만 보여줍니다."
      coverage={{ completed: completedTopics.length, total: TOPICS.length, conflicts: conflicts.length }}
      saveState={saving ? "saving" : saveState}
      savedAt={snapshot.updatedAt}
      summaryOpen={summaryOpen}
      onSummaryOpenChange={setSummaryOpen}
      onExitRequest={() => setExitOpen(true)}
      summary={<div className="grid gap-5"><DefinitionRows items={[
        { label: "상담 목적", value: draft.purpose || "미응답" },
        { label: "원하는 변화", value: draft.goals.join(", ") || "미응답" },
        { label: "현재 모발", value: `${draft.currentHair || "설명 없음"} · ${draft.hairLength} · ${draft.hairTexture}` },
        { label: "시술 범위", value: draft.allowedServices.join(", ") || "미응답" },
        { label: "관리", value: `아침 ${draft.morningMinutes}분 · ${draft.salonCycleWeeks}주 · ${draft.maintenanceLevel}` },
        { label: "회피", value: draft.avoid.join(", ") || "없음" },
      ]} /><div className="flex flex-wrap gap-2">{TOPICS.map((topic) => <button key={topic.id} type="button" className="min-h-11 border border-[var(--app-border)] px-3 text-sm font-black" onClick={() => { setEditTopic(topic.id); setSummaryOpen(false); }}>{topic.prompt} 수정</button>)}</div>{conflicts.map((conflict) => <p key={conflict.id} className="border border-[var(--app-warning)] bg-[var(--app-warning-bg)] p-3 text-sm">확인 필요 · {conflict.message}</p>)}</div>}
      footer={allComplete ? <button type="button" className="c-button min-h-12 w-full border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 font-black text-[var(--app-inverse-text)]" disabled={saving} onClick={() => { void trackConsultationInterviewEvent({ consultationId: snapshot.sessionId, event: "confirmed", interviewKind: "discovery", revision: draft.interviewRevision }); void mutate({ discovery: { ...draft, conflicts }, completeStage: "discovery", currentStage: "photo" }); }}>이 기준으로 사진 준비</button> : null}
    >
      <InterviewQuestionRenderer
        question={question}
        value={questionValue}
        onAnswer={(next) => {
          if (activeTopic === "purpose" && typeof next === "string") {
            const nextDraft = { ...draft, purpose: next };
            setDraft(nextDraft);
            window.setTimeout(() => void saveTopic("purpose", fieldsByTopic.purpose, nextDraft), 300);
          } else if (activeTopic === "goals" && Array.isArray(next)) setDraft({ ...draft, goals: next });
        }}
        onCommit={activeTopic === "purpose" ? undefined : () => void saveTopic(activeTopic, fieldsByTopic[activeTopic])}
        compound={compound}
      />
    </ConsultationInterviewShell>
    <ConfirmActionDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={() => { void trackConsultationInterviewEvent({ consultationId: snapshot.sessionId, event: "exited", interviewKind: "discovery", revision: draft.interviewRevision, keepalive: true }); router.push("/home"); }} title="상담을 나갈까요?" description="저장된 답변은 유지됩니다. 현재 질문에서 아직 저장하지 않은 입력은 사라질 수 있습니다." confirmLabel="저장된 상태로 나가기" cancelLabel="계속 인터뷰하기" />
  </>;
}

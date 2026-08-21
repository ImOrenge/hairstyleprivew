"use client";

import {
  MAKEUP_INTERVIEW_REQUIRED_TOPICS,
  MAKEUP_INTERVIEW_TOPICS,
  MAKEUP_MODE_LABELS,
  MAKEUP_MODES,
  type MakeupInterviewProfileV2,
  type MakeupInterviewTopic,
} from "@hairfit/shared/makeup";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmActionDialog } from "../../ui/ConfirmActionDialog";
import { Button } from "../../ui/Button";
import { ConsultationInterviewShell, type InterviewSaveState } from "../interview/ConsultationInterview";
import { trackConsultationInterviewEvent } from "../../../lib/consulting/interview-observability-client";

const LABELS: Record<MakeupInterviewTopic, string> = { mode: "대표 모드", occasion: "사용 상황", finish: "피부 마감", practicality: "시간·숙련도", avoid: "회피·수염 보정", products: "보유 제품", tools: "보유 도구" };
const OCCASIONS = [["daily", "데일리"], ["work", "출근·업무"], ["date", "데이트·모임"], ["formal", "격식 일정"], ["event", "행사·촬영"]] as const;
const FINISHES = [["natural", "내추럴"], ["semi_matte", "세미 매트"], ["matte", "매트"], ["semi_glow", "세미 글로우"], ["glow", "글로우"]] as const;
const SKILLS = [["none", "처음"], ["basic", "초보"], ["intermediate", "익숙함"], ["advanced", "숙련"]] as const;
const PRODUCT_OPTIONS = ["쿠션·파운데이션", "컨실러", "아이 팔레트", "아이라이너", "블러셔", "립"];
const TOOL_OPTIONS = ["손가락", "퍼프·스펀지", "베이스 브러시", "아이 브러시", "뷰러", "속눈썹 도구"];

function chips(values: readonly (readonly [string, string])[], selected: string | string[], onChange: (value: string) => void, multiple = false) {
  const current = Array.isArray(selected) ? selected : [selected];
  return <div className="f-consulting-interview__choices mt-5">{values.map(([value, label]) => <label key={value} className="f-consulting-interview__choice"><input type={multiple ? "checkbox" : "radio"} checked={current.includes(value)} onChange={() => onChange(value)} /><span><strong>{label}</strong></span></label>)}</div>;
}

export function MakeupDirectionInterview({ consultationId, value, coverage, savedAt, disabled, onSave, onConfirm }: {
  consultationId: string;
  value: MakeupInterviewProfileV2;
  coverage: Array<{ topicId: MakeupInterviewTopic; required: boolean; status: "complete" | "skipped" | "pending" }>;
  savedAt?: string | null;
  disabled?: boolean;
  onSave: (topic: MakeupInterviewTopic, profile: MakeupInterviewProfileV2, skip?: boolean) => Promise<MakeupInterviewProfileV2>;
  onConfirm: (profile: MakeupInterviewProfileV2) => Promise<void>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(value);
  const [active, setActive] = useState<MakeupInterviewTopic>(coverage.find((item) => item.status === "pending")?.topicId ?? "mode");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [saveState, setSaveState] = useState<InterviewSaveState>(savedAt ? "saved" : "idle");
  const [error, setError] = useState("");
  const entryRevision = useRef(value.revision);
  useEffect(() => { void trackConsultationInterviewEvent({ consultationId, event: entryRevision.current ? "resumed" : "opened", interviewKind: "makeup-direction", revision: entryRevision.current }); }, [consultationId]);
  const done = coverage.filter((item) => item.status !== "pending").length;
  const requiredDone = MAKEUP_INTERVIEW_REQUIRED_TOPICS.every((topic) => coverage.find((item) => item.topicId === topic)?.status === "complete");
  const nextPending = (topic: MakeupInterviewTopic) => MAKEUP_INTERVIEW_TOPICS.slice(MAKEUP_INTERVIEW_TOPICS.indexOf(topic) + 1).find((item) => coverage.find((entry) => entry.topicId === item)?.status === "pending");
  const save = async (topic: MakeupInterviewTopic, profile = draft, skip = false) => {
    setSaveState("saving"); setError("");
    try { const next = await onSave(topic, profile, skip); setDraft(next); setSaveState("saved"); setActive(nextPending(topic) ?? topic); void trackConsultationInterviewEvent({ consultationId, event: "topic_confirmed", interviewKind: "makeup-direction", topicId: topic, revision: next.revision }); }
    catch (reason) { setSaveState(reason instanceof Error && reason.message.includes("버전") ? "conflict" : "offline"); setError(reason instanceof Error ? reason.message : "답변을 저장하지 못했습니다."); }
  };
  const toggle = (items: string[], item: string) => items.includes(item) ? items.filter((entry) => entry !== item) : [...items, item];
  const navigation = <nav aria-label="메이크업 방향 인터뷰 목록"><p className="app-kicker">Interview topics</p><ol className="f-consulting-interview__topic-list mt-3">{MAKEUP_INTERVIEW_TOPICS.map((topic, index) => { const state = coverage.find((item) => item.topicId === topic)?.status ?? "pending"; return <li key={topic}><button type="button" className="f-consulting-interview__topic" data-state={state === "complete" ? "complete" : topic === active ? "active" : state} aria-current={topic === active ? "true" : undefined} onClick={() => setActive(topic)}><span className="f-consulting-interview__topic-marker" aria-hidden="true">{state === "complete" ? "✓" : state === "skipped" ? "–" : String(index + 1).padStart(2, "0")}</span><span>{LABELS[topic]}</span></button></li>; })}</ol></nav>;
  const summary = <div className="grid gap-3 text-sm"><p><strong>대표 모드</strong> · {MAKEUP_MODE_LABELS[draft.primaryMode]}</p><p><strong>상황</strong> · {[draft.primaryOccasion, ...draft.secondaryOccasions].join(", ")}</p><p><strong>마감</strong> · {draft.finishPreference}</p><p><strong>현실 조건</strong> · {draft.preparationMinutes}분 · {draft.skillLevel}</p><p><strong>회피</strong> · {draft.exclusions.join(", ") || "없음"}</p><p><strong>제품·도구</strong> · {[...draft.ownedProductTypes, ...draft.ownedToolTypes].join(", ") || "미입력"}</p></div>;
  return <>
    <ConsultationInterviewShell kind="makeup-direction" title="원하는 메이크업 인상을 먼저 정해요" description="퍼스널 컬러·얼굴 관측·확정 헤어는 AI가 근거로 연결합니다. 선택한 방향은 AI가 임의로 바꾸지 않습니다." coverage={{ completed: done, total: MAKEUP_INTERVIEW_TOPICS.length, conflicts: saveState === "conflict" ? 1 : 0 }} saveState={saveState} savedAt={savedAt} summaryOpen={summaryOpen} onSummaryOpenChange={setSummaryOpen} onExitRequest={() => setExitOpen(true)} navigation={navigation} summary={summary} footer={requiredDone ? <Button className="min-h-12 w-full" disabled={disabled || saveState === "saving"} onClick={() => void onConfirm(draft)}>AI 추천 검토하기</Button> : null}>
      <article data-question-id={`makeup-${active}`}><p className="app-kicker">{LABELS[active]}</p>
        {active === "mode" ? <><h3 className="mt-2 text-2xl font-black">가장 원하는 메이크업 모드를 골라주세요</h3><div className="f-consulting-interview__choices mt-5">{MAKEUP_MODES.map((mode) => <label key={mode} className="f-consulting-interview__choice"><input type="radio" checked={draft.primaryMode === mode} onChange={() => { const next = { ...draft, primaryMode: mode }; setDraft(next); window.setTimeout(() => void save("mode", next), 200); }} /><span><strong>{MAKEUP_MODE_LABELS[mode]}</strong></span></label>)}</div></> : null}
        {active === "occasion" ? <><h3 className="mt-2 text-2xl font-black">주 사용 상황과 보조 상황을 정해주세요</h3>{chips(OCCASIONS, draft.primaryOccasion, (primaryOccasion) => setDraft({ ...draft, primaryOccasion }))}<p className="mt-5 text-sm font-black">선택적 보조 상황</p>{chips(OCCASIONS, draft.secondaryOccasions, (item) => setDraft({ ...draft, secondaryOccasions: toggle(draft.secondaryOccasions, item).filter((entry) => entry !== draft.primaryOccasion) }), true)}<Button className="mt-6" onClick={() => void save("occasion")}>답변 저장</Button></> : null}
        {active === "finish" ? <><h3 className="mt-2 text-2xl font-black">피부 표현의 마감은 어떤 쪽인가요?</h3>{chips(FINISHES, draft.finishPreference, (finishPreference) => { const next = { ...draft, finishPreference: finishPreference as MakeupInterviewProfileV2["finishPreference"] }; setDraft(next); window.setTimeout(() => void save("finish", next), 200); })}</> : null}
        {active === "practicality" ? <><h3 className="mt-2 text-2xl font-black">준비 시간과 숙련도를 함께 알려주세요</h3><p className="mt-5 text-sm font-black">준비 시간</p>{chips([["5", "5분"], ["10", "10분"], ["20", "20분"], ["30", "30분"]] as const, String(draft.preparationMinutes), (value) => setDraft({ ...draft, preparationMinutes: Number(value) as MakeupInterviewProfileV2["preparationMinutes"] }))}<p className="mt-5 text-sm font-black">숙련도</p>{chips(SKILLS, draft.skillLevel, (skillLevel) => setDraft({ ...draft, skillLevel: skillLevel as MakeupInterviewProfileV2["skillLevel"] }))}<Button className="mt-6" onClick={() => void save("practicality")}>답변 저장</Button></> : null}
        {active === "avoid" ? <><h3 className="mt-2 text-2xl font-black">피하고 싶은 표현과 수염 주변 보정을 정해주세요</h3><textarea className="app-input mt-5 min-h-28 w-full px-4 py-3" value={draft.exclusions.join(", ")} onChange={(event) => setDraft({ ...draft, exclusions: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="예: 두꺼운 아이라인, 과한 글리터" /><label className="mt-5 flex items-center gap-3 text-sm font-black"><input type="checkbox" checked={draft.facialHair.userWantsCoverage} onChange={(event) => setDraft({ ...draft, facialHair: { type: event.target.checked && draft.facialHair.type === "none" ? "stubble" : draft.facialHair.type, userWantsCoverage: event.target.checked } })} />수염 주변 보정이 필요해요</label><Button className="mt-6" onClick={() => void save("avoid")}>답변 저장</Button></> : null}
        {active === "products" || active === "tools" ? <><h3 className="mt-2 text-2xl font-black">{active === "products" ? "이미 보유한 제품을 알려주세요" : "이미 보유한 도구를 알려주세요"}</h3><div className="f-consulting-interview__choices mt-5">{(active === "products" ? PRODUCT_OPTIONS : TOOL_OPTIONS).map((item) => { const items = active === "products" ? draft.ownedProductTypes : draft.ownedToolTypes; return <label key={item} className="f-consulting-interview__choice"><input type="checkbox" checked={items.includes(item)} onChange={() => setDraft(active === "products" ? { ...draft, ownedProductTypes: toggle(items, item) } : { ...draft, ownedToolTypes: toggle(items, item) })} /><span><strong>{item}</strong></span></label>; })}</div><div className="mt-6 flex gap-2"><Button onClick={() => void save(active)}>답변 저장</Button><Button variant="ghost" onClick={() => void save(active, draft, true)}>건너뛰기</Button></div></> : null}
        {error ? <p className="mt-4 text-sm text-red-400" role="alert">{error}</p> : null}
      </article>
    </ConsultationInterviewShell>
    <ConfirmActionDialog open={exitOpen} onOpenChange={setExitOpen} onConfirm={() => router.push("/home")} title="상담을 나갈까요?" description="저장된 메이크업 답변은 유지되어 다음에 이어서 진행할 수 있습니다." confirmLabel="저장된 상태로 나가기" cancelLabel="계속 인터뷰하기" />
  </>;
}

"use client";

import { useState } from "react";
import type { DiagnosticQuestionInstanceV1, HairProfileV2 } from "@hairfit/shared/consulting/hair-profile";
import { SurfaceCard } from "../workbenches/shared";

const TRAIT_LABELS: Record<string, string> = {
  texture_pattern: "모발 결", apparent_density: "보이는 밀도", strand_thickness_class: "굵기 추정",
  crown_volume: "정수리 볼륨", side_volume: "옆 볼륨", end_volume: "끝선 볼륨", frizz_flyaway: "부스스함·잔머리",
  surface_shine: "표면 광택", visible_end_condition: "보이는 끝선 상태", color_uniformity: "색상 균일도",
  hairline_visibility: "헤어라인 노출", parting_visibility: "가르마 노출",
};

export function HairTraitInsightPanel({ consultationId, initialProfile, initialQuestions, mode = "result", onQuestionsResolved }: {
  consultationId: string;
  initialProfile?: HairProfileV2 | null;
  initialQuestions?: DiagnosticQuestionInstanceV1[];
  mode?: "result" | "clarification";
  onQuestionsResolved?: () => void;
}) {
  const [profile, setProfile] = useState(initialProfile ?? null);
  const [questions, setQuestions] = useState(initialQuestions ?? []);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const visible = questions.filter((item) => item.state === "visible");
  const answer = async (question: DiagnosticQuestionInstanceV1, value: string, state: "answered" | "unknown" | "skipped" | "salon_confirmation" = "answered") => {
    if (!profile) return;
    setSavingId(question.id); setNotice("");
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(consultationId)}/hair-profile`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, expectedRevision: profile.revision, value, state }),
      });
      const data = await response.json() as { profile?: HairProfileV2; questions?: DiagnosticQuestionInstanceV1[]; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "답변을 저장하지 못했습니다.");
      const nextQuestions = data.questions ?? [];
      setProfile(data.profile); setQuestions(nextQuestions); setNotice("답변을 분석 기준에 반영했습니다.");
      if (!nextQuestions.some((item) => item.state === "visible")) onQuestionsResolved?.();
    } catch (error) { setNotice(error instanceof Error ? error.message : "답변을 저장하지 못했습니다."); }
    finally { setSavingId(null); }
  };
  if (mode === "clarification") {
    const question = visible[0];
    return <SurfaceCard className="p-5 sm:p-7" data-hair-trait-profile={profile?.state ?? "unavailable"} data-hair-trait-surface="clarification">
      <p className="app-kicker">AI follow-up</p>
      <h3 className="mt-3 text-xl font-black">사진으로 알 수 없는 핵심만 확인할게요</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">분석 결과와 섞지 않고, 추천에 영향을 주는 질문만 전체 상담에서 최대 2개 표시합니다.</p>
      {question ? <fieldset className="mt-6" disabled={savingId === question.id}>
        <legend className="text-base font-black">{question.prompt}</legend>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{question.options.filter((option) => option.label !== "잘 모르겠어요" && option.value !== "unknown").map((option) => <button key={option.value} type="button" className="min-h-11 w-full border border-[var(--app-border)] px-3 text-sm font-bold hover:border-[var(--app-border-strong)]" onClick={() => void answer(question, option.value)}>{option.label}</button>)}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><button type="button" className="min-h-11 border border-transparent px-3 underline" onClick={() => void answer(question, "unknown", "unknown")}>잘 모르겠어요</button><button type="button" className="min-h-11 border border-transparent px-3 underline" onClick={() => void answer(question, "salon", "salon_confirmation")}>미용실에서 확인</button></div>
      </fieldset> : <p className="mt-5 text-sm text-[var(--app-muted)]">추가 확인이 끝났습니다.</p>}
      {notice ? <p className="mt-4 text-sm" aria-live="polite">{notice}</p> : null}
    </SurfaceCard>;
  }
  return <SurfaceCard className="p-5" data-hair-trait-profile={profile?.state ?? "unavailable"} data-hair-trait-surface="result">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="app-kicker">Hair trait observations</p><h3 className="mt-2 text-lg font-black">사진으로 확인한 모발 특성</h3></div>{profile ? <span className="text-xs font-black">profile r{profile.revision}</span> : null}</div>
    {!profile ? <p className="mt-4 text-sm text-[var(--app-muted)]">모질 특성 분석은 얼굴 분석과 별도로 처리됩니다. 준비되지 않아도 얼굴 분석 결과는 그대로 사용할 수 있습니다.</p> : <>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">{profile.observed.map((item) => <li key={item.id} className="border-l-2 border-[var(--app-accent)] pl-3"><p className="text-xs font-black">{TRAIT_LABELS[item.traitId] ?? item.traitId} · 관찰됨</p><p className="mt-1 text-sm">{item.value}</p><p className="mt-1 text-[11px] text-[var(--app-muted)]">신뢰도 {Math.round(item.confidence * 100)}%{item.limitations.length ? ` · ${item.limitations.join(" · ")}` : ""}</p></li>)}</ul>
      {profile.unknownFieldIds.length ? <p className="mt-4 border border-[var(--app-border)] p-3 text-xs text-[var(--app-muted)]">사진만으로 확인하지 않은 항목 {profile.unknownFieldIds.length}개는 unknown으로 유지합니다. 다공성·탄력·내부 손상·시술 안전성은 사진으로 확정하지 않습니다.</p> : null}
    </>}
    {notice ? <p className="mt-4 text-sm" aria-live="polite">{notice}</p> : null}
  </SurfaceCard>;
}

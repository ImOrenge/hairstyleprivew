"use client";

import { createConsultationStartContext, type OptionalOpeningIntent } from "@hairfit/shared/consulting/start-context";
import { useEffect, useRef, useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { trackConsultationInterviewEvent } from "../../../lib/consulting/interview-observability-client";
import { Button } from "../../ui/Button";

const OPENING_OPTIONS: readonly { value: OptionalOpeningIntent; label: string; detail: string }[] = [
  { value: "leave_it_to_ai", label: "AI가 정해주세요", detail: "사진을 먼저 보고 가장 어울리는 방향부터 제안해요." },
  { value: "tidy_current_impression", label: "현재 인상 정돈", detail: "익숙한 분위기를 유지하며 불편한 부분만 정리해요." },
  { value: "natural_change", label: "자연스러운 변화", detail: "현재 인상 안에서 눈에 띄는 균형을 만들어요." },
  { value: "clear_change", label: "확실한 변화", detail: "새로운 이미지가 느껴지는 방향을 우선 탐색해요." },
];

export function ZeroInputConsultationStart({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">, options?: { navigate?: boolean }) => Promise<unknown>;
  saving: boolean;
}) {
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [selected, setSelected] = useState<OptionalOpeningIntent | null>(snapshot.startContext?.optionalOpeningIntent ?? null);
  const [optionalNote, setOptionalNote] = useState(snapshot.startContext?.optionalNote ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "offline" | "conflict">("idle");
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void trackConsultationInterviewEvent({ consultationId: snapshot.sessionId, event: snapshot.startContext ? "resumed" : "opened", interviewKind: "discovery", revision: snapshot.startContext?.revision ?? 0 });
  }, [snapshot.sessionId, snapshot.startContext]);

  const start = async (openingIntent: OptionalOpeningIntent | null, note = optionalNote) => {
    const now = new Date().toISOString();
    const startContext = createConsultationStartContext({
      now,
      optionalOpeningIntent: openingIntent,
      optionalNote: note,
      sourceProfileId: snapshot.discovery.intent?.sourceProfileId ?? null,
      revision: (snapshot.startContext?.revision ?? 0) + 1,
    });
    setSaveState("saving");
    const result = await mutate({ startContext, completeStage: "discovery", currentStage: "photo" });
    const outcome = result as { ok?: boolean; conflict?: boolean } | undefined;
    if (outcome?.ok) {
      void trackConsultationInterviewEvent({ consultationId: snapshot.sessionId, event: "confirmed", interviewKind: "discovery", topicId: openingIntent ? "optional-opening-intent" : "direct-analysis", revision: startContext.revision });
      return;
    }
    setSaveState(outcome?.conflict ? "conflict" : "offline");
  };

  return <section
      className="f-consulting-interview"
      data-kind="discovery"
      data-layout="standalone"
      data-intake-mode="zero-input"
      data-save-state={saving || saveState === "saving" ? "saving" : saveState}
      aria-labelledby="zero-input-intake-title"
    >
      <header className="f-consulting-interview__header">
        <div>
          <p className="app-kicker">AI consultant start</p>
          <h2 id="zero-input-intake-title" className="mt-2 text-2xl font-black">사진을 먼저 보고 필요한 것만 물어볼게요</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">상담 범위나 모발 상태를 미리 작성하지 않아도 됩니다. 사진의 얼굴·헤어·모질을 분석한 뒤 결과를 바꿀 내용만 짧게 확인합니다.</p>
        </div>
      </header>
      <div className="f-consulting-interview__body" data-zero-input-body="true">
        <div className="f-consulting-interview__content">
          <p className="text-xs font-bold text-[var(--app-muted)]" role="status" aria-live="polite">
            {saveState === "saving" ? "분석 시작 기준을 저장하고 있어요." : saveState === "conflict" ? "다른 화면의 변경을 불러왔습니다. 다시 시작해 주세요." : saveState === "offline" ? "연결을 확인한 뒤 다시 시도해 주세요." : "사진 전 필수 질문 0개"}
          </p>
          <div className="f-consulting-interview__question">
            <div className="f-consulting-interview__start-note">
              <p className="app-kicker">Photo first</p>
              <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]"><strong className="text-[var(--app-text)]">얼굴형 · 헤어라인 · 모질</strong>을 먼저 확인합니다. 사진으로 알 수 없는 시술 이력이나 안전 정보만 분석 뒤 짧게 물어봅니다.</p>
            </div>
            <div className="f-consulting-interview__start-actions mt-6">
              <Button type="button" loading={saving || saveState === "saving"} onClick={() => void start(null)}>사진으로 분석 시작</Button>
              <Button type="button" variant="secondary" aria-expanded={optionalOpen} aria-controls="optional-opening-intent" onClick={() => setOptionalOpen((current) => !current)}>{optionalOpen ? "원하는 방향 접기" : "원하는 방향이 있다면 알려주기"}</Button>
            </div>
            {optionalOpen ? <div id="optional-opening-intent" className="f-consulting-opening-intent mt-6">
              <fieldset className="f-consulting-opening-intent__fieldset">
                <legend className="text-sm font-black">원하는 방향이나 추가 고려사항이 있다면 알려주세요</legend>
                <p className="mt-1 text-xs text-[var(--app-muted)]">선택과 메모 모두 선택 사항이며, 비워 둬도 AI가 먼저 제안합니다.</p>
                <div className="f-consulting-opening-intent__choices mt-4">
                  {OPENING_OPTIONS.map((option) => <label key={option.value} className="f-consulting-opening-intent__option">
                    <input type="radio" name="optional-opening-intent" checked={selected === option.value} onChange={() => setSelected(option.value)} />
                    <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                  </label>)}
                </div>
              </fieldset>
              <label className="mt-5 grid gap-2 text-sm font-black">
                추가로 고려할 점 <span className="text-xs font-normal text-[var(--app-muted)]">선택 입력</span>
                <textarea
                  value={optionalNote}
                  onChange={(event) => setOptionalNote(event.target.value.slice(0, 500))}
                  placeholder="예: 안경을 자주 쓰고, 앞머리는 눈을 찌르지 않았으면 해요."
                  rows={3}
                  className="w-full resize-y rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-3 text-sm font-normal text-[var(--app-text)]"
                />
                <span className="text-right text-xs font-normal text-[var(--app-muted)]">{optionalNote.length} / 500</span>
              </label>
              <div className="f-consulting-opening-intent__footer">
                <Button type="button" loading={saving || saveState === "saving"} onClick={() => void start(selected, optionalNote)}>이 내용으로 사진 분석</Button>
              </div>
            </div> : null}
          </div>
        </div>
      </div>
    </section>;
}

"use client";

import type { ReactNode } from "react";
import type { ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { formatConsultationTimestampKst } from "../../../lib/consulting/format-timestamp";
import { Button } from "../../ui/Button";
import { Panel, SurfaceCard } from "../../ui/Surface";

export { Panel, SurfaceCard };

export function WorkbenchGrid({ input, output, inputLabel = "내가 알려줄 내용", outputLabel = "AI 컨설턴트가 정리한 내용", inputHeading = "내 선택", inputDescription = "원하는 방향을 선택하고 수정할 수 있어요.", outputHeading = "AI 컨설턴트 제안", outputDescription = "확인한 내용과 추천 이유를 함께 보여드려요." }: { input: ReactNode; output: ReactNode; inputLabel?: string; outputLabel?: string; inputHeading?: string; inputDescription?: string; outputHeading?: string; outputDescription?: string }) {
  return (
    <div data-consulting-split-canvas="true" className="grid gap-5 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-0 lg:overflow-hidden lg:border-y lg:border-[var(--app-border)]">
      <section data-consulting-pane="input" aria-label={inputLabel} tabIndex={0} className="f-consulting-scroll-pane min-w-0 lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-[var(--app-border)] lg:pr-5 lg:[scrollbar-gutter:stable]">
        <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] py-3 lg:sticky lg:top-0 lg:z-20">
          <p className="app-kicker">{inputHeading}</p>
          <p className="mt-1 text-xs text-[var(--app-muted)]">{inputDescription}</p>
        </div>
        <div className="grid gap-5 py-5 lg:pb-28">{input}</div>
      </section>
      <section data-consulting-pane="output" aria-label={outputLabel} tabIndex={0} className="f-consulting-scroll-pane min-w-0 lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:pl-5 lg:[scrollbar-gutter:stable]">
        <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] py-3 lg:sticky lg:top-0 lg:z-20">
          <p className="app-kicker">{outputHeading}</p>
          <p className="mt-1 text-xs text-[var(--app-muted)]">{outputDescription}</p>
        </div>
        <div className="grid gap-5 py-5 lg:pb-28">{output}</div>
      </section>
    </div>
  );
}

export function ConsultationSystemData({ snapshot, items = [] }: { snapshot: ConsultationSnapshot; items?: Array<{ label: string; value: ReactNode }> }) {
  const qualityPassed = snapshot.photo.quality.filter((item) => item.status === "pass").length;
  const acceptedPreviews = snapshot.previews.filter((item) => item.status === "accepted").length;
  const selected = snapshot.selectedStyleHistory.at(-1);
  const stageLabels: Record<string, string> = {
    discovery: "상담 질문",
    photo: "사진 준비",
    scan: "사진 분석",
    analysis: "분석 확인",
    direction: "스타일 방향",
    previews: "헤어 비교",
    decision: "헤어 확정",
    "personal-color": "퍼스널 컬러",
    "color-studio": "염색 방향",
    makeup: "메이크업",
    fashion: "패션",
    result: "최종 결과",
  };
  const activeTasks = snapshot.journey.activeTasks.map((task) => `${task.label} ${task.status === "failed" ? "확인 필요" : task.status === "complete" ? "완료" : "진행 중"}`);
  return (
    <SurfaceCard className="p-0" data-consulting-system-data="true" data-consulting-detail-count={items.length}>
      <details className="group p-5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
          <span><span className="app-kicker block">상담 진행</span><span className="mt-1 block text-base">진행 상세 보기</span></span>
          <span aria-hidden="true" className="text-xl transition group-open:rotate-45">＋</span>
        </summary>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">다음 단계, 준비 상태와 저장 기록이 필요할 때만 확인하세요.</p>
        <div className="mt-5">
        <DefinitionRows
          items={[
            {
              label: "다음 추천 단계",
              value: stageLabels[snapshot.journey.recommendedStage] ?? "상담 계속하기",
            },
            {
              label: "진행 중인 준비",
              value: activeTasks.length ? activeTasks.join(" · ") : "기다리는 작업 없음",
            },
            {
              label: "확인이 필요한 항목",
              value: snapshot.journey.blockingActions.length
                ? snapshot.journey.blockingActions
                    .slice(0, 2)
                    .map((action) => action.reason)
                    .join(" / ")
                : "없음",
            },
            {
              label: "사진 준비",
              value: snapshot.photo.quality.length ? `${snapshot.photo.quality.length}개 기준 중 ${qualityPassed}개 확인` : "사진을 준비해 주세요",
            },
            {
              label: "확인한 분석 근거",
              value: `${snapshot.evidence.items.length}개`,
            },
            {
              label: "스타일 방향",
              value: snapshot.strategy.confirmedAt ? "확정됨" : "검토 중",
            },
            { label: "비교할 수 있는 헤어", value: `${acceptedPreviews}개` },
            { label: "내가 고른 헤어", value: selected?.label || "선택 전" },
            {
              label: "마지막 저장",
              value: formatConsultationTimestampKst(snapshot.updatedAt),
            },
          ]}
        />
        </div>
      </details>
    </SurfaceCard>
  );
}

export function SaveStageButton({ loading, onClick, children = "변경 내용 저장", disabled = false }: { loading: boolean; onClick: () => void; children?: ReactNode; disabled?: boolean }) {
  return (
    <Button type="button" loading={loading} disabled={disabled} onClick={onClick} className="min-h-12">
      {children}
    </Button>
  );
}

export function ChoiceGroup({ label, values, selected, onToggle, multiple = true }: { label: string; values: string[]; selected: string[]; onToggle: (value: string) => void; multiple?: boolean }) {
  return (
    <fieldset data-consulting-input-control="true" className="f-consulting-input-control grid gap-3">
      <legend className="text-sm font-black">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const active = selected.includes(value);
          return (
            <button key={value} type="button" onClick={() => onToggle(value)} aria-pressed={active} className={`min-h-11 border px-4 py-2 text-sm font-bold transition ${active ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-border-strong)]"}`}>
              {value}
            </button>
          );
        })}
      </div>
      {!multiple ? <p className="text-xs text-[var(--app-muted)]">하나만 선택할 수 있습니다.</p> : null}
    </fieldset>
  );
}

export function TextField({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label data-consulting-input-control="true" className="f-consulting-input-control grid gap-2 text-sm font-black">
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="app-input w-full resize-y px-3 py-3 text-sm font-normal leading-6" />
    </label>
  );
}

export function DefinitionRows({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-3">
      {items.map((item) => (
        <div key={item.label} className="grid gap-1 border-b border-[var(--app-border)] pb-3">
          <dt className="text-xs font-black uppercase tracking-[0.04em] text-[var(--app-muted)]">{item.label}</dt>
          <dd className="m-0 text-sm font-bold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

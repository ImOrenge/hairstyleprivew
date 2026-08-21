"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HairAdjustmentAspect } from "@hairfit/shared/consulting/hair-recommendation";
import { useHairRecommendation } from "../../../hooks/useHairRecommendation";
import { buildConsultationHairProfile } from "../../../lib/consulting/hair-profile";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { customerHairReasonLabel, deriveHairConsultantViewState } from "../../../lib/consulting/hair-recommendation-view";
import { Button } from "../../ui/Button";
import { DefinitionRows, Panel, SurfaceCard, WorkbenchGrid } from "../workbenches/shared";

type Quote = { quoteId: string; isAllowed: boolean; expiresAt: string };
const ADJUSTMENTS: Array<{ aspect: HairAdjustmentAspect; label: string }> = [
  { aspect: "length", label: "기장" },
  { aspect: "bangs", label: "앞머리" },
  { aspect: "volume", label: "볼륨" },
  { aspect: "curl-texture", label: "컬·질감" },
  { aspect: "face-exposure", label: "얼굴 노출" },
  { aspect: "maintenance", label: "관리 난이도" },
  { aspect: "change-intensity", label: "변화 강도" },
  { aspect: "free-text", label: "직접 설명" },
];

export function HairRecommendationWorkbench({ snapshot, mutate, saving, pollingEnabled = true }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">, options?: { navigate?: boolean }) => Promise<unknown>;
  saving: boolean;
  pollingEnabled?: boolean;
}) {
  const router = useRouter();
  const recommendation = useHairRecommendation(snapshot.sessionId, pollingEnabled);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [selectedAspect, setSelectedAspect] = useState<HairAdjustmentAspect>("length");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const autoStartAttempted = useRef(false);

  const startGeneration = async () => {
    const adjustmentPending = recommendation.decision?.state === "adjustment-requested";
    if (starting || (recommendation.board && !adjustmentPending) || !snapshot.photo.draftId || !snapshot.strategy.confirmedAt) return;
    setStarting(true);
    setActionError(null);
    try {
      let draftId = snapshot.photo.draftId;
      if (adjustmentPending) {
        const startResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/hair-recommendation/start`, { method: "POST" });
        const startData = await startResponse.json().catch(() => ({})) as { draftId?: string; error?: string };
        if (!startResponse.ok || !startData.draftId) throw new Error(startData.error || "조정한 새 9개 프리뷰를 준비하지 못했습니다.");
        draftId = startData.draftId;
      }
      const quoteResponse = await fetch("/api/paid-actions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hair_generation", subjectId: draftId, billingScope: "customer" }),
      });
      const quoteData = await quoteResponse.json().catch(() => ({})) as { quote?: Quote; error?: string };
      if (!quoteResponse.ok || !quoteData.quote?.isAllowed) throw new Error(quoteData.error || "헤어 프리뷰 이용 권한을 확인하지 못했습니다.");
      const response = await fetch("/api/generations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          quoteId: quoteData.quote.quoteId,
          consultationId: snapshot.sessionId,
          hairProfile: buildConsultationHairProfile(snapshot.discovery, snapshot.strategy),
        }),
      });
      const data = await response.json().catch(() => ({})) as { generationId?: string; error?: string };
      if (!response.ok || !data.generationId) throw new Error(data.error || "9개 헤어 프리뷰를 접수하지 못했습니다.");
      await mutate({ photo: { ...snapshot.photo, generationId: data.generationId } }, { navigate: false });
      await recommendation.refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "9개 헤어 프리뷰를 접수하지 못했습니다.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    const adjustmentPending = recommendation.decision?.state === "adjustment-requested";
    if (recommendation.loading || (recommendation.board && !adjustmentPending) || autoStartAttempted.current || !snapshot.photo.draftId || !snapshot.strategy.confirmedAt) return;
    autoStartAttempted.current = true;
    void startGeneration();
  // The start guard intentionally keys off server state instead of re-running for every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendation.board, recommendation.decision?.state, recommendation.loading, snapshot.photo.draftId, snapshot.strategy.confirmedAt]);

  const viewState = deriveHairConsultantViewState({ board: recommendation.board, decision: recommendation.decision, adjusting, confirming });
  const acceptedCount = recommendation.board?.acceptedCount ?? snapshot.previews.filter((item) => item.status === "accepted").length;
  const primaryId = recommendation.decision?.primaryPreviewId;
  const primaryVariant = recommendation.board?.variants.find((variant) => variant.id === primaryId);
  const primaryAttempt = primaryVariant?.attempts.find((attempt) => attempt.status === "accepted" && attempt.outputUrl);
  const primarySnapshot = snapshot.previews.find((preview) => preview.id === primaryId);
  const reasons = useMemo(() => [...new Set((recommendation.decision?.rankedPreviews.find((item) => item.previewId === primaryId)?.reasonCodes ?? []).map(customerHairReasonLabel))].slice(0, 5), [primaryId, recommendation.decision]);
  const canConfirm = recommendation.decision?.state === "primary-ready" && acceptedCount === 9 && Boolean(primaryId);

  const confirm = async () => {
    if (!canConfirm) return;
    setConfirming(true);
    setActionError(null);
    try {
      const result = await recommendation.confirm();
      if (!result.recommendedRoute) throw new Error("다음 상담 화면을 확인하지 못했습니다.");
      router.push(result.recommendedRoute);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "주 추천을 확정하지 못했습니다.");
      setConfirming(false);
    }
  };

  const submitAdjustment = async () => {
    if (!adjustmentValue.trim()) return;
    setActionError(null);
    try {
      const result = await recommendation.adjust([{ aspect: selectedAspect, value: adjustmentValue.trim() }]);
      if (!result.recommendedRoute) throw new Error("조정 화면을 열지 못했습니다.");
      router.push(result.recommendedRoute);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "조정 요청을 저장하지 못했습니다.");
    }
  };

  const statusCopy = viewState === "preparing-nine" ? "9가지 가능성을 준비하고 있어요"
    : viewState === "generating-nine" ? "9가지 가능성을 만들고 있어요"
      : viewState === "recovering-slots" ? "완성도가 낮은 결과를 자동으로 다시 만들고 있어요"
        : viewState === "ranking-nine" ? "9개 결과에서 가장 잘 맞는 한 가지를 고르고 있어요"
          : viewState === "primary-review" ? "AI 컨설턴트의 주 추천이 준비됐어요"
            : viewState === "adjustment-capture" ? "마음에 걸리는 한 가지를 알려주세요"
              : viewState === "confirming" ? "선택을 안전하게 확정하고 있어요"
                : viewState === "handoff" ? "헤어 선택이 확정됐어요"
                  : "상태 확인이 필요해요";

  if (recommendation.decision?.state === "clarification-required" && recommendation.decision.clarification) {
    return <div className="mx-auto grid max-w-3xl gap-4" data-hair-recommendation-workbench="true" data-hair-recommendation-state="clarification" data-consulting-surface="clarification">
      <SurfaceCard className="grid gap-4 p-5 sm:p-7">
        <div><p className="app-kicker">One clarification only</p><h3 className="mt-2 text-xl font-black">{recommendation.decision.clarification.prompt}</h3><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">결과 갤러리와 분리해 한 가지 기준만 확인합니다. 답변은 이미 만든 9개의 순위를 한 번만 조정합니다.</p></div>
        <div className="flex flex-wrap gap-2">{recommendation.decision.clarification.answerOptions.map((answer) => <Button key={answer} type="button" variant="secondary" onClick={() => void recommendation.answerClarification(answer).catch((cause) => setActionError(cause instanceof Error ? cause.message : "답변을 저장하지 못했습니다."))}>{answer}</Button>)}</div>
      </SurfaceCard>
      {actionError || recommendation.error ? <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{actionError || recommendation.error}</p> : null}
    </div>;
  }

  if (viewState === "adjustment-capture") {
    return <div className="mx-auto grid max-w-3xl gap-4" data-hair-recommendation-workbench="true" data-hair-recommendation-state={viewState} data-consulting-surface="revision">
      <Panel className="grid gap-4 p-5 sm:p-7">
        <div><p className="app-kicker">Adjustment</p><h3 className="mt-2 text-xl font-black">한 번에 가장 중요한 부분부터 조정해요</h3><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">기존 결과는 보존합니다. 이 화면에서는 수정 요청만 집중해서 받고, 저장 후 새 revision 결과로 돌아갑니다.</p></div>
        <div className="flex flex-wrap gap-2">{ADJUSTMENTS.map((item) => <button key={item.aspect} type="button" aria-pressed={selectedAspect === item.aspect} onClick={() => setSelectedAspect(item.aspect)} className={`min-h-11 border px-3 text-sm font-black ${selectedAspect === item.aspect ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{item.label}</button>)}</div>
        <label className="grid gap-2 text-sm font-black">원하는 조정<textarea value={adjustmentValue} onChange={(event) => setAdjustmentValue(event.target.value)} className="app-input min-h-28 p-3" placeholder="예: 앞머리는 없애고 얼굴 옆선을 조금 더 가려주세요." /></label>
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={!adjustmentValue.trim()} onClick={() => void submitAdjustment()}>새 추천 revision 만들기</Button><Button type="button" variant="ghost" onClick={() => setAdjusting(false)}>기존 결과로 돌아가기</Button></div>
      </Panel>
      {actionError || recommendation.error ? <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{actionError || recommendation.error}</p> : null}
    </div>;
  }

  return <div data-hair-recommendation-workbench="true" data-hair-recommendation-state={viewState}>
    <WorkbenchGrid input={<div className="grid gap-5">
      <Panel className="grid gap-5 p-5 sm:p-7">
        <div role="status" aria-live="polite" aria-atomic="true">
          <p className="app-kicker">AI Hair consultant · 3×3 internal board</p>
          <h2 className="mt-2 text-xl font-black">{statusCopy}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">고객이 9개를 직접 추리지 않아도 되도록 얼굴·모질·관리 조건과 생성 품질을 함께 평가합니다.</p>
        </div>
        <div><div className="flex items-center justify-between text-sm font-black"><span>생성·품질 승인</span><strong>{acceptedCount} / 9</strong></div><progress className="mt-2 w-full" max={9} value={acceptedCount} aria-label={`헤어 프리뷰 생성 ${acceptedCount} / 9`} /></div>
        <DefinitionRows items={[
          { label: "현재 상태", value: viewState },
          { label: "추천 revision", value: recommendation.decision ? `r${recommendation.decision.revision}` : "평가 대기" },
          { label: "자동 복구", value: viewState === "recovering-slots" ? "실패 슬롯만 재시도 중" : "정상" },
        ]} />
        {!recommendation.board && !recommendation.loading ? <Button type="button" loading={starting} disabled={!snapshot.photo.draftId || !snapshot.strategy.confirmedAt} onClick={() => void startGeneration()}>9개 프리뷰 준비 다시 시도</Button> : null}
      </Panel>

      {viewState === "primary-review" && recommendation.decision?.state !== "clarification-required" ? <Panel className="grid gap-4 p-5">
        <div><p className="app-kicker">Your decision</p><h3 className="mt-2 text-lg font-black">AI가 먼저 정리한 한 가지 방향</h3></div>
        <div className="flex flex-wrap gap-2"><Button type="button" loading={saving || confirming} disabled={!canConfirm} onClick={() => void confirm()}>이대로 진행</Button><Button type="button" variant="secondary" onClick={() => setAdjusting(true)}>마음에 걸리는 점 말하기</Button></div>
        <p className="text-xs leading-5 text-[var(--app-muted)]">다른 8개 결과도 아래 전체 생성 갤러리에서 확인할 수 있으며, 직접 비교·선택은 완료조건이 아닙니다.</p>
      </Panel> : null}
      {actionError || recommendation.error ? <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{actionError || recommendation.error}</p> : null}
    </div>} output={<div className="grid gap-5">
      <Panel className="overflow-hidden">
        {primaryAttempt?.outputUrl ? <div className="mx-auto aspect-[4/5] w-full max-w-2xl bg-[var(--app-surface-muted)]"><img src={primaryAttempt.outputUrl} alt="AI 컨설턴트 주 추천 헤어" className="h-full w-full object-cover" decoding="async" /></div> : <div className="grid aspect-[4/5] max-h-[62vh] place-items-center bg-[var(--app-surface-muted)] p-6 text-center"><div><p className="font-black">{statusCopy}</p><p className="mt-2 text-sm text-[var(--app-muted)]">완료되지 않은 이미지는 추천 결과처럼 표시하지 않습니다.</p></div></div>}
        <div className="grid gap-4 p-5"><div><p className="app-kicker">Primary recommendation</p><h2 className="mt-2 text-2xl font-black">{primarySnapshot?.label ?? (primaryVariant ? `Hair option ${primaryVariant.slot}` : "평가 중")}</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{primarySnapshot?.reason ?? "9개 생성과 품질 확인이 끝나면 가장 적합한 한 가지를 설명합니다."}</p></div>
          {reasons.length ? <div><p className="text-sm font-black">추천 이유</p><ul className="mt-2 grid gap-2 text-sm leading-6">{reasons.map((reason) => <li key={reason} className="border-l-2 border-[var(--app-border-strong)] pl-3">{reason}</li>)}</ul></div> : null}
          {primaryId ? <DefinitionRows items={[
            { label: "예상 변화", value: `${snapshot.strategy.length} · ${snapshot.strategy.fringe} · ${snapshot.strategy.texture}` },
            { label: "관리 조건", value: `${snapshot.discovery.morningMinutes ?? "미확인"}분 · ${snapshot.discovery.maintenanceLevel}` },
            { label: "현실적 제한", value: snapshot.discovery.avoid.join(" · ") || "현장 모질과 시술 이력 재확인" },
            { label: "신뢰도", value: recommendation.decision ? `${Math.round(recommendation.decision.confidence * 100)}%` : "평가 중" },
          ]} /> : null}
        </div>
      </Panel>
      <SurfaceCard className="p-5" data-hair-generated-gallery="all-nine">
        <div><p className="app-kicker">All generated results</p><h2 className="mt-2 text-xl font-black">생성 내용 전체 {acceptedCount} / 9</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">AI 주 추천은 크게 표시하지만, 생성된 9개 결과와 각 슬롯 상태를 빠짐없이 확인할 수 있습니다. 직접 shortlist할 필요는 없습니다.</p></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{recommendation.board?.variants.map((variant) => {
          const accepted = variant.attempts.find((attempt) => attempt.status === "accepted" && attempt.outputUrl);
          const isPrimary = variant.id === primaryId;
          return <article key={variant.id} className={`overflow-hidden border ${isPrimary ? "border-[var(--app-border-strong)] ring-2 ring-[var(--app-ring)]" : "border-[var(--app-border)]"}`} data-hair-slot={variant.slot} data-hair-slot-state={accepted ? "accepted" : variant.status}>
            <div className="aspect-[4/5] bg-[var(--app-surface-muted)]">{accepted?.outputUrl ? <img src={accepted.outputUrl} alt={`헤어 생성 결과 ${variant.slot}${isPrimary ? ", AI 주 추천" : ""}`} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <div className="grid h-full place-items-center p-4 text-center text-xs text-[var(--app-muted)]">{variant.status === "generating" ? "생성·품질 확인 중" : recommendation.board?.state === "failed" ? "복구 필요" : "결과 대기 중"}</div>}</div>
            <div className="p-3"><div className="flex items-center justify-between gap-2"><strong>OPTION {variant.slot}</strong>{isPrimary ? <span className="text-xs font-black text-[var(--app-accent-strong)]">AI PRIMARY</span> : null}</div><p className="mt-1 text-xs text-[var(--app-muted)]">{variant.bucket.replace("_", " ")} · {variant.intent}</p></div>
          </article>;
        }) ?? Array.from({ length: 9 }, (_, index) => <div key={index} className="grid aspect-[4/5] place-items-center border border-[var(--app-border)] bg-[var(--app-surface-muted)] text-xs text-[var(--app-muted)]">OPTION {index + 1} · 대기</div>)}</div>
      </SurfaceCard>
    </div>} />
  </div>;
}

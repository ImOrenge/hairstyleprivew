"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientConsultationTask, type ConsultationPatch, type ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { buildConsultationHairProfile } from "../../../lib/consulting/hair-profile";
import { mapPreviewBoard, type PreviewBoard as Board } from "../../../lib/consulting/preview-board-client";
import { consultationStageHref } from "../../../lib/consulting/routes";
import { Button } from "../../ui/Button";
import { useConsultationTaskRuntime } from "../transition/ConsultationTaskRuntime";
import { ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

type Quote = {
  quoteId: string;
  subjectId: string;
  isAllowed: boolean;
  currentBalance: number;
  costCredits: number;
  balanceAfter: number;
  shortfallCredits: number;
  expiresAt: string;
};

type PreviewGenerationVisualState = "waiting" | "generating" | "partial" | "complete" | "failed";

function initialPreviewBoardState(previews: ConsultationSnapshot["previews"], generationId: string | null) {
  const accepted = previews.filter((item) => item.status === "accepted").length;
  if (previews.length > 0 && accepted >= previews.length) return "ready";
  if (accepted > 0) return "partial";
  return generationId ? "preparing" : "not_started";
}

function previewGenerationPresentation(boardState: string, acceptedCount: number, generationId: string | null, loading: boolean): {
  state: PreviewGenerationVisualState;
  title: string;
  detail: string;
} {
  const normalized = boardState.toLowerCase();
  if (["failed", "error", "cancelled"].includes(normalized)) return {
    state: "failed",
    title: "프리뷰 생성이 중단됐어요",
    detail: "저장된 상담 기준은 유지됩니다. 상태를 다시 확인하거나 재시도할 수 있습니다.",
  };
  if (["ready", "complete", "completed"].includes(normalized)) return {
    state: "complete",
    title: "프리뷰 생성·품질 검사가 끝났어요",
    detail: `${acceptedCount}개 결과가 품질 승인을 통과했습니다.`,
  };
  if (acceptedCount >= 2) return {
    state: "partial",
    title: "비교 가능 · 나머지 프리뷰 생성 중",
    detail: `${acceptedCount}개 결과는 지금 비교할 수 있고, 나머지는 백그라운드에서 계속 생성·검사합니다.`,
  };
  if (acceptedCount > 0) return {
    state: "partial",
    title: "첫 프리뷰 도착 · 계속 생성 중",
    detail: `${acceptedCount}개 결과가 준비됐습니다. 비교를 시작하려면 품질 승인 결과가 2개 필요합니다.`,
  };
  if (generationId || loading || !["not_started", "waiting"].includes(normalized)) return {
    state: "generating",
    title: "9개 프리뷰 생성 중",
    detail: "AI 생성과 품질 검사를 진행하고 있습니다. 완성된 결과부터 자동으로 표시됩니다.",
  };
  return {
    state: "waiting",
    title: "프리뷰 생성 접수 준비 중",
    detail: "사진과 확정 전략을 확인한 뒤 생성 작업을 자동으로 접수합니다.",
  };
}

export function PreviewsWorkbench({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const taskRuntime = useConsultationTaskRuntime();
  const [previews, setPreviews] = useState(snapshot.previews);
  const [selected, setSelected] = useState(snapshot.shortlist.previewIds);
  const [generationId, setGenerationId] = useState(snapshot.photo.generationId);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [boardState, setBoardState] = useState<string>(() => initialPreviewBoardState(snapshot.previews, snapshot.photo.generationId));
  const [acceptedCount, setAcceptedCount] = useState(snapshot.previews.filter((item) => item.status === "accepted").length);
  const [error, setError] = useState<string | null>(null);
  const [needsPurchase, setNeedsPurchase] = useState(false);
  const persistedBoardId = useRef<string | null>(null);
  const autoStartAttempted = useRef(false);

  const requestGenerationQuote = useCallback(async () => {
    const draftId = snapshot.photo.draftId;
    if (!draftId) throw new Error("사진 단계에서 업로드와 분석을 먼저 완료해 주세요.");
    const response = await fetch("/api/paid-actions/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hair_generation", subjectId: draftId, billingScope: "customer" }),
    });
    const data = (await response.json().catch(() => ({}))) as { quote?: Quote; error?: string };
    if (!response.ok || !data.quote) throw new Error(data.error || "생성 이용 권한을 확인하지 못했습니다.");
    setQuote(data.quote);
    return data.quote;
  }, [snapshot.photo.draftId]);

  const refreshBoard = useCallback(async () => {
    if (!generationId) return;
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/preview-board`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { board?: Board | null; state?: string; error?: string };
      if (response.status === 202) {
        setBoardState(data.state || "preparing");
        return;
      }
      if (!response.ok || !data.board) throw new Error(data.error || "3×3 프리뷰 보드를 불러오지 못했습니다.");
      const mapped = mapPreviewBoard(data.board);
      setPreviews(mapped);
      setBoardState(data.board.state);
      setAcceptedCount(data.board.acceptedCount);
      setError(null);
      if (data.board.state === "ready" && persistedBoardId.current !== data.board.id) {
        persistedBoardId.current = data.board.id;
        await mutate({ previews: mapped });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "3×3 프리뷰 보드를 불러오지 못했습니다.");
    }
  }, [generationId, mutate, snapshot.sessionId]);

  useEffect(() => {
    if (!generationId) return;
    const timer = window.setInterval(() => void refreshBoard(), 4_000);
    return () => window.clearInterval(timer);
  }, [generationId, refreshBoard]);

  const startGeneration = useCallback(async () => {
    const draftId = snapshot.photo.draftId;
    if (loading || generationId) return;
    if (!draftId) { setError("사진 단계에서 업로드와 분석을 먼저 완료해 주세요."); return; }
    if (!snapshot.strategy.confirmedAt) { setError("분석 방향을 확정한 뒤 생성할 수 있습니다."); return; }
    setLoading(true);
    setError(null);
    setNeedsPurchase(false);
    try {
      const executionQuote = quote && Date.parse(quote.expiresAt) > Date.now()
        ? quote
        : await requestGenerationQuote();
      if (!executionQuote.isAllowed) {
        setNeedsPurchase(true);
        throw new Error("현재 이용 권한으로는 헤어 프리뷰를 생성할 수 없습니다.");
      }
      const response = await fetch("/api/generations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          quoteId: executionQuote.quoteId,
          consultationId: snapshot.sessionId,
          hairProfile: buildConsultationHairProfile(snapshot.discovery, snapshot.strategy),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { generationId?: string; error?: string; quote?: Quote };
      if (data.quote) setQuote(data.quote);
      if (!response.ok || !data.generationId) {
        if (response.status === 409 && data.quote && !data.quote.isAllowed) setNeedsPurchase(true);
        throw new Error(data.error || "3×3 생성 작업을 접수하지 못했습니다.");
      }
      setGenerationId(data.generationId);
      setBoardState("preparing");
      const result = await mutate({ photo: { ...snapshot.photo, generationId: data.generationId } }) as { ok?: boolean };
      if (!result.ok) throw new Error("생성 작업을 상담 snapshot에 연결하지 못했습니다.");
      taskRuntime.startTask(createClientConsultationTask({
        id: data.generationId,
        kind: "preview-generation",
        stage: "previews",
        originStage: "direction",
        destinationStage: "previews",
        phaseKey: "queue",
        label: "헤어 프리뷰 보드",
        detail: "확정 전략으로 9개 결과를 생성하고 품질을 확인합니다.",
        completedUnits: 0,
        totalUnits: 9,
      }));
      router.replace(`${consultationStageHref(snapshot.sessionId, "previews")}?transition=preview-generation`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "3×3 생성 작업을 접수하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [generationId, loading, mutate, quote, requestGenerationQuote, router, snapshot.discovery, snapshot.photo, snapshot.sessionId, snapshot.strategy, taskRuntime]);

  useEffect(() => {
    if (autoStartAttempted.current || generationId || !snapshot.photo.draftId || !snapshot.strategy.confirmedAt) return;
    autoStartAttempted.current = true;
    const timer = window.setTimeout(() => void startGeneration(), 0);
    return () => window.clearTimeout(timer);
  }, [generationId, snapshot.photo.draftId, snapshot.strategy.confirmedAt, startGeneration]);

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  const canCompare = selected.length >= 2
    && selected.length <= 3
    && selected.every((id) => previews.some((preview) => preview.id === id && preview.status === "accepted"));
  const generationStatus = previewGenerationPresentation(boardState, acceptedCount, generationId, loading);

  const saveShortlist = async () => {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    try {
      const v2Response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/shortlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewVariantIds: selected, expectedVersion: snapshot.version }),
      });
      const v2Error = (await v2Response.json().catch(() => ({}))) as { error?: string };
      const v2Disabled = v2Response.status === 404 && v2Error.error === "HairFit V2 feature is disabled.";
      if (!v2Disabled && !v2Response.ok) {
        throw new Error(v2Error.error || "V2 shortlist를 저장하지 못했습니다.");
      }
      await mutate({ previews, shortlist: { previewIds: selected, updatedAt: new Date().toISOString() }, completeStage: "previews", currentStage: "compare" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "shortlist를 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return <WorkbenchGrid input={<div className="grid gap-5">
    <SurfaceCard className="f-preview-generation-status p-5" data-generation-state={generationStatus.state}>
      <div className="f-preview-generation-status__heading">
        <div className="f-preview-generation-status__copy" role="status" aria-live="polite" aria-atomic="true"><span className="f-preview-generation-status__signal" aria-hidden="true" /><div><p className="app-kicker">3×3 AI preview board</p><h2>{generationStatus.title}</h2></div></div>
        {generationId ? <span className="text-xs font-black uppercase text-[var(--app-muted)]">4초마다 상태 확인</span> : error ? <Button type="button" variant="secondary" loading={loading} disabled={!snapshot.photo.draftId || !snapshot.strategy.confirmedAt} onClick={() => void startGeneration()}>자동 접수 다시 시도</Button> : <span className="text-xs font-black uppercase text-[var(--app-muted)]">{loading ? "권한 확인·접수 중" : "자동 접수 대기"}</span>}
      </div>
      <p className="f-preview-generation-status__detail">{generationStatus.detail}</p>
      <div className="f-preview-generation-status__progress"><div><span>품질 승인 결과</span><strong>{acceptedCount} / 9</strong></div><progress max={9} value={acceptedCount} aria-label={`품질 승인 프리뷰 ${acceptedCount} / 9`} /></div>
    </SurfaceCard>
    {error ? <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}
    {needsPurchase ? <p className="border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm">상담 전략은 저장되어 있습니다. <Link href="/billing" className="font-black underline">이용 상품을 선택한 뒤 같은 상담에서 이어서 진행</Link>할 수 있습니다.</p> : null}
    <Panel className="grid gap-5 p-5"><div><p className="app-kicker">Preview controls</p><h2 className="mt-2 text-xl font-black">생성 결과를 2~3개 후보로 좁힙니다</h2><p className="mt-2 font-black">Shortlist {selected.length} / 3</p><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">오른쪽 AI 보드에서 품질 승인을 받은 이미지를 선택하면 이곳의 shortlist와 비교 가능 상태가 즉시 갱신됩니다.</p></div><DefinitionRows items={[
      { label: "Selected", value: `${selected.length} / 3` },
      { label: "Compare readiness", value: canCompare ? "비교 가능" : "승인 결과 2개 이상 필요" },
      { label: "Generation status", value: generationStatus.title },
      { label: "Accepted outputs", value: `${acceptedCount} / 9` },
    ]} /><SaveStageButton loading={saving || loading} disabled={!canCompare} onClick={() => void saveShortlist()}>선택한 후보 비교하기</SaveStageButton></Panel>
  </div>} output={<>
    <div className="grid gap-5 lg:grid-cols-3">{(["BALANCE","IMAGE","LIFESTYLE"] as const).map((axis) => <Panel key={axis} className="p-4"><p className="app-kicker">{axis}</p><div className="mt-4 grid gap-3">{previews.filter((item) => item.axis === axis).map((preview) => <button key={preview.id} type="button" disabled={preview.status !== "accepted"} onClick={() => toggle(preview.id)} aria-pressed={selected.includes(preview.id)} className={`overflow-hidden border text-left ${selected.includes(preview.id) ? "border-[var(--app-border-strong)] ring-2 ring-[var(--app-ring)]" : "border-[var(--app-border)]"} disabled:opacity-55`}><div className="aspect-[4/5] bg-[var(--app-surface-muted)]">{preview.imageUrl ? <img src={preview.imageUrl} alt={preview.label} className="h-full w-full object-cover" decoding="async" loading="lazy" /> : <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[var(--app-muted)]">{preview.status === "failed" ? "품질 검사 실패" : preview.status === "generating" ? "AI 생성 및 품질 검사 중" : "결과 대기 중"}</div>}</div><div className="p-3"><p className="font-black">{preview.label}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--app-muted)]">{preview.reason}</p></div></button>)}</div></Panel>)}</div>
    <SurfaceCard className="p-5"><p className="app-kicker">Board telemetry</p><h2 className="mt-2 text-xl font-black">AI 생성·품질 승인 분포</h2><div className="mt-5"><DefinitionRows items={(["BALANCE","IMAGE","LIFESTYLE"] as const).map((axis) => {
      const axisPreviews = previews.filter((item) => item.axis === axis);
      return { label: axis, value: `${axisPreviews.filter((item) => item.status === "accepted").length} 승인 · ${axisPreviews.filter((item) => item.status === "generating").length} 생성 중 · ${axisPreviews.filter((item) => item.status === "failed").length} 실패` };
    })} /></div><p className="mt-5 text-sm leading-6 text-[var(--app-muted)]">나머지 결과가 생성 중이어도 비교를 시작할 수 있습니다. 승인 결과는 2개 이상 필요합니다.</p></SurfaceCard>
    <ConsultationSystemData snapshot={snapshot} items={[
      { label: "Generation job", value: generationStatus.title },
      { label: "Board polling", value: generationId ? "4초 자동 갱신" : "비활성" },
      { label: "Shortlist", value: `${selected.length}개 선택` },
    ]} />
  </>} />;
}

"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsultationPatch, ConsultationPreview, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { Button } from "../../ui/Button";
import { Panel, SaveStageButton, SurfaceCard } from "./shared";

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

type BoardAttempt = { id: string; status: string; outputUrl: string | null };
type BoardVariant = { id: string; slot: number; bucket: "face_balance" | "image_change" | "manageability"; intent: string; status: string; attempts: BoardAttempt[] };
type Board = { id: string; state: "queued" | "generating" | "ready" | "failed"; acceptedCount: number; variants: BoardVariant[] };

const AXIS = { face_balance: "BALANCE", image_change: "IMAGE", manageability: "LIFESTYLE" } as const;

function mapBoard(board: Board): ConsultationPreview[] {
  return board.variants.map((variant) => {
    const accepted = [...variant.attempts].reverse().find((attempt) => attempt.status === "accepted" && attempt.outputUrl);
    return {
      id: variant.id,
      axis: AXIS[variant.bucket],
      label: `${AXIS[variant.bucket]} ${(variant.slot - 1) % 3 + 1}`,
      reason: variant.intent,
      imageUrl: accepted?.outputUrl ?? null,
      generatedImagePath: null,
      status: accepted ? "accepted" : board.state === "failed" ? "failed" : variant.status === "generating" ? "generating" : "pending",
      sourceVariantId: variant.id,
    };
  });
}

export function PreviewsWorkbench({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const [previews, setPreviews] = useState(snapshot.previews);
  const [selected, setSelected] = useState(snapshot.shortlist.previewIds);
  const [generationId, setGenerationId] = useState(snapshot.photo.generationId);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [boardState, setBoardState] = useState<string>(snapshot.previews.some((item) => item.status === "accepted") ? "ready" : "not_started");
  const [acceptedCount, setAcceptedCount] = useState(snapshot.previews.filter((item) => item.status === "accepted").length);
  const [error, setError] = useState<string | null>(null);
  const persistedBoardId = useRef<string | null>(null);

  const loadQuote = useCallback(async () => {
    const draftId = snapshot.photo.draftId;
    if (!draftId || generationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/paid-actions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hair_generation", subjectId: draftId, billingScope: "customer" }),
      });
      const data = (await response.json().catch(() => ({}))) as { quote?: Quote; error?: string };
      if (!response.ok || !data.quote) throw new Error(data.error || "생성 이용 조건을 확인하지 못했습니다.");
      setQuote(data.quote);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "생성 이용 조건을 확인하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [generationId, snapshot.photo.draftId]);

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
      const mapped = mapBoard(data.board);
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

  const startGeneration = async () => {
    const draftId = snapshot.photo.draftId;
    if (!draftId) { setError("사진 단계에서 업로드와 분석을 먼저 완료해 주세요."); return; }
    if (!snapshot.strategy.confirmedAt) { setError("분석 방향을 확정한 뒤 생성할 수 있습니다."); return; }
    if (!quote) { await loadQuote(); return; }
    if (!quote.isAllowed) { setError(`이용 가능한 처리량이 ${quote.shortfallCredits}만큼 부족합니다.`); return; }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/generations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, quoteId: quote.quoteId, consultationId: snapshot.sessionId }),
      });
      const data = (await response.json().catch(() => ({}))) as { generationId?: string; error?: string; quote?: Quote };
      if (data.quote) setQuote(data.quote);
      if (!response.ok || !data.generationId) throw new Error(data.error || "3×3 생성 작업을 접수하지 못했습니다.");
      setGenerationId(data.generationId);
      setBoardState("preparing");
      await mutate({ photo: { ...snapshot.photo, generationId: data.generationId } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "3×3 생성 작업을 접수하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  const ready = boardState === "ready" && acceptedCount === 9;

  return <div className="grid gap-5">
    <SurfaceCard className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div><p className="app-kicker">3×3 AI preview board</p><h2 className="mt-2 text-xl font-black">{generationId ? `생성 상태 · ${boardState}` : "전략 확정 후 생성 접수"}</h2><p className="mt-2 text-sm text-[var(--app-muted)]">{generationId ? `품질 검사를 통과한 결과 ${acceptedCount} / 9` : quote ? `필요 처리량 ${quote.costCredits} · 사용 후 ${quote.balanceAfter}` : "최신 이용 조건을 확인하고 있습니다."}</p></div>
      {generationId ? <Button type="button" variant="secondary" loading={loading} onClick={() => void refreshBoard()}>결과 갱신</Button> : <Button type="button" loading={loading} disabled={!snapshot.photo.draftId || !snapshot.strategy.confirmedAt} onClick={() => void startGeneration()}>{quote ? "3×3 생성 시작" : "이용 조건 확인"}</Button>}
    </SurfaceCard>
    {error ? <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}
    <div className="grid gap-5 lg:grid-cols-3">{(["BALANCE","IMAGE","LIFESTYLE"] as const).map((axis) => <Panel key={axis} className="p-4"><p className="app-kicker">{axis}</p><div className="mt-4 grid gap-3">{previews.filter((item) => item.axis === axis).map((preview) => <button key={preview.id} type="button" disabled={preview.status !== "accepted"} onClick={() => toggle(preview.id)} aria-pressed={selected.includes(preview.id)} className={`overflow-hidden border text-left ${selected.includes(preview.id) ? "border-[var(--app-border-strong)] ring-2 ring-[var(--app-ring)]" : "border-[var(--app-border)]"} disabled:opacity-55`}><div className="aspect-[4/5] bg-[var(--app-surface-muted)]">{preview.imageUrl ? <img src={preview.imageUrl} alt={preview.label} className="h-full w-full object-cover" decoding="async" loading="lazy" /> : <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[var(--app-muted)]">{preview.status === "failed" ? "품질 검사 실패" : preview.status === "generating" ? "AI 생성 및 품질 검사 중" : "결과 대기 중"}</div>}</div><div className="p-3"><p className="font-black">{preview.label}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--app-muted)]">{preview.reason}</p></div></button>)}</div></Panel>)}</div>
    <SurfaceCard className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-black">Shortlist {selected.length} / 3</p><p className="mt-1 text-sm text-[var(--app-muted)]">9개가 모두 준비되면 최소 2개, 최대 3개를 선택하세요.</p></div><SaveStageButton loading={saving} disabled={!ready || selected.length < 2 || selected.length > 3} onClick={() => void mutate({ previews, shortlist: { previewIds: selected, updatedAt: new Date().toISOString() }, completeStage: "previews", currentStage: "compare" })}>선택한 후보 비교하기</SaveStageButton></SurfaceCard>
  </div>;
}

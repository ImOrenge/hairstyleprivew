"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsultationPatch, ConsultationPreview, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { Button } from "../../ui/Button";
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
  const canCompare = selected.length >= 2
    && selected.length <= 3
    && selected.every((id) => previews.some((preview) => preview.id === id && preview.status === "accepted"));

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
    <SurfaceCard className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div><p className="app-kicker">3×3 AI preview board</p><h2 className="mt-2 text-xl font-black">{generationId ? `생성 상태 · ${boardState}` : "전략 확정 후 생성 접수"}</h2><p className="mt-2 text-sm text-[var(--app-muted)]">{generationId ? `품질 검사를 통과한 결과 ${acceptedCount} / 9` : quote ? `필요 처리량 ${quote.costCredits} · 사용 후 ${quote.balanceAfter}` : "최신 이용 조건을 확인하고 있습니다."}</p></div>
      {generationId ? <Button type="button" variant="secondary" loading={loading} onClick={() => void refreshBoard()}>결과 갱신</Button> : <Button type="button" loading={loading} disabled={!snapshot.photo.draftId || !snapshot.strategy.confirmedAt} onClick={() => void startGeneration()}>{quote ? "3×3 생성 시작" : "이용 조건 확인"}</Button>}
    </SurfaceCard>
    {error ? <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}
    <Panel className="grid gap-5 p-5"><div><p className="app-kicker">Preview controls</p><h2 className="mt-2 text-xl font-black">생성 결과를 2~3개 후보로 좁힙니다</h2><p className="mt-2 font-black">Shortlist {selected.length} / 3</p><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">오른쪽 AI 보드에서 품질 승인을 받은 이미지를 선택하면 이곳의 shortlist와 비교 가능 상태가 즉시 갱신됩니다.</p></div><DefinitionRows items={[
      { label: "Selected", value: `${selected.length} / 3` },
      { label: "Compare readiness", value: canCompare ? "비교 가능" : "승인 결과 2개 이상 필요" },
      { label: "Board state", value: boardState },
      { label: "Accepted outputs", value: `${acceptedCount} / 9` },
    ]} /><SaveStageButton loading={saving || loading} disabled={!canCompare} onClick={() => void saveShortlist()}>선택한 후보 비교하기</SaveStageButton></Panel>
  </div>} output={<>
    <div className="grid gap-5 lg:grid-cols-3">{(["BALANCE","IMAGE","LIFESTYLE"] as const).map((axis) => <Panel key={axis} className="p-4"><p className="app-kicker">{axis}</p><div className="mt-4 grid gap-3">{previews.filter((item) => item.axis === axis).map((preview) => <button key={preview.id} type="button" disabled={preview.status !== "accepted"} onClick={() => toggle(preview.id)} aria-pressed={selected.includes(preview.id)} className={`overflow-hidden border text-left ${selected.includes(preview.id) ? "border-[var(--app-border-strong)] ring-2 ring-[var(--app-ring)]" : "border-[var(--app-border)]"} disabled:opacity-55`}><div className="aspect-[4/5] bg-[var(--app-surface-muted)]">{preview.imageUrl ? <img src={preview.imageUrl} alt={preview.label} className="h-full w-full object-cover" decoding="async" loading="lazy" /> : <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[var(--app-muted)]">{preview.status === "failed" ? "품질 검사 실패" : preview.status === "generating" ? "AI 생성 및 품질 검사 중" : "결과 대기 중"}</div>}</div><div className="p-3"><p className="font-black">{preview.label}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--app-muted)]">{preview.reason}</p></div></button>)}</div></Panel>)}</div>
    <SurfaceCard className="p-5"><p className="app-kicker">Board telemetry</p><h2 className="mt-2 text-xl font-black">AI 생성·품질 승인 분포</h2><div className="mt-5"><DefinitionRows items={(["BALANCE","IMAGE","LIFESTYLE"] as const).map((axis) => {
      const axisPreviews = previews.filter((item) => item.axis === axis);
      return { label: axis, value: `${axisPreviews.filter((item) => item.status === "accepted").length} 승인 · ${axisPreviews.filter((item) => item.status === "generating").length} 생성 중 · ${axisPreviews.filter((item) => item.status === "failed").length} 실패` };
    })} /></div><p className="mt-5 text-sm leading-6 text-[var(--app-muted)]">나머지 결과가 생성 중이어도 비교를 시작할 수 있습니다. 승인 결과는 2개 이상 필요합니다.</p></SurfaceCard>
    <ConsultationSystemData snapshot={snapshot} items={[
      { label: "Generation job", value: generationId ? "연결됨" : "접수 전" },
      { label: "Board polling", value: generationId ? "4초 자동 갱신" : "비활성" },
      { label: "Shortlist", value: `${selected.length}개 선택` },
    ]} />
  </>} />;
}

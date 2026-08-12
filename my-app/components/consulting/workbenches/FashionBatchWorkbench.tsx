"use client";

/* eslint-disable @next/next/no-img-element */
import type { FashionPreviewCandidateV2, FashionPreviewSetV2 } from "@hairfit/shared/v2";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClientConsultationTask, selectedStyle, type ConsultationPatch, type ConsultationSnapshot, type FashionCategory, type FashionDirectionSnapshot, type FashionPreviewBatch, type SelectedFashionLook } from "../../../lib/consulting/contracts";
import { Button } from "../../ui/Button";
import { FashionDirectionInterview } from "../interview/FashionDirectionInterview";
import { useConsultationTaskRuntime } from "../transition/ConsultationTaskRuntime";
import { ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

const SLOTS: Array<{ id: string; category: FashionCategory; genre: string; label: string }> = [
  { id: "daily-casual", category: "DAILY", genre: "casual", label: "데일리 캐주얼" },
  { id: "daily-minimal", category: "DAILY", genre: "minimal", label: "데일리 미니멀" },
  { id: "daily-athleisure", category: "DAILY", genre: "athleisure", label: "데일리 애슬레저" },
  { id: "work-office", category: "WORK", genre: "office", label: "오피스" },
  { id: "work-classic", category: "WORK", genre: "classic", label: "워크 클래식" },
  { id: "work-smart", category: "WORK", genre: "minimal", label: "스마트 워크" },
  { id: "statement-street", category: "STATEMENT", genre: "street", label: "스트릿" },
  { id: "statement-formal", category: "STATEMENT", genre: "formal", label: "포멀" },
  { id: "statement-date", category: "STATEMENT", genre: "date", label: "데이트" },
];

type BatchState = { batch: FashionPreviewBatch | null; stylingSessionIds: string[] };

function directionSummary(direction: FashionDirectionSnapshot) {
  return [direction.situation, direction.genre, direction.season, direction.fit, direction.exposure, direction.budget].filter(Boolean).join(" · ");
}

export function FashionBatchWorkbench({ snapshot, mutate, saving, interviewEnabled = false }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">, options?: { navigate?: boolean }) => Promise<unknown>;
  saving: boolean;
  interviewEnabled?: boolean;
}) {
  const taskRuntime = useConsultationTaskRuntime();
  const style = selectedStyle(snapshot);
  const [direction, setDirection] = useState(snapshot.fashion.directionSnapshot);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);
  const [previews, setPreviews] = useState<FashionPreviewCandidateV2[]>([]);
  const [batchState, setBatchState] = useState<BatchState>({ batch: snapshot.fashionBatch, stylingSessionIds: [] });
  const [shortlist, setShortlist] = useState(snapshot.fashion.shortlistIds);
  const [selected, setSelected] = useState<SelectedFashionLook>(snapshot.fashion);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPurchase, setNeedsPurchase] = useState(false);

  const refresh = useCallback(async () => {
    const [previewResponse, batchResponse] = await Promise.all([
      fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-previews`, { cache: "no-store" }),
      fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch`, { cache: "no-store" }),
    ]);
    const previewData = (await previewResponse.json().catch(() => ({}))) as { previews?: FashionPreviewCandidateV2[]; previewSet?: FashionPreviewSetV2 | null; error?: string };
    const batchData = (await batchResponse.json().catch(() => ({}))) as BatchState & { error?: string };
    if (!previewResponse.ok) throw new Error(previewData.error || "패션 프리뷰 상태를 불러오지 못했습니다.");
    if (batchResponse.ok) setBatchState(batchData);
    setPreviews(previewData.previews ?? []);
    return { previews: previewData.previews ?? [], batch: batchData.batch ?? null };
  }, [snapshot.sessionId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => void Promise.all([fetch("/api/style-profile", { cache: "no-store" }), refresh()]).then(async ([profileResponse]) => {
      const data = (await profileResponse.json().catch(() => ({}))) as { profile?: { bodyPhotoPath?: string | null } };
      if (!cancelled) setProfileReady(Boolean(profileResponse.ok && data.profile?.bodyPhotoPath));
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "패션 준비 상태를 확인하지 못했습니다."); }), 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!batchState.batch || !["approved", "generating", "partial"].includes(batchState.batch.state)) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconcile", batchId: batchState.batch?.id }),
      }).then(() => refresh()).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [batchState.batch, refresh, snapshot.sessionId]);

  const prepareBatch = async (requestedDirection = direction) => {
    if (!profileReady || working) return;
    setWorking(true); setError(null); setNeedsPurchase(false);
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `${snapshot.sessionId}:fashion-batch:${snapshot.version}:${directionSummary(requestedDirection)}` },
        body: JSON.stringify({ direction: requestedDirection }),
      });
      const data = (await response.json().catch(() => ({}))) as BatchState & { error?: string };
      if (!response.ok || !data.batch) {
        if (response.status === 409) setNeedsPurchase(true);
        throw new Error(data.error || "9개 패션 룩 생성 권한을 확인하지 못했습니다.");
      }
      setBatchState(data);
      setDirection(requestedDirection);
      taskRuntime.startTask(createClientConsultationTask({
        id: data.batch.id,
        kind: "fashion-generation",
        stage: "fashion",
        originStage: "fashion",
        destinationStage: "fashion",
        phaseKey: "generation",
        label: "9개 패션 룩 배치",
        detail: "확정한 방향과 이용 권한을 연결해 DAILY·WORK·STATEMENT 결과를 생성합니다.",
        completedUnits: data.batch.completedCount,
        totalUnits: 9,
      }));
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? `${cause.message} 완료된 슬롯은 유지되며 같은 상담에서 이어갈 수 있습니다.` : "배치 실행을 완료하지 못했습니다.";
      setError(message);
      taskRuntime.failTask(message);
      await refresh().catch(() => undefined);
    } finally { setWorking(false); }
  };

  const resumeIncomplete = async () => {
    const { batch } = batchState;
    if (!batch || working) return;
    setWorking(true); setError(null);
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch", batchId: batch.id }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "미완료 슬롯을 서버에 재접수하지 못했습니다.");
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "미완료 슬롯을 재접수하지 못했습니다.");
      await refresh().catch(() => undefined);
    } finally { setWorking(false); }
  };

  const toggleShortlist = (preview: FashionPreviewCandidateV2) => {
    if (preview.status !== "completed" || !preview.imageUrl) return;
    setShortlist((current) => current.includes(preview.stylingSessionId)
      ? current.filter((id) => id !== preview.stylingSessionId)
      : current.length < 3 ? [...current, preview.stylingSessionId] : current);
  };

  const selectFinal = (preview: FashionPreviewCandidateV2) => {
    if (!shortlist.includes(preview.stylingSessionId)) return;
    setSelected({
      direction: directionSummary(preview.direction), directionSnapshot: preview.direction,
      shortlistIds: shortlist, lookId: preview.stylingSessionId, category: preview.category,
      label: preview.headline, items: preview.items, palette: preview.palette,
      neckline: preview.neckline, silhouette: preview.silhouette,
      avoidCombinations: preview.direction.avoidItems, shoppingKeywords: preview.shoppingKeywords,
      selectedAt: new Date().toISOString(),
    });
  };

  const saveSelection = async () => {
    if (!selected.lookId || shortlist.length < 2 || shortlist.length > 3) return;
    setWorking(true); setError(null);
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-previews`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `fashion:${snapshot.sessionId}:${snapshot.version}:${selected.lookId}` },
        body: JSON.stringify({ stylingSessionIds: shortlist, selectedStylingSessionId: selected.lookId }),
      });
      const data = (await response.json().catch(() => ({}))) as { previewSet?: FashionPreviewSetV2; error?: string };
      if (!response.ok || !data.previewSet) throw new Error(data.error || "최종 패션 룩을 저장하지 못했습니다.");
      await mutate({ fashion: { ...selected, shortlistIds: shortlist, directionSnapshot: data.previewSet.directionSnapshot, selectedAt: selected.selectedAt || new Date().toISOString() }, completeStage: "fashion", currentStage: "fashion" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "최종 패션 룩을 저장하지 못했습니다."); }
    finally { setWorking(false); }
  };

  const completed = previews.filter((preview) => preview.status === "completed" && preview.imageUrl);
  const shortlistPreviews = shortlist.map((id) => previews.find((preview) => preview.stylingSessionId === id)).filter(Boolean) as FashionPreviewCandidateV2[];
  return <WorkbenchGrid input={<div className="grid gap-5">
    {interviewEnabled && !batchState.batch ? <FashionDirectionInterview
      consultationId={snapshot.sessionId}
      direction={direction}
      selectedHair={style?.label || "확정한 헤어"}
      personalColor={`${snapshot.personalColor.season} · ${snapshot.personalColor.confidence}`}
      discoveryAvoid={snapshot.discovery.avoid}
      saving={saving}
      disabled={!profileReady || working}
      onAutosave={async (nextDirection) => {
        setDirection(nextDirection);
        return await mutate({ fashion: { ...snapshot.fashion, directionSnapshot: nextDirection }, currentStage: "fashion" }, { navigate: false }) as { ok?: boolean; conflict?: boolean };
      }}
      onConfirm={prepareBatch}
    /> : <Panel className="grid gap-5 p-5 sm:p-7">
      <div><p className="app-kicker">One direction · nine outputs</p><h2 className="mt-2 text-xl font-black">{style?.label || "확정한 헤어"}에서 9개 룩을 한 번에 준비합니다</h2><p className="mt-2 text-sm text-[var(--app-muted)]">상황·계절·핏·노출·예산·회피 조건을 한 번 정하면 DAILY·WORK·STATEMENT 9개 슬롯 전체에 반영됩니다.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-black">계절<select value={direction.season} onChange={(event) => setDirection({ ...direction, season: event.target.value as FashionDirectionSnapshot["season"] })} className="app-input min-h-11 px-3"><option value="spring">spring</option><option value="summer">summer</option><option value="autumn">autumn</option><option value="winter">winter</option><option value="all-season">all-season</option></select></label>
        <label className="grid gap-2 text-sm font-black">핏<select value={direction.fit} onChange={(event) => setDirection({ ...direction, fit: event.target.value as FashionDirectionSnapshot["fit"] })} className="app-input min-h-11 px-3"><option value="slim">slim</option><option value="regular">regular</option><option value="relaxed">relaxed</option><option value="oversized">oversized</option></select></label>
        <label className="grid gap-2 text-sm font-black">노출·넥라인<select value={direction.exposure} onChange={(event) => setDirection({ ...direction, exposure: event.target.value as FashionDirectionSnapshot["exposure"] })} className="app-input min-h-11 px-3"><option value="low">low</option><option value="balanced">balanced</option><option value="bold">bold</option></select></label>
        <label className="grid gap-2 text-sm font-black">예산<input value={direction.budget} onChange={(event) => setDirection({ ...direction, budget: event.target.value })} className="app-input min-h-11 px-3 font-normal" /></label>
      </div>
      <label className="grid gap-2 text-sm font-black">회피 아이템<input value={direction.avoidItems.join(", ")} onChange={(event) => setDirection({ ...direction, avoidItems: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className="app-input min-h-11 px-3 font-normal" /></label>
      {profileReady === false ? <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">전신 사진과 바디 프로필이 필요합니다. <Link href="/mypage" className="font-black underline">프로필 완성</Link></p> : null}
      <Button type="button" loading={working} disabled={!profileReady || Boolean(batchState.batch && ["approved", "generating", "partial", "ready"].includes(batchState.batch.state))} onClick={() => void prepareBatch(direction)}>이 방향으로 9개 룩 준비</Button>
    </Panel>}
    {batchState.batch && ["approved", "partial", "failed"].includes(batchState.batch.state) ? <Button type="button" variant="secondary" loading={working} onClick={() => void resumeIncomplete()}>미완료 슬롯 자동 재접수</Button> : null}
    {needsPurchase ? <p className="border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm">인터뷰 답변은 저장되어 있습니다. <Link href="/billing" className="font-black underline">이용 상품을 선택한 뒤 이어서 진행</Link>할 수 있습니다.</p> : null}
    {error ? <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}
    {completed.length >= 2 ? <SaveStageButton loading={saving || working} disabled={shortlist.length < 2 || shortlist.length > 3 || !selected.lookId || !shortlist.includes(selected.lookId)} onClick={() => void saveSelection()}>최종 패션 룩 저장</SaveStageButton> : null}
  </div>} output={<>
    {shortlistPreviews.length >= 2 ? <SurfaceCard className="p-5"><p className="app-kicker">Fashion comparison</p><h2 className="mt-2 text-xl font-black">후보 {shortlistPreviews.length}개를 같은 축으로 비교합니다</h2><div className={`mt-5 grid gap-4 ${shortlistPreviews.length === 3 ? "xl:grid-cols-3" : "sm:grid-cols-2"}`}>{shortlistPreviews.map((preview) => <section key={preview.stylingSessionId} aria-label={`${preview.headline} 비교`} className="border-t border-[var(--app-border-strong)] pt-4"><h3 className="font-black">{preview.headline}</h3><div className="mt-3"><DefinitionRows items={[
      { label: "Category", value: preview.category },
      { label: "Palette", value: preview.palette.join(" · ") || "기본 팔레트" },
      { label: "Neckline", value: preview.neckline || "기본" },
      { label: "Silhouette", value: preview.silhouette || preview.direction.fit },
      { label: "Hair link", value: preview.summary },
      { label: "Items", value: preview.items.map((item) => item.name).join(" · ") || "구성 대기" },
      { label: "Search", value: preview.shoppingKeywords.join(" · ") || "검색어 대기" },
    ]} /></div></section>)}</div></SurfaceCard> : null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-fashion-board-size="9">{SLOTS.map((slot) => {
      const preview = previews.find((item) => item.slotId === slot.id);
      const shortlisted = Boolean(preview && shortlist.includes(preview.stylingSessionId));
      const final = Boolean(preview && selected.lookId === preview.stylingSessionId);
      return <SurfaceCard key={slot.id} className="overflow-hidden p-0" data-fashion-slot-id={slot.id}><div className="aspect-[3/4] bg-[var(--app-surface-muted)]">{preview?.imageUrl ? <img src={preview.imageUrl} alt={`${slot.label} AI 패션 프리뷰`} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <div className="grid h-full place-items-center p-5 text-center text-sm font-black text-[var(--app-muted)]">{preview?.status ?? "배치 준비 전"}</div>}</div><div className="grid gap-3 p-4"><div><p className="app-kicker">{slot.category}</p><h3 className="mt-1 font-black">{preview?.headline || slot.label}</h3><p className="mt-1 text-xs text-[var(--app-muted)]">{preview?.summary || "헤어·컬러·바디 조건을 연결해 생성합니다."}</p></div>{preview?.status === "completed" ? <div className="flex gap-2"><Button type="button" variant={shortlisted ? "primary" : "secondary"} onClick={() => toggleShortlist(preview)}>{shortlisted ? "후보 해제" : "후보 선택"}</Button><Button type="button" variant={final ? "primary" : "ghost"} disabled={!shortlisted} onClick={() => selectFinal(preview)}>{final ? "최종 룩" : "최종 지정"}</Button></div> : null}{preview?.errorMessage ? <p className="text-xs text-[var(--app-danger)]">{preview.errorMessage}</p> : null}</div></SurfaceCard>;
    })}</div>
    <ConsultationSystemData snapshot={snapshot} items={[
      { label: "Fashion batch", value: batchState.batch ? `${batchState.batch.state} · ${batchState.batch.completedCount}/9 완료 · ${batchState.batch.failedCount} 실패` : "준비 전" },
      { label: "Shortlist", value: `${shortlist.length} / 3` },
      { label: "Final look", value: selected.label || "선택 전" },
    ]} />
  </>} />;
}

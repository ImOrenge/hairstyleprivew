"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { loadGenerationConsultationBridge } from "../../../lib/consulting/generation-bridge";
import { Button } from "../../ui/Button";
import { Panel, SaveStageButton, SurfaceCard } from "./shared";

export function PreviewsWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [previews, setPreviews] = useState(snapshot.previews);
  const [selected, setSelected] = useState(snapshot.shortlist.previewIds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    if (!snapshot.photo.generationId) return;
    setLoading(true); setError(null);
    try {
      const bridge = await loadGenerationConsultationBridge(snapshot.photo.generationId);
      setPreviews(bridge.previews);
      await mutate({ previews: bridge.previews, ...(bridge.faceAnalysis ? { faceAnalysis: bridge.faceAnalysis } : {}) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "결과를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  };
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  return <div className="grid gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black">연결된 generation · {snapshot.photo.generationId || "없음"}</p><p className="text-xs text-[var(--app-muted)]">완료된 결과만 shortlist에 넣을 수 있으며 부분 완료도 허용합니다.</p></div><Button type="button" variant="secondary" loading={loading} disabled={!snapshot.photo.generationId} onClick={() => void refresh()}>signed URL 및 결과 갱신</Button></div>
    {error ? <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}
    <div className="grid gap-5 lg:grid-cols-3">{(["BALANCE","IMAGE","LIFESTYLE"] as const).map((axis) => <Panel key={axis} className="p-4"><p className="app-kicker">{axis}</p><div className="mt-4 grid gap-3">{previews.filter((item) => item.axis === axis).map((preview) => <button key={preview.id} type="button" disabled={preview.status !== "accepted"} onClick={() => toggle(preview.id)} aria-pressed={selected.includes(preview.id)} className={`overflow-hidden border text-left ${selected.includes(preview.id) ? "border-[var(--app-border-strong)] ring-2 ring-[var(--app-ring)]" : "border-[var(--app-border)]"} disabled:opacity-55`}><div className="aspect-[4/5] bg-[var(--app-surface-muted)]">{preview.imageUrl ? <img src={preview.imageUrl} alt={preview.label} className="h-full w-full object-cover" decoding="async" loading="lazy" /> : <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[var(--app-muted)]">{preview.status === "failed" ? "생성 실패 · 다른 후보는 계속 비교할 수 있습니다." : "결과 대기 중"}</div>}</div><div className="p-3"><p className="font-black">{preview.label}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--app-muted)]">{preview.reason}</p></div></button>)}</div></Panel>)}</div>
    <SurfaceCard className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-black">Shortlist {selected.length} / 3</p><p className="mt-1 text-sm text-[var(--app-muted)]">비교를 위해 최소 2개, 최대 3개를 선택하세요.</p></div><SaveStageButton loading={saving} disabled={selected.length < 2 || selected.length > 3} onClick={() => void mutate({ previews, shortlist: { previewIds: selected, updatedAt: new Date().toISOString() }, completeStage: "previews", currentStage: "compare" })}>선택한 후보 비교하기</SaveStageButton></SurfaceCard>
  </div>;
}

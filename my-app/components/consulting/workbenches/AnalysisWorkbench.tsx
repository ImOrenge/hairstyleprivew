"use client";

import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot, Confidence } from "../../../lib/consulting/contracts";
import { DefinitionRows, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";
import { Button } from "../../ui/Button";
import { ConsultationPhotoEvidence } from "../photo/ConsultationPhotoEvidence";

export function AnalysisWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [face, setFace] = useState(snapshot.faceAnalysis);
  const [color, setColor] = useState(snapshot.personalColor);
  const [colorLoading, setColorLoading] = useState(false);
  const confidence = (value: string) => value as Confidence;
  const loadColor = async () => {
    setColorLoading(true);
    try {
      const response = await fetch("/api/style-profile", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { profile?: { personalColor?: { season?: string; tone?: string; bestColors?: Array<{ hex?: string }> } | null } };
      const saved = data.profile?.personalColor;
      if (response.ok && saved) setColor({ season: saved.season || "저장된 진단", undertone: saved.tone || "neutral", palette: (saved.bestColors || []).map((item) => item.hex || "").filter(Boolean), confidence: "high" });
    } finally { setColorLoading(false); }
  };
  return <WorkbenchGrid><Panel className="grid gap-6 p-5 sm:p-7"><div className="grid gap-4 sm:grid-cols-2">{([['faceShape','얼굴형'],['balance','균형'],['hairline','헤어라인'],['density','모발 밀도']] as const).map(([key,label]) => <label key={key} className="grid gap-2 text-sm font-black">{label}<input value={face[key]} onChange={(event) => setFace({ ...face, [key]: event.target.value })} className="app-input min-h-11 px-3 font-normal" /></label>)}</div><label className="grid gap-2 text-sm font-black">분석 신뢰도<select value={face.confidence} onChange={(event) => setFace({ ...face, confidence: confidence(event.target.value) })} className="app-input min-h-11 px-3"><option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option></select></label><div className="flex flex-wrap items-end justify-between gap-3"><div className="grid flex-1 gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-black">퍼스널 컬러<input value={color.season} onChange={(event) => setColor({ ...color, season: event.target.value })} className="app-input min-h-11 px-3 font-normal" /></label><label className="grid gap-2 text-sm font-black">언더톤<input value={color.undertone} onChange={(event) => setColor({ ...color, undertone: event.target.value })} className="app-input min-h-11 px-3 font-normal" /></label></div><Button type="button" variant="secondary" loading={colorLoading} onClick={() => void loadColor()}>저장된 퍼스널 컬러 연결</Button></div><SaveStageButton loading={saving} disabled={!snapshot.evidence.reviewedAt} onClick={() => void mutate({ faceAnalysis: face, personalColor: color, completeStage: "analysis", currentStage: "direction" })} /></Panel><div className="grid gap-4"><ConsultationPhotoEvidence sessionId={snapshot.sessionId} enabled={snapshot.photo.usageScopes.includes("analysis")} /><SurfaceCard className="p-5"><p className="app-kicker">Evidence ledger</p><div className="mt-4 grid gap-3">{snapshot.evidence.items.map((item) => <div key={item.id} className="border-l-2 border-[var(--app-accent)] pl-3"><p className="text-xs font-black uppercase">{item.layer} · {item.confidence}</p><p className="mt-1 text-sm">{item.evidence} → {item.meaning} → {item.action}</p></div>)}</div></SurfaceCard><SurfaceCard className="p-5"><DefinitionRows items={[{label:"Face",value:face.faceShape},{label:"Balance",value:face.balance},{label:"Color",value:`${color.season} / ${color.undertone}`},{label:"Confidence",value:face.confidence}]} /><div className="mt-4 grid gap-2" aria-label="분석 신뢰도 차트"><div className="h-2 bg-[var(--app-surface-muted)]"><div className="h-full bg-[var(--app-accent)]" style={{ width: face.confidence === "high" ? "88%" : face.confidence === "medium" ? "62%" : "34%" }} /></div><p className="text-xs text-[var(--app-muted)]">신뢰도는 확정값이 아니라 근거 품질을 나타냅니다.</p></div></SurfaceCard></div></WorkbenchGrid>;
}

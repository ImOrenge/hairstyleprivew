"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { selectedStyle } from "../../../lib/consulting/contracts";
import { ChoiceGroup, Panel, SaveStageButton, SurfaceCard, TextField, WorkbenchGrid } from "./shared";

export function AftercareWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [service, setService] = useState(snapshot.actualService);
  const [care, setCare] = useState(snapshot.careProgram);
  const selected = selectedStyle(snapshot);
  const toggle = (value: string) => setService((current) => ({ ...current, services: current.services.includes(value) ? current.services.filter((item) => item !== value) : [...current.services, value] }));
  return <WorkbenchGrid>
    <Panel className="grid gap-5 p-5 sm:p-7">
      <ChoiceGroup label="실제로 받은 시술 (복수 선택)" values={["커트","펌","염색","클리닉"]} selected={service.services} onToggle={toggle} />
      <label className="grid gap-2 text-sm font-black">시술일<input type="date" value={service.serviceDate || ""} onChange={(event) => setService({ ...service, serviceDate: event.target.value || null })} className="app-input min-h-11 px-3" /></label>
      <TextField label="디자이너가 실제로 조정한 내용" value={service.designerNotes} onChange={(designerNotes) => setService({ ...service, designerNotes })} />
      <TextField label="오늘 할 관리" value={care.today.join(", ")} onChange={(value) => setCare({ ...care, today: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
      <div className="grid gap-2">{care.checkpoints.map((checkpoint, index) => <button key={checkpoint.offset} type="button" onClick={() => setCare({ ...care, checkpoints: care.checkpoints.map((item, itemIndex) => itemIndex === index ? { ...item, complete: !item.complete } : item) })} aria-pressed={checkpoint.complete} className={`flex min-h-14 items-center justify-between border px-4 text-left ${checkpoint.complete ? "border-[var(--app-success)] bg-[var(--app-success-bg)]" : "border-[var(--app-border)]"}`}><span className="font-black">{checkpoint.offset}</span><span className="text-xs text-[var(--app-muted)]">{checkpoint.action}</span></button>)}</div>
      <label className="grid gap-2 text-sm font-black">만족도 · {care.satisfaction ?? "미입력"}<input type="range" min="1" max="5" value={care.satisfaction ?? 3} onChange={(event) => setCare({ ...care, satisfaction: Number(event.target.value) })} /></label>
      <TextField label="걱정되는 점·변화 기록" value={care.concerns.join(", ")} onChange={(value) => setCare({ ...care, concerns: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
      <label className="grid gap-2 text-sm font-black">시술 후 사진 URL (선택)<input type="url" value={care.afterPhotoUrl || ""} onChange={(event) => setCare({ ...care, afterPhotoUrl: event.target.value.trim() || null })} className="app-input min-h-11 px-3 font-normal" /></label>
      <SaveStageButton loading={saving} disabled={!service.services.length || !service.serviceDate || !care.today.length} onClick={() => void mutate({ actualService: { ...service, confirmedAt: service.confirmedAt || new Date().toISOString() }, careProgram: care, completeStage: "aftercare", currentStage: "fashion" })}>실제 시술 기준으로 관리 프로그램 저장</SaveStageButton>
    </Panel>
    <div className="grid gap-4"><SurfaceCard className="p-5"><p className="app-kicker">ActualServiceRecord + CareProgram</p><h2 className="mt-3 text-xl font-black">계획과 실제 시술을 섞지 않습니다</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">실제 시술 확정 시 선택 스타일이 잠깁니다. 이후 관리는 오늘, D+3, W+2, W+6, W+10 기준으로 이어집니다.</p></SurfaceCard>{snapshot.photo.generationId && selected ? <Link href={`/result/${encodeURIComponent(snapshot.photo.generationId)}?variant=${encodeURIComponent(selected.previewId)}`} className="inline-flex min-h-11 items-center justify-center border border-[var(--app-border)] bg-[var(--app-surface)] px-4 text-sm font-black">기존 시술 확정·Aftercare bridge 열기</Link> : null}</div>
  </WorkbenchGrid>;
}

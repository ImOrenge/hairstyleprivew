"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { ChoiceGroup, Panel, SaveStageButton, SurfaceCard, TextField, WorkbenchGrid } from "./shared";

export function DecisionWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const candidate = snapshot.previews.find((item) => item.id === snapshot.finalist.finalistPreviewId) ?? null;
  const [feasibility, setFeasibility] = useState("현재 모발에서 디자이너 확인 후 진행 가능");
  const [gap, setGap] = useState(snapshot.discovery.currentHair);
  const [services, setServices] = useState(snapshot.discovery.desiredServices.filter((item) => item !== "아직 모름"));
  const [maintenance, setMaintenance] = useState(snapshot.discovery.maintenanceLevel === "low" ? "낮은 관리 강도" : snapshot.discovery.maintenanceLevel === "high" ? "높은 관리 강도" : "보통 관리 강도");
  const [limitations, setLimitations] = useState(snapshot.discovery.avoid);
  const toggle = (value: string) => setServices((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const locked = Boolean(snapshot.selectedStyleHistory.at(-1)?.serviceConfirmedAt);
  return <WorkbenchGrid>
    <Panel className="overflow-hidden">{candidate?.imageUrl ? <div className="aspect-[4/5] bg-[var(--app-surface-muted)]"><img src={candidate.imageUrl} alt={candidate.label} className="h-full w-full object-cover" decoding="async" loading="eager" /></div> : <div className="flex aspect-[4/5] items-center justify-center bg-[var(--app-surface-muted)] text-sm text-[var(--app-muted)]">최종 후보 이미지 없음</div>}<div className="p-5"><p className="app-kicker">Selected style</p><h2 className="mt-2 text-2xl font-black">{candidate?.label || "후보를 먼저 선택하세요"}</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{candidate?.reason}</p></div></Panel>
    <Panel className="grid gap-5 p-5 sm:p-7"><TextField label="실현 가능성" value={feasibility} onChange={setFeasibility} /><TextField label="현재 모발과의 차이" value={gap} onChange={setGap} /><ChoiceGroup label="필요 서비스" values={["커트","펌","염색","클리닉"]} selected={services} onToggle={toggle} /><TextField label="관리 요구" value={maintenance} onChange={setMaintenance} /><TextField label="한계와 현장 확인 사항" value={limitations.join(", ")} onChange={(value) => setLimitations(value.split(",").map((item) => item.trim()).filter(Boolean))} />{locked ? <SurfaceCard className="p-4 text-sm font-bold">실제 시술이 확정되어 선택이 잠겼습니다.</SurfaceCard> : null}<SaveStageButton loading={saving} disabled={!candidate || locked} onClick={() => candidate && void mutate({ selectedStyle: { previewId: candidate.id, label: candidate.label, reason: candidate.reason, imageUrl: candidate.imageUrl, generatedImagePath: candidate.generatedImagePath, feasibility, currentHairGap: gap, services, maintenance, limitations, strategy: snapshot.strategy }, completeStage: "decision", currentStage: "salon-brief" })}>불변 선택 스냅샷 만들기</SaveStageButton></Panel>
  </WorkbenchGrid>;
}

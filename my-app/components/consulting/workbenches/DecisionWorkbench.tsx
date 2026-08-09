"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { ChoiceGroup, ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, TextField, WorkbenchGrid } from "./shared";

export function DecisionWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const candidate = snapshot.previews.find((item) => item.id === snapshot.finalist.finalistPreviewId) ?? null;
  const [feasibility, setFeasibility] = useState("현재 모발에서 디자이너 확인 후 진행 가능");
  const [gap, setGap] = useState(snapshot.discovery.currentHair);
  const [services, setServices] = useState(snapshot.discovery.desiredServices.filter((item) => item !== "아직 모름"));
  const [maintenance, setMaintenance] = useState(snapshot.discovery.maintenanceLevel === "low" ? "낮은 관리 강도" : snapshot.discovery.maintenanceLevel === "high" ? "높은 관리 강도" : "보통 관리 강도");
  const [limitations, setLimitations] = useState(snapshot.discovery.avoid);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (value: string) => setServices((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const locked = Boolean(snapshot.selectedStyleHistory.at(-1)?.serviceConfirmedAt);
  const syncSelectionV2 = async (previewVariantId: string) => {
    const selectionResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/selection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previewVariantId, expectedVersion: snapshot.version }),
    });
    const selectionData = (await selectionResponse.json().catch(() => ({}))) as {
      selection?: { id?: string; previewVariantId?: string; status?: string };
      consultationVersion?: number;
      error?: string;
    };
    if (selectionResponse.status === 404 && selectionData.error === "HairFit V2 feature is disabled.") return;
    if (!selectionResponse.ok || !selectionData.selection?.id || !Number.isInteger(selectionData.consultationVersion)) {
      const latestResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/selection`, { cache: "no-store" });
      const latestData = (await latestResponse.json().catch(() => ({}))) as { selection?: { previewVariantId?: string; status?: string } };
      if (latestResponse.ok && latestData.selection?.status === "confirmed" && latestData.selection.previewVariantId === previewVariantId) return;
      throw new Error(selectionData.error || "V2 선택 스냅샷을 만들지 못했습니다.");
    }
    const confirmResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId: selectionData.selection.id, expectedVersion: selectionData.consultationVersion }),
    });
    if (!confirmResponse.ok) {
      const confirmData = (await confirmResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(confirmData.error || "V2 선택을 확정하지 못했습니다.");
    }
  };
  const saveDecision = async () => {
    if (!candidate || locked) return;
    setSyncing(true);
    setError(null);
    try {
      await syncSelectionV2(candidate.id);
      await mutate({ selectedStyle: { previewId: candidate.id, label: candidate.label, reason: candidate.reason, imageUrl: candidate.imageUrl, generatedImagePath: candidate.generatedImagePath, feasibility, currentHairGap: gap, services, maintenance, limitations, strategy: snapshot.strategy }, completeStage: "decision", currentStage: "salon-brief" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "스타일 선택을 저장하지 못했습니다.");
    } finally {
      setSyncing(false);
    }
  };
  return <WorkbenchGrid input={
    <Panel className="grid gap-5 p-5 sm:p-7"><TextField label="실현 가능성" value={feasibility} onChange={setFeasibility} /><TextField label="현재 모발과의 차이" value={gap} onChange={setGap} /><ChoiceGroup label="필요 서비스" values={["커트","펌","염색","클리닉"]} selected={services} onToggle={toggle} /><TextField label="관리 요구" value={maintenance} onChange={setMaintenance} /><TextField label="한계와 현장 확인 사항" value={limitations.join(", ")} onChange={(value) => setLimitations(value.split(",").map((item) => item.trim()).filter(Boolean))} />{locked ? <SurfaceCard className="p-4 text-sm font-bold">실제 시술이 확정되어 선택이 잠겼습니다.</SurfaceCard> : null}{error ? <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}<SaveStageButton loading={saving || syncing} disabled={!candidate || locked} onClick={() => void saveDecision()}>불변 선택 스냅샷 만들기</SaveStageButton></Panel>
  } output={<>
    <Panel className="overflow-hidden">{candidate?.imageUrl ? <div className="aspect-[4/5] bg-[var(--app-surface-muted)]"><img src={candidate.imageUrl} alt={candidate.label} className="h-full w-full object-cover" decoding="async" loading="eager" /></div> : <div className="flex aspect-[4/5] items-center justify-center bg-[var(--app-surface-muted)] text-sm text-[var(--app-muted)]">최종 후보 이미지 없음</div>}<div className="p-5"><p className="app-kicker">Selected AI candidate</p><h2 className="mt-2 text-2xl font-black">{candidate?.label || "후보를 먼저 선택하세요"}</h2><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{candidate?.reason}</p>{candidate ? <div className="mt-5"><DefinitionRows items={[
      { label: "Axis", value: candidate.axis },
      { label: "Quality state", value: candidate.status },
      { label: "Strategy revision", value: snapshot.strategy.revision },
      { label: "Finalist decided", value: snapshot.finalist.decidedAt ? new Date(snapshot.finalist.decidedAt).toLocaleString("ko-KR") : "결정 시각 대기" },
    ]} /></div> : null}</div></Panel>
    <ConsultationSystemData snapshot={snapshot} items={[
      { label: "Decision lock", value: locked ? "실제 시술 확정으로 잠김" : "편집 가능" },
      { label: "Backup candidate", value: snapshot.finalist.backupPreviewId ? "지정됨" : "없음" },
      { label: "Required services", value: services.join(" · ") || "입력 대기" },
    ]} />
  </>} />;
}

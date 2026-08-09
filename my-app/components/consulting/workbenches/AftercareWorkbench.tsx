"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { selectedStyle } from "../../../lib/consulting/contracts";
import { ChoiceGroup, Panel, SaveStageButton, SurfaceCard, TextField, WorkbenchGrid } from "./shared";

export function AftercareWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [service, setService] = useState(snapshot.actualService);
  const [care, setCare] = useState(snapshot.careProgram);
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [afterPhotoConsent, setAfterPhotoConsent] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = selectedStyle(snapshot);
  const toggle = (value: string) => setService((current) => ({ ...current, services: current.services.includes(value) ? current.services.filter((item) => item !== value) : [...current.services, value] }));
  const saveAftercare = async () => {
    if (!service.services.length || !service.serviceDate || !care.today.length) return;
    setSyncing(true);
    setError(null);
    try {
      const idempotencyKey = `${snapshot.sessionId}:aftercare:${service.serviceDate}:${[...service.services].sort().join("-")}`;
      const v2Response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/aftercare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ services: service.services, serviceDate: service.serviceDate, designerNotes: service.designerNotes }),
      });
      const v2Data = (await v2Response.json().catch(() => ({}))) as { program?: { actualServiceId?: string }; error?: string };
      const v2Disabled = v2Response.status === 404 && v2Data.error === "HairFit V2 feature is disabled.";
      if (!v2Disabled && !v2Response.ok) {
        throw new Error(v2Data.error || "V2 애프터케어를 저장하지 못했습니다.");
      }
      let afterPhotoUpload = care.afterPhotoUpload ?? null;
      if (afterPhoto) {
        const actualServiceId = v2Data.program?.actualServiceId;
        if (v2Disabled || !actualServiceId) {
          throw new Error("실제 시술 기록을 만든 뒤에만 시술 후 사진을 비공개로 저장할 수 있습니다.");
        }
        const formData = new FormData();
        formData.append("file", afterPhoto);
        formData.append("actualServiceId", actualServiceId);
        formData.append("consent", String(afterPhotoConsent));
        const photoResponse = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/aftercare-photo`, {
          method: "POST",
          body: formData,
        });
        const photoData = (await photoResponse.json().catch(() => ({}))) as {
          photo?: { actualServiceId: string; fingerprint: string; uploadedAt: string };
          error?: string;
        };
        if (!photoResponse.ok || !photoData.photo) {
          throw new Error(photoData.error || "시술 후 사진을 저장하지 못했습니다.");
        }
        afterPhotoUpload = photoData.photo;
      }
      await mutate({
        actualService: { ...service, confirmedAt: service.confirmedAt || new Date().toISOString() },
        careProgram: { ...care, afterPhotoUrl: null, afterPhotoUpload },
        completeStage: "aftercare",
        currentStage: "fashion",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "애프터케어를 저장하지 못했습니다.");
    } finally {
      setSyncing(false);
    }
  };
  return <WorkbenchGrid>
    <Panel className="grid gap-5 p-5 sm:p-7">
      <ChoiceGroup label="실제로 받은 시술 (복수 선택)" values={["커트","펌","염색","클리닉"]} selected={service.services} onToggle={toggle} />
      <label className="grid gap-2 text-sm font-black">시술일<input type="date" value={service.serviceDate || ""} onChange={(event) => setService({ ...service, serviceDate: event.target.value || null })} className="app-input min-h-11 px-3" /></label>
      <TextField label="디자이너가 실제로 조정한 내용" value={service.designerNotes} onChange={(designerNotes) => setService({ ...service, designerNotes })} />
      <TextField label="오늘 할 관리" value={care.today.join(", ")} onChange={(value) => setCare({ ...care, today: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
      <div className="grid gap-2">{care.checkpoints.map((checkpoint, index) => <button key={checkpoint.offset} type="button" onClick={() => setCare({ ...care, checkpoints: care.checkpoints.map((item, itemIndex) => itemIndex === index ? { ...item, complete: !item.complete } : item) })} aria-pressed={checkpoint.complete} className={`flex min-h-14 items-center justify-between border px-4 text-left ${checkpoint.complete ? "border-[var(--app-success)] bg-[var(--app-success-bg)]" : "border-[var(--app-border)]"}`}><span className="font-black">{checkpoint.offset}</span><span className="text-xs text-[var(--app-muted)]">{checkpoint.action}</span></button>)}</div>
      <label className="grid gap-2 text-sm font-black">만족도 · {care.satisfaction ?? "미입력"}<input type="range" min="1" max="5" value={care.satisfaction ?? 3} onChange={(event) => setCare({ ...care, satisfaction: Number(event.target.value) })} /></label>
      <TextField label="걱정되는 점·변화 기록" value={care.concerns.join(", ")} onChange={(value) => setCare({ ...care, concerns: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
      <label className="grid gap-2 text-sm font-black">시술 후 사진 (선택)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setAfterPhoto(event.target.files?.[0] ?? null); setAfterPhotoConsent(false); }} className="app-input min-h-11 px-3 py-2 font-normal" /></label>
      {afterPhoto ? <label className="flex min-h-11 items-start gap-3 border border-[var(--app-border)] p-3 text-sm"><input type="checkbox" checked={afterPhotoConsent} onChange={(event) => setAfterPhotoConsent(event.target.checked)} className="mt-1" /><span><strong className="block">시술 결과 사진 사용 동의</strong><span className="mt-1 block text-xs leading-5 text-[var(--app-muted)]">선택한 사진은 비공개 Storage에 저장되며 이 실제 시술의 관리 기록과 다음 상담에만 사용됩니다.</span></span></label> : null}
      {care.afterPhotoUpload ? <p className="text-xs font-bold text-[var(--app-success)]">시술 후 사진 저장 완료 · {new Date(care.afterPhotoUpload.uploadedAt).toLocaleDateString("ko-KR")}</p> : null}
      {error ? <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}
      <SaveStageButton loading={saving || syncing} disabled={!service.services.length || !service.serviceDate || !care.today.length || Boolean(afterPhoto && !afterPhotoConsent)} onClick={() => void saveAftercare()}>실제 시술 기준으로 관리 프로그램 저장</SaveStageButton>
    </Panel>
    <div className="grid gap-4"><SurfaceCard className="p-5"><p className="app-kicker">ActualServiceRecord + CareProgram</p><h2 className="mt-3 text-xl font-black">계획과 실제 시술을 섞지 않습니다</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">실제 시술 확정 시 선택 스타일이 잠깁니다. 이후 관리는 오늘, D+3, W+2, W+6, W+10 기준으로 이어집니다.</p></SurfaceCard>{snapshot.photo.generationId && selected ? <Link href={`/result/${encodeURIComponent(snapshot.photo.generationId)}?variant=${encodeURIComponent(selected.previewId)}`} className="inline-flex min-h-11 items-center justify-center border border-[var(--app-border)] bg-[var(--app-surface)] px-4 text-sm font-black">기존 시술 확정·Aftercare bridge 열기</Link> : null}</div>
  </WorkbenchGrid>;
}

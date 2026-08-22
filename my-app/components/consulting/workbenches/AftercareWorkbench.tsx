"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AftercareProgramV2 } from "@hairfit/shared/v2";
import { createClientConsultationTask, selectedStyle, type ConsultationPatch, type ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { useConsultationTaskRuntime } from "../transition/ConsultationTaskRuntime";
import { ChoiceGroup, ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, TextField, WorkbenchGrid } from "./shared";
import { AftercareCheckinPanel } from "./AftercareCheckinPanel";

export function AftercareWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">, options?: { navigate?: boolean }) => Promise<unknown>; saving: boolean }) {
  const taskRuntime = useConsultationTaskRuntime();
  const [service, setService] = useState(snapshot.actualService);
  const [care, setCare] = useState(snapshot.careProgram);
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [afterPhotoConsent, setAfterPhotoConsent] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<"active" | "paused" | null>(null);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = selectedStyle(snapshot);
  const toggle = (value: string) => setService((current) => ({ ...current, services: current.services.includes(value) ? current.services.filter((item) => item !== value) : [...current.services, value] }));
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/aftercare`, { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) as {
        program?: AftercareProgramV2 | null;
        actualService?: { services: string[]; serviceDate: string; designerNotes: string; confirmedAt: string } | null;
        notification?: { status?: "active" | "paused" } | null;
        error?: string;
      } }))
      .then(({ response, data }) => {
        if (cancelled || !response.ok || !data.program || !data.actualService) return;
        setService({
          services: data.actualService.services,
          serviceDate: data.actualService.serviceDate,
          designerNotes: data.actualService.designerNotes,
          confirmedAt: data.actualService.confirmedAt,
        });
        setCare((current) => ({
          ...current,
          actualServiceId: data.program?.actualServiceId ?? null,
          programVersion: data.program?.version ?? 0,
          today: data.program?.today ?? current.today,
          checkpoints: data.program?.checkpoints ?? current.checkpoints,
          concerns: data.program?.concerns ?? current.concerns,
          satisfaction: data.program?.satisfaction ?? current.satisfaction,
        }));
        if (data.notification?.status) setNotificationStatus(data.notification.status);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [snapshot.sessionId]);

  const toggleNotifications = async () => {
    if (!care.actualServiceId || !notificationStatus) return;
    setNotificationSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/aftercare/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualServiceId: care.actualServiceId, action: notificationStatus === "active" ? "pause" : "resume" }),
      });
      const payload = await response.json().catch(() => ({})) as { notification?: { status?: "active" | "paused" }; error?: string };
      if (!response.ok || !payload.notification?.status) throw new Error(payload.error || "알림 상태를 변경하지 못했습니다.");
      setNotificationStatus(payload.notification.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "알림 상태를 변경하지 못했습니다.");
    } finally {
      setNotificationSaving(false);
    }
  };

  const saveAftercare = async () => {
    if (!service.services.length || !service.serviceDate) return;
    setSyncing(true);
    setError(null);
    taskRuntime.startTask(createClientConsultationTask({ id: `aftercare:${snapshot.sessionId}:v${care.programVersion + 1}`, kind: "aftercare-preparation", stage: "aftercare", originStage: "aftercare", destinationStage: "aftercare", phaseKey: "schedule", label: "Aftercare 프로그램 갱신", detail: "오늘 행동과 체크포인트를 실제 시술 기록에 맞춰 저장합니다.", completedUnits: 1, totalUnits: 3 }));
    try {
      const updating = Boolean(care.actualServiceId && care.programVersion > 0);
      const idempotencyKey = updating
        ? `${snapshot.sessionId}:aftercare:${care.actualServiceId}:v${care.programVersion + 1}`
        : `${snapshot.sessionId}:aftercare:${service.serviceDate}:${[...service.services].sort().join("-")}`;
      const v2Response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/aftercare`, {
        method: updating ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(updating ? {
          actualServiceId: care.actualServiceId,
          expectedVersion: care.programVersion,
          today: care.today,
          checkpoints: care.checkpoints,
          concerns: care.concerns,
          satisfaction: care.satisfaction,
        } : {
          services: service.services,
          serviceDate: service.serviceDate,
          designerNotes: service.designerNotes,
          today: care.today,
          checkpoints: care.checkpoints,
          concerns: care.concerns,
          satisfaction: care.satisfaction,
        }),
      });
      const v2Data = (await v2Response.json().catch(() => ({}))) as { program?: AftercareProgramV2; error?: string };
      const v2Disabled = v2Response.status === 404 && v2Data.error === "HairFit V2 feature is disabled.";
      if (!v2Disabled && !v2Response.ok) {
        throw new Error(v2Data.error || "V2 애프터케어를 저장하지 못했습니다.");
      }
      taskRuntime.updateTask({
        phaseKey: "checkpoints",
        phaseIndex: 2,
        completedUnits: 2,
        partialOutputCount: (v2Data.program?.today ?? care.today).length,
        detail: "서버가 관리 일정과 체크포인트 새 버전을 저장했습니다.",
      });
      const actualServiceId = v2Data.program?.actualServiceId ?? care.actualServiceId;
      if (actualServiceId && !notificationStatus) setNotificationStatus("active");
      let afterPhotoUpload = care.afterPhotoUpload ?? null;
      if (afterPhoto) {
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
      const result = await mutate({
        actualService: { ...service, confirmedAt: service.confirmedAt || new Date().toISOString() },
        careProgram: {
          ...care,
          actualServiceId: actualServiceId ?? null,
          programVersion: v2Data.program?.version ?? care.programVersion,
          today: v2Data.program?.today ?? care.today,
          checkpoints: v2Data.program?.checkpoints ?? care.checkpoints,
          concerns: v2Data.program?.concerns ?? care.concerns,
          satisfaction: v2Data.program?.satisfaction ?? care.satisfaction,
          afterPhotoUrl: null,
          afterPhotoUpload,
        },
        completeStage: "aftercare",
        currentStage: "aftercare",
      }, { navigate: false }) as { ok?: boolean };
      if (!result.ok) throw new Error("Aftercare 프로그램을 상담 snapshot에 연결하지 못했습니다.");
      taskRuntime.completeTask({ completedUnits: 3, totalUnits: 3, partialOutputCount: (v2Data.program?.today ?? care.today).length });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "애프터케어를 저장하지 못했습니다.";
      setError(message);
      taskRuntime.failTask(message);
    } finally {
      setSyncing(false);
    }
  };
  return <WorkbenchGrid input={
    <Panel className="grid gap-5 p-5 sm:p-7">
      {care.actualServiceId ? <SurfaceCard className="grid gap-2 p-4 text-sm"><p className="font-black">확정된 실제 시술</p><p>{service.services.join(" · ")} · {service.serviceDate}</p><p className="text-[var(--app-muted)]">{service.designerNotes || "현장 조정 기록 없음"}</p><p className="text-xs text-[var(--app-muted)]">실제 시술 원본은 잠그고 아래 관리·걱정·만족도만 새 버전으로 갱신합니다.</p></SurfaceCard> : <>
        <ChoiceGroup label="실제로 받은 시술 (복수 선택)" values={["커트","펌","염색","클리닉"]} selected={service.services} onToggle={toggle} />
        <label className="grid gap-2 text-sm font-black">시술일<input type="date" value={service.serviceDate || ""} onChange={(event) => setService({ ...service, serviceDate: event.target.value || null })} className="app-input min-h-11 px-3" /></label>
        <TextField label="디자이너가 실제로 조정한 내용" value={service.designerNotes} onChange={(designerNotes) => setService({ ...service, designerNotes })} />
      </>}
      {care.actualServiceId ? <>
        {notificationStatus ? <SurfaceCard className="grid gap-3 p-4 text-sm" data-aftercare-email-preference="true"><div><p className="font-black">에프터케어 이메일 알림</p><p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">{notificationStatus === "active" ? "예약된 미래 관리 메일을 받고 있습니다." : "알림을 쉬는 중입니다. 재개해도 이미 지난 메일은 소급 발송하지 않습니다."}</p></div><button type="button" onClick={() => void toggleNotifications()} disabled={notificationSaving} className="min-h-11 border border-[var(--app-border)] bg-[var(--app-surface)] px-4 font-black disabled:opacity-50">{notificationSaving ? "변경 중…" : notificationStatus === "active" ? "이메일 알림 일시정지" : "미래 알림 다시 받기"}</button></SurfaceCard> : null}
        <TextField label="오늘 할 관리" value={care.today.join(", ")} onChange={(value) => setCare({ ...care, today: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
        <div className="grid gap-2">{care.checkpoints.map((checkpoint, index) => <button key={checkpoint.offset} type="button" onClick={() => setCare({ ...care, checkpoints: care.checkpoints.map((item, itemIndex) => itemIndex === index ? { ...item, complete: !item.complete } : item) })} aria-pressed={checkpoint.complete} className={`flex min-h-14 items-center justify-between border px-4 text-left ${checkpoint.complete ? "border-[var(--app-success)] bg-[var(--app-success-bg)]" : "border-[var(--app-border)]"}`}><span className="font-black">{checkpoint.offset}</span><span className="text-xs text-[var(--app-muted)]">{checkpoint.action}</span></button>)}</div>
        <label className="grid gap-2 text-sm font-black">만족도 · {care.satisfaction ?? "미입력"}<input type="range" min="1" max="5" value={care.satisfaction ?? 3} onChange={(event) => setCare({ ...care, satisfaction: Number(event.target.value) })} /></label>
        <TextField label="걱정되는 점·변화 기록" value={care.concerns.join(", ")} onChange={(value) => setCare({ ...care, concerns: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
      </> : <SurfaceCard className="p-4 text-sm leading-6 text-[var(--app-muted)]">실제 시술을 확정하면 선택 헤어·분석 근거·디자이너 브리프를 연결해 오늘 행동과 네 개 체크포인트를 자동 생성합니다.</SurfaceCard>}
      <label className="grid gap-2 text-sm font-black">시술 후 사진 (선택)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setAfterPhoto(event.target.files?.[0] ?? null); setAfterPhotoConsent(false); }} className="app-input min-h-11 px-3 py-2 font-normal" /></label>
      {afterPhoto ? <label className="flex min-h-11 items-start gap-3 border border-[var(--app-border)] p-3 text-sm"><input type="checkbox" checked={afterPhotoConsent} onChange={(event) => setAfterPhotoConsent(event.target.checked)} className="mt-1" /><span><strong className="block">시술 결과 사진 사용 동의</strong><span className="mt-1 block text-xs leading-5 text-[var(--app-muted)]">선택한 사진은 비공개 Storage에 저장되며 이 실제 시술의 관리 기록과 다음 상담에만 사용됩니다.</span></span></label> : null}
      {care.afterPhotoUpload ? <p className="text-xs font-bold text-[var(--app-success)]">시술 후 사진 저장 완료 · {new Date(care.afterPhotoUpload.uploadedAt).toLocaleDateString("ko-KR")}</p> : null}
      {error ? <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}
      <SaveStageButton loading={saving || syncing} disabled={!service.services.length || !service.serviceDate || Boolean(afterPhoto && !afterPhotoConsent)} onClick={() => void saveAftercare()}>{care.actualServiceId ? "관리 프로그램 새 버전 저장" : "실제 시술 확정하고 관리 프로그램 자동 생성"}</SaveStageButton>
    </Panel>
  } output={<div className="grid gap-4"><SurfaceCard className="p-5"><p className="app-kicker">시술 기록과 일상 관리</p><h2 className="mt-3 text-xl font-black">실제로 받은 시술을 기준으로 관리합니다</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">실제 시술을 확정하면 오늘 할 관리와 시점별 확인 항목을 이어서 볼 수 있습니다.</p><div className="mt-5"><DefinitionRows items={[
      { label: "Selected style", value: selected?.label || "선택 기록 없음" },
      { label: "Actual services", value: service.services.join(" · ") || "입력 대기" },
      { label: "Service date", value: service.serviceDate || "입력 대기" },
      { label: "Program version", value: care.programVersion ? `v${care.programVersion}` : "초안" },
      { label: "Checkpoints", value: `${care.checkpoints.filter((item) => item.complete).length} / ${care.checkpoints.length} 완료` },
      { label: "After photo", value: care.afterPhotoUpload ? "비공개 저장 완료" : "없음" },
    ]} /></div></SurfaceCard>{care.actualServiceId?<AftercareCheckinPanel consultationId={snapshot.sessionId} actualServiceId={care.actualServiceId}/>:null}{care.today.length ? <SurfaceCard className="grid gap-4 p-5"><div><p className="app-kicker">오늘의 관리</p><h3 className="mt-2 text-lg font-black">오늘부터 바로 실행할 관리</h3></div><ul className="grid gap-2 text-sm leading-6">{care.today.map((action) => <li key={action} className="border-l-2 border-[var(--app-border-strong)] pl-3">{action}</li>)}</ul><div className="grid gap-2">{care.checkpoints.map((checkpoint) => <div key={checkpoint.offset} className="grid gap-1 border-t border-[var(--app-border)] pt-3 sm:grid-cols-[4rem_1fr]"><strong>{checkpoint.offset}</strong><span className="text-sm leading-6 text-[var(--app-muted)]">{checkpoint.action}</span></div>)}</div>{care.concerns.length ? <div><p className="text-xs font-black uppercase text-[var(--app-muted)]">주의·관찰</p><p className="mt-2 text-sm leading-6">{care.concerns.join(" · ")}</p></div> : null}</SurfaceCard> : null}{snapshot.photo.generationId && selected ? <Link href={`/result/${encodeURIComponent(snapshot.photo.generationId)}?variant=${encodeURIComponent(selected.previewId)}`} className="inline-flex min-h-11 items-center justify-center border border-[var(--app-border)] bg-[var(--app-surface)] px-4 text-sm font-black">기존 결과 열기</Link> : null}<ConsultationSystemData snapshot={snapshot} items={[
      { label: "Actual service lock", value: care.actualServiceId ? "원본 잠김" : "미확정" },
      { label: "Concern log", value: `${care.concerns.length}건` },
      { label: "Satisfaction", value: care.satisfaction ? `${care.satisfaction} / 5` : "미입력" },
    ]} /></div>} />;
}

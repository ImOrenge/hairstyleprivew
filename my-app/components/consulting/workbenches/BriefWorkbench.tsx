"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { AftercareProgramV2, SalonBriefV2 } from "@hairfit/shared/v2";
import { createClientConsultationTask, selectedStyle, type ConsultationPatch, type ConsultationSnapshot, type SalonBriefVersion } from "../../../lib/consulting/contracts";
import { getSiteUrl } from "../../../lib/site-url";
import { Button } from "../../ui/Button";
import { useConsultationTaskRuntime } from "../transition/ConsultationTaskRuntime";
import { ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, TextField, WorkbenchGrid } from "./shared";

function StructuredBriefDetails({ brief }: { brief: SalonBriefV2 }) {
  const recommendationSourceLabels: Record<keyof SalonBriefV2["recommendationSources"], string> = {
    cut: "커트 방향",
    volumeTexture: "볼륨과 질감",
    color: "컬러 방향",
    styling: "손질 방법",
    cautions: "시술 전 확인 사항",
    maintenance: "유지 관리",
    aftercare: "시술 후 관리",
    fashion: "패션 연계",
  };
  const styleTargetLabel = brief.inputSnapshot.styleTarget === "male"
    ? "남성형 헤어 기준"
    : brief.inputSnapshot.styleTarget === "female"
      ? "여성형 헤어 기준"
      : "중성형 헤어 기준";
  const detailRows = [
    { label: "상담 목표", value: brief.details.consultationGoals.join(" · ") || "미확인" },
    { label: "현재 모발", value: brief.details.currentHair.join(" · ") || "미확인" },
    { label: "선택 근거", value: brief.details.decisionRationale.join(" · ") || "미확인" },
    { label: "얼굴·분석 근거", value: brief.details.evidence.join(" · ") || "미확인" },
    { label: "퍼스널 컬러", value: brief.details.personalColor.join(" · ") || "미확인" },
    { label: "커트", value: brief.details.services.cut.join(" · ") || "미확인" },
    { label: "펌", value: brief.details.services.perm.join(" · ") || "미확인" },
    { label: "컬러", value: brief.details.services.color.join(" · ") || "미확인" },
    { label: "길이·볼륨", value: [brief.details.design.length, brief.details.design.volume].filter(Boolean).join(" · ") || "미확인" },
    { label: "앞머리·가르마", value: brief.details.design.fringeParting || "미확인" },
    { label: "질감", value: brief.details.design.texture || "미확인" },
    { label: "관리·유지", value: brief.details.maintenance.join(" · ") || "미확인" },
    { label: "홈케어·Aftercare", value: brief.details.aftercare.join(" · ") || "미확인" },
    { label: "패션 연계", value: brief.details.fashionLink.join(" · ") || "미확인" },
    { label: "디자이너 메모", value: brief.details.designerNotes.join(" · ") || "미확인" },
    { label: "추가 확인", value: brief.details.unresolved.join(" · ") || "없음" },
  ];

  return <SurfaceCard className="p-5" data-brief-engine={brief.engine.id}>
    <p className="app-kicker">미용실 전달용 상세 정보</p>
    <h2 className="mt-2 text-xl font-black">살롱 전달용 상세 브리프</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">확정한 헤어 방향과 상담 내용을 미용사가 바로 확인할 수 있는 시술 항목으로 정리했습니다. 확인되지 않은 내용은 현장에서 다시 확인하도록 표시합니다.</p>
    <div className="mt-5"><DefinitionRows items={detailRows} /></div>
    <div className="mt-5 border-t border-[var(--app-border)] pt-4"><DefinitionRows items={[
      { label: "스타일 적용 기준", value: styleTargetLabel },
      { label: "정리 방식", value: brief.engine.mode === "recycled-blueprint" ? "헤어 설계 기준 반영" : "현재 상담 기준 반영" },
      { label: "확인한 상담 정보", value: `${brief.inputSnapshot.provenance.length}개 항목` },
      { label: "시술 제안에 반영한 내용", value: (Object.keys(brief.recommendationSources) as Array<keyof SalonBriefV2["recommendationSources"]>).map((key) => recommendationSourceLabels[key]).join(" · ") || "확정 헤어와 상담 요청" },
    ]} /></div>
  </SurfaceCard>;
}

export function BriefWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">, options?: { navigate?: boolean }) => Promise<unknown>; saving: boolean }) {
  const taskRuntime = useConsultationTaskRuntime();
  const style = selectedStyle(snapshot);
  const initial = useMemo<SalonBriefVersion>(() => snapshot.salonBrief.createdAt ? snapshot.salonBrief : {
    ...snapshot.salonBrief,
    summary: style ? `${style.label}: ${style.reason}` : "",
    cut: style?.services.includes("커트") ? "확정한 스타일의 기장과 레이어 시작점을 기준으로 현장에서 미세 조정" : "커트 필요 여부를 현장에서 확인",
    volumeTexture: `정수리 ${snapshot.strategy.crownVolume}, 사이드 ${snapshot.strategy.sideVolume}, 질감 ${snapshot.strategy.texture}`,
    styling: style?.maintenance || "관리 범위 확인",
    caution: style?.limitations || [],
  }, [snapshot.salonBrief, snapshot.strategy, style]);
  const [brief, setBrief] = useState(initial);
  const [structuredBrief, setStructuredBrief] = useState<SalonBriefV2 | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const [serviceDate, setServiceDate] = useState(snapshot.actualService.serviceDate ?? "");
  const [actualServices, setActualServices] = useState<string[]>(snapshot.actualService.services);
  const [serviceNotes, setServiceNotes] = useState(snapshot.actualService.designerNotes);
  const [registeringService, setRegisteringService] = useState(false);
  const autoBriefAttempted = useRef(false);

  useEffect(() => {
    if (!snapshot.salonBrief.createdAt) return;
    let cancelled = false;
    void fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/salon-brief`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { brief?: SalonBriefV2 | null; error?: string };
        if (!response.ok) throw new Error(data.error || "상세 Salon Brief를 불러오지 못했습니다.");
        if (!cancelled) setStructuredBrief(data.brief ?? null);
      })
      .catch((cause) => { if (!cancelled) setShareError(cause instanceof Error ? cause.message : "상세 Salon Brief를 불러오지 못했습니다."); });
    return () => { cancelled = true; };
  }, [snapshot.salonBrief.createdAt, snapshot.sessionId]);

  useEffect(() => {
    if (snapshot.salonBrief.createdAt || autoBriefAttempted.current) return;
    autoBriefAttempted.current = true;
    const taskId = `brief:${snapshot.sessionId}:auto`;
    taskRuntime.startTask(createClientConsultationTask({ id: taskId, kind: "brief", stage: "salon-brief", originStage: "decision", destinationStage: "salon-brief", phaseKey: "summary", label: "Salon Brief 자동 생성", detail: "확정 헤어의 분석 근거와 디자이너 브리프를 실행 문서로 연결합니다.", completedUnits: 0, totalUnits: 3 }));
    void fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/salon-brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `${snapshot.sessionId}:brief:auto` },
      body: JSON.stringify({}),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { brief?: SalonBriefV2; error?: string };
      if (!response.ok || !data.brief) throw new Error(data.error || "Salon Brief를 자동 생성하지 못했습니다.");
      const generated = data.brief;
      setStructuredBrief(generated);
      const fieldText = (value: Record<string, unknown>) => {
        const candidate = value.instruction ?? value.direction;
        return typeof candidate === "string" ? candidate : JSON.stringify(value);
      };
      const next: SalonBriefVersion = {
        ...initial,
        version: generated.version,
        mode: generated.audience,
        summary: generated.summary,
        cut: fieldText(generated.cut),
        volumeTexture: fieldText(generated.volumeTexture),
        styling: generated.styling.join(" · "),
        caution: generated.cautions,
        rawFaceIncluded: false,
        createdAt: generated.createdAt,
      };
      setBrief(next);
      taskRuntime.updateTask({ phaseKey: "constraints", phaseIndex: 2, completedUnits: 2, partialOutputCount: generated.cautions.length + generated.styling.length, detail: "커트·질감·스타일링·주의사항을 서버 버전에 연결했습니다." });
      const result = await mutate({ salonBrief: next, completeStage: "salon-brief", currentStage: "salon-brief" }, { navigate: false }) as { ok?: boolean };
      if (!result.ok) throw new Error("자동으로 만든 브리프를 현재 상담에 저장하지 못했습니다.");
      taskRuntime.completeTask({ completedUnits: 3, totalUnits: 3, partialOutputCount: generated.cautions.length + generated.styling.length + 1 });
    }).catch((cause) => {
      const message = cause instanceof Error ? cause.message : "Salon Brief를 자동 생성하지 못했습니다.";
      setShareError(message);
      taskRuntime.failTask(message);
    });
  }, [initial, mutate, snapshot.salonBrief.createdAt, snapshot.sessionId, taskRuntime]);

  const createShare = async () => {
    setShareLoading(true); setShareError(null);
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours: brief.shareExpiryHours }) });
      const data = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!response.ok || !data.token) throw new Error(data.error || "공유 링크를 만들지 못했습니다.");
      setShareUrl(`${getSiteUrl()}/consulting/share/${data.token}`);
    } catch (error) { setShareError(error instanceof Error ? error.message : "공유 링크를 만들지 못했습니다."); }
    finally { setShareLoading(false); }
  };

  const revokeShare = async () => {
    setShareLoading(true); setShareError(null);
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}/share`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { revokedAt?: string; error?: string };
      if (!response.ok || !data.revokedAt) throw new Error(data.error || "공유 권한을 폐기하지 못했습니다.");
      setShareUrl(null);
      await mutate({ salonBrief: { ...brief, shareRevokedAt: data.revokedAt } });
    } catch (error) { setShareError(error instanceof Error ? error.message : "공유 권한을 폐기하지 못했습니다."); }
    finally { setShareLoading(false); }
  };

  const saveBrief = async () => {
    const version = snapshot.salonBrief.createdAt ? snapshot.salonBrief.version + 1 : 1;
    setSavingBrief(true);
    setShareError(null);
    taskRuntime.startTask(createClientConsultationTask({ id: `brief:${snapshot.sessionId}:v${version}`, kind: "brief", stage: "salon-brief", originStage: "salon-brief", destinationStage: "salon-brief", phaseKey: "summary", label: "Salon Brief 갱신", detail: "수정한 상담 요청과 제약 조건을 새 버전으로 저장합니다.", completedUnits: 0, totalUnits: 3 }));
    try {
      const v2Response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/salon-brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `${snapshot.sessionId}:brief:${version}` },
        body: JSON.stringify({ brief: {
          audience: brief.mode,
          summary: brief.summary,
          cut: { instruction: brief.cut },
          volumeTexture: { instruction: brief.volumeTexture },
          color: snapshot.colorDecision.state === "confirmed"
            ? { instruction: `${snapshot.colorDecision.colorName} ${snapshot.colorDecision.swatchHex} · ${snapshot.colorDecision.technique} · 강도 ${snapshot.colorDecision.intensity}%`, provenance: snapshot.colorDecision.id }
            : snapshot.colorDecision.state === "keep-current"
              ? { instruction: "현재 모발 색상 유지", provenance: snapshot.colorDecision.id }
              : snapshot.strategy.color ? { instruction: snapshot.strategy.color } : null,
          styling: [brief.styling],
          cautions: brief.caution,
        } }),
      });
      const v2Error = (await v2Response.json().catch(() => ({}))) as { brief?: SalonBriefV2; error?: string };
      const v2Disabled = v2Response.status === 404 && v2Error.error === "HairFit V2 feature is disabled.";
      if (!v2Disabled && !v2Response.ok) {
        throw new Error(v2Error.error || "V2 살롱 브리프를 저장하지 못했습니다.");
      }
      if (v2Error.brief) setStructuredBrief(v2Error.brief);
      taskRuntime.updateTask({ phaseKey: "constraints", phaseIndex: 2, completedUnits: 2, partialOutputCount: 2, detail: "서버가 브리프 내용과 제약 조건을 저장했습니다." });
      const result = await mutate({ salonBrief: { ...brief, version, rawFaceIncluded: false, createdAt: new Date().toISOString() }, completeStage: "salon-brief", currentStage: "salon-brief" }, { navigate: false }) as { ok?: boolean };
      if (!result.ok) throw new Error("살롱 브리프를 현재 상담에 저장하지 못했습니다.");
      taskRuntime.completeTask({ completedUnits: 3, totalUnits: 3, partialOutputCount: 3 });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "살롱 브리프를 저장하지 못했습니다.";
      setShareError(message);
      taskRuntime.failTask(message);
    } finally {
      setSavingBrief(false);
    }
  };

  const registerActualService = async () => {
    if (!serviceDate || !actualServices.length) return;
    setRegisteringService(true);
    setShareError(null);
    taskRuntime.startTask(createClientConsultationTask({ id: `aftercare:${snapshot.sessionId}:${serviceDate}`, kind: "aftercare-preparation", stage: "salon-brief", originStage: "salon-brief", destinationStage: "aftercare", phaseKey: "actual-service", label: "Aftercare 프로그램 준비", detail: "실제 시술 기록을 기준으로 오늘 행동과 다음 체크포인트를 구성합니다.", completedUnits: 0, totalUnits: 3 }));
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/aftercare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `${snapshot.sessionId}:actual-service:${serviceDate}:${[...actualServices].sort().join("-")}` },
        body: JSON.stringify({
          services: actualServices,
          serviceDate,
          designerNotes: serviceNotes,
          today: [],
          checkpoints: [],
          concerns: [],
          satisfaction: null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { program?: AftercareProgramV2; error?: string };
      if (!response.ok || !data.program) throw new Error(data.error || "실제 시술 기록을 저장하지 못했습니다.");
      taskRuntime.updateTask({ phaseKey: "schedule", phaseIndex: 1, completedUnits: 1, partialOutputCount: data.program.today.length, detail: "실제 시술 기록과 오늘의 관리 행동을 서버에서 받았습니다." });
      const result = await mutate({
        actualService: { services: actualServices, serviceDate, designerNotes: serviceNotes, confirmedAt: new Date().toISOString() },
        careProgram: {
          ...snapshot.careProgram,
          actualServiceId: data.program.actualServiceId,
          programVersion: data.program.version,
          today: data.program.today,
          checkpoints: data.program.checkpoints,
          concerns: data.program.concerns,
          satisfaction: data.program.satisfaction,
        },
        currentStage: "aftercare",
      }, { navigate: false }) as { ok?: boolean };
      if (!result.ok) throw new Error("애프터케어 프로그램을 현재 상담에 저장하지 못했습니다.");
      taskRuntime.updateTask({ phaseKey: "checkpoints", phaseIndex: 2, completedUnits: 2, partialOutputCount: data.program.today.length + data.program.checkpoints.length, detail: "관리 일정과 확인 항목을 현재 상담에 저장했습니다." });
      taskRuntime.completeTask({ completedUnits: 3, totalUnits: 3, partialOutputCount: data.program.today.length });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "실제 시술 기록을 저장하지 못했습니다.";
      setShareError(message);
      taskRuntime.failTask(message);
    } finally {
      setRegisteringService(false);
    }
  };

  return <WorkbenchGrid input={
    <Panel className="grid gap-5 p-5 sm:p-7">
      <div className="flex gap-2">{(["customer","designer"] as const).map((mode) => <button key={mode} type="button" onClick={() => setBrief({ ...brief, mode })} aria-pressed={brief.mode === mode} className={`min-h-11 border px-4 text-sm font-black ${brief.mode === mode ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{mode === "customer" ? "고객용" : "디자이너용"}</button>)}</div>
      <TextField label="상담 요약" value={brief.summary} onChange={(summary) => setBrief({ ...brief, summary })} />
      <TextField label="커트 방향" value={brief.cut} onChange={(cut) => setBrief({ ...brief, cut })} />
      <TextField label="볼륨·질감" value={brief.volumeTexture} onChange={(volumeTexture) => setBrief({ ...brief, volumeTexture })} />
      <TextField label="스타일링" value={brief.styling} onChange={(styling) => setBrief({ ...brief, styling })} />
      <TextField label="주의·현장 확인 사항" value={brief.caution.join(", ")} onChange={(value) => setBrief({ ...brief, caution: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
      <fieldset className="grid gap-3 border-t border-[var(--app-border)] pt-5"><legend className="text-sm font-black">미용사 응답 · 별도 기록</legend><div className="flex flex-wrap gap-2">{([
        ["feasible", "구현 가능"], ["adjustment-needed", "일부 조정"], ["in-person-review", "현장 상담"],
      ] as const).map(([status, label]) => <button key={status} type="button" aria-pressed={brief.designerFeedback?.status === status} onClick={() => setBrief({ ...brief, designerFeedback: { status, note: brief.designerFeedback?.note ?? "", revision: (snapshot.salonBrief.designerFeedback?.revision ?? 0) + 1, receivedAt: new Date().toISOString() } })} className={`min-h-11 border px-3 text-sm font-black ${brief.designerFeedback?.status === status ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{label}</button>)}</div><TextField label="미용사 메모" value={brief.designerFeedback?.note ?? ""} onChange={(note) => setBrief({ ...brief, designerFeedback: { status: brief.designerFeedback?.status ?? "in-person-review", note, revision: (snapshot.salonBrief.designerFeedback?.revision ?? 0) + 1, receivedAt: new Date().toISOString() } })} /><p className="text-xs text-[var(--app-muted)]">미용사 응답은 브리프에 별도로 저장되며 확정한 헤어는 바꾸지 않습니다.</p></fieldset>
      <fieldset><legend className="text-sm font-black">공유 만료</legend><div className="mt-2 flex gap-2">{([24,168,720] as const).map((hours) => <button key={hours} type="button" onClick={() => setBrief({ ...brief, shareExpiryHours: hours, shareRevokedAt: null })} className={`min-h-11 border px-3 text-sm font-black ${brief.shareExpiryHours === hours ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : ""}`}>{hours === 24 ? "24시간" : hours === 168 ? "7일" : "30일"}</button>)}</div></fieldset>
      <SaveStageButton loading={saving || savingBrief} disabled={!style || !brief.summary.trim()} onClick={() => void saveBrief()}>브리프 버전 저장</SaveStageButton>
      <details className="border border-[var(--app-border)] p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-black">시술을 받은 뒤 기록하기</summary><div className="mt-3 grid gap-4">
        <div><p className="app-kicker">시술 후에만 사용</p><h3 className="mt-2 text-lg font-black">실제로 받은 시술 기록</h3><p className="mt-1 text-sm text-[var(--app-muted)]">상담을 진행하기 위해 지금 입력할 필요는 없습니다. 시술 종류와 날짜가 정해진 뒤 기록하면 애프터케어가 열립니다.</p></div>
        <div className="flex flex-wrap gap-2">{["커트", "펌", "염색", "클리닉"].map((service) => <button key={service} type="button" aria-pressed={actualServices.includes(service)} onClick={() => setActualServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service])} className={`min-h-11 border px-3 text-sm font-black ${actualServices.includes(service) ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{service}</button>)}</div>
        <label className="grid gap-2 text-sm font-black">실제 시술일<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} className="app-input min-h-11 px-3" /></label>
        <TextField label="현장 조정 메모" value={serviceNotes} onChange={setServiceNotes} />
        <Button type="button" variant="secondary" loading={registeringService} disabled={!serviceDate || !actualServices.length || Boolean(snapshot.actualService.confirmedAt)} onClick={() => void registerActualService()}>{snapshot.actualService.confirmedAt ? "실제 시술 기록 완료" : "실제 시술 기록 후 Aftercare 열기"}</Button>
      </div></details>
    </Panel>
  } output={<div className="grid gap-4">
      {structuredBrief ? <StructuredBriefDetails brief={structuredBrief} /> : null}
      <SurfaceCard className="p-5"><p className="app-kicker">미용실에 보여줄 브리프</p><h2 className="mt-3 text-xl font-black">{style?.label || "선택 대기"}</h2><p className="mt-3 text-sm leading-6">{brief.summary}</p><div className="mt-5"><DefinitionRows items={[
        { label: "문서 대상", value: brief.mode === "customer" ? "고객용" : "디자이너용" },
        { label: "커트", value: brief.cut || "입력 대기" },
        { label: "볼륨·질감", value: brief.volumeTexture || "입력 대기" },
        { label: "손질 방법", value: brief.styling || "입력 대기" },
        { label: "현장에서 확인할 점", value: brief.caution.join(" · ") || "없음" },
        { label: "미용사 의견", value: brief.designerFeedback ? `${brief.designerFeedback.status}${brief.designerFeedback.note ? ` · ${brief.designerFeedback.note}` : ""}` : "응답 대기" },
        { label: "원본 얼굴 사진", value: "공유하지 않음" },
      ]} /></div></SurfaceCard>
      <SurfaceCard className="p-5 text-sm leading-6 text-[var(--app-muted)]"><p className="font-black text-[var(--app-text)]">개인정보 기본값</p><p className="mt-2">원본 얼굴 사진은 공유 자료·QR·PDF에 포함하지 않습니다. 공유 링크는 만료 시간을 가지며 언제든 폐기할 수 있습니다.</p>{shareError ? <p className="mt-3 text-[var(--app-danger)]">{shareError}</p> : null}<div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="secondary" loading={shareLoading} disabled={!snapshot.salonBrief.createdAt} onClick={() => void createShare()}>QR 공유 만들기</Button><Button type="button" variant="ghost" loading={shareLoading} disabled={!shareUrl} onClick={() => void revokeShare()}>공유 권한 폐기</Button></div>{shareUrl ? <div className="mt-5 grid justify-items-start gap-3"><div className="border border-[var(--app-border)] p-3" style={{ backgroundColor: "#fff" }}><QRCodeSVG value={shareUrl} size={148} bgColor="#fff" fgColor="#000" title="살롱 브리프 공유 QR 코드" /></div><button type="button" className="break-all text-left text-xs font-bold underline" onClick={() => void navigator.clipboard.writeText(shareUrl)}>공유 URL 복사 · {shareUrl}</button></div> : null}</SurfaceCard>
      <ConsultationSystemData snapshot={snapshot} items={[
        { label: "브리프 상태", value: snapshot.salonBrief.createdAt ? "저장됨" : "작성 중" },
        { label: "공유 유효 시간", value: `${brief.shareExpiryHours}시간` },
        { label: "공유 상태", value: shareUrl ? "QR 발급됨" : snapshot.salonBrief.shareRevokedAt ? "폐기됨" : "공유 전" },
      ]} />
    </div>} />;
}

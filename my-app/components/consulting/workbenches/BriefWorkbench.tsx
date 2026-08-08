"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { ConsultationPatch, ConsultationSnapshot, SalonBriefVersion } from "../../../lib/consulting/contracts";
import { selectedStyle } from "../../../lib/consulting/contracts";
import { getSiteUrl } from "../../../lib/site-url";
import { Button } from "../../ui/Button";
import { Panel, SaveStageButton, SurfaceCard, TextField, WorkbenchGrid } from "./shared";

export function BriefWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const style = selectedStyle(snapshot);
  const initial = useMemo<SalonBriefVersion>(() => snapshot.salonBrief.createdAt ? snapshot.salonBrief : {
    ...snapshot.salonBrief,
    summary: style ? `${style.label}: ${style.reason}` : "",
    cut: style?.services.includes("커트") ? "선택 스냅샷의 기장과 레이어 시작점을 기준으로 현장에서 미세 조정" : "커트 필요 여부를 현장에서 확인",
    volumeTexture: `정수리 ${snapshot.strategy.crownVolume}, 사이드 ${snapshot.strategy.sideVolume}, 질감 ${snapshot.strategy.texture}`,
    styling: style?.maintenance || "관리 범위 확인",
    caution: style?.limitations || [],
  }, [snapshot.salonBrief, snapshot.strategy, style]);
  const [brief, setBrief] = useState(initial);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

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

  return <WorkbenchGrid>
    <Panel className="grid gap-5 p-5 sm:p-7">
      <div className="flex gap-2">{(["customer","designer"] as const).map((mode) => <button key={mode} type="button" onClick={() => setBrief({ ...brief, mode })} aria-pressed={brief.mode === mode} className={`min-h-11 border px-4 text-sm font-black uppercase ${brief.mode === mode ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{mode}</button>)}</div>
      <TextField label="상담 요약" value={brief.summary} onChange={(summary) => setBrief({ ...brief, summary })} />
      <TextField label="커트 방향" value={brief.cut} onChange={(cut) => setBrief({ ...brief, cut })} />
      <TextField label="볼륨·질감" value={brief.volumeTexture} onChange={(volumeTexture) => setBrief({ ...brief, volumeTexture })} />
      <TextField label="스타일링" value={brief.styling} onChange={(styling) => setBrief({ ...brief, styling })} />
      <fieldset><legend className="text-sm font-black">공유 만료</legend><div className="mt-2 flex gap-2">{([24,168,720] as const).map((hours) => <button key={hours} type="button" onClick={() => setBrief({ ...brief, shareExpiryHours: hours, shareRevokedAt: null })} className={`min-h-11 border px-3 text-sm font-black ${brief.shareExpiryHours === hours ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : ""}`}>{hours === 24 ? "24시간" : hours === 168 ? "7일" : "30일"}</button>)}</div></fieldset>
      <SaveStageButton loading={saving} disabled={!style || !brief.summary.trim()} onClick={() => void mutate({ salonBrief: { ...brief, version: snapshot.salonBrief.createdAt ? snapshot.salonBrief.version + 1 : 1, rawFaceIncluded: false, createdAt: new Date().toISOString() }, completeStage: "salon-brief", currentStage: "aftercare" })}>브리프 버전 저장</SaveStageButton>
    </Panel>
    <div className="grid gap-4">
      <SurfaceCard className="p-5"><p className="app-kicker">SalonBriefVersion</p><h2 className="mt-3 text-xl font-black">{style?.label || "선택 대기"}</h2><p className="mt-3 text-sm leading-6">{brief.summary}</p></SurfaceCard>
      <SurfaceCard className="p-5 text-sm leading-6 text-[var(--app-muted)]"><p className="font-black text-[var(--app-text)]">개인정보 기본값</p><p className="mt-2">원본 얼굴 사진은 공유 자료·QR·PDF에 포함하지 않습니다. 공유 링크는 만료 시간을 가지며 언제든 폐기할 수 있습니다.</p>{shareError ? <p className="mt-3 text-[var(--app-danger)]">{shareError}</p> : null}<div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="secondary" loading={shareLoading} disabled={!snapshot.salonBrief.createdAt} onClick={() => void createShare()}>QR 공유 만들기</Button><Button type="button" variant="ghost" loading={shareLoading} disabled={!shareUrl} onClick={() => void revokeShare()}>공유 권한 폐기</Button></div>{shareUrl ? <div className="mt-5 grid justify-items-start gap-3"><div className="border border-[var(--app-border)] p-3" style={{ backgroundColor: "#fff" }}><QRCodeSVG value={shareUrl} size={148} bgColor="#fff" fgColor="#000" title="살롱 브리프 공유 QR 코드" /></div><button type="button" className="break-all text-left text-xs font-bold underline" onClick={() => void navigator.clipboard.writeText(shareUrl)}>공유 URL 복사 · {shareUrl}</button></div> : null}</SurfaceCard>
    </div>
  </WorkbenchGrid>;
}

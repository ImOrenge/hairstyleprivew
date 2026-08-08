"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Button } from "../../ui/Button";
import { SurfaceCard } from "../../ui/Surface";

export function ConsultationPhotoEvidence({ sessionId, enabled = true }: { sessionId: string; enabled?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState(enabled ? "사진 근거를 불러오려면 주소를 발급해 주세요." : "사진 분석 사용 범위가 선택되지 않았습니다.");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (!enabled) { setMessage("사진 분석 사용 범위가 선택되지 않았습니다."); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(sessionId)}/photo-assets`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { primaryUrl?: string; error?: string };
      if (!response.ok || !data.primaryUrl) throw new Error(data.error || "사진을 불러오지 못했습니다.");
      setUrl(data.primaryUrl); setMessage("10분 동안 유효한 분석용 사진입니다.");
    } catch (error) { setUrl(null); setMessage(error instanceof Error ? error.message : "사진을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  };
  return <SurfaceCard className="overflow-hidden">{url ? <div className="aspect-[4/5] bg-[var(--app-surface-muted)]"><img src={url} alt="상담 분석용 원본 사진" className="h-full w-full object-cover" decoding="async" loading="lazy" onError={() => { setUrl(null); setMessage("사진 주소가 만료되었습니다. 다시 발급해 주세요."); }} /></div> : <div className="flex aspect-[4/5] items-center justify-center p-5 text-center text-sm text-[var(--app-muted)]">{message}</div>}<div className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-xs text-[var(--app-muted)]">{message}</p><Button type="button" variant="ghost" loading={loading} onClick={() => void load()}>signed URL 갱신</Button></div></SurfaceCard>;
}

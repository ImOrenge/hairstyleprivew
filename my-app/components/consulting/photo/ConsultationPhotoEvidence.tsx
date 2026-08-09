"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { AnalysisEvidenceV2 } from "@hairfit/shared/v2";
import { Button } from "../../ui/Button";
import { SurfaceCard } from "../../ui/Surface";
import { FaceEvidenceOverlay } from "./FaceEvidenceOverlay";

interface EvidenceResponse {
  evidence?: AnalysisEvidenceV2;
  overlayEnabled?: boolean;
  error?: string;
}

export function ConsultationPhotoEvidence({
  sessionId,
  enabled = true,
}: {
  sessionId: string;
  enabled?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<AnalysisEvidenceV2 | null>(null);
  const [message, setMessage] = useState(enabled
    ? "사진과 분석 좌표를 불러오려면 주소를 발급해 주세요."
    : "사진 분석 사용 범위가 선택되지 않았습니다.");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!enabled) {
      setMessage("사진 분석 사용 범위가 선택되지 않았습니다.");
      return;
    }
    setLoading(true);
    try {
      const [photoResponse, evidenceResponse] = await Promise.all([
        fetch(`/api/consultations/${encodeURIComponent(sessionId)}/photo-assets`, { cache: "no-store" }),
        fetch(`/api/v2/consultations/${encodeURIComponent(sessionId)}/evidence`, { cache: "no-store" }),
      ]);
      const photoData = (await photoResponse.json().catch(() => ({}))) as { primaryUrl?: string; error?: string };
      const evidenceData = (await evidenceResponse.json().catch(() => ({}))) as EvidenceResponse;
      if (!photoResponse.ok || !photoData.primaryUrl) {
        throw new Error(photoData.error || "사진을 불러오지 못했습니다.");
      }
      setUrl(photoData.primaryUrl);
      const nextEvidence = evidenceResponse.ok && evidenceData.overlayEnabled !== false ? evidenceData.evidence ?? null : null;
      const geometryCount = (nextEvidence?.landmarks.length ?? 0)
        + (nextEvidence?.contours.length ?? 0)
        + (nextEvidence?.measurements.length ?? 0);
      setEvidence(geometryCount > 0 ? nextEvidence : null);
      setMessage(geometryCount > 0
        ? `10분 동안 유효한 사진 · ${nextEvidence?.model.name} 좌표 근거 ${geometryCount}개`
        : evidenceData.overlayEnabled === false
          ? "분석 좌표는 저장됐지만 신뢰 UI 롤백 플래그로 오버레이가 숨겨졌습니다."
          : evidenceData.error || "사진은 불러왔지만 렌더링할 얼굴 좌표 근거가 없습니다.");
    } catch (error) {
      setUrl(null);
      setEvidence(null);
      setMessage(error instanceof Error ? error.message : "사진을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return <SurfaceCard className="overflow-hidden" data-photo-evidence-stage="true">
    {url ? <div className="relative aspect-[4/5] bg-[var(--app-surface-muted)]">
      <img
        src={url}
        alt="상담 분석용 원본 사진"
        className="h-full w-full object-cover"
        decoding="async"
        loading="lazy"
        onError={() => {
          setUrl(null);
          setEvidence(null);
          setMessage("사진 주소가 만료되었습니다. 다시 발급해 주세요.");
        }}
      />
      {evidence ? <FaceEvidenceOverlay evidence={evidence} /> : null}
    </div> : <div className="flex aspect-[4/5] items-center justify-center p-5 text-center text-sm text-[var(--app-muted)]">{message}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="text-xs text-[var(--app-muted)]" aria-live="polite">{message}</p>
      <Button type="button" variant="ghost" loading={loading} onClick={() => void load()}>signed URL 갱신</Button>
    </div>
  </SurfaceCard>;
}

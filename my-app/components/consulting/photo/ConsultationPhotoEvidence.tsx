"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { effectiveEvidencePointV2, type AnalysisEvidenceV2, type FaceObservationBundleV2, type NormalizedPointV2 } from "@hairfit/shared/v2";
import { Button } from "../../ui/Button";
import { SurfaceCard } from "../../ui/Surface";
import { FaceEvidenceOverlay, type FaceEvidenceLayer } from "./FaceEvidenceOverlay";

interface EvidenceResponse {
  evidence?: AnalysisEvidenceV2;
  observation?: FaceObservationBundleV2 | null;
  overlayEnabled?: boolean;
  error?: string;
}

export function ConsultationPhotoEvidence({
  sessionId,
  enabled = true,
  activeEvidenceId = null,
  onEvidenceSelect,
  onEvidenceLoad,
  allowCorrections = false,
}: {
  sessionId: string;
  enabled?: boolean;
  activeEvidenceId?: string | null;
  onEvidenceSelect?: (evidenceId: string) => void;
  onEvidenceLoad?: (evidence: AnalysisEvidenceV2 | null) => void;
  allowCorrections?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<AnalysisEvidenceV2 | null>(null);
  const [observation, setObservation] = useState<FaceObservationBundleV2 | null>(null);
  const [message, setMessage] = useState(enabled
    ? "사진과 분석 좌표를 자동으로 불러오고 있습니다."
    : "사진 분석 사용 범위가 선택되지 않았습니다.");
  const [loading, setLoading] = useState(false);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<FaceEvidenceLayer[]>([
    "contour",
    "hairline",
    "measurement",
  ]);
  const automaticRefreshes = useRef(0);
  const overlayObservation = observation?.sourceAssets[0]?.role === "consultation_photo" ? observation : null;

  const toggleLayer = (layer: FaceEvidenceLayer) => setVisibleLayers((current) => current.includes(layer)
    ? current.filter((item) => item !== layer)
    : [...current, layer]);

  const load = useCallback(async (automatic = false) => {
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
      if (!automatic) automaticRefreshes.current = 0;
      const nextEvidence = evidenceResponse.ok && evidenceData.overlayEnabled !== false ? evidenceData.evidence ?? null : null;
      const geometryCount = (nextEvidence?.landmarks.length ?? 0)
        + (nextEvidence?.contours.length ?? 0)
        + (nextEvidence?.measurements.length ?? 0);
      const renderEvidence = geometryCount > 0 ? nextEvidence : null;
      setEvidence(renderEvidence);
      setObservation(evidenceResponse.ok ? evidenceData.observation ?? null : null);
      setSelectedLandmarkId((current) => current && renderEvidence?.landmarks.some((item) => item.id === current)
        ? current
        : renderEvidence?.landmarks[0]?.id ?? null);
      onEvidenceLoad?.(renderEvidence);
      setMessage(geometryCount > 0
        ? `10분 동안 유효한 사진 · ${nextEvidence?.model.name} 좌표 근거 ${geometryCount}개`
        : evidenceData.overlayEnabled === false
          ? "분석 좌표는 저장됐지만 신뢰 UI 롤백 플래그로 오버레이가 숨겨졌습니다."
          : evidenceData.error || "사진은 불러왔지만 렌더링할 얼굴 좌표 근거가 없습니다.");
    } catch (error) {
      setUrl(null);
      setEvidence(null);
      setObservation(null);
      onEvidenceLoad?.(null);
      setMessage(error instanceof Error ? error.message : "사진을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [enabled, onEvidenceLoad, sessionId]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void load(true), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, load]);

  const recoverExpiredAsset = () => {
    setUrl(null);
    setEvidence(null);
    setObservation(null);
    onEvidenceLoad?.(null);
    if (automaticRefreshes.current < 1) {
      automaticRefreshes.current += 1;
      setMessage("사진 주소가 만료되어 자동으로 다시 불러오고 있습니다.");
      void load(true);
      return;
    }
    setMessage("사진 주소 자동 갱신에 실패했습니다. 수동으로 다시 시도해 주세요.");
  };

  const saveLandmarkCorrection = async (adjustedPoint: NormalizedPointV2) => {
    if (!evidence || !selectedLandmarkId) return;
    setCorrectionSaving(true);
    try {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(sessionId)}/evidence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: evidence.correctionRevision,
          targetType: "landmark",
          targetId: selectedLandmarkId,
          pointIndex: 0,
          adjustedPoint,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as EvidenceResponse;
      if (!response.ok || !data.evidence) throw new Error(data.error || "랜드마크 좌표를 저장하지 못했습니다.");
      setEvidence(data.evidence);
      onEvidenceLoad?.(data.evidence);
      setMessage(`AI 원본 좌표를 보존하고 사용자 보정 리비전 ${data.evidence.correctionRevision}을 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "랜드마크 좌표를 저장하지 못했습니다.");
    } finally {
      setCorrectionSaving(false);
    }
  };

  const nudgeLandmark = (x: number, y: number) => {
    if (!evidence || !selectedLandmarkId) return;
    const landmark = evidence.landmarks.find((item) => item.id === selectedLandmarkId);
    if (!landmark) return;
    const current = effectiveEvidencePointV2(evidence, "landmark", landmark.id, 0, landmark.point);
    void saveLandmarkCorrection({
      ...current,
      x: Math.max(0, Math.min(1, current.x + x)),
      y: Math.max(0, Math.min(1, current.y + y)),
    });
  };

  const restoreLandmark = () => {
    const landmark = evidence?.landmarks.find((item) => item.id === selectedLandmarkId);
    if (landmark) void saveLandmarkCorrection(landmark.point);
  };

  return <SurfaceCard className="overflow-hidden" data-photo-evidence-stage="true">
    {url ? <div className="relative aspect-[4/5] bg-[var(--app-surface-muted)]">
      <img
        src={url}
        alt="상담 분석용 원본 사진"
        className="h-full w-full object-cover"
        decoding="async"
        loading="lazy"
        onError={recoverExpiredAsset}
      />
      {evidence ? <FaceEvidenceOverlay
        evidence={evidence}
        visibleLayers={visibleLayers}
        activeEvidenceId={activeEvidenceId}
        onEvidenceSelect={onEvidenceSelect}
        selectedLandmarkId={allowCorrections ? selectedLandmarkId : null}
        onLandmarkSelect={allowCorrections ? setSelectedLandmarkId : undefined}
        observation={overlayObservation}
      /> : null}
    </div> : <div className="flex aspect-[4/5] items-center justify-center p-5 text-center text-sm text-[var(--app-muted)]">{message}</div>}
    <div className="grid gap-3 p-4">
      {evidence ? <fieldset>
        <legend className="text-xs font-black">분석 레이어</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {([
            ["contour", "윤곽"],
            ["hairline", "헤어라인"],
            ["measurement", "측정선"],
            ["skin", "피부 샘플"],
            ["excluded", "컬러 제외"],
          ] as const).map(([layer, label]) => <button
            key={layer}
            type="button"
            onClick={() => toggleLayer(layer)}
            aria-pressed={visibleLayers.includes(layer)}
            className={`min-h-11 border px-3 text-xs font-black ${visibleLayers.includes(layer) ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}
          >{label}</button>)}
        </div>
      </fieldset> : null}
      {observation ? <div className="border border-[var(--app-border)] p-3 text-xs" data-face-observation-summary="true">
        <p className="font-black">컬러 관찰 번들 · {observation.regionSamples.length}개 영역</p>
        <p className="mt-1 text-[var(--app-muted)]">
          유효 피부 픽셀 {Math.round(observation.quality.validSkinPixelRatio * 100)}%
          {observation.quality.crossRegionMaxDeltaE === null ? "" : ` · 영역 차이 ΔE ${observation.quality.crossRegionMaxDeltaE.toFixed(1)}`}
        </p>
        {observation.quality.warnings.map((warning) => <p key={warning.code} className="mt-1 font-bold text-[var(--app-warning)]">{warning.message}</p>)}
      </div> : null}
      {evidence && allowCorrections ? <fieldset className="border border-[var(--app-border)] p-3" disabled={correctionSaving}>
        <legend className="px-1 text-xs font-black">랜드마크 좌표 보정</legend>
        <label className="grid gap-1 text-xs font-bold">
          보정할 AI 기준점
          <select
            value={selectedLandmarkId ?? ""}
            onChange={(event) => setSelectedLandmarkId(event.target.value)}
            className="app-input min-h-11 px-3"
          >
            {evidence.landmarks.map((landmark) => <option key={landmark.id} value={landmark.id}>{landmark.id}</option>)}
          </select>
        </label>
        <div className="mt-3 grid grid-cols-3 gap-2" aria-label="선택 랜드마크 이동">
          <span />
          <button type="button" className="min-h-11 border font-black" onClick={() => nudgeLandmark(0, -0.005)} aria-label="위로 이동">↑</button>
          <span />
          <button type="button" className="min-h-11 border font-black" onClick={() => nudgeLandmark(-0.005, 0)} aria-label="왼쪽으로 이동">←</button>
          <button type="button" className="min-h-11 border px-2 text-xs font-black" onClick={restoreLandmark}>AI 원본</button>
          <button type="button" className="min-h-11 border font-black" onClick={() => nudgeLandmark(0.005, 0)} aria-label="오른쪽으로 이동">→</button>
          <span />
          <button type="button" className="min-h-11 border font-black" onClick={() => nudgeLandmark(0, 0.005)} aria-label="아래로 이동">↓</button>
          <span />
        </div>
        <p className="mt-2 text-[11px] leading-5 text-[var(--app-muted)]">표시 좌표만 0.5% 단위로 보정합니다. AI가 만든 원본 좌표는 덮어쓰지 않고 감사 이력에 함께 보존됩니다.</p>
      </fieldset> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--app-muted)]" aria-live="polite">{message}</p>
        <Button type="button" variant="ghost" loading={loading} onClick={() => void load(false)}>사진 다시 불러오기</Button>
      </div>
    </div>
  </SurfaceCard>;
}

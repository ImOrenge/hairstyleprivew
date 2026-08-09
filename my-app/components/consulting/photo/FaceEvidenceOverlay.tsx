"use client";

import { useState } from "react";
import {
  effectiveEvidencePointV2,
  hasEvidencePointCorrectionV2,
  type AnalysisEvidenceV2,
  type EvidenceCorrectionTargetV2,
  type FacialMeasurementV2,
  type NormalizedPointV2,
} from "@hairfit/shared/v2";

export type FaceEvidenceLayer = "contour" | "hairline" | "measurement" | "skin" | "excluded";

const DEFAULT_VISIBLE_LAYERS: readonly FaceEvidenceLayer[] = [
  "contour",
  "hairline",
  "measurement",
];

const VISIBLE_MEASUREMENTS = new Set([
  "face_length",
  "forehead_width",
  "cheekbone_width",
  "jaw_width",
  "chin_width",
  "vertical_symmetry_axis",
]);

const MEASUREMENT_LABELS: Record<string, string> = {
  face_length: "얼굴 길이",
  forehead_width: "이마 폭",
  cheekbone_width: "광대 폭",
  jaw_width: "턱 폭",
  chin_width: "턱 끝 폭",
  vertical_symmetry_axis: "세로 균형축",
};

function projectedPoint(point: NormalizedPointV2, sourceWidth: number, sourceHeight: number) {
  return { x: point.x * sourceWidth, y: point.y * sourceHeight };
}

function points(pointsValue: readonly NormalizedPointV2[], sourceWidth: number, sourceHeight: number) {
  return pointsValue
    .map((point) => {
      const projected = projectedPoint(point, sourceWidth, sourceHeight);
      return `${projected.x},${projected.y}`;
    })
    .join(" ");
}

function evidenceOpacity(confidence: number) {
  return Math.max(0.42, Math.min(0.94, confidence));
}

function correctedPoints(
  evidence: AnalysisEvidenceV2,
  targetType: EvidenceCorrectionTargetV2,
  targetId: string,
  source: readonly NormalizedPointV2[],
) {
  return source.map((point, index) => effectiveEvidencePointV2(evidence, targetType, targetId, index, point));
}

function MeasurementLine({
  measurement,
  evidence,
  active,
  onActivate,
  sourceWidth,
  sourceHeight,
  unit,
}: {
  measurement: FacialMeasurementV2;
  evidence: AnalysisEvidenceV2;
  active: boolean;
  onActivate: () => void;
  sourceWidth: number;
  sourceHeight: number;
  unit: number;
}) {
  const label = MEASUREMENT_LABELS[measurement.id] || measurement.id;
  const geometry = correctedPoints(evidence, "measurement", measurement.id, measurement.geometry);
  const endpoint = geometry.at(-1);
  return <g
    role="button"
    tabIndex={0}
    aria-label={`${label} 측정 근거`}
    aria-pressed={active}
    data-evidence-id={measurement.id}
    className="cursor-pointer"
    style={{ outline: "none" }}
    onClick={onActivate}
    onFocus={onActivate}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    }}
  >
    <polyline
      points={points(geometry, sourceWidth, sourceHeight)}
      fill="none"
      style={{ fill: "none" }}
      stroke="var(--app-success)"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={unit * (active ? 0.008 : 0.004)}
      opacity={active ? 1 : evidenceOpacity(measurement.confidence)}
    />
    {geometry.map((point, index) => <circle
      key={`${measurement.id}-${index}`}
      cx={point.x * sourceWidth}
      cy={point.y * sourceHeight}
      r={unit * (active ? 0.011 : 0.007)}
      fill="var(--app-success)"
      stroke="var(--app-surface)"
      strokeWidth={unit * 0.003}
    />)}
    {active && endpoint ? <text
      x={Math.min(0.96, endpoint.x + 0.015) * sourceWidth}
      y={Math.max(0.04, endpoint.y - 0.015) * sourceHeight}
      fill="var(--app-inverse-text)"
      stroke="var(--app-inverse)"
      strokeWidth={unit * 0.008}
      paintOrder="stroke"
      fontSize={unit * 0.026}
      fontWeight={900}
    >{label}</text> : null}
  </g>;
}

export function FaceEvidenceOverlay({
  evidence,
  visibleLayers = DEFAULT_VISIBLE_LAYERS,
  activeEvidenceId = null,
  onEvidenceSelect,
  selectedLandmarkId = null,
  onLandmarkSelect,
}: {
  evidence: AnalysisEvidenceV2;
  visibleLayers?: readonly FaceEvidenceLayer[];
  activeEvidenceId?: string | null;
  onEvidenceSelect?: (evidenceId: string) => void;
  selectedLandmarkId?: string | null;
  onLandmarkSelect?: (landmarkId: string) => void;
}) {
  const measurements = evidence.measurements.filter((item) => VISIBLE_MEASUREMENTS.has(item.id));
  const [activeMeasurementId, setActiveMeasurementId] = useState(measurements[0]?.id ?? null);
  const sourceWidth = Math.max(1, evidence.sourceTransform.sourceWidth || 1);
  const sourceHeight = Math.max(1, evidence.sourceTransform.sourceHeight || 1);
  const unit = Math.min(sourceWidth, sourceHeight);
  const visible = new Set(visibleLayers);
  const layerActive = (layer: FaceEvidenceLayer) => activeEvidenceId === layer;
  return <>
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${sourceWidth} ${sourceHeight}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="AI 얼굴 분석 랜드마크"
      data-face-evidence-overlay="true"
    >
      <title>AI 얼굴 분석 랜드마크</title>
      <desc>서버에 저장된 정규화 좌표로 얼굴 윤곽, 핵심 기준점, 추정 헤어라인과 측정선을 표시합니다.</desc>
      {visible.has("contour") ? evidence.contours.map((contour) => <polyline
        key={contour.id}
        data-evidence-id={contour.id}
        data-evidence-source={contour.source}
        data-evidence-active={layerActive("contour") || activeEvidenceId === contour.id}
        points={points(correctedPoints(evidence, "contour", contour.id, contour.points), sourceWidth, sourceHeight)}
        fill="none"
        style={{ fill: "none" }}
        stroke="var(--app-accent)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={unit * (layerActive("contour") || activeEvidenceId === contour.id ? 0.01 : 0.006)}
        opacity={layerActive("contour") || activeEvidenceId === contour.id ? 1 : evidenceOpacity(contour.confidence)}
      />) : null}
      {visible.has("contour") ? evidence.landmarks.map((landmark) => {
        const point = effectiveEvidencePointV2(evidence, "landmark", landmark.id, 0, landmark.point);
        const corrected = hasEvidencePointCorrectionV2(evidence, "landmark", landmark.id, 0);
        const selected = selectedLandmarkId === landmark.id;
        return <circle
          key={landmark.id}
          role={onLandmarkSelect ? "button" : undefined}
          tabIndex={onLandmarkSelect ? 0 : undefined}
          aria-label={onLandmarkSelect ? `${landmark.id} 랜드마크 좌표 보정` : undefined}
          aria-pressed={onLandmarkSelect ? selected : undefined}
          data-landmark-id={landmark.id}
          data-evidence-source={corrected ? "user_adjusted" : landmark.source}
          data-original-x={landmark.point.x}
          data-original-y={landmark.point.y}
          cx={point.x * sourceWidth}
          cy={point.y * sourceHeight}
          r={unit * (selected ? 0.014 : layerActive("contour") ? 0.011 : 0.0075)}
          fill={corrected ? "var(--app-warning)" : "var(--app-accent)"}
          stroke="var(--app-surface)"
          strokeWidth={unit * 0.003}
          opacity={selected || layerActive("contour") ? 1 : evidenceOpacity(landmark.confidence)}
          className={onLandmarkSelect ? "cursor-pointer" : undefined}
          onClick={() => onLandmarkSelect?.(landmark.id)}
          onFocus={() => onLandmarkSelect?.(landmark.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onLandmarkSelect?.(landmark.id);
            }
          }}
        />;
      }) : null}
      {visible.has("hairline") ? evidence.hairline?.lines.map((line) => <polyline
        key={line.id}
        data-evidence-id={line.id}
        data-evidence-source={line.source}
        data-evidence-active={layerActive("hairline") || activeEvidenceId === line.id}
        points={points(correctedPoints(evidence, "hairline", line.id, line.points), sourceWidth, sourceHeight)}
        fill="none"
        style={{ fill: "none" }}
        stroke="var(--app-warning)"
        strokeDasharray={`${unit * 0.014} ${unit * 0.009}`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={unit * (layerActive("hairline") || activeEvidenceId === line.id ? 0.01 : 0.006)}
        opacity={layerActive("hairline") || activeEvidenceId === line.id ? 1 : evidenceOpacity(line.confidence)}
      />) : null}
      {visible.has("skin") ? evidence.skinSampleRegions.map((region) => <polygon
        key={region.id}
        data-evidence-id={region.id}
        data-evidence-source={region.source}
        data-evidence-active={layerActive("skin") || activeEvidenceId === region.id}
        points={points(correctedPoints(evidence, "skin", region.id, region.points), sourceWidth, sourceHeight)}
        fill="var(--app-success)"
        stroke="var(--app-surface)"
        strokeWidth={unit * (layerActive("skin") || activeEvidenceId === region.id ? 0.008 : 0.004)}
        opacity={layerActive("skin") || activeEvidenceId === region.id ? 0.46 : 0.24}
      />) : null}
      {visible.has("excluded") ? evidence.excludedRegions.map((region) => <polygon
        key={region.id}
        data-evidence-id={region.id}
        data-evidence-source={region.source}
        data-evidence-active={layerActive("excluded") || activeEvidenceId === region.id}
        points={points(correctedPoints(evidence, "excluded", region.id, region.points), sourceWidth, sourceHeight)}
        fill="var(--app-danger)"
        stroke="var(--app-danger)"
        strokeDasharray={`${unit * 0.012} ${unit * 0.008}`}
        strokeWidth={unit * (layerActive("excluded") || activeEvidenceId === region.id ? 0.009 : 0.005)}
        opacity={layerActive("excluded") || activeEvidenceId === region.id ? 0.42 : 0.22}
      />) : null}
      {visible.has("measurement") ? measurements.map((measurement) => <MeasurementLine
        key={measurement.id}
        measurement={measurement}
        evidence={evidence}
        active={activeEvidenceId === measurement.id
          || ((activeEvidenceId === "measurement" || activeEvidenceId === null) && activeMeasurementId === measurement.id)}
        onActivate={() => {
          setActiveMeasurementId(measurement.id);
          onEvidenceSelect?.("measurement");
        }}
        sourceWidth={sourceWidth}
        sourceHeight={sourceHeight}
        unit={unit}
      />) : null}
    </svg>
    <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-2" aria-hidden="true">
      {visible.has("contour") ? <span className="border border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-bg)_86%,transparent)] px-2 py-1 text-[10px] font-black text-[var(--app-text)]">감지 좌표</span> : null}
      {visible.has("hairline") ? <span className="border border-[var(--app-warning)] bg-[color-mix(in_srgb,var(--app-bg)_86%,transparent)] px-2 py-1 text-[10px] font-black text-[var(--app-text)]">추정 헤어라인</span> : null}
      {visible.has("skin") ? <span className="border border-[var(--app-success)] bg-[color-mix(in_srgb,var(--app-bg)_86%,transparent)] px-2 py-1 text-[10px] font-black text-[var(--app-text)]">피부 샘플</span> : null}
      {visible.has("excluded") ? <span className="border border-[var(--app-danger)] bg-[color-mix(in_srgb,var(--app-bg)_86%,transparent)] px-2 py-1 text-[10px] font-black text-[var(--app-text)]">컬러 제외</span> : null}
    </div>
  </>;
}

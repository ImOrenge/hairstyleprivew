"use client";

import { useState } from "react";
import type { AnalysisEvidenceV2, FacialMeasurementV2, NormalizedPointV2 } from "@hairfit/shared/v2";

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

function MeasurementLine({
  measurement,
  active,
  onActivate,
  sourceWidth,
  sourceHeight,
  unit,
}: {
  measurement: FacialMeasurementV2;
  active: boolean;
  onActivate: () => void;
  sourceWidth: number;
  sourceHeight: number;
  unit: number;
}) {
  const label = MEASUREMENT_LABELS[measurement.id] || measurement.id;
  const endpoint = measurement.geometry.at(-1);
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
      points={points(measurement.geometry, sourceWidth, sourceHeight)}
      fill="none"
      style={{ fill: "none" }}
      stroke="var(--app-success)"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={unit * (active ? 0.008 : 0.004)}
      opacity={active ? 1 : evidenceOpacity(measurement.confidence)}
    />
    {measurement.geometry.map((point, index) => <circle
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

export function FaceEvidenceOverlay({ evidence }: { evidence: AnalysisEvidenceV2 }) {
  const measurements = evidence.measurements.filter((item) => VISIBLE_MEASUREMENTS.has(item.id));
  const [activeMeasurementId, setActiveMeasurementId] = useState(measurements[0]?.id ?? null);
  const sourceWidth = Math.max(1, evidence.sourceTransform.sourceWidth || 1);
  const sourceHeight = Math.max(1, evidence.sourceTransform.sourceHeight || 1);
  const unit = Math.min(sourceWidth, sourceHeight);
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
      {evidence.contours.map((contour) => <polyline
        key={contour.id}
        data-evidence-id={contour.id}
        data-evidence-source={contour.source}
        points={points(contour.points, sourceWidth, sourceHeight)}
        fill="none"
        style={{ fill: "none" }}
        stroke="var(--app-accent)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={unit * 0.006}
        opacity={evidenceOpacity(contour.confidence)}
      />)}
      {evidence.landmarks.map((landmark) => <circle
        key={landmark.id}
        data-landmark-id={landmark.id}
        data-evidence-source={landmark.source}
        cx={landmark.point.x * sourceWidth}
        cy={landmark.point.y * sourceHeight}
        r={unit * 0.0075}
        fill="var(--app-accent)"
        stroke="var(--app-surface)"
        strokeWidth={unit * 0.003}
        opacity={evidenceOpacity(landmark.confidence)}
      />)}
      {evidence.hairline?.lines.map((line) => <polyline
        key={line.id}
        data-evidence-id={line.id}
        data-evidence-source={line.source}
        points={points(line.points, sourceWidth, sourceHeight)}
        fill="none"
        style={{ fill: "none" }}
        stroke="var(--app-warning)"
        strokeDasharray={`${unit * 0.014} ${unit * 0.009}`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={unit * 0.006}
        opacity={evidenceOpacity(line.confidence)}
      />)}
      {measurements.map((measurement) => <MeasurementLine
        key={measurement.id}
        measurement={measurement}
        active={activeMeasurementId === measurement.id}
        onActivate={() => setActiveMeasurementId(measurement.id)}
        sourceWidth={sourceWidth}
        sourceHeight={sourceHeight}
        unit={unit}
      />)}
    </svg>
    <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-2" aria-hidden="true">
      <span className="border border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-bg)_86%,transparent)] px-2 py-1 text-[10px] font-black text-[var(--app-text)]">감지 좌표</span>
      <span className="border border-[var(--app-warning)] bg-[color-mix(in_srgb,var(--app-bg)_86%,transparent)] px-2 py-1 text-[10px] font-black text-[var(--app-text)]">추정 헤어라인</span>
    </div>
  </>;
}

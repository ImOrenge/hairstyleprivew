"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AnalysisEvidenceV2, FacialMeasurementV2 } from "@hairfit/shared/v2";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { ConsultationPhotoEvidence } from "../photo/ConsultationPhotoEvidence";
import { ConsultationSystemData, DefinitionRows, Panel, SurfaceCard, WorkbenchGrid } from "./shared";

const MEASUREMENT_LABELS: Record<string, string> = {
  face_length: "얼굴 세로 길이",
  forehead_width: "이마 폭",
  cheekbone_width: "광대 폭",
  jaw_width: "턱선 폭",
  chin_width: "턱 끝 폭",
  upper_face_length: "상안부",
  mid_face_length: "중안부",
  lower_face_length: "하안부",
  jaw_angle_left: "왼쪽 턱각",
  jaw_angle_right: "오른쪽 턱각",
  vertical_symmetry_axis: "세로 중심축",
  face_length_ratio: "세로 / 광대 폭",
  forehead_jaw_ratio: "이마 / 턱선 폭",
};

const FACE_SHAPE_LABELS: Record<string, string> = {
  oval: "계란형",
  round: "둥근형",
  oblong: "긴형",
  long: "긴형",
  square: "각진형",
  rectangle: "직사각형",
  angular: "각진형",
  triangle: "삼각형",
};

const FACE_SHAPE_COLORS: Record<string, string> = {
  oval: "var(--face-shape-oval)",
  round: "var(--face-shape-round)",
  oblong: "var(--face-shape-oblong)",
  long: "var(--face-shape-oblong)",
  square: "var(--face-shape-square)",
  rectangle: "var(--face-shape-square)",
  angular: "var(--face-shape-square)",
  triangle: "var(--face-shape-triangle)",
};

function faceShapePercentages(evidence: AnalysisEvidenceV2 | null) {
  if (!evidence) return [];
  const weighted = Object.entries(evidence.faceShape.blend).map(([key, value]) => {
    const shape = key.split(":").at(-1) || key;
    return {
      key,
      label: FACE_SHAPE_LABELS[shape] || shape,
      color: FACE_SHAPE_COLORS[shape] || "var(--app-muted)",
      weight: Math.max(0, Number(value) || 0),
    };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return [];
  const normalized = weighted.map((item) => ({ ...item, rawPercent: (item.weight / total) * 100 }));
  const rows = normalized.map((item) => ({ ...item, percent: Math.floor(item.rawPercent) }));
  let remainder = 100 - rows.reduce((sum, item) => sum + item.percent, 0);
  normalized
    .map((item, index) => ({ index, fraction: item.rawPercent - Math.floor(item.rawPercent) }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => { if (remainder > 0) { rows[index].percent += 1; remainder -= 1; } });
  return rows.sort((a, b) => b.percent - a.percent);
}

function FaceShapeBlendChart({ evidence }: { evidence: AnalysisEvidenceV2 | null }) {
  const rows = faceShapePercentages(evidence);
  if (!rows.length) return <SurfaceCard className="p-5" data-analysis-face-shape-blend="pending">
    <p className="app-kicker">Korean salon face-shape blend</p>
    <p className="mt-3 text-sm text-[var(--app-muted)]">랜드마크 비율을 불러오면 얼굴 윤곽 유사도 그래프가 표시됩니다.</p>
  </SurfaceCard>;
  const stops = rows.reduce<{ end: number; values: string[] }>((result, row) => {
    const end = result.end + row.percent;
    return { end, values: [...result.values, `${row.color} ${result.end}% ${end}%`] };
  }, { end: 0, values: [] }).values;
  const primary = rows[0];
  const reference = primary.key.split(":")[0];
  const referenceLabel = reference === "male" ? "한국 성인 남성 기준" : reference === "female" ? "한국 성인 여성 기준" : "한국 성인 공통 기준";
  const disclosure = reference === "male"
    ? "한국 성인 남성 두상·얼굴 형태 연구의 5개 유형"
    : reference === "female" ? "한국 성인 여성 얼굴형 연구의 5개 유형" : "한국 남녀 연구에서 공통으로 확인되는 5개 유형";
  const chartLabel = rows.map((row) => `${row.label} ${row.percent}%`).join(", ");
  return <SurfaceCard className="f-consulting-face-shape p-5" data-analysis-face-shape-blend="ready">
    <p className="app-kicker">Korean salon face-shape blend</p>
    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-black">가장 가까운 얼굴 윤곽은 {primary.label} {primary.percent}%입니다</h3><span className="text-xs font-black">{referenceLabel}</span></div>
    <div className="mt-5 grid items-center gap-5 sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)]">
      <div className="f-consulting-face-shape__chart" role="img" aria-label={chartLabel} style={{ background: `conic-gradient(${stops.join(", ")})` }}>
        <span><strong>{primary.percent}%</strong><small>{primary.label}</small></span>
      </div>
      <ul className="grid gap-2" aria-label="얼굴형 유사도 백분율">{rows.map((row) => <li key={row.key} className="grid grid-cols-[0.75rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
        <span className="h-3 w-3" aria-hidden="true" style={{ background: row.color }} />
        <span className="font-bold">{row.label}</span>
        <strong>{row.percent}%</strong>
      </li>)}</ul>
    </div>
    <p className="mt-4 border-t border-[var(--app-border)] pt-3 text-[11px] leading-5 text-[var(--app-muted)]">{disclosure}에 랜드마크의 세로·이마·광대·턱 비율이 얼마나 가까운지 보여주는 미용 상담용 유사도입니다. 인종 판정이나 의학적 두상 진단이 아닙니다.</p>
  </SurfaceCard>;
}

function measurementValue(measurement: FacialMeasurementV2) {
  if (measurement.kind === "ratio") return measurement.normalizedValue.toFixed(2);
  if (measurement.kind === "angle") return `${Math.round(measurement.normalizedValue * 180)}°`;
  return `${Math.round(measurement.normalizedValue * 100)}%`;
}

function measurementMax(measurement: FacialMeasurementV2) {
  return measurement.kind === "ratio" ? Math.max(2, measurement.normalizedValue) : 1;
}

function FacialProportionMatrix({ evidence }: { evidence: AnalysisEvidenceV2 | null }) {
  if (!evidence) return <SurfaceCard className="p-5" data-analysis-proportion-matrix="pending">
    <p className="app-kicker">Facial proportion matrix</p>
    <p className="mt-3 text-sm text-[var(--app-muted)]">저장된 측정 근거를 불러오면 얼굴 비율 차트가 표시됩니다.</p>
  </SurfaceCard>;

  return <SurfaceCard className="p-5" data-analysis-proportion-matrix="ready">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="app-kicker">Facial proportion matrix</p>
        <h3 className="mt-2 text-base font-black">사진 좌표에서 계산한 비율 근거</h3>
      </div>
      <span className="text-xs font-black">{evidence.measurements.length} measurements</span>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2" aria-label="얼굴 비율 측정 차트">
      {evidence.measurements.map((measurement) => <div
        key={measurement.id}
        className="grid gap-2 border-l-2 border-[var(--app-accent)] pl-3"
        data-analysis-measurement-id={measurement.id}
      >
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-black">{MEASUREMENT_LABELS[measurement.id] ?? measurement.id}</span>
          <span className="font-bold">{measurementValue(measurement)}</span>
        </div>
        <meter
          className="h-2 w-full"
          min={0}
          max={measurementMax(measurement)}
          value={Math.max(0, measurement.normalizedValue)}
          aria-label={`${MEASUREMENT_LABELS[measurement.id] ?? measurement.id} ${measurementValue(measurement)}`}
        />
        <div className="flex flex-wrap justify-between gap-2 text-[11px] text-[var(--app-muted)]">
          <span>{measurement.category}</span>
          <span>근거 신뢰도 {Math.round(measurement.confidence * 100)}%</span>
        </div>
      </div>)}
    </div>
    <p className="mt-4 border-t border-[var(--app-border)] pt-3 text-[11px] leading-5 text-[var(--app-muted)]">길이·폭은 crop 안의 정규화 거리이며 실제 cm가 아닙니다. 각도는 0~180° 환산값이고 비율은 두 측정선의 상대값입니다.</p>
  </SurfaceCard>;
}

export function AnalysisWorkbench({ snapshot }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const personalColorConsent = snapshot.photo.usageScopes.includes("personalColor");
  const hasSnapshotColor = snapshot.personalColor.season !== "확인 전";
  const [color, setColor] = useState(personalColorConsent ? snapshot.personalColor : { season: "사용 동의 없음", undertone: "미사용", palette: [], confidence: "low" as const });
  const [colorLoading, setColorLoading] = useState(false);
  const [geometryEvidence, setGeometryEvidence] = useState<AnalysisEvidenceV2 | null>(null);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(snapshot.evidence.items[0]?.id ?? null);
  const activeEvidence = snapshot.evidence.items.find((item) => item.id === activeEvidenceId) ?? null;
  const linkedRecommendations = snapshot.strategyRecommendations.filter((item) => item.evidenceId === activeEvidenceId);

  const loadColor = useCallback(async () => {
    setColorLoading(true);
    try {
      const response = await fetch("/api/style-profile", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        profile?: { personalColor?: { season?: string; tone?: string; bestColors?: Array<{ hex?: string }> } | null };
      };
      const saved = data.profile?.personalColor;
      if (response.ok && saved) {
        setColor({
          season: saved.season || "저장된 진단",
          undertone: saved.tone || "neutral",
          palette: (saved.bestColors || []).map((item) => item.hex || "").filter(Boolean),
          confidence: "high",
        });
      }
    } finally {
      setColorLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!personalColorConsent || hasSnapshotColor) return;
    const timer = window.setTimeout(() => void loadColor(), 0);
    return () => window.clearTimeout(timer);
  // Personal color is optional supporting evidence and must not block analysis rendering.
  }, [hasSnapshotColor, loadColor, personalColorConsent]);

  return <WorkbenchGrid output={<>
    <div className="grid gap-4">
      <FaceShapeBlendChart evidence={geometryEvidence} />
      <FacialProportionMatrix evidence={geometryEvidence} />
      <SurfaceCard className="p-5">
        <p className="app-kicker">Evidence ledger</p>
        <div className="mt-4 grid gap-3" aria-label="분석 근거 목록">
          {snapshot.evidence.items.map((item) => <button
            key={item.id}
            type="button"
            onClick={() => setActiveEvidenceId(item.id)}
            aria-pressed={activeEvidenceId === item.id}
            data-evidence-ledger-id={item.id}
            className={`min-h-16 border-l-2 p-3 text-left ${activeEvidenceId === item.id ? "border-[var(--app-border-strong)] bg-[var(--app-surface-muted)]" : "border-[var(--app-accent)]"}`}
          >
            <span className="text-xs font-black uppercase">{item.layer} · {item.confidence}</span>
            <span className="mt-1 block text-sm">{item.evidence} → {item.meaning} → {item.action}</span>
          </button>)}
        </div>
      </SurfaceCard>
    </div>
    <ConsultationSystemData snapshot={snapshot} items={[
      { label: "Focused evidence", value: activeEvidence?.layer || "선택 전" },
      { label: "Linked directions", value: `${linkedRecommendations.length}건` },
      { label: "Geometry", value: geometryEvidence ? `${geometryEvidence.measurements.length} measurements · r${geometryEvidence.correctionRevision}` : "불러오는 중" },
      { label: "Color profile", value: `${color.season} · ${color.confidence}` },
    ]} />
  </>} input={
    <div className="grid gap-4">
      <ConsultationPhotoEvidence
        sessionId={snapshot.sessionId}
        enabled={snapshot.photo.usageScopes.includes("analysis")}
        activeEvidenceId={activeEvidenceId}
        onEvidenceSelect={setActiveEvidenceId}
        onEvidenceLoad={setGeometryEvidence}
      />
      <Panel className="grid gap-6 p-5 sm:p-7">
      <div>
        <p className="app-kicker">Evidence → Meaning → Action</p>
        <h2 className="mt-3 text-xl font-black">근거와 추천 방향을 함께 확인합니다</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">AI 분석값은 수정 가능한 입력칸이 아니라 서버에 저장된 관찰 근거입니다. 근거를 선택하면 사진 레이어와 연결된 방향이 함께 강조됩니다.</p>
      </div>

      <DefinitionRows items={[
        { label: "Face blend", value: snapshot.faceAnalysis.faceShape },
        { label: "Balance", value: snapshot.faceAnalysis.balance },
        { label: "Hairline", value: snapshot.faceAnalysis.hairline },
        { label: "Color", value: `${color.season} / ${color.undertone}` },
        { label: "Confidence", value: snapshot.faceAnalysis.confidence },
      ]} />

      <SurfaceCard className="p-4" data-active-evidence-id={activeEvidenceId ?? "none"}>
        <p className="app-kicker">Focus ribbon</p>
        {activeEvidence ? <div className="mt-3 grid gap-2 text-sm">
          <p><strong>관찰</strong> · {activeEvidence.evidence}</p>
          <p><strong>영향</strong> · {activeEvidence.meaning}</p>
          <p><strong>행동</strong> · {activeEvidence.action}</p>
        </div> : <p className="mt-3 text-sm text-[var(--app-muted)]">왼쪽 근거 목록에서 항목을 선택하세요.</p>}
      </SurfaceCard>

      <div>
        <p className="text-sm font-black">Hair Direction Matrix</p>
        <div className="mt-3 grid gap-2">
          {(linkedRecommendations.length ? linkedRecommendations : snapshot.strategyRecommendations).map((recommendation) => <button
            key={recommendation.axis}
            type="button"
            onClick={() => setActiveEvidenceId(recommendation.evidenceId)}
            aria-pressed={activeEvidenceId === recommendation.evidenceId}
            className="min-h-14 border border-[var(--app-border)] p-3 text-left"
          >
            <span className="text-xs font-black uppercase">{recommendation.axis} · {recommendation.recommendedValue}</span>
            <span className="mt-1 block text-sm">{recommendation.impact}</span>
          </button>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--app-muted)]">퍼스널 컬러는 사진 품질과 별도 근거로 연결합니다.</p>
        <span className="text-xs font-black">{colorLoading ? "저장된 컬러 근거 자동 연결 중" : `${color.season} · ${color.confidence}`}</span>
      </div>
      <Link href={`/consulting/${encodeURIComponent(snapshot.sessionId)}/direction`} className="inline-flex min-h-12 items-center justify-center border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 text-sm font-black text-[var(--app-inverse-text)]">추천 전략 조정하기</Link>
      </Panel>
    </div>
  } />;
}

"use client";

import { useState } from "react";
import type {
  MakeupAtlasLineId,
  MakeupComplexionGuideGeometry,
  MakeupComplexionGuideId,
  MakeupAtlasMode,
  MakeupDenseAtlasV3,
  MakeupModule,
  MakeupModuleDirection,
  MakeupNormalizedPoint,
  MakeupSemanticProjectionV3,
  MakeupTopologyProjectionV2,
} from "@hairfit/shared/makeup";
import { makeupTechnicalCustomerLabel } from "@hairfit/shared/makeup";
import { MakeupColorInfo, MakeupColorRail, type MakeupColorCalloutId, type MakeupColorCalloutView } from "./MakeupColorCallouts";
import { MakeupDirectionPaths } from "./MakeupDirectionPaths";

const MODULE_COLORS: Record<MakeupModule, string> = {
  base: "#D8B38C",
  brow: "#8A6A55",
  eyeshadow: "#A87585",
  eyeliner: "#403532",
  blush: "#EF7F79",
  lip: "#BE686C",
  lashes: "#4A3833",
};

const FAMILY_COLORS: Record<string, string> = {
  neutral_beige: "#D8B38C",
  deep_neutral_brown: "#8A6A55",
  soft_camel: "#C19282",
  soft_brown: "#8A655A",
  peach_coral: "#EF7F79",
  brick_rose: "#BE686C",
  rose: "#BE686C",
  coral: "#EF7F79",
};

const COMPLEXION_COLORS: Record<MakeupComplexionGuideId, string> = {
  t_zone_highlight: "#E8D3B5",
  nose_contour: "#8C6D5B",
  jaw_shadow: "#6F5147",
};

const LEGACY_COMPLEXION_GUIDES: MakeupComplexionGuideGeometry[] = [
  {
    id: "t_zone_highlight",
    role: "highlight",
    anchors: [{ x: 0.5, y: 0.31 }, { x: 0.5, y: 0.39 }, { x: 0.5, y: 0.58 }],
    polygons: [
      [{ x: 0.37, y: 0.29 }, { x: 0.63, y: 0.29 }, { x: 0.63, y: 0.33 }, { x: 0.37, y: 0.33 }],
      [{ x: 0.485, y: 0.39 }, { x: 0.515, y: 0.39 }, { x: 0.515, y: 0.58 }, { x: 0.485, y: 0.58 }],
    ],
    vectors: [
      { origin: { x: 0.5, y: 0.31 }, dx: -0.11, dy: 0 },
      { origin: { x: 0.5, y: 0.31 }, dx: 0.11, dy: 0 },
      { origin: { x: 0.5, y: 0.39 }, dx: 0, dy: 0.17 },
    ],
  },
  {
    id: "nose_contour",
    role: "shadow",
    anchors: [{ x: 0.465, y: 0.41 }, { x: 0.535, y: 0.41 }],
    polygons: [
      [{ x: 0.451, y: 0.41 }, { x: 0.473, y: 0.41 }, { x: 0.468, y: 0.56 }, { x: 0.446, y: 0.56 }],
      [{ x: 0.527, y: 0.41 }, { x: 0.549, y: 0.41 }, { x: 0.554, y: 0.56 }, { x: 0.532, y: 0.56 }],
    ],
    vectors: [
      { origin: { x: 0.462, y: 0.42 }, dx: -0.004, dy: 0.13 },
      { origin: { x: 0.538, y: 0.42 }, dx: 0.004, dy: 0.13 },
    ],
  },
  {
    id: "jaw_shadow",
    role: "shadow",
    anchors: [{ x: 0.31, y: 0.73 }, { x: 0.69, y: 0.73 }],
    polygons: [
      [{ x: 0.28, y: 0.72 }, { x: 0.31, y: 0.7 }, { x: 0.46, y: 0.79 }, { x: 0.43, y: 0.81 }],
      [{ x: 0.69, y: 0.7 }, { x: 0.72, y: 0.72 }, { x: 0.57, y: 0.81 }, { x: 0.54, y: 0.79 }],
    ],
    vectors: [
      { origin: { x: 0.31, y: 0.73 }, dx: 0.13, dy: 0.06 },
      { origin: { x: 0.69, y: 0.73 }, dx: -0.13, dy: 0.06 },
    ],
  },
];

type CalloutSpec = { id: MakeupColorCalloutId; label: string; module: MakeupModule; side: "left" | "right"; top: number };

const CALLOUT_SPECS: CalloutSpec[] = [
  { id: "brow", label: "눈썹", module: "brow", side: "left", top: 19 },
  { id: "eyeshadow", label: "아이섀도", module: "eyeshadow", side: "left", top: 32 },
  { id: "eyeliner", label: "아이라인", module: "eyeliner", side: "left", top: 45 },
  { id: "blush", label: "볼", module: "blush", side: "left", top: 59 },
  { id: "lip", label: "입술", module: "lip", side: "left", top: 73 },
  { id: "t_zone_highlight", label: "T존 밝힘", module: "base", side: "right", top: 20 },
  { id: "lashes", label: "속눈썹", module: "lashes", side: "right", top: 36 },
  { id: "nose_contour", label: "콧대 음영", module: "base", side: "right", top: 53 },
  { id: "jaw_shadow", label: "턱선 음영", module: "base", side: "right", top: 73 },
];

const GUIDE_LABELS: Record<MakeupComplexionGuideId, string> = {
  t_zone_highlight: "T존 하이라이트",
  nose_contour: "콧대 음영",
  jaw_shadow: "턱선 음영",
};

const MODULE_LABELS: Partial<Record<MakeupModule, string>> = {
  brow: "눈썹",
  eyeshadow: "아이섀도",
  eyeliner: "아이라인",
  blush: "볼",
  lip: "입술",
  lashes: "속눈썹",
};

const DEFAULT_CALLOUT_BY_MODULE: Record<MakeupModule, MakeupColorCalloutId> = {
  base: "nose_contour",
  brow: "brow",
  eyeshadow: "eyeshadow",
  eyeliner: "eyeliner",
  blush: "blush",
  lip: "lip",
  lashes: "lashes",
};

const isComplexionGuideId = (value: MakeupColorCalloutId): value is MakeupComplexionGuideId =>
  value === "t_zone_highlight" || value === "nose_contour" || value === "jaw_shadow";
const familyName = (value: string | null | undefined, fallback: string) => value?.trim()
  ? makeupTechnicalCustomerLabel(value.trim())
  : fallback;
const moduleColor = (item: MakeupModuleDirection | undefined, module: MakeupModule) => {
  const family = item?.direction.colorFamily?.toLowerCase() ?? "";
  return FAMILY_COLORS[family] ?? MODULE_COLORS[module];
};
const averagePoint = (points: MakeupNormalizedPoint[], fallback: MakeupNormalizedPoint): MakeupNormalizedPoint => points.length ? {
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
} : fallback;
const edgePoint = (points: MakeupNormalizedPoint[], side: "left" | "right", fallback: MakeupNormalizedPoint) => points.length
  ? points.reduce((selected, point) => side === "left" ? (point.x < selected.x ? point : selected) : (point.x > selected.x ? point : selected))
  : fallback;

const PRECISION_CONNECTOR_SPECS: Record<MakeupColorCalloutId, {
  lineIds: readonly MakeupAtlasLineId[];
  target: MakeupNormalizedPoint;
}> = {
  brow: { lineIds: ["brow.upper.left"], target: { x: 0.35, y: 0.34 } },
  eye: { lineIds: ["eye.upper.left", "eye.lower.left"], target: { x: 0.36, y: 0.39 } },
  eyeshadow: { lineIds: ["eye.crease.left", "eye.under.left"], target: { x: 0.4, y: 0.36 } },
  eyeliner: { lineIds: ["eye.upper.left"], target: { x: 0.39, y: 0.37 } },
  lashes: { lineIds: ["eye.upper.right"], target: { x: 0.61, y: 0.37 } },
  blush: { lineIds: ["makeup.blush.left"], target: { x: 0.34, y: 0.45 } },
  lip: { lineIds: ["lip.outer.upper", "lip.outer.lower"], target: { x: 0.44, y: 0.53 } },
  t_zone_highlight: { lineIds: ["makeup.t-zone"], target: { x: 0.56, y: 0.28 } },
  nose_contour: { lineIds: ["nose.bridge.right"], target: { x: 0.54, y: 0.47 } },
  jaw_shadow: { lineIds: ["makeup.jaw-shadow.right"], target: { x: 0.64, y: 0.58 } },
};

const nearestPoint = (points: MakeupNormalizedPoint[], target: MakeupNormalizedPoint) => points.length
  ? points.reduce((nearest, point) => {
    const nearestDistance = Math.hypot(nearest.x - target.x, nearest.y - target.y);
    const pointDistance = Math.hypot(point.x - target.x, point.y - target.y);
    return pointDistance < nearestDistance ? point : nearest;
  })
  : null;

type CanvasProps = {
  photoUrl: string | null;
  modules: MakeupModuleDirection[];
  topology?: MakeupTopologyProjectionV2 | null;
  denseAtlas?: MakeupDenseAtlasV3 | null;
  semanticProjection?: MakeupSemanticProjectionV3 | null;
  activeModule: MakeupModule;
  mode: MakeupAtlasMode;
  onSelect: (module: MakeupModule) => void;
  showInfo?: boolean;
};

export function MakeupDirectionCanvas({ photoUrl, modules, topology = null, denseAtlas = null, semanticProjection = null, activeModule, mode, onSelect, showInfo = false }: CanvasProps) {
  const [selectedCallout, setSelectedCallout] = useState<MakeupColorCalloutId | null>(null);
  const [hoveredCallout, setHoveredCallout] = useState<MakeupColorCalloutId | null>(null);
  const [focusedCallout, setFocusedCallout] = useState<MakeupColorCalloutId | null>(null);
  const moduleMap = new Map(modules.map((item) => [item.module, item]));
  const base = moduleMap.get("base");
  const complexionGuides = base?.geometry.complexionGuides?.length ? base.geometry.complexionGuides : LEGACY_COMPLEXION_GUIDES;
  const guideMap = new Map(complexionGuides.map((guide) => [guide.id, guide]));
  const selectedSpec = CALLOUT_SPECS.find((item) => item.id === selectedCallout);
  const interactiveCalloutId = focusedCallout
    ?? hoveredCallout
    ?? (selectedSpec?.module === activeModule ? selectedCallout : null);
  const visibleCalloutId = interactiveCalloutId ?? DEFAULT_CALLOUT_BY_MODULE[activeModule];

  const callouts: MakeupColorCalloutView[] = CALLOUT_SPECS.map((spec) => {
    const item = moduleMap.get(spec.module);
    const guide = isComplexionGuideId(spec.id) ? guideMap.get(spec.id) : undefined;
    const color = guide ? COMPLEXION_COLORS[guide.id] : moduleColor(item, spec.module);
    const intensity = Math.round((item?.direction.intensity ?? 0.25) * (guide?.id === "t_zone_highlight" ? 72 : guide ? 62 : 100));
    const direction = guide?.id === "t_zone_highlight"
      ? "이마 중앙은 바깥으로, 콧대는 아래로 짧게 쓸어주세요."
      : guide?.id === "nose_contour"
        ? "콧대 양옆을 위에서 아래로 좁게 블렌딩하세요."
        : guide?.id === "jaw_shadow"
          ? "귀밑에서 턱 중앙을 향해 경계를 풀어주세요."
          : item?.direction.technical.applicationDirection.join(" · ") || "얼굴 결을 따라 얇게 블렌딩하세요.";
    const texture = guide?.role === "highlight" ? "은은한 광" : guide?.role === "shadow" ? "매트 섀도우" : item?.direction.texture ?? "내추럴";
    const family = guide
      ? (guide.role === "highlight" ? "은은한 베이지" : guide.id === "nose_contour" ? "뉴트럴 토프" : "딥 뉴트럴 토프")
      : familyName(item?.direction.colorFamily, spec.label);
    const blend = spec.id === "brow"
      ? "결을 따라 안→밖"
      : spec.id === "eye"
        ? "눈머리→눈꼬리"
        : spec.id === "blush"
          ? "볼 중심→광대 위"
          : spec.id === "lip"
            ? "중앙→입꼬리"
            : spec.id === "t_zone_highlight"
              ? "이마↔ · 콧대↓"
              : spec.id === "nose_contour"
                ? "위→아래 ↓"
                : "귀밑→턱 중앙";
    return {
      ...spec,
      module: spec.module,
      color,
      intensity: Math.min(100, Math.max(0, intensity)),
      direction,
      blend,
      texture,
      family,
      title: guide ? GUIDE_LABELS[guide.id] : MODULE_LABELS[spec.module] ?? spec.label,
    };
  });

  const visibleCallout = callouts.find((callout) => callout.id === visibleCalloutId) ?? callouts[0];
  const renderActiveModule = hoveredCallout || focusedCallout ? visibleCallout.module : activeModule;
  const moduleColors = Object.fromEntries(modules.map((item) => [item.module, moduleColor(item, item.module)])) as Record<MakeupModule, string>;
  const topologyAnchors = new Map(topology?.calloutAnchors.map((anchor) => [anchor.id, anchor.point]) ?? []);
  const precisionGeometryReady = Boolean(denseAtlas && !denseAtlas.degradedReason);
  const denseLineMap = new Map<MakeupAtlasLineId, MakeupNormalizedPoint[]>(
    denseAtlas?.lineSets.map((line) => [line.id, line.points]) ?? [],
  );
  const precisionConnectorPoint = (calloutId: MakeupColorCalloutId) => {
    if (!precisionGeometryReady) return null;
    const spec = PRECISION_CONNECTOR_SPECS[calloutId];
    const points = spec.lineIds.flatMap((lineId) => denseLineMap.get(lineId) ?? []);
    return nearestPoint(points, spec.target);
  };
  const connectors = callouts.map((callout) => {
    const guide = isComplexionGuideId(callout.id) ? guideMap.get(callout.id) : undefined;
    const moduleGeometry = moduleMap.get(callout.module)?.geometry;
    const fallback = callout.side === "left" ? { x: 0.3, y: callout.top / 100 } : { x: 0.7, y: callout.top / 100 };
    const candidates = guide?.anchors.length ? guide.anchors : moduleGeometry?.anchors.length ? moduleGeometry.anchors : moduleGeometry?.polygons.flat() ?? [];
    const precisionPoint = precisionConnectorPoint(callout.id);
    const point = precisionPoint
      ?? topologyAnchors.get(callout.id === "eyeshadow" || callout.id === "eyeliner" || callout.id === "lashes" ? "eye" : callout.id)
      ?? (guide ? averagePoint(candidates, fallback) : edgePoint(candidates, callout.side, fallback));
    return {
      id: callout.id,
      side: callout.side,
      top: callout.top,
      point,
      color: callout.color,
      source: precisionPoint ? "precision-atlas-v3" as const : "topology-v2-fallback" as const,
    };
  });

  return <div
    className="makeup-direction-map"
    data-makeup-source-pixels="unaltered"
    data-complexion-guide-source={base?.geometry.complexionGuides?.length ? "server" : "legacy-fallback"}
    data-makeup-visible-callout={visibleCallout.id}
    data-makeup-topology-state={topology?.degradedReason ?? (topology ? "ready" : "legacy")}
    data-makeup-dense-atlas-state={denseAtlas?.degradedReason ?? (denseAtlas ? "ready" : "unavailable")}
    data-makeup-connector-geometry-source={precisionGeometryReady ? "precision-atlas-v3" : "topology-v2-fallback"}
    data-makeup-semantic-state={semanticProjection?.state ?? "foundation"}
  >
    <div className="makeup-direction-map__workspace">
      <div className="makeup-direction-map__stage">
        <div className="makeup-direction-map__media">
          <MakeupDirectionPaths
            photoUrl={photoUrl}
            modules={modules}
            topology={topology}
            denseAtlas={denseAtlas}
            semanticProjection={semanticProjection}
            moduleColors={moduleColors}
            guideColors={COMPLEXION_COLORS}
            activeModule={renderActiveModule}
            activeCallout={visibleCallout.id}
            connectors={connectors}
            mode={mode}
          />
          {denseAtlas?.degradedReason || (!denseAtlas && topology?.degradedReason) ? <span className="makeup-direction-map__degraded" role="status">정밀 랜드마크를 불러오지 못해 간소화된 지도를 표시합니다.</span> : null}
        </div>
        <MakeupColorRail side="left" callouts={callouts} visibleId={visibleCallout.id} selectedId={selectedCallout} onPreview={setHoveredCallout} onFocusPreview={setFocusedCallout} onSelect={(callout) => { setSelectedCallout(callout.id); onSelect(callout.module); }} />
        <MakeupColorRail side="right" callouts={callouts} visibleId={visibleCallout.id} selectedId={selectedCallout} onPreview={setHoveredCallout} onFocusPreview={setFocusedCallout} onSelect={(callout) => { setSelectedCallout(callout.id); onSelect(callout.module); }} />
      </div>
      {showInfo || interactiveCalloutId ? <MakeupColorInfo callout={visibleCallout} /> : null}
    </div>
  </div>;
}

"use client";

import type { CSSProperties } from "react";
import type {
  MakeupAtlasMode,
  MakeupAtlasLineId,
  MakeupComplexionGuideId,
  MakeupDenseAtlasV3,
  MakeupDirectionVector,
  MakeupModule,
  MakeupModuleDirection,
  MakeupNormalizedPoint,
  MakeupSemanticProjectionV3,
  MakeupTopologyPointSetId,
  MakeupTopologyProjectionV2,
} from "@hairfit/shared/makeup";
import type { MakeupColorCalloutId } from "./MakeupColorCallouts";

type Connector = {
  id: MakeupColorCalloutId;
  side: "left" | "right";
  top: number;
  point: MakeupNormalizedPoint;
  color: string;
  source: "precision-atlas-v3" | "topology-v2-fallback";
};

const ACTIVE_POINT_SETS: Record<MakeupColorCalloutId, MakeupTopologyPointSetId[]> = {
  brow: ["left_brow_upper", "left_brow_lower", "right_brow_upper", "right_brow_lower"],
  eye: ["left_eye", "right_eye"],
  eyeshadow: ["left_eye", "right_eye"],
  eyeliner: ["left_eye", "right_eye"],
  lashes: ["left_eye", "right_eye"],
  blush: ["left_cheek", "right_cheek"],
  lip: ["outer_lip", "inner_lip"],
  t_zone_highlight: ["t_zone", "nose_bridge"],
  nose_contour: ["nose_left", "nose_right", "nose_bridge"],
  jaw_shadow: ["face_oval"],
};

const PRIMARY_STRUCTURE_LINE_IDS = new Set<MakeupAtlasLineId>([
  "face.oval",
  "face.cheekbone.left",
  "face.cheekbone.right",
  "brow.upper.left",
  "brow.upper.right",
  "eye.upper.left",
  "eye.lower.left",
  "eye.upper.right",
  "eye.lower.right",
  "nose.bridge.center",
  "nose.tip",
  "lip.outer.upper",
  "lip.outer.lower",
  "center.chin",
]);

const ACTIVE_ATLAS_LINE_IDS: Record<MakeupColorCalloutId, readonly MakeupAtlasLineId[]> = {
  brow: ["brow.axis.left", "brow.axis.right"],
  eye: ["eye.crease.left", "eye.under.left", "eye.crease.right", "eye.under.right"],
  eyeshadow: ["eye.crease.left", "eye.under.left", "eye.crease.right", "eye.under.right"],
  eyeliner: ["eye.upper.left", "eye.upper.right"],
  lashes: ["eye.upper.left", "eye.upper.right"],
  blush: ["makeup.blush.left", "makeup.blush.right"],
  lip: ["lip.cupid", "lip.corner.axis.left", "lip.corner.axis.right"],
  t_zone_highlight: ["makeup.t-zone"],
  nose_contour: ["nose.bridge.left", "nose.bridge.right"],
  jaw_shadow: ["makeup.jaw-shadow.left", "makeup.jaw-shadow.right"],
};

const SEMANTIC_ZONE_PREFIXES: Record<MakeupColorCalloutId, readonly string[]> = {
  brow: ["brow."],
  eye: ["eyeshadow.", "eyeliner.", "lashes."],
  eyeshadow: ["eyeshadow."],
  eyeliner: ["eyeliner."],
  lashes: ["lashes."],
  blush: ["blush."],
  lip: ["lip."],
  t_zone_highlight: ["t_zone."],
  nose_contour: ["nose.contour."],
  jaw_shadow: ["jaw.shadow."],
};

const pointAt = (point: MakeupNormalizedPoint) => ({ x: point.x * 1000, y: point.y * 1250 });

const openPolylinePath = (points: MakeupNormalizedPoint[]) => {
  if (points.length < 2) return "";
  return points.map((point, index) => {
    const projected = pointAt(point);
    return `${index === 0 ? "M" : "L"} ${projected.x} ${projected.y}`;
  }).join(" ");
};

const containedCurvePath = (points: MakeupNormalizedPoint[]) => {
  if (points.length < 3) return openPolylinePath(points);
  const projected = points.map(pointAt);
  const commands = [`M ${projected[0].x} ${projected[0].y}`];
  for (let index = 1; index < projected.length - 1; index += 1) {
    const current = projected[index];
    const next = projected[index + 1];
    commands.push(`Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`);
  }
  const last = projected.at(-1)!;
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(" ");
};

const segmentKey = (left: number, right: number) => left < right ? `${left}:${right}` : `${right}:${left}`;

const dedupedAtlasPath = (
  sourceIndices: readonly number[],
  points: MakeupNormalizedPoint[],
  seenSegments: Set<string>,
) => {
  const commands: string[] = [];
  let continuing = false;
  let duplicateSegmentCount = 0;
  let visibleSegmentCount = 0;
  for (let index = 0; index < sourceIndices.length - 1; index += 1) {
    const key = segmentKey(sourceIndices[index], sourceIndices[index + 1]);
    if (seenSegments.has(key)) {
      duplicateSegmentCount += 1;
      continuing = false;
      continue;
    }
    seenSegments.add(key);
    const start = pointAt(points[index]);
    const end = pointAt(points[index + 1]);
    if (!continuing) commands.push(`M ${start.x} ${start.y}`);
    commands.push(`L ${end.x} ${end.y}`);
    continuing = true;
    visibleSegmentCount += 1;
  }
  return { d: commands.join(" "), duplicateSegmentCount, visibleSegmentCount };
};

const pointTick = (points: MakeupNormalizedPoint[], index: number) => {
  const center = pointAt(points[index]);
  const previous = pointAt(points[Math.max(0, index - 1)]);
  const next = pointAt(points[Math.min(points.length - 1, index + 1)]);
  const tangentX = next.x - previous.x;
  const tangentY = next.y - previous.y;
  const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentY));
  const normalX = -tangentY / tangentLength * 2.8;
  const normalY = tangentX / tangentLength * 2.8;
  return {
    x1: center.x - normalX,
    y1: center.y - normalY,
    x2: center.x + normalX,
    y2: center.y + normalY,
  };
};

const loosePointTick = (point: MakeupNormalizedPoint) => {
  const center = pointAt(point);
  const radialX = center.x - 500;
  const radialY = center.y - 625;
  const radialLength = Math.max(0.0001, Math.hypot(radialX, radialY));
  const tangentX = -radialY / radialLength * 2.8;
  const tangentY = radialX / radialLength * 2.8;
  return { x1: center.x - tangentX, y1: center.y - tangentY, x2: center.x + tangentX, y2: center.y + tangentY };
};

const smoothPath = (points: MakeupNormalizedPoint[], closed: boolean) => {
  const source = closed && points.length > 1 && points[0].x === points.at(-1)?.x && points[0].y === points.at(-1)?.y
    ? points.slice(0, -1)
    : points;
  if (source.length < 2) return "";
  const count = source.length;
  const start = pointAt(source[0]);
  const segment = (index: number) => {
    const current = pointAt(source[index]);
    const previous = pointAt(source[closed ? (index - 1 + count) % count : Math.max(0, index - 1)]);
    const next = pointAt(source[closed ? (index + 1) % count : Math.min(count - 1, index + 1)]);
    const after = pointAt(source[closed ? (index + 2) % count : Math.min(count - 1, index + 2)]);
    const controlA = { x: current.x + (next.x - previous.x) / 6, y: current.y + (next.y - previous.y) / 6 };
    const controlB = { x: next.x - (after.x - current.x) / 6, y: next.y - (after.y - current.y) / 6 };
    return `C ${controlA.x} ${controlA.y} ${controlB.x} ${controlB.y} ${next.x} ${next.y}`;
  };
  const segmentCount = closed ? count : count - 1;
  return `M ${start.x} ${start.y} ${Array.from({ length: segmentCount }, (_, index) => segment(index)).join(" ")}${closed ? " Z" : ""}`;
};

const vectorStroke = (vector: MakeupDirectionVector, progress: number, length: number, offset: number) => {
  const normalLength = Math.max(0.0001, Math.hypot(vector.dx, vector.dy));
  const normalX = -vector.dy / normalLength * offset;
  const normalY = vector.dx / normalLength * offset;
  const start = {
    x: vector.origin.x + vector.dx * progress + normalX,
    y: vector.origin.y + vector.dy * progress + normalY,
  };
  const end = { x: start.x + vector.dx * length, y: start.y + vector.dy * length };
  const a = pointAt(start); const b = pointAt(end);
  const control = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - Math.abs(b.x - a.x) * 0.08 };
  return `M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`;
};

const connectorPath = (connector: Connector) => {
  const start = pointAt(connector.point);
  const edgeX = connector.side === "left" ? 115 : 885;
  const elbowX = connector.side === "left" ? Math.max(edgeX + 24, start.x - 76) : Math.min(edgeX - 24, start.x + 76);
  const targetY = connector.top / 100 * 1250;
  return `M ${start.x} ${start.y} L ${elbowX} ${targetY} L ${edgeX} ${targetY}`;
};

type EyeFeatureGuide = {
  side: "left" | "right";
  eyeliner: MakeupNormalizedPoint[];
  lashes: Array<{ start: MakeupNormalizedPoint; end: MakeupNormalizedPoint }>;
};

const buildEyeFeatureGuide = (side: "left" | "right", points: MakeupNormalizedPoint[]): EyeFeatureGuide | null => {
  if (points.length < 4) return null;
  const outerIndex = points.reduce((selected, point, index) => {
    const selectedPoint = points[selected];
    return side === "left" ? (point.x < selectedPoint.x ? index : selected) : (point.x > selectedPoint.x ? index : selected);
  }, 0);
  const outer = points[outerIndex];
  const wing = { x: outer.x + (side === "left" ? -0.018 : 0.018), y: outer.y - 0.006 };
  const eyeliner = outerIndex === 0 ? [wing, ...points] : [...points, wing];
  const lashIndices = Array.from(new Set([1, Math.floor(points.length * 0.3), Math.floor(points.length * 0.5), Math.floor(points.length * 0.7), points.length - 2]))
    .filter((index) => index > 0 && index < points.length - 1);
  const lashes = lashIndices.map((index, order) => {
    const start = points[index];
    const length = 0.011 + order * 0.0012;
    return {
      start,
      end: {
        x: start.x + (side === "left" ? -0.0035 : 0.0035),
        y: start.y - length,
      },
    };
  });
  return { side, eyeliner, lashes };
};

type Props = {
  photoUrl: string | null;
  modules: MakeupModuleDirection[];
  topology: MakeupTopologyProjectionV2 | null;
  denseAtlas: MakeupDenseAtlasV3 | null;
  semanticProjection: MakeupSemanticProjectionV3 | null;
  moduleColors: Record<MakeupModule, string>;
  guideColors: Record<MakeupComplexionGuideId, string>;
  activeModule: MakeupModule;
  activeCallout: MakeupColorCalloutId;
  connectors: Connector[];
  mode: MakeupAtlasMode;
};

export function MakeupDirectionPaths({ photoUrl, modules, topology, denseAtlas, semanticProjection, moduleColors, guideColors, activeModule, activeCallout, connectors, mode }: Props) {
  const activeSets = new Set(ACTIVE_POINT_SETS[activeCallout]);
  const denseReady = Boolean(denseAtlas && !denseAtlas.degradedReason);
  const pointCount = denseReady ? denseAtlas!.uniqueSourcePointCount : topology ? new Set(topology.pointSets.flatMap((set) => set.sourceIndices)).size : 0;
  const topologyPoints = new Map<number, { point: MakeupNormalizedPoint; sets: Set<MakeupTopologyPointSetId>; tick: ReturnType<typeof pointTick> }>();
  for (const set of topology?.pointSets ?? []) {
    const visibleLength = set.closed && set.sourceIndices[0] === set.sourceIndices.at(-1) ? set.sourceIndices.length - 1 : set.sourceIndices.length;
    for (let index = 0; index < visibleLength; index += 1) {
      const sourceIndex = set.sourceIndices[index];
      const existing = topologyPoints.get(sourceIndex);
      if (existing) existing.sets.add(set.id);
      else topologyPoints.set(sourceIndex, { point: set.points[index], sets: new Set([set.id]), tick: pointTick(set.points, index) });
    }
  }
  const regionMap = new Map(topology?.moduleRegions.map((region) => [region.module, region]) ?? []);
  const pointSetMap = new Map(topology?.pointSets.map((set) => [set.id, set.points]) ?? []);
  const complexionPaths = (id: MakeupComplexionGuideId) => {
    if (id === "t_zone_highlight") return [pointSetMap.get("t_zone"), pointSetMap.get("nose_bridge")].filter(Boolean) as MakeupNormalizedPoint[][];
    if (id === "nose_contour") return [pointSetMap.get("nose_left"), pointSetMap.get("nose_right")].filter(Boolean) as MakeupNormalizedPoint[][];
    const faceOval = pointSetMap.get("face_oval") ?? [];
    return faceOval.length ? [faceOval.slice(8, 19), faceOval.slice(18, 29)] : [];
  };
  const semanticPrefixes = SEMANTIC_ZONE_PREFIXES[activeCallout];
  const semanticBundles = (semanticProjection?.lineBundles ?? []).filter((bundle) => (
    bundle.module === activeModule
    && semanticPrefixes.some((prefix) => bundle.zoneId.startsWith(prefix))
  ));
  const activeAtlasIds = new Set(ACTIVE_ATLAS_LINE_IDS[activeCallout]);
  const selectedDenseLines = denseReady ? denseAtlas!.lineSets.filter((line) => {
    if (mode === "precision") return true;
    if (mode === "structure") return line.role === "structure" && PRIMARY_STRUCTURE_LINE_IDS.has(line.id);
    return false;
  }) : [];
  const dedupeOrder = mode === "precision"
    ? selectedDenseLines
    : [...selectedDenseLines.filter((line) => line.role === "application"), ...selectedDenseLines.filter((line) => line.role === "structure")];
  const seenSegments = new Set<string>();
  const densePathById = new Map(dedupeOrder.map((line) => {
    const path = mode === "precision"
      ? { d: openPolylinePath(line.points), duplicateSegmentCount: 0, visibleSegmentCount: Math.max(0, line.points.length - 1) }
      : dedupedAtlasPath(line.sourceIndices, line.points, seenSegments);
    return [line.id, path] as const;
  }));
  const denseLines = selectedDenseLines.filter((line) => densePathById.get(line.id)?.d);
  const visibleSegmentCount = denseLines.reduce((total, line) => total + (densePathById.get(line.id)?.visibleSegmentCount ?? 0), 0);
  const duplicateSegmentCount = denseLines.reduce((total, line) => total + (densePathById.get(line.id)?.duplicateSegmentCount ?? 0), 0);
  const denseLineMap = new Map(denseAtlas?.lineSets.map((line) => [line.id, line.points]) ?? []);
  const eyeFeatureGuides = (["left", "right"] as const).map((side) => {
    const densePoints = denseLineMap.get(`eye.upper.${side}` as MakeupAtlasLineId);
    const fallbackPoints = pointSetMap.get(side === "left" ? "left_eye" : "right_eye")?.slice(9);
    return buildEyeFeatureGuide(side, densePoints ?? fallbackPoints ?? []);
  }).filter((guide): guide is EyeFeatureGuide => Boolean(guide));
  const eyelinerEnabled = modules.find((item) => item.module === "eyeliner")?.state === "enabled";
  const lashesEnabled = modules.find((item) => item.module === "lashes")?.state === "enabled";

  return <svg
    viewBox="0 0 1000 1250"
    className="makeup-direction-map__canvas"
    role="img"
    aria-label={mode === "application" ? `${activeCallout} 컬러 칩과 부위 연결 인포그래픽` : `${activeCallout} 진단용 얼굴 랜드마크 지도`}
    data-makeup-topology-version={denseReady ? denseAtlas!.version : topology?.version ?? "legacy-sparse"}
    data-makeup-connector-geometry-source={denseReady ? "precision-atlas-v3" : "topology-v2-fallback"}
    data-makeup-topology-point-count={pointCount}
    data-makeup-topology-degraded={topology?.degradedReason ?? "false"}
    data-display-mode={mode}
    data-makeup-render-mode={mode === "application" ? "callout-infographic" : "diagnostic-landmark-lines"}
    data-makeup-semantic-projection={semanticProjection?.state ?? "none"}
  >
    {photoUrl
      ? <image href={photoUrl} x="0" y="0" width="1000" height="1250" preserveAspectRatio="xMidYMid slice" />
      : <rect width="1000" height="1250" fill="#171717" />}

    {denseReady ? <g
      aria-hidden="true"
      className="makeup-dense-atlas"
      data-makeup-dense-atlas
      data-line-count={denseLines.length}
      data-source-line-count={selectedDenseLines.length}
      data-segment-count={denseAtlas!.segmentCount}
      data-visible-segment-count={visibleSegmentCount}
      data-suppressed-duplicate-segment-count={duplicateSegmentCount}
    >
      {denseLines.map((line) => {
        const active = line.role === "application" && activeAtlasIds.has(line.id);
        const context = line.role === "structure" && line.modules.includes(activeModule);
        const color = line.modules[0] ? moduleColors[line.modules[0]] : moduleColors.base;
        return <path
          key={line.id}
          d={densePathById.get(line.id)!.d}
          className={`makeup-dense-atlas__line is-${line.role}${context ? " is-context" : ""}${active ? " is-active" : ""}`}
          data-makeup-atlas-line={line.id}
          data-makeup-atlas-role={line.role}
          data-makeup-visual-tier={active ? "active" : context ? "context" : "reference"}
          data-makeup-modules={line.modules.join(",")}
          data-point-count={line.points.length}
          style={{ "--makeup-layer-color": color } as CSSProperties}
          vectorEffect="non-scaling-stroke"
        />;
      })}
      {mode === "precision" ? <g className="makeup-dense-atlas__ticks" data-makeup-precision-ticks>
        {denseAtlas!.precisionTicks.map((entry) => {
          const tick = loosePointTick(entry.point);
          return <line key={entry.sourceIndex} data-makeup-atlas-tick={entry.sourceIndex} {...tick} className="makeup-dense-atlas__tick" vectorEffect="non-scaling-stroke" />;
        })}
      </g> : null}
    </g> : mode !== "application" && topology && !topology.degradedReason ? <g aria-hidden="true" className="makeup-topology" data-makeup-topology>
      {topology.pointSets.map((set) => {
        const active = activeSets.has(set.id);
        return <g key={set.id} className={`makeup-topology-set${active ? " is-active" : ""}`} data-makeup-topology-set={set.id} data-point-count={set.points.length}>
          <path d={smoothPath(set.points, false)} className="makeup-topology-set__path" vectorEffect="non-scaling-stroke" />
        </g>;
      })}
      <g className="makeup-topology-points">
        {[...topologyPoints.entries()].map(([sourceIndex, entry]) => <line
          key={sourceIndex}
          data-makeup-topology-point={sourceIndex}
          x1={entry.tick.x1}
          y1={entry.tick.y1}
          x2={entry.tick.x2}
          y2={entry.tick.y2}
          className={`makeup-topology-point${[...entry.sets].some((id) => activeSets.has(id)) ? " is-active" : ""}`}
          vectorEffect="non-scaling-stroke"
        />)}
      </g>
    </g> : null}

    {semanticProjection && mode === "precision" ? <g aria-hidden="true" className="makeup-semantic-lines" data-makeup-semantic-lines data-semantic-state={semanticProjection.state}>
      {semanticBundles.map((bundle, index) => <path
        key={`${bundle.zoneId}-${bundle.role}-${index}`}
        d={containedCurvePath(bundle.points)}
        data-makeup-semantic-zone={bundle.zoneId}
        data-makeup-semantic-role={bundle.role}
        data-makeup-semantic-fallback={String(bundle.provenance.fallback)}
        className={`makeup-semantic-line is-${bundle.role} is-active`}
        style={{ "--makeup-layer-color": moduleColors[bundle.module], "--makeup-emphasis": bundle.emphasis } as CSSProperties}
        vectorEffect="non-scaling-stroke"
      />)}
    </g> : null}

    {!denseReady && mode !== "application" ? <g aria-hidden="true" className="makeup-zone-layers">
      {modules.map((item) => {
        const active = item.module === activeModule;
        const color = moduleColors[item.module];
        const region = regionMap.get(item.module);
        const contourPaths = region?.paths ?? item.geometry.polygons;
        const brushPaths = region?.strokePaths ?? [];
        return <g key={item.module} data-makeup-module={item.module} className={`makeup-zone-layer${active ? " is-active" : ""}${item.state !== "enabled" ? " is-disabled" : ""}`} style={{ "--makeup-layer-color": color } as CSSProperties}>
          {contourPaths.map((points, index) => <path key={`line-${index}`} data-makeup-zone-line={`${item.module}-${index}`} d={smoothPath(points, false)} className="makeup-zone-layer__line" vectorEffect="non-scaling-stroke" />)}
          {brushPaths.map((points, index) => <path key={`brush-${index}`} data-makeup-brush-line={`${item.module}-${index}`} d={smoothPath(points, false)} className="makeup-zone-layer__brush" vectorEffect="non-scaling-stroke" />)}
          {!region ? item.geometry.vectors.flatMap((vector, vectorIndex) => [0, 0.34, 0.68].map((step, stepIndex) => <path
            key={`fallback-${vectorIndex}-${stepIndex}`}
            d={vectorStroke(vector, step, 0.24, 0)}
            className="makeup-zone-layer__brush"
            vectorEffect="non-scaling-stroke"
          />)) : null}
          {item.geometry.excludedPolygons.map((points, index) => <path key={`excluded-${index}`} d={smoothPath(points, false)} className="makeup-zone-layer__excluded" vectorEffect="non-scaling-stroke" />)}
        </g>;
      })}

      {modules.find((item) => item.module === "base")?.geometry.complexionGuides?.map((guide) => {
        const active = activeModule === "base" && activeCallout === guide.id;
        const linePaths = complexionPaths(guide.id);
        return <g key={guide.id} data-makeup-guide={guide.id} className={`makeup-complexion-layer${active ? " is-active" : ""}`} style={{ "--makeup-layer-color": guideColors[guide.id] } as CSSProperties}>
          {(linePaths.length ? linePaths : guide.polygons).map((points, index) => <path key={`line-${index}`} data-makeup-complexion-line={`${guide.id}-${index}`} d={smoothPath(points, false)} className="makeup-complexion-layer__line" vectorEffect="non-scaling-stroke" />)}
          {!linePaths.length ? guide.vectors.flatMap((vector, vectorIndex) => [0, 0.32, 0.64].map((step, stepIndex) => <path
            key={`fallback-${vectorIndex}-${stepIndex}`}
            d={vectorStroke(vector, step, 0.25, 0)}
            className="makeup-complexion-layer__brush"
            vectorEffect="non-scaling-stroke"
          />)) : null}
        </g>;
      })}
    </g> : null}

    {mode === "application" && eyeFeatureGuides.length ? <g aria-hidden="true" className="makeup-eye-feature-guides" data-makeup-eye-feature-guides>
      {eyelinerEnabled ? eyeFeatureGuides.map((guide) => <path
        key={`eyeliner-${guide.side}`}
        d={containedCurvePath(guide.eyeliner)}
        data-makeup-eye-feature-guide={`eyeliner-${guide.side}`}
        className="makeup-eye-feature-guide__eyeliner"
        style={{ "--makeup-layer-color": moduleColors.eyeliner } as CSSProperties}
        vectorEffect="non-scaling-stroke"
      />) : null}
      {lashesEnabled ? eyeFeatureGuides.flatMap((guide) => guide.lashes.map((lash, index) => {
        const start = pointAt(lash.start);
        const end = pointAt(lash.end);
        return <line
          key={`lashes-${guide.side}-${index}`}
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          data-makeup-eye-feature-guide={`lashes-${guide.side}`}
          className="makeup-eye-feature-guide__lash"
          style={{ "--makeup-layer-color": moduleColors.lashes } as CSSProperties}
          vectorEffect="non-scaling-stroke"
        />;
      })) : null}
    </g> : null}

    <g aria-hidden="true" className="makeup-callout-connectors" data-makeup-callout-connectors>
      {connectors.map((connector) => <path
        key={connector.id}
        d={connectorPath(connector)}
        data-makeup-callout-connector={connector.id}
        data-makeup-callout-anchor-source={connector.source}
        className={`makeup-callout-connector${connector.id === activeCallout ? " is-active" : ""}`}
        style={{ "--makeup-layer-color": connector.color } as CSSProperties}
        vectorEffect="non-scaling-stroke"
      />)}
    </g>
  </svg>;
}

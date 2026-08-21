import {
  MAKEUP_ATLAS_LINE_IDS,
  MAKEUP_MODULES,
  type MakeupAtlasLineId,
  type MakeupDenseAtlasLineSetV3,
  type MakeupDenseAtlasV3,
  type MakeupModule,
  type MakeupNormalizedPoint,
} from "./contract.ts";

export const MAKEUP_SEMANTIC_ZONE_IDS = [
  "brow.left", "brow.right",
  "eyeshadow.left", "eyeshadow.right",
  "eyeliner.left", "eyeliner.right",
  "lashes.left", "lashes.right",
  "blush.left", "blush.right",
  "lip.upper", "lip.lower",
  "t_zone.highlight",
  "nose.contour.left", "nose.contour.right",
  "jaw.shadow.left", "jaw.shadow.right",
] as const;

export type MakeupSemanticZoneId = (typeof MAKEUP_SEMANTIC_ZONE_IDS)[number];
export type MakeupSemanticPurpose = "highlight" | "shadow" | "color" | "definition";
export type MakeupSemanticPathMode = "follow_topology" | "parallel_offset" | "interpolate_between";
export type MakeupBrushDirection = "inner_to_outer" | "outer_to_inner" | "upward" | "downward" | "radial";
export type MakeupSemanticExclusion = "hair" | "facial_hair" | "glasses" | "eye" | "iris" | "nostril" | "lip_inner" | "occluded";

export interface MakeupSemanticAnchorRefV3 {
  lineId: MakeupAtlasLineId;
  sourceIndex: number;
  tangentOffset: number;
  normalOffset: number;
}

export interface MakeupSemanticZoneV3 {
  id: MakeupSemanticZoneId;
  module: MakeupModule;
  purpose: MakeupSemanticPurpose;
  anchorRefs: MakeupSemanticAnchorRefV3[];
  pathMode: MakeupSemanticPathMode;
  brushDirection: MakeupBrushDirection;
  brushStrokeCount: number;
  intensity: number;
  reason: string;
  caution: string;
  exclusions: MakeupSemanticExclusion[];
  confidence: { semantic: number; visibility: number };
}

export interface MakeupSemanticMapV3 {
  schemaVersion: "makeup-semantic-map-v3";
  faceCharacteristics: {
    brow: string;
    eye: string;
    cheekbone: string;
    nose: string;
    lip: string;
    jaw: string;
  };
  zones: MakeupSemanticZoneV3[];
  summary: string;
}

export interface MakeupSemanticArtifactV3 {
  version: "makeup-semantic-artifact-v3";
  sourceFingerprint: string;
  sourceCorrectionRevision: number;
  semanticOutputFingerprint: string;
  output: MakeupSemanticMapV3;
}

export interface MakeupProtectedRegionV3 {
  id: string;
  kind: MakeupSemanticExclusion;
  points: MakeupNormalizedPoint[];
}

export interface MakeupSemanticProjectionLineBundleV3 {
  zoneId: MakeupSemanticZoneId;
  module: MakeupModule;
  role: "structure" | "application" | "brush" | "boundary";
  points: MakeupNormalizedPoint[];
  open: true;
  colorToken: string;
  emphasis: number;
  provenance: {
    sourceIndices: number[];
    semanticConfidence: number | null;
    fallback: boolean;
  };
}

export interface MakeupSemanticProjectionV3 {
  version: "makeup-semantic-projection-v3";
  sourceFingerprint: string;
  semanticOutputFingerprint: string;
  atlasVersion: "makeup-dense-atlas-v3";
  state: "complete" | "partial" | "fallback";
  lineBundles: MakeupSemanticProjectionLineBundleV3[];
  excludedZones: Array<{ zoneId: MakeupSemanticZoneId; reason: string }>;
  warnings: string[];
  validation: {
    snapMeanPx: number;
    snapP95Px: number;
    protectedRegionViolations: number;
    rejectedProtectedRegionIntersections: number;
    acceptedZoneCount: number;
    fallbackZoneCount: number;
  };
}

const bounded = (value: unknown, minimum: number, maximum: number) => typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
const compactKorean = (value: unknown, maximum: number) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum && /[가-힣]/u.test(value);
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const hasOnlyKeys = (value: unknown, keys: readonly string[]) => Boolean(value && typeof value === "object"
  && Object.keys(value).length === keys.length
  && Object.keys(value).every((key) => keys.includes(key)));

export function assertMakeupSemanticMapV3(value: MakeupSemanticMapV3) {
  if (value.schemaVersion !== "makeup-semantic-map-v3"
    || !hasOnlyKeys(value, ["schemaVersion", "faceCharacteristics", "zones", "summary"])
    || !Array.isArray(value.zones)
    || value.zones.length < 1
    || value.zones.length > MAKEUP_SEMANTIC_ZONE_IDS.length
    || !unique(value.zones.map((zone) => zone.id))
    || !compactKorean(value.summary, 180)) throw new Error("MAKEUP_SEMANTIC_SCHEMA_INVALID");
  const characteristicValues = Object.values(value.faceCharacteristics ?? {});
  if (!hasOnlyKeys(value.faceCharacteristics, ["brow", "eye", "cheekbone", "nose", "lip", "jaw"])
    || characteristicValues.some((item) => !compactKorean(item, 180))) throw new Error("MAKEUP_SEMANTIC_CHARACTERISTICS_INVALID");
  for (const zone of value.zones) {
    if (!hasOnlyKeys(zone, ["id", "module", "purpose", "anchorRefs", "pathMode", "brushDirection", "brushStrokeCount", "intensity", "reason", "caution", "exclusions", "confidence"])
      || !MAKEUP_SEMANTIC_ZONE_IDS.includes(zone.id)
      || !MAKEUP_MODULES.includes(zone.module)
      || !["highlight", "shadow", "color", "definition"].includes(zone.purpose)
      || !["follow_topology", "parallel_offset", "interpolate_between"].includes(zone.pathMode)
      || !["inner_to_outer", "outer_to_inner", "upward", "downward", "radial"].includes(zone.brushDirection)
      || !Number.isInteger(zone.brushStrokeCount)
      || zone.brushStrokeCount < 3
      || zone.brushStrokeCount > 9
      || !bounded(zone.intensity, 0, 1)
      || !bounded(zone.confidence?.semantic, 0, 1)
      || !bounded(zone.confidence?.visibility, 0, 1)
      || !compactKorean(zone.reason, 180)
      || !compactKorean(zone.caution, 180)
      || !Array.isArray(zone.anchorRefs)
      || zone.anchorRefs.length < 2
      || zone.anchorRefs.length > 24
      || !Array.isArray(zone.exclusions)
      || !unique(zone.exclusions)
      || zone.exclusions.some((item) => !["hair", "facial_hair", "glasses", "eye", "iris", "nostril", "lip_inner", "occluded"].includes(item))
      || !hasOnlyKeys(zone.confidence, ["semantic", "visibility"])
      || zone.anchorRefs.some((anchor) => !MAKEUP_ATLAS_LINE_IDS.includes(anchor.lineId)
        || !hasOnlyKeys(anchor, ["lineId", "sourceIndex", "tangentOffset", "normalOffset"])
        || !Number.isInteger(anchor.sourceIndex)
        || !bounded(anchor.tangentOffset, -0.025, 0.025)
        || !bounded(anchor.normalOffset, -0.025, 0.025))) {
      throw new Error(`MAKEUP_SEMANTIC_ZONE_INVALID:${zone.id}`);
    }
  }
}

export function parseMakeupSemanticMapV3Json(text: string): MakeupSemanticMapV3 {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const parsed = JSON.parse(trimmed) as MakeupSemanticMapV3;
  assertMakeupSemanticMapV3(parsed);
  return parsed;
}

export const MAKEUP_SEMANTIC_MAP_V3_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "faceCharacteristics", "zones", "summary"],
  properties: {
    schemaVersion: { const: "makeup-semantic-map-v3" },
    faceCharacteristics: {
      type: "object",
      additionalProperties: false,
      required: ["brow", "eye", "cheekbone", "nose", "lip", "jaw"],
      properties: Object.fromEntries(["brow", "eye", "cheekbone", "nose", "lip", "jaw"].map((key) => [key, { type: "string", minLength: 1, maxLength: 180 }])),
    },
    zones: {
      type: "array",
      minItems: 1,
      maxItems: MAKEUP_SEMANTIC_ZONE_IDS.length,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "module", "purpose", "anchorRefs", "pathMode", "brushDirection", "brushStrokeCount", "intensity", "reason", "caution", "exclusions", "confidence"],
        properties: {
          id: { enum: MAKEUP_SEMANTIC_ZONE_IDS },
          module: { enum: MAKEUP_MODULES },
          purpose: { enum: ["highlight", "shadow", "color", "definition"] },
          anchorRefs: { type: "array", minItems: 2, maxItems: 24, items: { type: "object", additionalProperties: false, required: ["lineId", "sourceIndex", "tangentOffset", "normalOffset"], properties: { lineId: { enum: MAKEUP_ATLAS_LINE_IDS }, sourceIndex: { type: "integer", minimum: 0, maximum: 477 }, tangentOffset: { type: "number", minimum: -0.025, maximum: 0.025 }, normalOffset: { type: "number", minimum: -0.025, maximum: 0.025 } } } },
          pathMode: { enum: ["follow_topology", "parallel_offset", "interpolate_between"] },
          brushDirection: { enum: ["inner_to_outer", "outer_to_inner", "upward", "downward", "radial"] },
          brushStrokeCount: { type: "integer", minimum: 3, maximum: 9 },
          intensity: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string", minLength: 1, maxLength: 180 },
          caution: { type: "string", minLength: 1, maxLength: 180 },
          exclusions: { type: "array", uniqueItems: true, items: { enum: ["hair", "facial_hair", "glasses", "eye", "iris", "nostril", "lip_inner", "occluded"] } },
          confidence: { type: "object", additionalProperties: false, required: ["semantic", "visibility"], properties: { semantic: { type: "number", minimum: 0, maximum: 1 }, visibility: { type: "number", minimum: 0, maximum: 1 } } },
        },
      },
    },
    summary: { type: "string", minLength: 1, maxLength: 180 },
  },
} as const;

const ZONE_FALLBACK_LINE: Record<MakeupSemanticZoneId, MakeupAtlasLineId> = {
  "brow.left": "brow.axis.left",
  "brow.right": "brow.axis.right",
  "eyeshadow.left": "eye.crease.left",
  "eyeshadow.right": "eye.crease.right",
  "eyeliner.left": "eye.upper.left",
  "eyeliner.right": "eye.upper.right",
  "lashes.left": "eye.upper.left",
  "lashes.right": "eye.upper.right",
  "blush.left": "makeup.blush.left",
  "blush.right": "makeup.blush.right",
  "lip.upper": "lip.outer.upper",
  "lip.lower": "lip.outer.lower",
  "t_zone.highlight": "makeup.t-zone",
  "nose.contour.left": "nose.bridge.left",
  "nose.contour.right": "nose.bridge.right",
  "jaw.shadow.left": "makeup.jaw-shadow.left",
  "jaw.shadow.right": "makeup.jaw-shadow.right",
};

const ZONE_MODULE: Record<MakeupSemanticZoneId, MakeupModule> = {
  "brow.left": "brow", "brow.right": "brow",
  "eyeshadow.left": "eyeshadow", "eyeshadow.right": "eyeshadow",
  "eyeliner.left": "eyeliner", "eyeliner.right": "eyeliner",
  "lashes.left": "lashes", "lashes.right": "lashes",
  "blush.left": "blush", "blush.right": "blush",
  "lip.upper": "lip", "lip.lower": "lip",
  "t_zone.highlight": "base",
  "nose.contour.left": "base", "nose.contour.right": "base",
  "jaw.shadow.left": "base", "jaw.shadow.right": "base",
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const distance = (a: MakeupNormalizedPoint, b: MakeupNormalizedPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function offsetPoint(line: MakeupDenseAtlasLineSetV3, anchor: MakeupSemanticAnchorRefV3) {
  const index = line.sourceIndices.indexOf(anchor.sourceIndex);
  if (index < 0) throw new Error("ANCHOR_NOT_ALLOWLISTED");
  const previous = line.points[Math.max(0, index - 1)];
  const current = line.points[index];
  const next = line.points[Math.min(line.points.length - 1, index + 1)];
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const length = Math.max(0.000001, Math.hypot(dx, dy));
  const tx = dx / length;
  const ty = dy / length;
  return {
    point: { x: clamp(current.x + tx * anchor.tangentOffset - ty * anchor.normalOffset), y: clamp(current.y + ty * anchor.tangentOffset + tx * anchor.normalOffset) },
    source: current,
  };
}

function orientation(a: MakeupNormalizedPoint, b: MakeupNormalizedPoint, c: MakeupNormalizedPoint) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function segmentIntersects(a: MakeupNormalizedPoint, b: MakeupNormalizedPoint, c: MakeupNormalizedPoint, d: MakeupNormalizedPoint) {
  return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
}

function hasSelfIntersection(points: MakeupNormalizedPoint[]) {
  for (let left = 0; left < points.length - 1; left += 1) {
    for (let right = left + 2; right < points.length - 1; right += 1) {
      if (segmentIntersects(points[left], points[left + 1], points[right], points[right + 1])) return true;
    }
  }
  return false;
}

function pointInPolygon(point: MakeupNormalizedPoint, polygon: MakeupNormalizedPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]; const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / Math.max(0.000001, b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function pathIntersectsRegion(points: MakeupNormalizedPoint[], region: MakeupProtectedRegionV3) {
  if (region.points.length < 3) return false;
  if (points.some((point) => pointInPolygon(point, region.points))) return true;
  for (let index = 0; index < points.length - 1; index += 1) {
    for (let edge = 0; edge < region.points.length; edge += 1) {
      if (segmentIntersects(points[index], points[index + 1], region.points[edge], region.points[(edge + 1) % region.points.length])) return true;
    }
  }
  return false;
}

const PROTECTED_REGION_ALLOWLIST: Partial<Record<MakeupModule, MakeupSemanticExclusion[]>> = {
  eyeshadow: ["eye"],
  eyeliner: ["eye"],
  lashes: ["eye"],
  lip: ["lip_inner"],
};

function brushVector(direction: MakeupBrushDirection, point: MakeupNormalizedPoint) {
  if (direction === "upward") return { x: 0, y: -0.018 };
  if (direction === "downward") return { x: 0, y: 0.018 };
  if (direction === "outer_to_inner") return { x: point.x < 0.5 ? 0.018 : -0.018, y: -0.004 };
  if (direction === "radial") {
    const dx = point.x - 0.5; const dy = point.y - 0.5; const length = Math.max(0.000001, Math.hypot(dx, dy));
    return { x: dx / length * 0.018, y: dy / length * 0.018 };
  }
  return { x: point.x < 0.5 ? -0.018 : 0.018, y: -0.004 };
}

function fallbackBundle(atlas: MakeupDenseAtlasV3, zoneId: MakeupSemanticZoneId): MakeupSemanticProjectionLineBundleV3 {
  const line = atlas.lineSets.find((candidate) => candidate.id === ZONE_FALLBACK_LINE[zoneId]);
  if (!line) throw new Error(`FALLBACK_LINE_MISSING:${zoneId}`);
  return {
    zoneId,
    module: ZONE_MODULE[zoneId],
    role: "boundary",
    points: line.points,
    open: true,
    colorToken: `makeup.${ZONE_MODULE[zoneId]}`,
    emphasis: 0.5,
    provenance: { sourceIndices: line.sourceIndices, semanticConfidence: null, fallback: true },
  };
}

function safeFallbackBundles(atlas: MakeupDenseAtlasV3, zoneId: MakeupSemanticZoneId, blockingRegions: MakeupProtectedRegionV3[]) {
  const fallback = fallbackBundle(atlas, zoneId);
  if (!blockingRegions.length) return [fallback];
  const safeRuns: MakeupNormalizedPoint[][] = [];
  let run: MakeupNormalizedPoint[] = [];
  const flush = () => { if (run.length >= 2) safeRuns.push(run); run = []; };
  for (const point of fallback.points) {
    const pointBlocked = blockingRegions.some((region) => pointInPolygon(point, region.points));
    const segmentBlocked = run.length > 0 && blockingRegions.some((region) => pathIntersectsRegion([run[run.length - 1], point], region));
    if (pointBlocked || segmentBlocked) { flush(); if (!pointBlocked) run = [point]; }
    else run.push(point);
  }
  flush();
  return safeRuns.map((points) => ({ ...fallback, points }));
}

export function compileMakeupSemanticProjectionV3(input: {
  artifact: MakeupSemanticArtifactV3;
  atlas: MakeupDenseAtlasV3;
  expectedSourceFingerprint: string;
  protectedRegions?: MakeupProtectedRegionV3[];
}): MakeupSemanticProjectionV3 {
  const { artifact, atlas } = input;
  assertMakeupSemanticMapV3(artifact.output);
  if (artifact.version !== "makeup-semantic-artifact-v3"
    || artifact.sourceFingerprint !== input.expectedSourceFingerprint
    || artifact.sourceCorrectionRevision !== atlas.sourceCorrectionRevision
    || atlas.degradedReason) throw new Error("MAKEUP_SEMANTIC_SOURCE_STALE");
  const lineMap = new Map(atlas.lineSets.map((line) => [line.id, line]));
  const bundles: MakeupSemanticProjectionLineBundleV3[] = [];
  const excludedZones: MakeupSemanticProjectionV3["excludedZones"] = [];
  let acceptedZoneCount = 0;
  let rejectedProtectedRegionIntersections = 0;

  for (const zone of artifact.output.zones) {
    let failure = "";
    let points: MakeupNormalizedPoint[] = [];
    try {
      if (zone.module !== ZONE_MODULE[zone.id]) throw new Error("ZONE_MODULE_MISMATCH");
      if (zone.confidence.semantic < 0.7) throw new Error("SEMANTIC_CONFIDENCE_LOW");
      if (zone.confidence.visibility < 0.65) throw new Error("VISIBILITY_CONFIDENCE_LOW");
      points = zone.anchorRefs.map((anchor) => {
        const line = lineMap.get(anchor.lineId);
        if (!line) throw new Error("ANCHOR_LINE_MISSING");
        return offsetPoint(line, anchor).point;
      });
      if (points.some((point, index) => index > 0 && distance(points[index - 1], point) > 0.06)) throw new Error("SEGMENT_GAP_EXCEEDED");
      if (hasSelfIntersection(points)) throw new Error("SELF_INTERSECTION");
      const protectedKindsAllowed = new Set(PROTECTED_REGION_ALLOWLIST[zone.module] ?? []);
      const blockingRegions = (input.protectedRegions ?? []).filter((region) => !protectedKindsAllowed.has(region.kind));
      if (blockingRegions.some((region) => pathIntersectsRegion(points, region))) {
        rejectedProtectedRegionIntersections += 1;
        throw new Error("PROTECTED_REGION_INTERSECTION");
      }
      bundles.push({
        zoneId: zone.id,
        module: zone.module,
        role: "application",
        points,
        open: true,
        colorToken: `makeup.${zone.module}`,
        emphasis: zone.intensity,
        provenance: { sourceIndices: zone.anchorRefs.map((anchor) => anchor.sourceIndex), semanticConfidence: zone.confidence.semantic, fallback: false },
      });
      for (let index = 0; index < zone.brushStrokeCount; index += 1) {
        const anchorIndex = Math.round(index * (points.length - 1) / Math.max(1, zone.brushStrokeCount - 1));
        const origin = points[anchorIndex]; const vector = brushVector(zone.brushDirection, origin);
        const brushPoints = [origin, { x: clamp(origin.x + vector.x), y: clamp(origin.y + vector.y) }];
        if (blockingRegions.some((region) => pathIntersectsRegion(brushPoints, region))) continue;
        bundles.push({
          zoneId: zone.id,
          module: zone.module,
          role: "brush",
          points: brushPoints,
          open: true,
          colorToken: `makeup.${zone.module}`,
          emphasis: zone.intensity,
          provenance: { sourceIndices: [zone.anchorRefs[anchorIndex].sourceIndex], semanticConfidence: zone.confidence.semantic, fallback: false },
        });
      }
      acceptedZoneCount += 1;
    } catch (error) {
      failure = error instanceof Error ? error.message : "ZONE_REJECTED";
    }
    if (failure) {
      const protectedKindsAllowed = new Set(PROTECTED_REGION_ALLOWLIST[zone.module] ?? []);
      const blockingRegions = (input.protectedRegions ?? []).filter((region) => !protectedKindsAllowed.has(region.kind));
      bundles.push(...safeFallbackBundles(atlas, zone.id, blockingRegions));
      excludedZones.push({ zoneId: zone.id, reason: failure });
    }
  }

  const fallbackZoneCount = excludedZones.length;
  const state = acceptedZoneCount === 0 ? "fallback" : fallbackZoneCount ? "partial" : "complete";
  return {
    version: "makeup-semantic-projection-v3",
    sourceFingerprint: artifact.sourceFingerprint,
    semanticOutputFingerprint: artifact.semanticOutputFingerprint,
    atlasVersion: "makeup-dense-atlas-v3",
    state,
    lineBundles: bundles,
    excludedZones,
    warnings: excludedZones.map((zone) => `${zone.zoneId}:${zone.reason}`),
    validation: { snapMeanPx: 0, snapP95Px: 0, protectedRegionViolations: 0, rejectedProtectedRegionIntersections, acceptedZoneCount, fallbackZoneCount },
  };
}

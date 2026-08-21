import type { FaceObservationBundleV2 } from "../personal-color-v2/observation.ts";
import {
  MAKEUP_ATLAS_LINE_IDS,
  type MakeupAtlasLineId,
  type MakeupAtlasMode,
  type MakeupDenseAtlasLineSetV3,
  type MakeupDenseAtlasV3,
  type MakeupModule,
  type MakeupNormalizedPoint,
} from "./contract.ts";

type AtlasDefinition = {
  id: MakeupAtlasLineId;
  sourceIndices: readonly number[];
  role: MakeupDenseAtlasLineSetV3["role"];
  modules: readonly MakeupModule[];
};

const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109] as const;

/**
 * Ordered MediaPipe FaceMesh contours. Every definition is intentionally open:
 * renderers must never infer a closing segment from the semantic name.
 */
export const MAKEUP_DENSE_ATLAS_DEFINITIONS_V3: readonly AtlasDefinition[] = [
  { id: "face.oval", sourceIndices: FACE_OVAL, role: "structure", modules: ["base"] },
  { id: "face.temple.left", sourceIndices: [10,109,67,103,54,21,162,127,234], role: "structure", modules: ["base"] },
  { id: "face.temple.right", sourceIndices: [10,338,297,332,284,251,389,356,454], role: "structure", modules: ["base"] },
  { id: "face.cheekbone.left", sourceIndices: [234,227,137,123,117,118,101,50,205,187,147,213,215,177,132], role: "structure", modules: ["base", "blush"] },
  { id: "face.cheekbone.right", sourceIndices: [454,447,366,352,346,347,330,280,425,411,376,433,435,401,361], role: "structure", modules: ["base", "blush"] },
  { id: "face.jaw.left", sourceIndices: [152,148,176,149,150,136,172,58,132,93,234], role: "structure", modules: ["base"] },
  { id: "face.jaw.right", sourceIndices: [454,323,361,288,397,365,379,378,400,377,152], role: "structure", modules: ["base"] },
  { id: "face.chin", sourceIndices: [172,136,150,149,176,148,152,377,400,378,379,365,397], role: "structure", modules: ["base"] },

  { id: "brow.upper.left", sourceIndices: [156,70,63,105,66,107,55,193], role: "structure", modules: ["brow"] },
  { id: "brow.lower.left", sourceIndices: [35,124,46,53,52,65], role: "structure", modules: ["brow"] },
  { id: "brow.axis.left", sourceIndices: [70,63,105,66,107], role: "application", modules: ["brow"] },
  { id: "brow.upper.right", sourceIndices: [383,300,293,334,296,336,285,417], role: "structure", modules: ["brow"] },
  { id: "brow.lower.right", sourceIndices: [265,353,276,283,282,295], role: "structure", modules: ["brow"] },
  { id: "brow.axis.right", sourceIndices: [300,293,334,296,336], role: "application", modules: ["brow"] },

  { id: "eye.upper.left", sourceIndices: [33,246,161,160,159,158,157,173,133], role: "structure", modules: ["eyeshadow", "eyeliner", "lashes"] },
  { id: "eye.lower.left", sourceIndices: [33,7,163,144,145,153,154,155,133], role: "structure", modules: ["eyeliner", "lashes"] },
  { id: "eye.crease.left", sourceIndices: [226,113,225,224,223,222,221,189,244], role: "application", modules: ["eyeshadow"] },
  { id: "eye.under.left", sourceIndices: [226,31,228,229,230,231,232,233,244], role: "application", modules: ["eyeshadow"] },
  { id: "eye.upper.right", sourceIndices: [263,466,388,387,386,385,384,398,362], role: "structure", modules: ["eyeshadow", "eyeliner", "lashes"] },
  { id: "eye.lower.right", sourceIndices: [263,249,390,373,374,380,381,382,362], role: "structure", modules: ["eyeliner", "lashes"] },
  { id: "eye.crease.right", sourceIndices: [446,342,445,444,443,442,441,413,464], role: "application", modules: ["eyeshadow"] },
  { id: "eye.under.right", sourceIndices: [446,261,448,449,450,451,452,453,464], role: "application", modules: ["eyeshadow"] },

  { id: "nose.bridge.center", sourceIndices: [168,6,197,195,5,4,1], role: "structure", modules: ["base"] },
  { id: "nose.bridge.left", sourceIndices: [193,122,196,3,51,45,44,1], role: "application", modules: ["base"] },
  { id: "nose.bridge.right", sourceIndices: [417,351,419,248,281,275,274,1], role: "application", modules: ["base"] },
  { id: "nose.alar.left", sourceIndices: [98,97,2,326,327], role: "structure", modules: ["base"] },
  { id: "nose.alar.right", sourceIndices: [327,326,2,97,98], role: "structure", modules: ["base"] },
  { id: "nose.tip", sourceIndices: [129,49,131,134,51,281,363,360,279,358], role: "structure", modules: ["base"] },

  { id: "lip.outer.upper", sourceIndices: [61,185,40,39,37,0,267,269,270,409,291], role: "structure", modules: ["lip"] },
  { id: "lip.outer.lower", sourceIndices: [61,146,91,181,84,17,314,405,321,375,291], role: "structure", modules: ["lip"] },
  { id: "lip.inner.upper", sourceIndices: [78,191,80,81,82,13,312,311,310,415,308], role: "structure", modules: ["lip"] },
  { id: "lip.inner.lower", sourceIndices: [78,95,88,178,87,14,317,402,318,324,308], role: "structure", modules: ["lip"] },
  { id: "lip.cupid", sourceIndices: [185,40,39,37,0,267,269,270,409], role: "application", modules: ["lip"] },
  { id: "lip.corner.axis.left", sourceIndices: [57,61,76,62,78], role: "application", modules: ["lip"] },
  { id: "lip.corner.axis.right", sourceIndices: [291,306,292,308,325], role: "application", modules: ["lip"] },

  { id: "center.philtrum", sourceIndices: [2,164,0,13,14,17], role: "structure", modules: ["base", "lip"] },
  { id: "center.nasolabial.left", sourceIndices: [114,47,100,126,209,198,217,174,196], role: "application", modules: ["base"] },
  { id: "center.nasolabial.right", sourceIndices: [343,277,329,355,429,420,437,399,419], role: "application", modules: ["base"] },
  { id: "center.chin", sourceIndices: [17,18,200,199,175,152], role: "structure", modules: ["base"] },

  { id: "makeup.t-zone", sourceIndices: [109,10,338,151,9,8,168,6,197,195,5,4,1], role: "application", modules: ["base"] },
  { id: "makeup.c-zone.left", sourceIndices: [70,156,143,111,117,118,50,101,205], role: "application", modules: ["base", "blush"] },
  { id: "makeup.c-zone.right", sourceIndices: [300,383,372,340,346,347,280,330,425], role: "application", modules: ["base", "blush"] },
  { id: "makeup.blush.left", sourceIndices: [123,117,118,101,50,205,187,147], role: "application", modules: ["blush"] },
  { id: "makeup.blush.right", sourceIndices: [352,346,347,330,280,425,411,376], role: "application", modules: ["blush"] },
  { id: "makeup.jaw-shadow.left", sourceIndices: [234,93,132,58,172,136,150,149,176,148,152], role: "application", modules: ["base"] },
  { id: "makeup.jaw-shadow.right", sourceIndices: [454,323,361,288,397,365,379,378,400,377,152], role: "application", modules: ["base"] },
] as const;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const normalizedPoint = (value: MakeupNormalizedPoint): MakeupNormalizedPoint => ({ x: clamp(value.x), y: clamp(value.y) });

function sourceModel(bundle: FaceObservationBundleV2) {
  const manifest = bundle.modelManifest.find((item) => /face|mesh|landmark/i.test(`${item.component} ${item.name}`)) ?? bundle.modelManifest[0];
  return {
    provider: manifest?.provider ?? "unknown",
    name: manifest?.name ?? "FaceMesh",
    version: manifest?.version ?? "unknown",
    pointCount: bundle.landmarks.length,
  };
}

function precisionTickIndices(lineSets: MakeupDenseAtlasLineSetV3[], pointCount: number) {
  const ordered = Array.from(new Set(lineSets.flatMap((line) => line.sourceIndices)));
  for (let index = 0; index < Math.min(pointCount, 360); index += 1) {
    if (!ordered.includes(index)) ordered.push(index);
  }
  if (pointCount >= 478) {
    for (let index = 468; index < 478; index += 1) if (!ordered.includes(index)) ordered.push(index);
  }
  return ordered.slice(0, 420);
}

export function compileMakeupDenseAtlasV3(bundle: FaceObservationBundleV2): MakeupDenseAtlasV3 {
  const confidence = clamp(bundle.quality.validSkinPixelRatio);
  const base = {
    version: "makeup-dense-atlas-v3" as const,
    coordinateSpace: "normalized_source_image" as const,
    sourceModel: sourceModel(bundle),
    sourceCorrectionRevision: bundle.correctionRevision,
  };
  if (bundle.landmarks.length < 468) {
    return {
      ...base,
      lineSets: [],
      precisionTickSourceIndices: [],
      precisionTicks: [],
      uniqueSourcePointCount: 0,
      segmentCount: 0,
      degradedReason: "insufficient_points",
    };
  }
  const lineSets = MAKEUP_DENSE_ATLAS_DEFINITIONS_V3.map((definition): MakeupDenseAtlasLineSetV3 => ({
    id: definition.id,
    sourceIndices: [...definition.sourceIndices],
    points: definition.sourceIndices.map((index) => normalizedPoint(bundle.landmarks[index])),
    open: true,
    confidence,
    role: definition.role,
    modules: [...definition.modules],
  }));
  const uniqueSourcePointCount = new Set(lineSets.flatMap((line) => line.sourceIndices)).size;
  const tickSourceIndices = precisionTickIndices(lineSets, bundle.landmarks.length);
  return {
    ...base,
    lineSets,
    precisionTickSourceIndices: tickSourceIndices,
    precisionTicks: tickSourceIndices.map((sourceIndex) => ({ sourceIndex, point: normalizedPoint(bundle.landmarks[sourceIndex]) })),
    uniqueSourcePointCount,
    segmentCount: lineSets.reduce((total, line) => total + Math.max(0, line.points.length - 1), 0),
    degradedReason: confidence < 0.55 ? "low_confidence" : null,
  };
}

export function makeupDenseAtlasLinesForMode(
  atlas: MakeupDenseAtlasV3,
  mode: MakeupAtlasMode,
  activeModules: readonly MakeupModule[] = [],
) {
  if (mode === "structure") return atlas.lineSets.filter((line) => line.role === "structure");
  if (mode === "precision") return atlas.lineSets;
  const enabled = new Set(activeModules);
  return atlas.lineSets.filter((line) => line.role === "structure" || line.modules.some((module) => enabled.has(module)));
}

export function assertMakeupDenseAtlasV3(atlas: MakeupDenseAtlasV3) {
  const ids = new Set(atlas.lineSets.map((line) => line.id));
  const points = atlas.lineSets.flatMap((line) => line.points);
  if (atlas.version !== "makeup-dense-atlas-v3" || atlas.coordinateSpace !== "normalized_source_image") throw new Error("MAKEUP_DENSE_ATLAS_IDENTITY_INVALID");
  if (!Number.isInteger(atlas.sourceCorrectionRevision) || atlas.sourceCorrectionRevision < 0) throw new Error("MAKEUP_DENSE_ATLAS_CORRECTION_REVISION_INVALID");
  if (atlas.degradedReason === "insufficient_points") {
    if (atlas.lineSets.length || atlas.uniqueSourcePointCount || atlas.segmentCount) throw new Error("MAKEUP_DENSE_ATLAS_DEGRADED_INVALID");
    return;
  }
  if (![468, 478].includes(atlas.sourceModel.pointCount)
    || atlas.lineSets.length < 40
    || ids.size !== atlas.lineSets.length
    || MAKEUP_ATLAS_LINE_IDS.some((id) => !ids.has(id))
    || atlas.uniqueSourcePointCount < 200
    || atlas.segmentCount < 180
    || atlas.precisionTickSourceIndices.length < 300
    || atlas.precisionTickSourceIndices.length > 420
    || atlas.precisionTicks.length !== atlas.precisionTickSourceIndices.length
    || atlas.precisionTicks.some((tick, index) => tick.sourceIndex !== atlas.precisionTickSourceIndices[index]
      || tick.sourceIndex < 0
      || tick.sourceIndex >= atlas.sourceModel.pointCount
      || !Number.isFinite(tick.point.x)
      || !Number.isFinite(tick.point.y)
      || tick.point.x < 0
      || tick.point.x > 1
      || tick.point.y < 0
      || tick.point.y > 1)
    || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)
    || atlas.lineSets.some((line) => line.open !== true
      || line.sourceIndices.length !== line.points.length
      || line.sourceIndices.length < 2
      || line.sourceIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= atlas.sourceModel.pointCount))) {
    throw new Error("MAKEUP_DENSE_ATLAS_GEOMETRY_INVALID");
  }
}

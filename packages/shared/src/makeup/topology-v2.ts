import type { FaceObservationBundleV2 } from "../personal-color-v2/observation.ts";
import {
  MAKEUP_MODULES,
  type MakeupModule,
  type MakeupNormalizedPoint,
  type MakeupTopologyCalloutId,
  type MakeupTopologyPointSetId,
  type MakeupTopologyPointSetV2,
  type MakeupTopologyProjectionV2,
} from "./contract.ts";

export const MAKEUP_FACE_TOPOLOGY_V2: Readonly<Record<MakeupTopologyPointSetId, readonly number[]>> = {
  face_oval: [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10],
  left_brow_upper: [70,63,105,66,107],
  left_brow_lower: [46,53,52,65,55],
  right_brow_upper: [336,296,334,293,300],
  right_brow_lower: [276,283,282,295,285],
  left_eye: [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33],
  right_eye: [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466,263],
  outer_lip: [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61],
  inner_lip: [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191,78],
  nose_bridge: [168,6,197,195,5,4,1],
  nose_left: [168,98,97,99,240,75,59,166,219,218,1],
  nose_right: [168,327,326,328,460,305,289,392,439,438,1],
  left_cheek: [50,101,205,187,147,123,117,118],
  right_cheek: [280,330,425,411,376,352,346,347],
  t_zone: [109,10,338,151,9,8,168,6,197,1],
};

const CLOSED_POINT_SETS = new Set<MakeupTopologyPointSetId>([
  "face_oval", "left_eye", "right_eye", "outer_lip", "inner_lip", "left_cheek", "right_cheek",
]);

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const point = (value: MakeupNormalizedPoint): MakeupNormalizedPoint => ({ x: clamp(value.x), y: clamp(value.y) });
const mean = (points: MakeupNormalizedPoint[], fallback: MakeupNormalizedPoint): MakeupNormalizedPoint => points.length
  ? point({ x: points.reduce((sum, item) => sum + item.x, 0) / points.length, y: points.reduce((sum, item) => sum + item.y, 0) / points.length })
  : fallback;
const edgePoint = (points: MakeupNormalizedPoint[], edge: "left" | "right", fallback: MakeupNormalizedPoint) => points.length
  ? points.reduce((selected, item) => edge === "left" ? (item.x < selected.x ? item : selected) : (item.x > selected.x ? item : selected))
  : fallback;

function sourceModel(bundle: FaceObservationBundleV2) {
  const manifest = bundle.modelManifest.find((item) => /face|mesh|landmark/i.test(`${item.component} ${item.name}`)) ?? bundle.modelManifest[0];
  return {
    provider: manifest?.provider ?? "unknown",
    name: manifest?.name ?? "FaceMesh",
    version: manifest?.version ?? "unknown",
    pointCount: bundle.landmarks.length,
  };
}

function projectedSet(id: MakeupTopologyPointSetId, landmarks: MakeupNormalizedPoint[]): MakeupTopologyPointSetV2 {
  const ordered = MAKEUP_FACE_TOPOLOGY_V2[id];
  return {
    id,
    sourceIndices: [...ordered],
    points: ordered.map((index) => point(landmarks[index])),
    closed: CLOSED_POINT_SETS.has(id),
  };
}

function combineOutline(upper: MakeupTopologyPointSetV2, lower: MakeupTopologyPointSetV2) {
  return [...upper.points, ...[...lower.points].reverse()];
}

export function compileMakeupTopologyProjectionV2(bundle: FaceObservationBundleV2): MakeupTopologyProjectionV2 {
  const model = sourceModel(bundle);
  const confidence = clamp(bundle.quality.validSkinPixelRatio);
  if (bundle.landmarks.length < 468) {
    return {
      version: "makeup-topology-v2",
      coordinateSpace: "normalized_source_image",
      sourceModel: model,
      pointSets: [],
      moduleRegions: [],
      calloutAnchors: [],
      confidence,
      degradedReason: "insufficient_points",
    };
  }

  const pointSets = (Object.keys(MAKEUP_FACE_TOPOLOGY_V2) as MakeupTopologyPointSetId[]).map((id) => projectedSet(id, bundle.landmarks));
  const byId = new Map(pointSets.map((set) => [set.id, set]));
  const get = (id: MakeupTopologyPointSetId) => byId.get(id)!;
  const leftBrow = combineOutline(get("left_brow_upper"), get("left_brow_lower"));
  const rightBrow = combineOutline(get("right_brow_upper"), get("right_brow_lower"));
  const faceOval = get("face_oval").points;
  const leftJaw = faceOval.slice(18, 28);
  const rightJaw = faceOval.slice(8, 19);
  const calloutAnchors: Array<{ id: MakeupTopologyCalloutId; point: MakeupNormalizedPoint }> = [
    { id: "brow", point: edgePoint(leftBrow, "left", { x: 0.3, y: 0.35 }) },
    { id: "eye", point: edgePoint(get("left_eye").points, "left", { x: 0.3, y: 0.43 }) },
    { id: "blush", point: edgePoint(get("left_cheek").points, "left", { x: 0.28, y: 0.56 }) },
    { id: "lip", point: edgePoint(get("outer_lip").points, "left", { x: 0.41, y: 0.67 }) },
    { id: "t_zone_highlight", point: edgePoint(get("t_zone").points.slice(0, 4), "right", { x: 0.58, y: 0.3 }) },
    { id: "nose_contour", point: edgePoint(get("nose_right").points, "right", { x: 0.55, y: 0.49 }) },
    { id: "jaw_shadow", point: edgePoint(rightJaw, "right", { x: 0.7, y: 0.73 }) },
  ];
  const anchor = (id: MakeupTopologyCalloutId) => calloutAnchors.find((item) => item.id === id)!.point;
  const pathsByModule: Record<MakeupModule, MakeupNormalizedPoint[][]> = {
    base: [get("t_zone").points, get("nose_left").points, get("nose_right").points, leftJaw, rightJaw],
    brow: [leftBrow, rightBrow],
    eyeshadow: [get("left_eye").points, get("right_eye").points],
    eyeliner: [],
    blush: [get("left_cheek").points, get("right_cheek").points],
    lip: [get("outer_lip").points, get("inner_lip").points],
    lashes: [],
  };
  const strokesByModule: Record<MakeupModule, MakeupNormalizedPoint[][]> = {
    base: [get("t_zone").points, get("nose_left").points, get("nose_right").points, leftJaw, rightJaw],
    brow: [get("left_brow_upper").points, get("right_brow_upper").points],
    eyeshadow: [],
    eyeliner: [get("left_eye").points.slice(9), get("right_eye").points.slice(9)],
    blush: [get("left_cheek").points, get("right_cheek").points],
    lip: [get("outer_lip").points],
    lashes: [get("left_eye").points.slice(9), get("right_eye").points.slice(9)],
  };
  const moduleCallout: Record<MakeupModule, MakeupTopologyCalloutId> = {
    base: "t_zone_highlight", brow: "brow", eyeshadow: "eye", eyeliner: "eye", blush: "blush", lip: "lip", lashes: "eye",
  };

  return {
    version: "makeup-topology-v2",
    coordinateSpace: "normalized_source_image",
    sourceModel: model,
    pointSets,
    moduleRegions: MAKEUP_MODULES.map((module) => ({
      module,
      paths: pathsByModule[module],
      strokePaths: strokesByModule[module],
      calloutAnchors: [anchor(moduleCallout[module])],
    })),
    calloutAnchors,
    confidence,
    degradedReason: confidence < 0.55 ? "low_confidence" : null,
  };
}

export function uniqueMakeupTopologyPointCount(projection: MakeupTopologyProjectionV2) {
  return new Set(projection.pointSets.flatMap((set) => set.sourceIndices)).size;
}

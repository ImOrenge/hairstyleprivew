import type { FaceObservationBundleV2 } from "../personal-color-v2/observation.ts";
import { MAKEUP_MODULES, type MakeupComplexionGuideGeometry, type MakeupModule, type MakeupModuleGeometry, type MakeupNormalizedPoint } from "./contract.ts";
import { compileMakeupTopologyProjectionV2 } from "./topology-v2.ts";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const point = (value: MakeupNormalizedPoint | undefined, fallback: MakeupNormalizedPoint): MakeupNormalizedPoint => ({
  x: clamp(value?.x ?? fallback.x),
  y: clamp(value?.y ?? fallback.y),
});
const landmark = (bundle: FaceObservationBundleV2, index: number, fallback: MakeupNormalizedPoint) => point(bundle.landmarks[index], fallback);
const polygon = (center: MakeupNormalizedPoint, radiusX: number, radiusY: number) => Array.from({ length: 12 }, (_, index) => {
  const angle = Math.PI * 2 * index / 12;
  return { x: clamp(center.x + Math.cos(angle) * radiusX), y: clamp(center.y + Math.sin(angle) * radiusY) };
});
const band = (start: MakeupNormalizedPoint, end: MakeupNormalizedPoint, halfWidth: number) => {
  const dx = end.x - start.x; const dy = end.y - start.y;
  const length = Math.max(0.0001, Math.hypot(dx, dy));
  const offsetX = -dy / length * halfWidth; const offsetY = dx / length * halfWidth;
  return [
    point({ x: start.x + offsetX, y: start.y + offsetY }, start),
    point({ x: end.x + offsetX, y: end.y + offsetY }, end),
    point({ x: end.x - offsetX, y: end.y - offsetY }, end),
    point({ x: start.x - offsetX, y: start.y - offsetY }, start),
  ];
};
const rectangle = (center: MakeupNormalizedPoint, halfWidth: number, halfHeight: number) => [
  point({ x: center.x - halfWidth, y: center.y - halfHeight }, center),
  point({ x: center.x + halfWidth, y: center.y - halfHeight }, center),
  point({ x: center.x + halfWidth, y: center.y + halfHeight }, center),
  point({ x: center.x - halfWidth, y: center.y + halfHeight }, center),
];
const geometry = (anchors: MakeupNormalizedPoint[], polygons: MakeupNormalizedPoint[][], vectors: MakeupModuleGeometry["vectors"], excludedPolygons: MakeupNormalizedPoint[][] = [], complexionGuides?: MakeupComplexionGuideGeometry[]): MakeupModuleGeometry => ({
  coordinateSpace: "normalized_source_image",
  anchors,
  polygons,
  excludedPolygons,
  vectors,
  ...(complexionGuides?.length ? { complexionGuides } : {}),
});
const openClosedPath = (points: MakeupNormalizedPoint[]) => points.length > 1
  && points[0].x === points.at(-1)?.x
  && points[0].y === points.at(-1)?.y
  ? points.slice(0, -1)
  : points;
const centerOf = (points: MakeupNormalizedPoint[], fallback: MakeupNormalizedPoint) => points.length ? {
  x: points.reduce((sum, current) => sum + current.x, 0) / points.length,
  y: points.reduce((sum, current) => sum + current.y, 0) / points.length,
} : fallback;
const eyeshadowZone = (points: MakeupNormalizedPoint[]) => {
  const center = centerOf(points, { x: 0.5, y: 0.42 });
  return points.map((current) => point({
    x: center.x + (current.x - center.x) * 1.08,
    y: center.y + (current.y - center.y) * 1.45 - 0.022,
  }, current));
};

export function compileMakeupGeometryV1(bundle: FaceObservationBundleV2): Record<MakeupModule, MakeupModuleGeometry> {
  const topology = compileMakeupTopologyProjectionV2(bundle);
  const topologySet = (id: typeof topology.pointSets[number]["id"]) => topology.pointSets.find((set) => set.id === id)?.points ?? [];
  const denseLeftBrow = [...topologySet("left_brow_upper"), ...[...topologySet("left_brow_lower")].reverse()];
  const denseRightBrow = [...topologySet("right_brow_upper"), ...[...topologySet("right_brow_lower")].reverse()];
  const leftBrow = denseLeftBrow.length >= 10 ? denseLeftBrow : [70, 63, 105, 66, 107].map((index, position) => landmark(bundle, index, { x: 0.31 + position * 0.035, y: 0.35 - Math.sin(position / 4 * Math.PI) * 0.025 }));
  const rightBrow = denseRightBrow.length >= 10 ? denseRightBrow : [336, 296, 334, 293, 300].map((index, position) => landmark(bundle, index, { x: 0.55 + position * 0.035, y: 0.35 - Math.sin((4 - position) / 4 * Math.PI) * 0.025 }));
  const denseLeftEye = openClosedPath(topologySet("left_eye"));
  const denseRightEye = openClosedPath(topologySet("right_eye"));
  const leftEye = denseLeftEye.length >= 16 ? denseLeftEye : [33, 160, 158, 133, 153, 144].map((index) => landmark(bundle, index, { x: 0.35, y: 0.43 }));
  const rightEye = denseRightEye.length >= 16 ? denseRightEye : [362, 385, 387, 263, 373, 380].map((index) => landmark(bundle, index, { x: 0.65, y: 0.43 }));
  const denseLips = openClosedPath(topologySet("outer_lip"));
  const lips = denseLips.length >= 20 ? denseLips : [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91].map((index) => landmark(bundle, index, { x: 0.5, y: 0.69 }));
  const leftCheek = landmark(bundle, 234, { x: 0.31, y: 0.58 });
  const rightCheek = landmark(bundle, 454, { x: 0.69, y: 0.58 });
  const foreheadCenter = landmark(bundle, 10, { x: 0.5, y: 0.25 });
  const betweenBrows = landmark(bundle, 168, { x: 0.5, y: 0.38 });
  const noseTip = landmark(bundle, 1, { x: 0.5, y: 0.58 });
  const leftJaw = landmark(bundle, 172, { x: 0.3, y: 0.73 });
  const rightJaw = landmark(bundle, 397, { x: 0.7, y: 0.73 });
  const chin = landmark(bundle, 152, { x: 0.5, y: 0.82 });
  const leftEyeOuter = landmark(bundle, 33, leftEye[0]); const leftEyeInner = landmark(bundle, 133, leftEye[Math.min(8, leftEye.length - 1)]);
  const rightEyeInner = landmark(bundle, 362, rightEye[Math.min(8, rightEye.length - 1)]); const rightEyeOuter = landmark(bundle, 263, rightEye[0]);
  const skinPolygons = bundle.regionSamples.map((sample) => sample.polygon.map(({ x, y }) => ({ x, y })));
  const facialHairPolygons = bundle.masks.filter((mask) => mask.kind === "facial_hair").map((mask) => mask.points.map(({ x, y }) => ({ x, y })));
  const eyeAndBrowExclusions = bundle.masks.filter((mask) => mask.kind === "eye" || mask.kind === "brow").map((mask) => mask.points.map(({ x, y }) => ({ x, y })));
  const foreheadGuide = { x: foreheadCenter.x, y: (foreheadCenter.y + betweenBrows.y) / 2 };
  const noseLeftTop = { x: betweenBrows.x - 0.035, y: betweenBrows.y + 0.025 };
  const noseLeftBottom = { x: noseTip.x - 0.035, y: noseTip.y - 0.025 };
  const noseRightTop = { x: betweenBrows.x + 0.035, y: betweenBrows.y + 0.025 };
  const noseRightBottom = { x: noseTip.x + 0.035, y: noseTip.y - 0.025 };
  const leftJawEnd = { x: chin.x - 0.055, y: chin.y - 0.015 };
  const rightJawEnd = { x: chin.x + 0.055, y: chin.y - 0.015 };
  const complexionGuides: MakeupComplexionGuideGeometry[] = [
    {
      id: "t_zone_highlight", role: "highlight", anchors: [foreheadGuide, betweenBrows, noseTip],
      polygons: [rectangle(foreheadGuide, 0.13, 0.018), band(betweenBrows, noseTip, 0.014)],
      vectors: [
        { origin: foreheadGuide, dx: -0.11, dy: 0 },
        { origin: foreheadGuide, dx: 0.11, dy: 0 },
        { origin: betweenBrows, dx: noseTip.x - betweenBrows.x, dy: noseTip.y - betweenBrows.y - 0.01 },
      ],
    },
    {
      id: "nose_contour", role: "shadow", anchors: [noseLeftTop, noseRightTop],
      polygons: [band(noseLeftTop, noseLeftBottom, 0.011), band(noseRightTop, noseRightBottom, 0.011)],
      vectors: [
        { origin: noseLeftTop, dx: noseLeftBottom.x - noseLeftTop.x, dy: noseLeftBottom.y - noseLeftTop.y },
        { origin: noseRightTop, dx: noseRightBottom.x - noseRightTop.x, dy: noseRightBottom.y - noseRightTop.y },
      ],
    },
    {
      id: "jaw_shadow", role: "shadow", anchors: [leftJaw, rightJaw],
      polygons: [band(leftJaw, leftJawEnd, 0.018), band(rightJaw, rightJawEnd, 0.018)],
      vectors: [
        { origin: leftJaw, dx: leftJawEnd.x - leftJaw.x, dy: leftJawEnd.y - leftJaw.y },
        { origin: rightJaw, dx: rightJawEnd.x - rightJaw.x, dy: rightJawEnd.y - rightJaw.y },
      ],
    },
  ];
  const byModule: Record<MakeupModule, MakeupModuleGeometry> = {
    base: geometry([], skinPolygons, [], facialHairPolygons, complexionGuides),
    brow: geometry([leftBrow[0], leftBrow[Math.floor(leftBrow.length / 4)], leftBrow[Math.floor(leftBrow.length / 2) - 1], rightBrow[0], rightBrow[Math.floor(rightBrow.length / 4)], rightBrow[Math.floor(rightBrow.length / 2) - 1]], [leftBrow, rightBrow], [
      { origin: leftBrow[0], dx: leftBrow[Math.floor(leftBrow.length / 2) - 1].x - leftBrow[0].x, dy: leftBrow[Math.floor(leftBrow.length / 2) - 1].y - leftBrow[0].y },
      { origin: rightBrow[0], dx: rightBrow[Math.floor(rightBrow.length / 2) - 1].x - rightBrow[0].x, dy: rightBrow[Math.floor(rightBrow.length / 2) - 1].y - rightBrow[0].y },
    ]),
    eyeshadow: geometry([leftEyeInner, leftEyeOuter, rightEyeInner, rightEyeOuter], denseLeftEye.length ? [eyeshadowZone(leftEye), eyeshadowZone(rightEye)] : [polygon({ x: (leftEyeInner.x + leftEyeOuter.x) / 2, y: leftEye[1].y - 0.012 }, 0.105, 0.065), polygon({ x: (rightEyeInner.x + rightEyeOuter.x) / 2, y: rightEye[1].y - 0.012 }, 0.105, 0.065)], [
      { origin: leftEyeInner, dx: leftEyeOuter.x - leftEyeInner.x, dy: -0.02 }, { origin: rightEyeInner, dx: rightEyeOuter.x - rightEyeInner.x, dy: -0.02 },
    ], eyeAndBrowExclusions),
    eyeliner: geometry([leftEyeInner, leftEyeOuter, rightEyeInner, rightEyeOuter], [], [
      { origin: leftEyeInner, dx: leftEyeOuter.x - leftEyeInner.x - 0.025, dy: leftEyeOuter.y - leftEyeInner.y - 0.018 },
      { origin: rightEyeInner, dx: rightEyeOuter.x - rightEyeInner.x + 0.025, dy: rightEyeOuter.y - rightEyeInner.y - 0.018 },
    ]),
    blush: geometry([leftCheek, rightCheek], topologySet("left_cheek").length ? [topologySet("left_cheek"), topologySet("right_cheek")] : [polygon(leftCheek, 0.095, 0.06), polygon(rightCheek, 0.095, 0.06)], [
      { origin: leftCheek, dx: -0.12, dy: -0.055 }, { origin: rightCheek, dx: 0.12, dy: -0.055 },
    ]),
    lip: geometry([lips[0], lips[3], lips[6], lips[9]], [lips], [], facialHairPolygons),
    lashes: geometry([leftEyeOuter, rightEyeOuter], [], [
      { origin: leftEye[1], dx: -0.025, dy: -0.07 }, { origin: leftEye[2], dx: 0, dy: -0.075 }, { origin: rightEye[1], dx: 0, dy: -0.075 }, { origin: rightEye[2], dx: 0.025, dy: -0.07 },
    ]),
  };
  for (const module of MAKEUP_MODULES) {
    const current = byModule[module];
    if ([...current.anchors, ...current.polygons.flat(), ...current.excludedPolygons.flat(), ...current.vectors.map((vector) => vector.origin)].some(({ x, y }) => x < 0 || x > 1 || y < 0 || y > 1)) {
      throw new Error("MAKEUP_ANCHOR_OUT_OF_BOUNDS");
    }
  }
  return byModule;
}

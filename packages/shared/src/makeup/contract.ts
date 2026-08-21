import type { MakeupInterviewProfileV2, MakeupMode, MakeupRecommendationRationaleV1 } from "./interview.ts";

export const MAKEUP_MODULES = ["base", "brow", "eyeshadow", "eyeliner", "blush", "lip", "lashes"] as const;
export type MakeupModule = (typeof MAKEUP_MODULES)[number];
export type MakeupGender = "male" | "female" | "nonbinary" | "not_provided" | null;

export interface MakeupContextProfile {
  presentation: "invisible_correction" | "natural_grooming" | "defined" | "expressive" | "editorial";
  makeupMode?: MakeupMode;
  occasions: string[];
  preparationMinutes: 5 | 10 | 20 | 30;
  skillLevel: "none" | "basic" | "intermediate" | "advanced";
  finishPreference: "matte" | "semi_matte" | "natural" | "semi_glow" | "glow";
  exclusions: string[];
  ownedProductTypes: string[];
  ownedToolTypes: string[];
  gender: MakeupGender;
  facialHair: { type: "none" | "stubble" | "mustache" | "beard" | "mixed"; userWantsCoverage: boolean };
}

export interface MakeupNormalizedPoint { x: number; y: number }
export interface MakeupDirectionVector { origin: MakeupNormalizedPoint; dx: number; dy: number }
export type MakeupComplexionGuideId = "t_zone_highlight" | "nose_contour" | "jaw_shadow";
export interface MakeupComplexionGuideGeometry {
  id: MakeupComplexionGuideId;
  role: "highlight" | "shadow";
  anchors: MakeupNormalizedPoint[];
  polygons: MakeupNormalizedPoint[][];
  vectors: MakeupDirectionVector[];
}
export interface MakeupModuleGeometry {
  coordinateSpace: "normalized_source_image";
  anchors: MakeupNormalizedPoint[];
  polygons: MakeupNormalizedPoint[][];
  excludedPolygons: MakeupNormalizedPoint[][];
  vectors: MakeupDirectionVector[];
  complexionGuides?: MakeupComplexionGuideGeometry[];
}

export type MakeupTopologyPointSetId =
  | "face_oval"
  | "left_brow_upper"
  | "left_brow_lower"
  | "right_brow_upper"
  | "right_brow_lower"
  | "left_eye"
  | "right_eye"
  | "outer_lip"
  | "inner_lip"
  | "nose_bridge"
  | "nose_left"
  | "nose_right"
  | "left_cheek"
  | "right_cheek"
  | "t_zone";

export type MakeupTopologyCalloutId = "brow" | "eye" | "blush" | "lip" | MakeupComplexionGuideId;

export interface MakeupTopologyPointSetV2 {
  id: MakeupTopologyPointSetId;
  sourceIndices: number[];
  points: MakeupNormalizedPoint[];
  closed: boolean;
}

export interface MakeupTopologyModuleRegionV2 {
  module: MakeupModule;
  paths: MakeupNormalizedPoint[][];
  strokePaths: MakeupNormalizedPoint[][];
  calloutAnchors: MakeupNormalizedPoint[];
}

export interface MakeupTopologyProjectionV2 {
  version: "makeup-topology-v2";
  coordinateSpace: "normalized_source_image";
  sourceModel: { provider: string; name: string; version: string; pointCount: number };
  pointSets: MakeupTopologyPointSetV2[];
  moduleRegions: MakeupTopologyModuleRegionV2[];
  calloutAnchors: Array<{ id: MakeupTopologyCalloutId; point: MakeupNormalizedPoint }>;
  confidence: number;
  degradedReason: null | "insufficient_points" | "low_confidence" | "occluded";
}

export const MAKEUP_ATLAS_MODES = ["structure", "application", "precision"] as const;
export type MakeupAtlasMode = (typeof MAKEUP_ATLAS_MODES)[number];

export const MAKEUP_ATLAS_LINE_IDS = [
  "face.oval",
  "face.temple.left",
  "face.temple.right",
  "face.cheekbone.left",
  "face.cheekbone.right",
  "face.jaw.left",
  "face.jaw.right",
  "face.chin",
  "brow.upper.left",
  "brow.lower.left",
  "brow.axis.left",
  "brow.upper.right",
  "brow.lower.right",
  "brow.axis.right",
  "eye.upper.left",
  "eye.lower.left",
  "eye.crease.left",
  "eye.under.left",
  "eye.upper.right",
  "eye.lower.right",
  "eye.crease.right",
  "eye.under.right",
  "nose.bridge.center",
  "nose.bridge.left",
  "nose.bridge.right",
  "nose.alar.left",
  "nose.alar.right",
  "nose.tip",
  "lip.outer.upper",
  "lip.outer.lower",
  "lip.inner.upper",
  "lip.inner.lower",
  "lip.cupid",
  "lip.corner.axis.left",
  "lip.corner.axis.right",
  "center.philtrum",
  "center.nasolabial.left",
  "center.nasolabial.right",
  "center.chin",
  "makeup.t-zone",
  "makeup.c-zone.left",
  "makeup.c-zone.right",
  "makeup.blush.left",
  "makeup.blush.right",
  "makeup.jaw-shadow.left",
  "makeup.jaw-shadow.right",
] as const;

export type MakeupAtlasLineId = (typeof MAKEUP_ATLAS_LINE_IDS)[number];

export interface MakeupDenseAtlasLineSetV3 {
  id: MakeupAtlasLineId;
  sourceIndices: number[];
  points: MakeupNormalizedPoint[];
  open: true;
  confidence: number;
  role: "structure" | "application";
  modules: MakeupModule[];
}

export interface MakeupDenseAtlasV3 {
  version: "makeup-dense-atlas-v3";
  coordinateSpace: "normalized_source_image";
  sourceModel: {
    provider: string;
    name: string;
    version: string;
    pointCount: number;
  };
  sourceCorrectionRevision: number;
  lineSets: MakeupDenseAtlasLineSetV3[];
  precisionTickSourceIndices: number[];
  precisionTicks: Array<{ sourceIndex: number; point: MakeupNormalizedPoint }>;
  uniqueSourcePointCount: number;
  segmentCount: number;
  degradedReason: null | "insufficient_points" | "low_confidence" | "occluded";
}

export type MakeupTechnicalParameter = string | number | boolean | string[] | number[];

export interface MakeupTechnicalDirection {
  kind: MakeupModule;
  zonePolicyVersion: "makeup-zone-policy-v1" | "context-required";
  placement: string[];
  applicationDirection: string[];
  finish: string;
  technique: string;
  productAttributes: string[];
  warnings: string[];
  parameters: Record<string, MakeupTechnicalParameter>;
}

export interface MakeupModuleDirection {
  module: MakeupModule;
  state: "enabled" | "disabled_by_user" | "not_applicable";
  geometry: MakeupModuleGeometry;
  direction: {
    enabled: boolean;
    intensity: number;
    colorFamily: string | null;
    texture: string | null;
    evidenceIds: string[];
    reasons: string[];
    technical: MakeupTechnicalDirection;
  };
}

export interface MakeupGeometryPatch {
  anchors?: Array<{ index: number; point: MakeupNormalizedPoint }>;
  polygons?: Array<{ polygonIndex: number; pointIndex: number; point: MakeupNormalizedPoint }>;
  vectors?: Array<{ index: number; origin?: MakeupNormalizedPoint; dx?: number; dy?: number }>;
}

export interface MakeupModulePatch {
  expectedRevision: number;
  state?: "enabled" | "disabled_by_user";
  geometry?: MakeupGeometryPatch;
  direction?: Partial<Pick<MakeupModuleDirection["direction"], "enabled" | "intensity" | "colorFamily" | "texture">>;
}

export type MakeupSourceStaleReason = "face_observation_changed" | "personal_color_changed" | "selected_style_changed" | "input_profile_changed";

export interface MakeupDirectionSnapshot {
  schemaVersion: "makeup-direction-snapshot-v1";
  id: string;
  consultationId: string;
  version: number;
  status: "context_draft" | "geometry_building" | "map_ready" | "partial_ready" | "user_adjusted" | "confirmed" | "routine_ready" | "brief_ready" | "failed_retryable" | "superseded";
  source: { faceObservationBundleId: string; personalColorProfileId: string; selectedStyleId: string; inputProfileRevision: number };
  context: MakeupContextProfile;
  interviewProfile?: MakeupInterviewProfileV2;
  rationale?: MakeupRecommendationRationaleV1;
  modules: MakeupModuleDirection[];
  topologyProjection?: MakeupTopologyProjectionV2;
  denseAtlas?: MakeupDenseAtlasV3;
  modelManifest: { geometryPolicyVersion: string; directionPolicyVersion: string; routinePolicyVersion: string; explanationModel: string | null; createdAt: string };
  confirmedAt: string | null;
  createdAt: string;
}

export interface MakeupRoutine {
  id: string;
  makeupDirectionSnapshotId: string;
  source: MakeupDirectionSnapshot["source"];
  rationaleRevision: number | null;
  mode: "compact" | "full";
  estimatedSeconds: number;
  steps: Array<{ order: number; module: MakeupModule; instruction: string; zoneIds: string[]; colorAttribute: string | null; intensity: number | null; toolType: string | null; estimatedSeconds: number; failurePreventionTips: string[]; productSearchTerms: string[] }>;
  createdAt: string;
}

export interface MakeupArtistBrief {
  id: string;
  makeupDirectionSnapshotId: string;
  source: MakeupDirectionSnapshot["source"];
  rationaleRevision: number | null;
  sourcePhotoIncluded: false;
  context: Pick<MakeupContextProfile, "presentation" | "occasions" | "preparationMinutes" | "skillLevel" | "finishPreference" | "facialHair">;
  presentationIntensity: number;
  exclusions: string[];
  moduleSummaries: Array<{ module: MakeupModule; enabled: boolean; colorFamily: string | null; intensity: number; finish: string; placement: string[]; applicationDirection: string[]; technique: string; cautions: string[] }>;
  narrative: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function availableMakeupModules(_gender: MakeupGender) {
  return [...MAKEUP_MODULES];
}

function pointInBounds(point: MakeupNormalizedPoint) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export function assertMakeupContextProfile(context: MakeupContextProfile) {
  if (!["invisible_correction", "natural_grooming", "defined", "expressive", "editorial"].includes(context.presentation)
    || (context.makeupMode !== undefined && !["transparent_correction", "daily_natural", "soft_blend", "full_definition", "glam_event", "fashion_editorial"].includes(context.makeupMode))
    || ![5, 10, 20, 30].includes(context.preparationMinutes)
    || !["none", "basic", "intermediate", "advanced"].includes(context.skillLevel)
    || !["matte", "semi_matte", "natural", "semi_glow", "glow"].includes(context.finishPreference)
    || !["none", "stubble", "mustache", "beard", "mixed"].includes(context.facialHair.type)) {
    throw new Error("MAKEUP_CONTEXT_INVALID");
  }
  for (const values of [context.occasions, context.exclusions, context.ownedProductTypes, context.ownedToolTypes]) {
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) throw new Error("MAKEUP_CONTEXT_INVALID");
  }
}

export function assertMakeupDirectionSnapshot(snapshot: MakeupDirectionSnapshot) {
  if (snapshot.schemaVersion !== "makeup-direction-snapshot-v1" || !snapshot.id || !snapshot.consultationId || !Number.isInteger(snapshot.version) || snapshot.version < 1) {
    throw new Error("MAKEUP_DIRECTION_SNAPSHOT_IDENTITY_INVALID");
  }
  const modules = new Set(snapshot.modules.map((item) => item.module));
  if (snapshot.modules.length !== MAKEUP_MODULES.length || MAKEUP_MODULES.some((module) => !modules.has(module))) {
    throw new Error("MAKEUP_DIRECTION_SNAPSHOT_MODULES_INVALID");
  }
  const points = snapshot.modules.flatMap((item) => [
    ...item.geometry.anchors,
    ...item.geometry.polygons.flat(),
    ...item.geometry.excludedPolygons.flat(),
    ...item.geometry.vectors.map((vector) => vector.origin),
    ...(item.geometry.complexionGuides ?? []).flatMap((guide) => [
      ...guide.anchors,
      ...guide.polygons.flat(),
      ...guide.vectors.map((vector) => vector.origin),
    ]),
  ]);
  if (points.some((point) => !pointInBounds(point))) throw new Error("MAKEUP_DIRECTION_SNAPSHOT_GEOMETRY_INVALID");
  if (snapshot.modules.some((item) => [...item.geometry.polygons, ...item.geometry.excludedPolygons].some((polygon) => polygon.length < 3)
      || item.geometry.vectors.some((vector) => !Number.isFinite(vector.dx) || !Number.isFinite(vector.dy)
      || vector.dx < -1 || vector.dx > 1 || vector.dy < -1 || vector.dy > 1)
      || (item.geometry.complexionGuides ?? []).some((guide) => guide.polygons.some((polygon) => polygon.length < 3)
        || guide.vectors.some((vector) => !Number.isFinite(vector.dx) || !Number.isFinite(vector.dy)
          || vector.dx < -1 || vector.dx > 1 || vector.dy < -1 || vector.dy > 1)))) {
    throw new Error("MAKEUP_DIRECTION_SNAPSHOT_GEOMETRY_INVALID");
  }
  if (snapshot.modules.some((item) => !Number.isFinite(item.direction.intensity) || item.direction.intensity < 0 || item.direction.intensity > 1)) {
    throw new Error("MAKEUP_DIRECTION_SNAPSHOT_INTENSITY_INVALID");
  }
  const topology = snapshot.topologyProjection;
  if (topology) {
    const topologyPoints = [
      ...topology.pointSets.flatMap((set) => set.points),
      ...topology.moduleRegions.flatMap((region) => [...region.paths.flat(), ...region.strokePaths.flat(), ...region.calloutAnchors]),
      ...topology.calloutAnchors.map((anchor) => anchor.point),
    ];
    const calloutIds = new Set(topology.calloutAnchors.map((anchor) => anchor.id));
    if (topology.version !== "makeup-topology-v2"
      || topology.coordinateSpace !== "normalized_source_image"
      || !Number.isInteger(topology.sourceModel.pointCount)
      || topology.sourceModel.pointCount < 0
      || !Number.isFinite(topology.confidence)
      || topology.confidence < 0
      || topology.confidence > 1
      || topologyPoints.some((point) => !pointInBounds(point))
      || topology.pointSets.some((set) => set.sourceIndices.length !== set.points.length
        || set.sourceIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= topology.sourceModel.pointCount))
      || (!topology.degradedReason && (topology.pointSets.length < 15
        || topology.moduleRegions.length !== MAKEUP_MODULES.length
        || calloutIds.size !== 7))) {
      throw new Error("MAKEUP_DIRECTION_SNAPSHOT_TOPOLOGY_INVALID");
    }
  }
  const denseAtlas = snapshot.denseAtlas;
  if (denseAtlas) {
    const densePoints = denseAtlas.lineSets.flatMap((line) => line.points);
    const lineIds = new Set(denseAtlas.lineSets.map((line) => line.id));
    if (denseAtlas.version !== "makeup-dense-atlas-v3"
      || denseAtlas.coordinateSpace !== "normalized_source_image"
      || !Number.isInteger(denseAtlas.sourceCorrectionRevision)
      || denseAtlas.sourceCorrectionRevision < 0
      || densePoints.some((point) => !pointInBounds(point))
      || denseAtlas.lineSets.some((line) => line.open !== true
        || line.sourceIndices.length !== line.points.length
        || line.sourceIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= denseAtlas.sourceModel.pointCount))
      || (!denseAtlas.degradedReason && (denseAtlas.lineSets.length < 40
        || lineIds.size !== denseAtlas.lineSets.length
        || denseAtlas.uniqueSourcePointCount < 200
        || denseAtlas.segmentCount < 180
        || denseAtlas.precisionTickSourceIndices.length < 300
        || denseAtlas.precisionTickSourceIndices.length > 420))) {
      throw new Error("MAKEUP_DIRECTION_SNAPSHOT_DENSE_ATLAS_INVALID");
    }
    if (denseAtlas.precisionTicks.length !== denseAtlas.precisionTickSourceIndices.length
      || denseAtlas.precisionTicks.some((tick, index) => tick.sourceIndex !== denseAtlas.precisionTickSourceIndices[index]
        || tick.sourceIndex < 0
        || tick.sourceIndex >= denseAtlas.sourceModel.pointCount
        || !pointInBounds(tick.point))) {
      throw new Error("MAKEUP_DIRECTION_SNAPSHOT_DENSE_ATLAS_TICKS_INVALID");
    }
  }
  if (snapshot.modules.some((item) => item.direction.technical.kind !== item.module
    || !["makeup-zone-policy-v1", "context-required"].includes(item.direction.technical.zonePolicyVersion)
    || !item.direction.technical.finish
    || !item.direction.technical.technique
    || !Array.isArray(item.direction.technical.placement)
    || !Array.isArray(item.direction.technical.applicationDirection)
    || !Array.isArray(item.direction.technical.productAttributes)
    || !Array.isArray(item.direction.technical.warnings))) {
    throw new Error("MAKEUP_DIRECTION_SNAPSHOT_TECHNICAL_INVALID");
  }
  assertMakeupContextProfile(snapshot.context);
  if (snapshot.status === "confirmed" && !snapshot.confirmedAt) throw new Error("MAKEUP_DIRECTION_SNAPSHOT_CONFIRMATION_INVALID");
}

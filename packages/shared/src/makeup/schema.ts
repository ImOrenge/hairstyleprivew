import { MAKEUP_ATLAS_LINE_IDS, MAKEUP_MODULES } from "./contract.ts";

const STRING_ARRAY_SCHEMA = { type: "array", items: { type: "string" } } as const;
const POINT_SCHEMA = { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } } } as const;
const VECTOR_SCHEMA = { type: "object", additionalProperties: false, required: ["origin", "dx", "dy"], properties: { origin: POINT_SCHEMA, dx: { type: "number", minimum: -1, maximum: 1 }, dy: { type: "number", minimum: -1, maximum: 1 } } } as const;
const COMPLEXION_GUIDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "role", "anchors", "polygons", "vectors"],
  properties: {
    id: { enum: ["t_zone_highlight", "nose_contour", "jaw_shadow"] },
    role: { enum: ["highlight", "shadow"] },
    anchors: { type: "array", items: POINT_SCHEMA },
    polygons: { type: "array", items: { type: "array", minItems: 3, items: POINT_SCHEMA } },
    vectors: { type: "array", items: VECTOR_SCHEMA },
  },
} as const;
const TOPOLOGY_POINT_SET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "sourceIndices", "points", "closed"],
  properties: {
    id: { enum: ["face_oval", "left_brow_upper", "left_brow_lower", "right_brow_upper", "right_brow_lower", "left_eye", "right_eye", "outer_lip", "inner_lip", "nose_bridge", "nose_left", "nose_right", "left_cheek", "right_cheek", "t_zone"] },
    sourceIndices: { type: "array", items: { type: "integer", minimum: 0 } },
    points: { type: "array", items: POINT_SCHEMA },
    closed: { type: "boolean" },
  },
} as const;
const TOPOLOGY_MODULE_REGION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["module", "paths", "strokePaths", "calloutAnchors"],
  properties: {
    module: { enum: ["base", "brow", "eyeshadow", "eyeliner", "blush", "lip", "lashes"] },
    paths: { type: "array", items: { type: "array", items: POINT_SCHEMA } },
    strokePaths: { type: "array", items: { type: "array", items: POINT_SCHEMA } },
    calloutAnchors: { type: "array", items: POINT_SCHEMA },
  },
} as const;
const TOPOLOGY_PROJECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "coordinateSpace", "sourceModel", "pointSets", "moduleRegions", "calloutAnchors", "confidence", "degradedReason"],
  properties: {
    version: { const: "makeup-topology-v2" },
    coordinateSpace: { const: "normalized_source_image" },
    sourceModel: { type: "object", additionalProperties: false, required: ["provider", "name", "version", "pointCount"], properties: { provider: { type: "string" }, name: { type: "string" }, version: { type: "string" }, pointCount: { type: "integer", minimum: 0 } } },
    pointSets: { type: "array", maxItems: 15, items: TOPOLOGY_POINT_SET_SCHEMA },
    moduleRegions: { type: "array", maxItems: 7, items: TOPOLOGY_MODULE_REGION_SCHEMA },
    calloutAnchors: { type: "array", maxItems: 7, items: { type: "object", additionalProperties: false, required: ["id", "point"], properties: { id: { enum: ["brow", "eye", "blush", "lip", "t_zone_highlight", "nose_contour", "jaw_shadow"] }, point: POINT_SCHEMA } } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    degradedReason: { type: ["string", "null"], enum: ["insufficient_points", "low_confidence", "occluded", null] },
  },
} as const;
const DENSE_ATLAS_LINE_SET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "sourceIndices", "points", "open", "confidence", "role", "modules"],
  properties: {
    id: { enum: MAKEUP_ATLAS_LINE_IDS },
    sourceIndices: { type: "array", minItems: 2, items: { type: "integer", minimum: 0 } },
    points: { type: "array", minItems: 2, items: POINT_SCHEMA },
    open: { const: true },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    role: { enum: ["structure", "application"] },
    modules: { type: "array", items: { enum: MAKEUP_MODULES } },
  },
} as const;
const DENSE_ATLAS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "coordinateSpace", "sourceModel", "sourceCorrectionRevision", "lineSets", "precisionTickSourceIndices", "precisionTicks", "uniqueSourcePointCount", "segmentCount", "degradedReason"],
  properties: {
    version: { const: "makeup-dense-atlas-v3" },
    coordinateSpace: { const: "normalized_source_image" },
    sourceModel: { type: "object", additionalProperties: false, required: ["provider", "name", "version", "pointCount"], properties: { provider: { type: "string" }, name: { type: "string" }, version: { type: "string" }, pointCount: { type: "integer", minimum: 0 } } },
    sourceCorrectionRevision: { type: "integer", minimum: 0 },
    lineSets: { type: "array", maxItems: MAKEUP_ATLAS_LINE_IDS.length, items: DENSE_ATLAS_LINE_SET_SCHEMA },
    precisionTickSourceIndices: { type: "array", maxItems: 420, items: { type: "integer", minimum: 0 } },
    precisionTicks: { type: "array", maxItems: 420, items: { type: "object", additionalProperties: false, required: ["sourceIndex", "point"], properties: { sourceIndex: { type: "integer", minimum: 0 }, point: POINT_SCHEMA } } },
    uniqueSourcePointCount: { type: "integer", minimum: 0 },
    segmentCount: { type: "integer", minimum: 0 },
    degradedReason: { type: ["string", "null"], enum: ["insufficient_points", "low_confidence", "occluded", null] },
  },
} as const;

const MAKEUP_CONTEXT_SCHEMA_CORE = {
  type: "object",
  additionalProperties: false,
  required: ["presentation", "occasions", "preparationMinutes", "skillLevel", "finishPreference", "exclusions", "ownedProductTypes", "ownedToolTypes", "gender", "facialHair"],
  properties: {
    presentation: { type: "string", enum: ["invisible_correction", "natural_grooming", "defined", "expressive", "editorial"] },
    makeupMode: { type: "string", enum: ["transparent_correction", "daily_natural", "soft_blend", "full_definition", "glam_event", "fashion_editorial"] },
    occasions: STRING_ARRAY_SCHEMA,
    preparationMinutes: { type: "integer", enum: [5, 10, 20, 30] },
    skillLevel: { type: "string", enum: ["none", "basic", "intermediate", "advanced"] },
    finishPreference: { type: "string", enum: ["matte", "semi_matte", "natural", "semi_glow", "glow"] },
    exclusions: STRING_ARRAY_SCHEMA,
    ownedProductTypes: STRING_ARRAY_SCHEMA,
    ownedToolTypes: STRING_ARRAY_SCHEMA,
    gender: { type: ["string", "null"], enum: ["male", "female", "nonbinary", "not_provided", null] },
    facialHair: { type: "object", additionalProperties: false, required: ["type", "userWantsCoverage"], properties: { type: { enum: ["none", "stubble", "mustache", "beard", "mixed"] }, userWantsCoverage: { type: "boolean" } } },
  },
} as const;

export const MAKEUP_CONTEXT_PROFILE_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://hairfit.beauty/schemas/makeup-context-profile.json",
  title: "MakeupContextProfile",
  ...MAKEUP_CONTEXT_SCHEMA_CORE,
} as const;

export const MAKEUP_DIRECTION_SNAPSHOT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://hairfit.beauty/schemas/makeup-direction-snapshot-v1.json",
  title: "MakeupDirectionSnapshot",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "consultationId", "version", "status", "source", "context", "modules", "modelManifest", "confirmedAt", "createdAt"],
  properties: {
    schemaVersion: { const: "makeup-direction-snapshot-v1" },
    id: { type: "string", minLength: 1 },
    consultationId: { type: "string", minLength: 1 },
    version: { type: "integer", minimum: 1 },
    status: { enum: ["context_draft", "geometry_building", "map_ready", "partial_ready", "user_adjusted", "confirmed", "routine_ready", "brief_ready", "failed_retryable", "superseded"] },
    source: { type: "object", additionalProperties: false, required: ["faceObservationBundleId", "personalColorProfileId", "selectedStyleId", "inputProfileRevision"], properties: { faceObservationBundleId: { type: "string" }, personalColorProfileId: { type: "string" }, selectedStyleId: { type: "string" }, inputProfileRevision: { type: "integer", minimum: 1 } } },
    context: MAKEUP_CONTEXT_SCHEMA_CORE,
    interviewProfile: { type: "object" },
    rationale: { type: "object" },
    modules: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["module", "state", "geometry", "direction"],
        properties: {
          module: { enum: ["base", "brow", "eyeshadow", "eyeliner", "blush", "lip", "lashes"] },
          state: { enum: ["enabled", "disabled_by_user", "not_applicable"] },
          geometry: { type: "object", additionalProperties: false, required: ["coordinateSpace", "anchors", "polygons", "excludedPolygons", "vectors"], properties: { coordinateSpace: { const: "normalized_source_image" }, anchors: { type: "array", items: POINT_SCHEMA }, polygons: { type: "array", items: { type: "array", items: POINT_SCHEMA } }, excludedPolygons: { type: "array", items: { type: "array", items: POINT_SCHEMA } }, vectors: { type: "array", items: VECTOR_SCHEMA }, complexionGuides: { type: "array", maxItems: 3, items: COMPLEXION_GUIDE_SCHEMA } } },
          direction: { type: "object", additionalProperties: false, required: ["enabled", "intensity", "colorFamily", "texture", "evidenceIds", "reasons", "technical"], properties: { enabled: { type: "boolean" }, intensity: { type: "number", minimum: 0, maximum: 1 }, colorFamily: { type: ["string", "null"] }, texture: { type: ["string", "null"] }, evidenceIds: STRING_ARRAY_SCHEMA, reasons: STRING_ARRAY_SCHEMA, technical: { type: "object", additionalProperties: false, required: ["kind", "zonePolicyVersion", "placement", "applicationDirection", "finish", "technique", "productAttributes", "warnings", "parameters"], properties: { kind: { enum: ["base", "brow", "eyeshadow", "eyeliner", "blush", "lip", "lashes"] }, zonePolicyVersion: { enum: ["makeup-zone-policy-v1", "context-required"] }, placement: STRING_ARRAY_SCHEMA, applicationDirection: STRING_ARRAY_SCHEMA, finish: { type: "string", minLength: 1 }, technique: { type: "string", minLength: 1 }, productAttributes: STRING_ARRAY_SCHEMA, warnings: STRING_ARRAY_SCHEMA, parameters: { type: "object", additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "array", items: { type: "string" } }, { type: "array", items: { type: "number" } }] } } } } } },
        },
      },
    },
    topologyProjection: TOPOLOGY_PROJECTION_SCHEMA,
    denseAtlas: DENSE_ATLAS_SCHEMA,
    recipeBinding: {
      type: "object",
      additionalProperties: false,
      required: ["cycleId", "cycleVersion", "recipeId", "recipeFingerprint", "presentationFamily"],
      properties: {
        cycleId: { type: "string", minLength: 1 },
        cycleVersion: { type: "integer", minimum: 1 },
        recipeId: { type: "string", minLength: 1 },
        recipeFingerprint: { type: "string", pattern: "^[a-fA-F0-9]{64}$" },
        presentationFamily: { enum: ["masculine", "feminine", "neutral"] },
      },
    },
    modelManifest: { type: "object", additionalProperties: false, required: ["geometryPolicyVersion", "directionPolicyVersion", "routinePolicyVersion", "explanationModel", "createdAt"], properties: { geometryPolicyVersion: { type: "string" }, directionPolicyVersion: { type: "string" }, routinePolicyVersion: { type: "string" }, explanationModel: { type: ["string", "null"] }, createdAt: { type: "string", format: "date-time" } } },
    confirmedAt: { type: ["string", "null"], format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

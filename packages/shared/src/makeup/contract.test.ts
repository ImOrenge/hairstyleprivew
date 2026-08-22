import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { MAKEUP_MODULES, assertMakeupDirectionSnapshot, availableMakeupModules, type MakeupContextProfile, type MakeupDirectionSnapshot, type MakeupGender } from "./contract.ts";
import { MAKEUP_CONTEXT_PROFILE_JSON_SCHEMA, MAKEUP_DIRECTION_SNAPSHOT_JSON_SCHEMA } from "./schema.ts";
import { buildMakeupFoundationSnapshotV1 } from "./foundation.ts";
import { validateMakeupModulePatchBounds } from "./zone-policy.ts";
import { compileMakeupArtistBriefV1, compileMakeupRoutineV1 } from "./artifacts.ts";
import { compileMakeupTopologyProjectionV2, uniqueMakeupTopologyPointCount } from "./topology-v2.ts";
import { assertMakeupDenseAtlasV3, compileMakeupDenseAtlasV3, makeupDenseAtlasLinesForMode } from "./topology-v3.ts";
import { assertMakeupSemanticMapV3, compileMakeupSemanticProjectionV3, parseMakeupSemanticMapV3Json, type MakeupSemanticArtifactV3, type MakeupSemanticMapV3 } from "./semantic-v3.ts";
import { MAKEUP_P38_FACE_SHAPES, MAKEUP_P38_FIXTURE_CASES, MAKEUP_P38_OCCLUSIONS, MAKEUP_P38_SKIN_TONE_GROUPS, makeupP38FixtureLandmarks } from "./fixtures-v3.ts";
import type { FaceObservationBundleV2 } from "../personal-color-v2/observation.ts";
import type { PersonalColorProfileV2 } from "../personal-color-v2/contract.ts";
import { MAKEUP_MODES, defaultMakeupInterviewProfile, isMakeupInterviewComplete, makeupContextFromInterview } from "./interview.ts";
import { compileMakeupRecommendationRationaleV1 } from "./rationale.ts";

function snapshot(): MakeupDirectionSnapshot {
  const createdAt = "2026-08-14T00:00:00.000Z";
  return {
    schemaVersion: "makeup-direction-snapshot-v1",
    id: "makeup-snapshot",
    consultationId: "consultation-v2",
    version: 1,
    status: "map_ready",
    source: {
      faceObservationBundleId: "observation",
      personalColorProfileId: "profile",
      selectedStyleId: "style",
      inputProfileRevision: 1,
    },
    context: {
      presentation: "natural_grooming",
      occasions: ["daily"],
      preparationMinutes: 10,
      skillLevel: "basic",
      finishPreference: "natural",
      exclusions: [],
      ownedProductTypes: [],
      ownedToolTypes: [],
      gender: null,
      facialHair: { type: "none", userWantsCoverage: false },
    },
    modules: MAKEUP_MODULES.map((module) => ({
      module,
      state: "enabled",
      geometry: {
        coordinateSpace: "normalized_source_image",
        anchors: [{ x: 0.5, y: 0.5 }],
        polygons: [],
        excludedPolygons: [],
        vectors: [],
      },
      direction: {
        enabled: true,
        intensity: 0.5,
        colorFamily: null,
        texture: null,
        evidenceIds: [],
        reasons: [],
        technical: {
          kind: module,
          zonePolicyVersion: "makeup-zone-policy-v1",
          placement: ["zone"],
          applicationDirection: ["direction"],
          finish: "natural",
          technique: "test",
          productAttributes: [],
          warnings: [],
          parameters: {},
        },
      },
    })),
    modelManifest: {
      geometryPolicyVersion: "v1",
      directionPolicyVersion: "v1",
      routinePolicyVersion: "v1",
      explanationModel: null,
      createdAt,
    },
    confirmedAt: null,
    createdAt,
  };
}

test("makeup module availability is invariant across gender values", () => {
  const genders: MakeupGender[] = ["male", "female", "nonbinary", "not_provided", null];
  for (const gender of genders) assert.deepEqual(availableMakeupModules(gender), [...MAKEUP_MODULES]);
});

test("makeup interview exposes six modes and required five-topic coverage", () => {
  assert.equal(MAKEUP_MODES.length, 6);
  const profile = defaultMakeupInterviewProfile(snapshot().context);
  assert.equal(isMakeupInterviewComplete(profile), false);
  profile.completedTopics = ["mode", "occasion", "finish", "practicality", "avoid"];
  assert.equal(isMakeupInterviewComplete(profile), true);
  assert.equal(makeupContextFromInterview(profile, "glam_event").presentation, "expressive");
});

test("makeup rationale proposes but never silently accepts a constrained adjustment", () => {
  const profile = {
    ...defaultMakeupInterviewProfile(snapshot().context),
    primaryMode: "full_definition" as const,
    preparationMinutes: 5 as const,
    skillLevel: "none" as const,
    revision: 3,
  };
  const rationale = compileMakeupRecommendationRationaleV1({
    profile,
    source: snapshot().source,
    personalColor: {
      label: "가을 뮤트",
      confidence: 0.8,
      palette: ["#8c6d5b"],
    },
    face: { quality: "ready", validSkinPixelRatio: 0.9, warnings: [] },
    hair: { colorFamily: "dark brown", fringe: "side", parting: "6:4" },
  });
  assert.equal(rationale.requestedMode, "full_definition");
  assert.equal(rationale.suggestedMode, "soft_blend");
  assert.equal(rationale.adjustmentRequired, true);
  assert.equal(rationale.acceptedMode, null);
  assert.equal(rationale.decision, "pending");
  assert.equal(rationale.evidence.length, 5);
  assert.equal(rationale.modules.length, 7);
});

test("makeup skeleton requires all seven modules and normalized geometry", () => {
  const value = snapshot();
  assert.doesNotThrow(() => assertMakeupDirectionSnapshot(value));
  const ajv = new Ajv2020({ strict: false });
  ajv.addFormat("date-time", true);
  assert.equal(ajv.compile(MAKEUP_CONTEXT_PROFILE_JSON_SCHEMA)(value.context), true);
  const validateSnapshot = ajv.compile(MAKEUP_DIRECTION_SNAPSHOT_JSON_SCHEMA);
  assert.equal(validateSnapshot(value), true, JSON.stringify(validateSnapshot.errors));
  assert.equal(MAKEUP_CONTEXT_PROFILE_JSON_SCHEMA.properties.preparationMinutes.enum.length, 4);
  assert.equal(MAKEUP_DIRECTION_SNAPSHOT_JSON_SCHEMA.properties.modules.minItems, 7);
  value.modules[0].geometry.anchors[0] = { x: 1.1, y: 0.5 };
  assert.throws(() => assertMakeupDirectionSnapshot(value), /GEOMETRY_INVALID/);
});

const observation = {
  schemaVersion: "face-observation-bundle-v2",
  id: "observation",
  consultationId: "consultation-v2",
  sourceAnalysisEvidenceId: "evidence",
  inputHash: "a".repeat(64),
  modelHash: "b".repeat(64),
  sourceAssets: [],
  sourceTransform: {
    rotationDegrees: 0,
    sourceWidth: 1000,
    sourceHeight: 1250,
    coordinateSpace: "normalized-upright-source-v1",
  },
  landmarks: [],
  masks: [],
  calibration: {
    inputColorSpace: "srgb",
    workingColorSpace: "linear-srgb",
    referenceWhite: "D65",
    method: "srgb-estimated-white-balance-v1",
    whiteBalanceGains: [1, 1, 1],
  },
  regionSamples: [
    {
      regionId: "left_cheek_upper",
      polygon: [
        { x: 0.2, y: 0.45 },
        { x: 0.42, y: 0.45 },
        { x: 0.38, y: 0.68 },
      ],
      statistics: {
        median: { l: 70, a: 8, b: 12 },
        trimmedMean: { l: 70, a: 8, b: 12 },
        mad: { l: 1, a: 1, b: 1 },
        chromaMedian: 14,
        hueDegreesMedian: 56,
        sampledPixelCount: 100,
        validPixelCount: 90,
        validPixelRatio: 0.9,
      },
      excludedByKind: {},
      warnings: [],
    },
  ],
  quality: {
    status: "usable",
    validSkinPixelRatio: 0.9,
    crossRegionMaxDeltaE: null,
    warnings: [],
  },
  modelManifest: [],
  correctionRevision: 0,
  createdAt: "2026-08-15T00:00:00.000Z",
} as FaceObservationBundleV2;
const personalColor = {
  schemaVersion: "personal-color-profile-v2",
  id: "profile",
  consultationId: "consultation-v2",
  version: 1,
  status: "profile_ready",
  captureMode: "quick",
  observationBundleId: "observation",
  calibration: {
    method: "estimated_white_balance",
    referenceWhite: "D65",
    confidence: 0.8,
    version: "v1",
    meanDeltaE00: null,
  },
  regions: [],
  axes: {
    temperature: {
      value: 0,
      confidence: 0.5,
      evidenceIds: [],
      unavailableReason: null,
    },
    value: {
      value: 0,
      confidence: 0.5,
      evidenceIds: [],
      unavailableReason: null,
    },
    chroma: {
      value: 0,
      confidence: 0.5,
      evidenceIds: [],
      unavailableReason: null,
    },
    contrast: {
      value: 0,
      confidence: 0.5,
      evidenceIds: [],
      unavailableReason: null,
    },
    hueCharacter: {
      value: 0,
      confidence: 0.5,
      evidenceIds: [],
      unavailableReason: null,
    },
  },
  seasonalPosterior: [],
  displayClassification: null,
  harmonyPalette: {
    best: ["soft_peach"],
    base: ["neutral_beige"],
    accent: ["rose"],
    challenge: [],
    metals: [],
  },
  preferenceProfile: {
    likedColorIds: [],
    dislikedColorIds: [],
    preferredContrast: null,
  },
  confidence: {
    overall: 0.6,
    typeConfidence: 0.5,
    paletteConfidence: 0.5,
    stability: 0.5,
  },
  modelManifest: {
    profileModel: "v1",
    axisPolicyVersion: "v1",
    posteriorVersion: "v1",
    paletteVersion: "v1",
    createdAt: "2026-08-15T00:00:00.000Z",
  },
  legacyProjectionHash: null,
  drapeValidatedAt: null,
  confirmedAt: null,
  createdAt: "2026-08-15T00:00:00.000Z",
} as PersonalColorProfileV2;

test("foundation compiler produces seven bounded modules without gender gating", () => {
  const build = (gender: MakeupGender) =>
    buildMakeupFoundationSnapshotV1({
      id: `snapshot-${gender}`,
      consultationId: "consultation-v2",
      version: 1,
      source: {
        faceObservationBundleId: "observation",
        personalColorProfileId: "profile",
        selectedStyleId: "style",
        inputProfileRevision: 1,
      },
      context: { ...snapshot().context, gender },
      observation,
      personalColor,
      createdAt: "2026-08-15T00:00:00.000Z",
    });
  const baseline = build(null);
  for (const gender of ["male", "female", "nonbinary", "not_provided"] as MakeupGender[]) {
    const candidate = build(gender);
    assert.deepEqual(
      candidate.modules.map(({ module, state, direction }) => ({
        module,
        state,
        enabled: direction.enabled,
        intensity: direction.intensity,
      })),
      baseline.modules.map(({ module, state, direction }) => ({
        module,
        state,
        enabled: direction.enabled,
        intensity: direction.intensity,
      })),
    );
  }
  assert.equal(baseline.modules.length, 7);
  const complexionGuides = baseline.modules.find((item) => item.module === "base")?.geometry.complexionGuides ?? [];
  assert.deepEqual(
    complexionGuides.map((guide) => guide.id),
    ["t_zone_highlight", "nose_contour", "jaw_shadow"],
  );
  assert.ok(complexionGuides.every((guide) => guide.polygons.length > 0 && guide.vectors.length > 0));
  const ajv = new Ajv2020({ strict: false });
  ajv.addFormat("date-time", true);
  const validateSnapshot = ajv.compile(MAKEUP_DIRECTION_SNAPSHOT_JSON_SCHEMA);
  assert.equal(validateSnapshot(baseline), true, JSON.stringify(validateSnapshot.errors));
  assert.doesNotThrow(() => assertMakeupDirectionSnapshot(baseline));
});

test("dense topology projects a deterministic bounded FaceMesh map with seven callouts", () => {
  const denseObservation: FaceObservationBundleV2 = {
    ...observation,
    landmarks: Array.from({ length: 468 }, (_, index) => ({
      x: 0.2 + (index % 26) / 50,
      y: 0.12 + Math.floor(index / 26) / 28,
    })),
    modelManifest: [
      {
        component: "face-landmarks",
        provider: "tensorflow-js",
        name: "MediaPipeFaceMesh",
        version: "1",
      },
    ],
  };
  const projection = compileMakeupTopologyProjectionV2(denseObservation);
  assert.equal(projection.degradedReason, null);
  assert.equal(projection.pointSets.length, 15);
  assert.equal(projection.moduleRegions.length, 7);
  assert.equal(new Set(projection.calloutAnchors.map((item) => item.id)).size, 7);
  assert.ok(uniqueMakeupTopologyPointCount(projection) >= 140);
  assert.ok(uniqueMakeupTopologyPointCount(projection) <= 190);
  const built = buildMakeupFoundationSnapshotV1({
    id: "dense-topology",
    consultationId: "consultation-v2",
    version: 1,
    source: {
      faceObservationBundleId: "observation",
      personalColorProfileId: "profile",
      selectedStyleId: "style",
      inputProfileRevision: 1,
    },
    context: snapshot().context,
    observation: denseObservation,
    personalColor,
    createdAt: "2026-08-15T00:00:00.000Z",
  });
  assert.equal(built.topologyProjection?.version, "makeup-topology-v2");
  assert.equal(built.denseAtlas?.version, "makeup-dense-atlas-v3");
  assert.equal(built.modelManifest.geometryPolicyVersion, "makeup-dense-atlas-v3");
  assert.doesNotThrow(() => assertMakeupDirectionSnapshot(built));
  const validateSnapshot = new Ajv2020({ strict: false });
  validateSnapshot.addFormat("date-time", true);
  const validate = validateSnapshot.compile(MAKEUP_DIRECTION_SNAPSHOT_JSON_SCHEMA);
  assert.equal(validate(built), true, JSON.stringify(validate.errors));
});

test("dense atlas v3 compiles open high-density FaceMesh lines for all three modes", () => {
  const denseObservation: FaceObservationBundleV2 = {
    ...observation,
    correctionRevision: 3,
    landmarks: Array.from({ length: 478 }, (_, index) => ({
      x: 0.15 + (index % 29) / 42,
      y: 0.08 + Math.floor(index / 29) / 23,
    })),
    modelManifest: [
      {
        component: "face-landmarks",
        provider: "tensorflow-js",
        name: "MediaPipeFaceMesh",
        version: "attention-mesh-1",
      },
    ],
  };
  const first = compileMakeupDenseAtlasV3(denseObservation);
  const second = compileMakeupDenseAtlasV3(denseObservation);
  assert.doesNotThrow(() => assertMakeupDenseAtlasV3(first));
  assert.deepEqual(second, first, "same source must produce a byte-stable atlas");
  assert.equal(first.sourceModel.pointCount, 478);
  assert.equal(first.sourceCorrectionRevision, 3);
  assert.ok(first.lineSets.length >= 40);
  assert.ok(first.uniqueSourcePointCount >= 200);
  assert.ok(first.segmentCount >= 180);
  assert.ok(first.precisionTickSourceIndices.length >= 300);
  assert.ok(first.precisionTickSourceIndices.length <= 420);
  assert.equal(first.precisionTicks.length, first.precisionTickSourceIndices.length);
  assert.ok(first.lineSets.every((line) => line.open && line.sourceIndices.length === line.points.length));
  assert.ok(makeupDenseAtlasLinesForMode(first, "structure").length < first.lineSets.length);
  assert.ok(makeupDenseAtlasLinesForMode(first, "application", ["lip"]).some((line) => line.id === "lip.cupid"));
  assert.deepEqual(makeupDenseAtlasLinesForMode(first, "precision"), first.lineSets);
});

test("dense atlas v3 fails down explicitly instead of fabricating missing landmarks", () => {
  const degraded = compileMakeupDenseAtlasV3({
    ...observation,
    landmarks: Array.from({ length: 467 }, () => ({ x: 0.5, y: 0.5 })),
  });
  assert.equal(degraded.degradedReason, "insufficient_points");
  assert.equal(degraded.lineSets.length, 0);
  assert.equal(degraded.precisionTickSourceIndices.length, 0);
  assert.equal(degraded.precisionTicks.length, 0);
  assert.doesNotThrow(() => assertMakeupDenseAtlasV3(degraded));
});

function semanticFixture(): {
  atlas: ReturnType<typeof compileMakeupDenseAtlasV3>;
  artifact: MakeupSemanticArtifactV3;
} {
  const atlas = compileMakeupDenseAtlasV3({
    ...observation,
    correctionRevision: 2,
    landmarks: Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 })),
  });
  const output: MakeupSemanticMapV3 = {
    schemaVersion: "makeup-semantic-map-v3",
    faceCharacteristics: {
      brow: "완만한 눈썹선",
      eye: "선명한 눈매",
      cheekbone: "부드러운 광대",
      nose: "곧은 콧대",
      lip: "균형 잡힌 입술",
      jaw: "완만한 턱선",
    },
    zones: [
      {
        id: "brow.left",
        module: "brow",
        purpose: "definition",
        anchorRefs: [70, 63, 105].map((sourceIndex) => ({
          lineId: "brow.axis.left" as const,
          sourceIndex,
          tangentOffset: 0,
          normalOffset: 0,
        })),
        pathMode: "follow_topology",
        brushDirection: "inner_to_outer",
        brushStrokeCount: 3,
        intensity: 0.55,
        reason: "눈썹 결을 따라 자연스러운 선을 만듭니다.",
        caution: "경계를 진하게 닫지 않습니다.",
        exclusions: ["hair"],
        confidence: { semantic: 0.9, visibility: 0.9 },
      },
    ],
    summary: "얼굴의 실제 기준점을 따라 열린 선으로 적용합니다.",
  };
  return {
    atlas,
    artifact: {
      version: "makeup-semantic-artifact-v3",
      sourceFingerprint: "source-fingerprint",
      sourceCorrectionRevision: 2,
      semanticOutputFingerprint: "semantic-fingerprint",
      output,
    },
  };
}

test("semantic v3 strict output snaps allowlisted anchors and emits open line bundles", () => {
  const { atlas, artifact } = semanticFixture();
  assert.doesNotThrow(() => assertMakeupSemanticMapV3(artifact.output));
  const projection = compileMakeupSemanticProjectionV3({
    artifact,
    atlas,
    expectedSourceFingerprint: "source-fingerprint",
  });
  assert.equal(projection.state, "complete");
  assert.equal(projection.validation.acceptedZoneCount, 1);
  assert.equal(projection.validation.fallbackZoneCount, 0);
  assert.equal(projection.validation.snapMeanPx, 0);
  assert.equal(projection.validation.snapP95Px, 0);
  assert.equal(projection.lineBundles.filter((line) => line.role === "brush").length, 3);
  assert.ok(projection.lineBundles.every((line) => line.open && line.points.length >= 2));
});

test("OpenAI and Gemini text boundaries normalize to the same strict semantic map", () => {
  const { artifact } = semanticFixture();
  const json = JSON.stringify(artifact.output);
  const openAiBoundary = parseMakeupSemanticMapV3Json(json);
  const geminiBoundary = parseMakeupSemanticMapV3Json(`\`\`\`json\n${json}\n\`\`\``);
  assert.deepEqual(openAiBoundary, geminiBoundary);
});

test("semantic v3 rejects protected-region crossings per zone and keeps deterministic fallback", () => {
  const { atlas, artifact } = semanticFixture();
  const projection = compileMakeupSemanticProjectionV3({
    artifact,
    atlas,
    expectedSourceFingerprint: "source-fingerprint",
    protectedRegions: [
      {
        id: "occlusion",
        kind: "occluded",
        points: [
          { x: 0.48, y: 0.48 },
          { x: 0.52, y: 0.48 },
          { x: 0.52, y: 0.52 },
          { x: 0.48, y: 0.52 },
        ],
      },
    ],
  });
  assert.equal(projection.state, "fallback");
  assert.equal(projection.validation.protectedRegionViolations, 0);
  assert.equal(projection.validation.rejectedProtectedRegionIntersections, 1);
  assert.equal(projection.validation.fallbackZoneCount, 1);
  assert.equal(projection.lineBundles.length, 0);
});

test("semantic v3 fails closed on stale sources and out-of-contract offsets", () => {
  const { atlas, artifact } = semanticFixture();
  assert.throws(
    () =>
      compileMakeupSemanticProjectionV3({
        artifact,
        atlas,
        expectedSourceFingerprint: "changed",
      }),
    /SOURCE_STALE/,
  );
  const invalid = structuredClone(artifact.output);
  invalid.zones[0].anchorRefs[0].normalOffset = 0.2;
  assert.throws(() => assertMakeupSemanticMapV3(invalid), /ZONE_INVALID/);
  const extraRoot = {
    ...structuredClone(artifact.output),
    inferredAge: "30대",
  } as unknown as MakeupSemanticMapV3;
  assert.throws(() => assertMakeupSemanticMapV3(extraRoot), /SCHEMA_INVALID/);
  const extraZone = structuredClone(artifact.output) as MakeupSemanticMapV3 & {
    zones: Array<MakeupSemanticMapV3["zones"][number] & { diagnosis?: string }>;
  };
  extraZone.zones[0].diagnosis = "민감성 피부";
  assert.throws(() => assertMakeupSemanticMapV3(extraZone), /ZONE_INVALID/);
});

test("P38 fixture matrix covers 30 representation and occlusion combinations within compile budget", () => {
  assert.equal(MAKEUP_P38_FIXTURE_CASES.length, 30);
  assert.deepEqual(new Set(MAKEUP_P38_FIXTURE_CASES.map((fixture) => fixture.skinToneGroup)), new Set(MAKEUP_P38_SKIN_TONE_GROUPS));
  assert.deepEqual(new Set(MAKEUP_P38_FIXTURE_CASES.map((fixture) => fixture.faceShape)), new Set(MAKEUP_P38_FACE_SHAPES));
  assert.deepEqual(new Set(MAKEUP_P38_FIXTURE_CASES.map((fixture) => fixture.occlusion)), new Set(MAKEUP_P38_OCCLUSIONS));
  assert.ok(new Set(MAKEUP_P38_FIXTURE_CASES.map((fixture) => fixture.presentationGender)).size >= 4);
  assert.ok(MAKEUP_P38_FIXTURE_CASES.some((fixture) => fixture.glasses));
  assert.ok(MAKEUP_P38_FIXTURE_CASES.some((fixture) => fixture.fringe !== "none"));
  const timings: number[] = [];
  const foundationTimings: number[] = [];
  for (const fixture of MAKEUP_P38_FIXTURE_CASES) {
    const fixtureObservation = {
      ...observation,
      landmarks: makeupP38FixtureLandmarks(fixture),
    };
    const started = performance.now();
    const atlas = compileMakeupDenseAtlasV3(fixtureObservation);
    timings.push(performance.now() - started);
    assert.doesNotThrow(() => assertMakeupDenseAtlasV3(atlas), fixture.id);
    assert.ok(atlas.lineSets.length >= 40, fixture.id);
    assert.ok(atlas.uniqueSourcePointCount >= 200, fixture.id);
    assert.ok(atlas.segmentCount >= 180, fixture.id);
    const foundationStarted = performance.now();
    const built = buildMakeupFoundationSnapshotV1({
      id: fixture.id,
      consultationId: "fixture-consultation",
      version: 1,
      source: snapshot().source,
      context: { ...snapshot().context, gender: fixture.presentationGender },
      observation: fixtureObservation,
      personalColor,
      createdAt: "2026-08-15T00:00:00.000Z",
    });
    foundationTimings.push(performance.now() - foundationStarted);
    assert.equal(built.denseAtlas?.version, "makeup-dense-atlas-v3");
  }
  const ordered = [...timings].sort((left, right) => left - right);
  const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1];
  assert.ok(p95 <= 100, `dense atlas compile p95 ${p95.toFixed(2)}ms exceeds 100ms`);
  const foundationOrdered = [...foundationTimings].sort((left, right) => left - right);
  const foundationP95 = foundationOrdered[Math.ceil(foundationOrdered.length * 0.95) - 1];
  assert.ok(foundationP95 <= 300, `foundation compile p95 ${foundationP95.toFixed(2)}ms exceeds 300ms`);
});

test("zone policies provide color position direction intensity texture and product attributes", () => {
  const value = buildMakeupFoundationSnapshotV1({
    id: "zone-snapshot",
    consultationId: "consultation-v2",
    version: 1,
    source: {
      faceObservationBundleId: "observation",
      personalColorProfileId: "profile",
      selectedStyleId: "style",
      inputProfileRevision: 1,
    },
    context: {
      ...snapshot().context,
      preparationMinutes: 20,
      skillLevel: "intermediate",
      ownedProductTypes: ["brow_pencil", "lip"],
    },
    observation,
    personalColor,
    hair: { colorFamily: "deep_neutral_brown", fringe: "side", parting: "6:4" },
    createdAt: "2026-08-15T00:00:00.000Z",
  });
  for (const item of value.modules) {
    assert.ok(item.direction.colorFamily);
    assert.ok(item.direction.intensity > 0);
    assert.ok(item.direction.texture);
    assert.ok(item.direction.technical.placement.length > 0);
    assert.ok(item.direction.technical.applicationDirection.length > 0);
    assert.ok(item.direction.technical.technique);
    assert.ok(item.direction.technical.productAttributes.length > 0);
    assert.equal(item.direction.technical.kind, item.module);
  }
  assert.equal(value.modelManifest.directionPolicyVersion, "makeup-zone-policy-v1");
  assert.equal(value.source.personalColorProfileId, personalColor.id);
  assert.ok(value.modules.find((item) => item.module === "brow")?.direction.technical.productAttributes.includes("owned:brow_pencil"));
});

test("time skill presentation facial hair and explicit exclusions alter policy without gender gating", () => {
  const source = {
    faceObservationBundleId: "observation",
    personalColorProfileId: "profile",
    selectedStyleId: "style",
    inputProfileRevision: 1,
  };
  const build = (context: MakeupContextProfile, gender: MakeupGender = null) =>
    buildMakeupFoundationSnapshotV1({
      id: `zone-${gender}-${context.presentation}`,
      consultationId: "consultation-v2",
      version: 1,
      source,
      context: { ...context, gender },
      observation: {
        ...observation,
        masks: [
          {
            id: "facial-hair",
            label: "facial hair",
            kind: "facial_hair",
            operation: "exclude",
            source: "detected",
            confidence: 0.9,
            points: [
              { x: 0.35, y: 0.65 },
              { x: 0.65, y: 0.65 },
              { x: 0.5, y: 0.8 },
            ],
          },
        ],
      },
      personalColor,
      createdAt: "2026-08-15T00:00:00.000Z",
    });
  const natural = build({
    ...snapshot().context,
    preparationMinutes: 5,
    skillLevel: "none",
    facialHair: { type: "beard", userWantsCoverage: true },
    exclusions: ["no_blush", "glitter"],
  });
  const expressive = build(
    {
      ...snapshot().context,
      presentation: "expressive",
      preparationMinutes: 30,
      skillLevel: "advanced",
      facialHair: { type: "beard", userWantsCoverage: true },
      exclusions: ["no_blush", "glitter"],
    },
    "male",
  );
  assert.ok((expressive.modules.find((item) => item.module === "eyeshadow")?.direction.intensity ?? 0) > (natural.modules.find((item) => item.module === "eyeshadow")?.direction.intensity ?? 1));
  assert.equal(natural.modules.find((item) => item.module === "blush")?.state, "disabled_by_user");
  const base = natural.modules.find((item) => item.module === "base")!;
  assert.equal(base.geometry.excludedPolygons.length, 1);
  assert.equal(base.direction.technical.parameters.facialHairTreatment, "avoid_heavy_base_on_hair_mask");
  assert.equal(natural.modules.find((item) => item.module === "eyeshadow")?.direction.technical.finish, "matte_or_satin");
  assert.deepEqual(
    build(natural.context, "female").modules.map((item) => item.module),
    build(natural.context, "nonbinary").modules.map((item) => item.module),
  );
});

test("manual geometry adjustments reject unsafe deltas and vector magnitude", () => {
  const value = buildMakeupFoundationSnapshotV1({
    id: "bounds",
    consultationId: "consultation-v2",
    version: 1,
    source: {
      faceObservationBundleId: "observation",
      personalColorProfileId: "profile",
      selectedStyleId: "style",
      inputProfileRevision: 1,
    },
    context: snapshot().context,
    observation,
    personalColor,
    createdAt: "2026-08-15T00:00:00.000Z",
  });
  const brow = value.modules.find((item) => item.module === "brow")!;
  assert.doesNotThrow(() =>
    validateMakeupModulePatchBounds(brow, {
      anchors: [
        {
          index: 0,
          point: {
            x: brow.geometry.anchors[0].x + 0.01,
            y: brow.geometry.anchors[0].y,
          },
        },
      ],
    }),
  );
  assert.throws(
    () =>
      validateMakeupModulePatchBounds(brow, {
        anchors: [
          {
            index: 0,
            point: {
              x: brow.geometry.anchors[0].x + 0.2,
              y: brow.geometry.anchors[0].y,
            },
          },
        ],
      }),
    /OUT_OF_BOUNDS/,
  );
  assert.throws(
    () =>
      validateMakeupModulePatchBounds(brow, {
        vectors: [{ index: 0, dx: 0.9, dy: 0.9 }],
      }),
    /OUT_OF_BOUNDS/,
  );
});

test("confirmed directions compile a bounded routine and an exact structured artist brief", () => {
  const built = buildMakeupFoundationSnapshotV1({
    id: "artifact-snapshot",
    consultationId: "consultation-v2",
    version: 2,
    source: {
      faceObservationBundleId: "observation",
      personalColorProfileId: "profile-v5",
      selectedStyleId: "style-v3",
      inputProfileRevision: 4,
    },
    context: {
      ...snapshot().context,
      preparationMinutes: 10,
      exclusions: ["no_blush"],
      ownedProductTypes: ["brow_pencil", "lip"],
    },
    observation,
    personalColor,
    createdAt: "2026-08-15T00:00:00.000Z",
  });
  const confirmed: MakeupDirectionSnapshot = {
    ...built,
    status: "confirmed",
    confirmedAt: "2026-08-15T00:05:00.000Z",
  };
  const routine = compileMakeupRoutineV1({
    id: "routine",
    snapshot: confirmed,
    createdAt: "2026-08-15T00:05:01.000Z",
  });
  const brief = compileMakeupArtistBriefV1({
    id: "brief",
    snapshot: confirmed,
    createdAt: "2026-08-15T00:05:01.000Z",
  });
  assert.ok(routine.estimatedSeconds <= 600);
  assert.equal(
    routine.steps.some((step) => step.module === "blush"),
    false,
  );
  assert.equal(routine.source.personalColorProfileId, "profile-v5");
  assert.ok(routine.steps.every((step) => step.productSearchTerms.every((term) => !/[<>{}]/.test(term))));
  assert.ok(routine.steps.every((step) => !/[a-z]+_[a-z_]+/.test(step.instruction)));
  assert.ok(routine.steps.every((step) => step.productSearchTerms.every((term) => !term.includes("_"))));
  assert.equal(brief.sourcePhotoIncluded, false);
  assert.deepEqual(brief.source, confirmed.source);
  assert.equal(brief.moduleSummaries.length, 7);
  for (const item of brief.moduleSummaries) {
    const source = confirmed.modules.find((module) => module.module === item.module)!;
    assert.equal(item.colorFamily, source.direction.colorFamily);
    assert.equal(item.intensity, source.direction.intensity);
    assert.deepEqual(item.placement, source.direction.technical.placement);
    assert.deepEqual(item.applicationDirection, source.direction.technical.applicationDirection);
  }
});

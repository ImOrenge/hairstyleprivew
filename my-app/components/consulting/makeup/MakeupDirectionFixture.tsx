"use client";

import { useEffect, useState } from "react";
import { MAKEUP_FACE_TOPOLOGY_V2, MAKEUP_MODULES, MAKEUP_SEMI_REAL_MODEL_LANDMARKS_V3, compileMakeupArtistBriefV1, compileMakeupDenseAtlasV3, compileMakeupRoutineV1, compileMakeupSemanticProjectionV3, type MakeupAtlasMode, type MakeupComplexionGuideGeometry, type MakeupDirectionSnapshot, type MakeupModule, type MakeupModuleDirection, type MakeupModuleGeometry, type MakeupNormalizedPoint, type MakeupSemanticArtifactV3, type MakeupTopologyPointSetId, type MakeupTopologyProjectionV2 } from "@hairfit/shared/makeup";
import type { FaceObservationBundleV2 } from "@hairfit/shared/personal-color-v2";
import { Panel, SurfaceCard } from "../workbenches/shared";
import { MakeupDirectionCanvas } from "./MakeupDirectionCanvas";
import { MakeupDirectionMatrix } from "./MakeupDirectionMatrix";
import { MakeupOutputs } from "./MakeupOutputs";

const rectangle = (x: number, y: number, width: number, height: number) => [{ x: x - width, y: y - height }, { x: x + width, y: y - height }, { x: x + width, y: y + height }, { x: x - width, y: y + height }];
const ellipse = (x: number, y: number, radiusX: number, radiusY: number, count = 16) => Array.from({ length: count }, (_, index) => {
  const angle = Math.PI * 2 * index / count;
  return { x: x + Math.cos(angle) * radiusX, y: y + Math.sin(angle) * radiusY };
});
const complexionGuides: MakeupComplexionGuideGeometry[] = [
  { id: "t_zone_highlight", role: "highlight", anchors: [{ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.4 }], polygons: [rectangle(0.5, 0.31, 0.13, 0.018), rectangle(0.5, 0.48, 0.015, 0.1)], vectors: [{ origin: { x: 0.5, y: 0.31 }, dx: -0.11, dy: 0 }, { origin: { x: 0.5, y: 0.31 }, dx: 0.11, dy: 0 }, { origin: { x: 0.5, y: 0.4 }, dx: 0, dy: 0.16 }] },
  { id: "nose_contour", role: "shadow", anchors: [{ x: 0.46, y: 0.41 }, { x: 0.54, y: 0.41 }], polygons: [rectangle(0.46, 0.49, 0.012, 0.08), rectangle(0.54, 0.49, 0.012, 0.08)], vectors: [{ origin: { x: 0.46, y: 0.42 }, dx: 0, dy: 0.13 }, { origin: { x: 0.54, y: 0.42 }, dx: 0, dy: 0.13 }] },
  { id: "jaw_shadow", role: "shadow", anchors: [{ x: 0.31, y: 0.73 }, { x: 0.69, y: 0.73 }], polygons: [[{ x: 0.28, y: 0.72 }, { x: 0.31, y: 0.7 }, { x: 0.46, y: 0.79 }, { x: 0.43, y: 0.81 }], [{ x: 0.69, y: 0.7 }, { x: 0.72, y: 0.72 }, { x: 0.57, y: 0.81 }, { x: 0.54, y: 0.79 }]], vectors: [{ origin: { x: 0.31, y: 0.73 }, dx: 0.13, dy: 0.06 }, { origin: { x: 0.69, y: 0.73 }, dx: -0.13, dy: 0.06 }] },
];

// Generated once from the fixture photo with MediaPipeFaceMesh. Keep this evidence aligned
// with hairfit-semi-real-model-v1.png instead of approximating the face with ellipses.
const fixtureTopologyPoints: Record<MakeupTopologyPointSetId, MakeupNormalizedPoint[]> = {
  face_oval: [{x:.508,y:.2582},{x:.5608,y:.2603},{x:.6053,y:.2665},{x:.6459,y:.2794},{x:.6719,y:.2989},{x:.6881,y:.3238},{x:.6967,y:.3508},{x:.6993,y:.384},{x:.6958,y:.4157},{x:.69,y:.4485},{x:.6801,y:.4838},{x:.6655,y:.5205},{x:.6472,y:.5503},{x:.627,y:.5722},{x:.602,y:.5908},{x:.5807,y:.6032},{x:.5583,y:.6144},{x:.5323,y:.6225},{x:.4988,y:.625},{x:.4654,y:.6215},{x:.4402,y:.6126},{x:.4186,y:.6006},{x:.398,y:.5875},{x:.3731,y:.5683},{x:.3534,y:.5459},{x:.3359,y:.5155},{x:.3221,y:.4781},{x:.3129,y:.4424},{x:.3078,y:.4093},{x:.3053,y:.3773},{x:.3091,y:.344},{x:.3195,y:.317},{x:.3383,y:.2925},{x:.3673,y:.2739},{x:.4099,y:.2626},{x:.4552,y:.2581},{x:.508,y:.2582}],
  left_brow_upper: [{x:.3495,y:.3391},{x:.3672,y:.327},{x:.3927,y:.3206},{x:.4256,y:.3217},{x:.4645,y:.3255}],
  left_brow_lower: [{x:.3591,y:.3459},{x:.3752,y:.3359},{x:.3977,y:.3315},{x:.4278,y:.3328},{x:.4686,y:.3446}],
  right_brow_upper: [{x:.5473,y:.3234},{x:.587,y:.3187},{x:.6202,y:.3181},{x:.6452,y:.3259},{x:.6614,y:.3409}],
  right_brow_lower: [{x:.6518,y:.346},{x:.6367,y:.3342},{x:.6145,y:.3285},{x:.5841,y:.3297},{x:.5418,y:.3423}],
  left_eye: [{x:.3831,y:.3727},{x:.3884,y:.3769},{x:.394,y:.3797},{x:.4022,y:.3824},{x:.415,y:.3841},{x:.4283,y:.3837},{x:.4416,y:.3825},{x:.4507,y:.382},{x:.4555,y:.3812},{x:.4511,y:.3767},{x:.4411,y:.3697},{x:.4269,y:.3648},{x:.4128,y:.3637},{x:.3994,y:.3655},{x:.3913,y:.3684},{x:.3868,y:.3707},{x:.3831,y:.3727}],
  right_eye: [{x:.6279,y:.3744},{x:.6221,y:.3787},{x:.6157,y:.3814},{x:.6067,y:.3837},{x:.5933,y:.3848},{x:.5803,y:.3844},{x:.568,y:.3832},{x:.5593,y:.3827},{x:.5546,y:.3815},{x:.559,y:.377},{x:.5687,y:.3696},{x:.5825,y:.3641},{x:.5968,y:.3627},{x:.6109,y:.3647},{x:.6193,y:.3685},{x:.6242,y:.3716},{x:.6279,y:.3744}],
  outer_lip: [{x:.439,y:.5321},{x:.4453,y:.5368},{x:.4538,y:.542},{x:.4667,y:.5483},{x:.4828,y:.5525},{x:.5014,y:.5539},{x:.5198,y:.5527},{x:.5362,y:.5485},{x:.5497,y:.5422},{x:.5591,y:.5368},{x:.5661,y:.5318},{x:.56,y:.528},{x:.5514,y:.5237},{x:.5397,y:.5183},{x:.5216,y:.5133},{x:.5031,y:.5168},{x:.4846,y:.5133},{x:.4662,y:.5186},{x:.4539,y:.524},{x:.4452,y:.5283},{x:.439,y:.5321}],
  inner_lip: [{x:.4446,y:.532},{x:.4543,y:.5315},{x:.4627,y:.531},{x:.4739,y:.5308},{x:.4872,y:.5313},{x:.5023,y:.532},{x:.5172,y:.5314},{x:.5305,y:.5309},{x:.5417,y:.531},{x:.5503,y:.5313},{x:.5604,y:.5317},{x:.5504,y:.5313},{x:.5419,y:.5311},{x:.5306,y:.5309},{x:.5174,y:.5314},{x:.5024,y:.5321},{x:.4873,y:.5314},{x:.474,y:.531},{x:.4628,y:.5313},{x:.4544,y:.5317},{x:.4446,y:.532}],
  nose_bridge: [{x:.5044,y:.3689},{x:.5039,y:.3892},{x:.5035,y:.4062},{x:.5031,y:.4218},{x:.5026,y:.4385},{x:.5022,y:.4583},{x:.5017,y:.4729}],
  nose_left: [{x:.5044,y:.3689},{x:.4602,y:.4818},{x:.4825,y:.4852},{x:.4807,y:.4826},{x:.4651,y:.4801},{x:.471,y:.4783},{x:.4675,y:.4758},{x:.4674,y:.4735},{x:.4606,y:.4724},{x:.4688,y:.4689},{x:.5017,y:.4729}],
  nose_right: [{x:.5044,y:.3689},{x:.5419,y:.4834},{x:.5194,y:.486},{x:.5214,y:.4835},{x:.537,y:.4815},{x:.5313,y:.4795},{x:.535,y:.4771},{x:.5354,y:.4748},{x:.5422,y:.4739},{x:.5346,y:.4701},{x:.5017,y:.4729}],
  left_cheek: [{x:.3702,y:.4536},{x:.4088,y:.4377},{x:.3946,y:.4733},{x:.3596,y:.4835},{x:.3373,y:.4732},{x:.3314,y:.4442},{x:.3556,y:.4143},{x:.3765,y:.4208}],
  right_cheek: [{x:.6336,y:.458},{x:.596,y:.4408},{x:.6081,y:.4768},{x:.6429,y:.4882},{x:.666,y:.4787},{x:.6728,y:.4499},{x:.6487,y:.4179},{x:.6273,y:.4234}],
  t_zone: [{x:.4552,y:.2581},{x:.508,y:.2582},{x:.5608,y:.2603},{x:.5067,y:.2938},{x:.5057,y:.3291},{x:.505,y:.3491},{x:.5044,y:.3689},{x:.5039,y:.3892},{x:.5035,y:.4062},{x:.5017,y:.4729}],
};
const fixturePointSets = (Object.keys(MAKEUP_FACE_TOPOLOGY_V2) as MakeupTopologyPointSetId[]).map((id) => ({
  id,
  sourceIndices: [...MAKEUP_FACE_TOPOLOGY_V2[id]],
  points: fixtureTopologyPoints[id],
  closed: ["face_oval", "left_eye", "right_eye", "outer_lip", "inner_lip", "left_cheek", "right_cheek"].includes(id),
}));
const fixturePathsByModule: Record<MakeupModule, MakeupNormalizedPoint[][]> = {
  base: [fixtureTopologyPoints.t_zone, fixtureTopologyPoints.nose_left, fixtureTopologyPoints.nose_right, fixtureTopologyPoints.face_oval.slice(8, 19), fixtureTopologyPoints.face_oval.slice(18, 29)],
  brow: [fixtureTopologyPoints.left_brow_upper, fixtureTopologyPoints.left_brow_lower, fixtureTopologyPoints.right_brow_upper, fixtureTopologyPoints.right_brow_lower],
  eyeshadow: [fixtureTopologyPoints.left_eye, fixtureTopologyPoints.right_eye],
  eyeliner: [],
  blush: [fixtureTopologyPoints.left_cheek, fixtureTopologyPoints.right_cheek],
  lip: [fixtureTopologyPoints.outer_lip, fixtureTopologyPoints.inner_lip],
  lashes: [],
};
const fixtureBrushPathsByModule: Record<MakeupModule, MakeupNormalizedPoint[][]> = {
  base: [fixtureTopologyPoints.t_zone, fixtureTopologyPoints.nose_left, fixtureTopologyPoints.nose_right, fixtureTopologyPoints.face_oval.slice(8, 19), fixtureTopologyPoints.face_oval.slice(18, 29)],
  brow: [fixtureTopologyPoints.left_brow_upper, fixtureTopologyPoints.right_brow_upper],
  eyeshadow: [],
  eyeliner: [fixtureTopologyPoints.left_eye.slice(8), fixtureTopologyPoints.right_eye.slice(8)],
  blush: [fixtureTopologyPoints.left_cheek, fixtureTopologyPoints.right_cheek],
  lip: [fixtureTopologyPoints.outer_lip],
  lashes: [fixtureTopologyPoints.left_eye.slice(8), fixtureTopologyPoints.right_eye.slice(8)],
};
const fixtureTopology: MakeupTopologyProjectionV2 = {
  version: "makeup-topology-v2",
  coordinateSpace: "normalized_source_image",
  sourceModel: { provider: "tensorflow-js", name: "MediaPipeFaceMesh", version: "1", pointCount: 468 },
  pointSets: fixturePointSets,
  moduleRegions: MAKEUP_MODULES.map((module) => ({ module, paths: fixturePathsByModule[module], strokePaths: fixtureBrushPathsByModule[module], calloutAnchors: [{ x: 0.5, y: 0.5 }] })),
  calloutAnchors: [
    { id: "brow", point: { x: 0.3495, y: 0.3391 } },
    { id: "eye", point: { x: 0.3831, y: 0.3727 } },
    { id: "blush", point: { x: 0.3314, y: 0.4442 } },
    { id: "lip", point: { x: 0.439, y: 0.5321 } },
    { id: "t_zone_highlight", point: { x: 0.5608, y: 0.2603 } },
    { id: "nose_contour", point: { x: 0.5422, y: 0.4739 } },
    { id: "jaw_shadow", point: { x: 0.6655, y: 0.5205 } },
  ],
  confidence: 0.97,
  degradedReason: null,
};
const fixtureDenseAtlas = compileMakeupDenseAtlasV3({
  schemaVersion: "face-observation-bundle-v2", id: "e2e-observation", consultationId: "00000000-0000-4000-8000-000000000011", sourceAnalysisEvidenceId: "e2e-evidence",
  inputHash: "a".repeat(64), modelHash: "b".repeat(64), sourceAssets: [], sourceTransform: { rotationDegrees: 0, sourceWidth: 819, sourceHeight: 1024, coordinateSpace: "normalized-upright-source-v1" },
  landmarks: [...MAKEUP_SEMI_REAL_MODEL_LANDMARKS_V3], masks: [], calibration: { inputColorSpace: "srgb", workingColorSpace: "linear-srgb", referenceWhite: "D65", method: "srgb-estimated-white-balance-v1", whiteBalanceGains: [1, 1, 1] },
  regionSamples: [], quality: { status: "usable", validSkinPixelRatio: 0.97, crossRegionMaxDeltaE: null, warnings: [] }, modelManifest: [{ component: "face-landmarks", provider: "tensorflow-js", name: "MediaPipeFaceMesh", version: "attention-mesh-1" }], correctionRevision: 0, createdAt: "2026-08-15T04:00:00.000Z",
} satisfies FaceObservationBundleV2);

function fixtureGeometry(module: MakeupModule): MakeupModuleGeometry {
  const common = { coordinateSpace: "normalized_source_image" as const, excludedPolygons: [] };
  if (module === "base") return { ...common, anchors: [{ x: 0.5, y: 0.48 }], polygons: [], vectors: [], complexionGuides };
  if (module === "brow") return {
    ...common,
    anchors: [{ x: 0.31, y: 0.35 }, { x: 0.43, y: 0.34 }, { x: 0.57, y: 0.34 }, { x: 0.69, y: 0.35 }],
    polygons: [
      [{ x: 0.28, y: 0.36 }, { x: 0.34, y: 0.335 }, { x: 0.43, y: 0.34 }, { x: 0.43, y: 0.355 }, { x: 0.34, y: 0.35 }, { x: 0.28, y: 0.37 }],
      [{ x: 0.57, y: 0.34 }, { x: 0.66, y: 0.335 }, { x: 0.72, y: 0.36 }, { x: 0.72, y: 0.37 }, { x: 0.66, y: 0.35 }, { x: 0.57, y: 0.355 }],
    ],
    vectors: [{ origin: { x: 0.3, y: 0.36 }, dx: 0.12, dy: -0.015 }, { origin: { x: 0.7, y: 0.36 }, dx: -0.12, dy: -0.015 }],
  };
  if (module === "eyeshadow") return { ...common, anchors: [{ x: 0.36, y: 0.41 }, { x: 0.64, y: 0.41 }], polygons: [ellipse(0.36, 0.405, 0.095, 0.045), ellipse(0.64, 0.405, 0.095, 0.045)], vectors: [{ origin: { x: 0.42, y: 0.41 }, dx: -0.12, dy: -0.025 }, { origin: { x: 0.58, y: 0.41 }, dx: 0.12, dy: -0.025 }] };
  if (module === "eyeliner") return { ...common, anchors: [{ x: 0.29, y: 0.44 }, { x: 0.43, y: 0.44 }, { x: 0.57, y: 0.44 }, { x: 0.71, y: 0.44 }], polygons: [], vectors: [{ origin: { x: 0.43, y: 0.44 }, dx: -0.15, dy: -0.018 }, { origin: { x: 0.57, y: 0.44 }, dx: 0.15, dy: -0.018 }] };
  if (module === "blush") return { ...common, anchors: [{ x: 0.34, y: 0.56 }, { x: 0.66, y: 0.56 }], polygons: [ellipse(0.34, 0.56, 0.1, 0.052), ellipse(0.66, 0.56, 0.1, 0.052)], vectors: [{ origin: { x: 0.38, y: 0.57 }, dx: -0.14, dy: -0.075 }, { origin: { x: 0.62, y: 0.57 }, dx: 0.14, dy: -0.075 }] };
  if (module === "lip") return { ...common, anchors: [{ x: 0.42, y: 0.665 }, { x: 0.5, y: 0.65 }, { x: 0.58, y: 0.665 }], polygons: [[{ x: 0.41, y: 0.665 }, { x: 0.47, y: 0.642 }, { x: 0.5, y: 0.651 }, { x: 0.53, y: 0.642 }, { x: 0.59, y: 0.665 }, { x: 0.54, y: 0.69 }, { x: 0.5, y: 0.697 }, { x: 0.46, y: 0.69 }]], vectors: [] };
  return { ...common, anchors: [{ x: 0.31, y: 0.43 }, { x: 0.69, y: 0.43 }], polygons: [], vectors: [{ origin: { x: 0.31, y: 0.43 }, dx: -0.02, dy: -0.06 }, { origin: { x: 0.69, y: 0.43 }, dx: 0.02, dy: -0.06 }] };
}

const modules: MakeupModuleDirection[] = MAKEUP_MODULES.map((module, index) => {
  return {
    module, state: "enabled",
    geometry: fixtureGeometry(module),
    direction: {
      enabled: true, intensity: 0.2 + index * 0.06, colorFamily: ["neutral_beige", "deep_neutral_brown", "soft_camel", "soft_brown", "peach_coral", "brick_rose", "soft_brown"][index], texture: module === "base" ? "natural" : "satin",
      evidenceIds: ["e2e-face-observation", "e2e-personal-color-profile", "e2e-selected-style"], reasons: ["presentation:natural_grooming", "time:10", "skill:basic"],
      technical: { kind: module, zonePolicyVersion: "makeup-zone-policy-v1", placement: [`${module}_primary_zone`, `${module}_paired_zone`], applicationDirection: ["center_to_outer", "follow_source_geometry"], finish: module === "base" ? "natural" : "satin", technique: `e2e_${module}_direction`, productAttributes: [`search:${module}`], warnings: module === "base" ? ["수염 경계에는 잔량만 연결합니다."] : [], parameters: { intensityBand: "natural", safeAdjustmentStep: 0.01 } },
    },
  };
});
const snapshot: MakeupDirectionSnapshot = { schemaVersion: "makeup-direction-snapshot-v1", id: "e2e-makeup-snapshot", consultationId: "00000000-0000-4000-8000-000000000011", version: 2, status: "confirmed", source: { faceObservationBundleId: "e2e-face-observation", personalColorProfileId: "e2e-personal-color-profile-v5", selectedStyleId: "e2e-selected-style-v3", inputProfileRevision: 4 }, context: { presentation: "natural_grooming", occasions: ["daily", "work"], preparationMinutes: 10, skillLevel: "basic", finishPreference: "natural", exclusions: [], ownedProductTypes: ["brow_pencil", "lip"], ownedToolTypes: ["sponge", "brow_brush"], gender: "not_provided", facialHair: { type: "stubble", userWantsCoverage: true } }, modules, topologyProjection: fixtureTopology, denseAtlas: fixtureDenseAtlas, modelManifest: { geometryPolicyVersion: "makeup-dense-atlas-v3", directionPolicyVersion: "makeup-zone-policy-v1", routinePolicyVersion: "makeup-routine-v1", explanationModel: null, createdAt: "2026-08-15T04:00:00.000Z" }, confirmedAt: "2026-08-15T04:05:00.000Z", createdAt: "2026-08-15T04:00:00.000Z" };
const semanticArtifact: MakeupSemanticArtifactV3 = {
  version: "makeup-semantic-artifact-v3",
  sourceFingerprint: "e2e-semantic-source",
  sourceCorrectionRevision: fixtureDenseAtlas.sourceCorrectionRevision,
  semanticOutputFingerprint: "e2e-semantic-output",
  output: {
    schemaVersion: "makeup-semantic-map-v3",
    faceCharacteristics: { brow: "완만한 눈썹선", eye: "선명한 눈매", cheekbone: "부드러운 광대", nose: "곧은 콧대", lip: "균형 잡힌 입술", jaw: "완만한 턱선" },
    zones: [{ id: "brow.left", module: "brow", purpose: "definition", anchorRefs: [70, 63, 105].map((sourceIndex) => ({ lineId: "brow.axis.left" as const, sourceIndex, tangentOffset: 0, normalOffset: 0 })), pathMode: "follow_topology", brushDirection: "inner_to_outer", brushStrokeCount: 3, intensity: 0.55, reason: "눈썹 결을 따라 자연스러운 선을 만듭니다.", caution: "경계를 진하게 닫지 않습니다.", exclusions: ["hair"], confidence: { semantic: 0.9, visibility: 0.9 } }],
    summary: "얼굴의 실제 기준점을 따라 열린 선으로 적용합니다.",
  },
};
const semanticProjection = compileMakeupSemanticProjectionV3({ artifact: semanticArtifact, atlas: fixtureDenseAtlas, expectedSourceFingerprint: semanticArtifact.sourceFingerprint });
const routine = compileMakeupRoutineV1({ id: "e2e-routine", snapshot, createdAt: "2026-08-15T04:05:01.000Z" });
const brief = compileMakeupArtistBriefV1({ id: "e2e-brief", snapshot, createdAt: "2026-08-15T04:05:01.000Z" });

export function MakeupDirectionFixture({ diagnostics = false }: { diagnostics?: boolean }) {
  const [activeModule, setActiveModule] = useState<MakeupModule>("base");
  const [mode, setMode] = useState<MakeupAtlasMode>("application");
  const [refined, setRefined] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setRefined(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5" data-testid="makeup-direction-fixture">
    <Panel className="min-w-0 p-4"><p className="app-kicker">Makeup color guide</p><h2 className="mt-1 text-lg font-black">컬러와 적용 부위</h2>{diagnostics ? <div className="mt-3 flex gap-2" role="group" aria-label="메이크업 라인 지도 밀도">{(["structure", "application", "precision"] as const).map((item) => <button key={item} type="button" data-makeup-atlas-mode={item} aria-pressed={mode === item} onClick={() => setMode(item)} className="min-h-11 border border-[var(--app-border)] px-3 py-2 text-sm font-black">{{ structure: "구조", application: "적용", precision: "정밀" }[item]}</button>)}</div> : null}<div className="mt-4 min-w-0"><MakeupDirectionCanvas photoUrl="/images/consulting/models/hairfit-semi-real-model-v1.png" modules={modules} topology={snapshot.topologyProjection} denseAtlas={snapshot.denseAtlas} semanticProjection={refined ? semanticProjection : null} activeModule={activeModule} mode={diagnostics ? mode : "application"} onSelect={setActiveModule} showInfo={diagnostics} /></div>{diagnostics ? <div className="mt-3 border border-[var(--app-border)] px-3 py-2 text-xs" role="status" aria-live="polite" data-makeup-semantic-fixture-state={refined ? "completed" : "running"}>{refined ? "AI 정밀 가이드 준비 완료" : "얼굴 구조를 먼저 보여드리고 정밀 가이드를 다듬고 있어요."}</div> : null}</Panel>
    {diagnostics ? <SurfaceCard className="p-0"><MakeupDirectionMatrix modules={modules} activeModule={activeModule} onSelect={setActiveModule} /></SurfaceCard> : null}
    <MakeupOutputs sessionId={snapshot.consultationId} routine={routine} brief={brief} onRefresh={async () => undefined} />
  </div>;
}

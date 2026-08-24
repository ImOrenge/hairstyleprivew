import type { FaceObservationBundleV2 } from "../personal-color-v2/observation.ts";
import type { PersonalColorProfileV2 } from "../personal-color-v2/contract.ts";
import { assertMakeupDirectionSnapshot, type MakeupContextProfile, type MakeupDirectionSnapshot } from "./contract.ts";
import { compileMakeupGeometryV1 } from "./geometry.ts";
import { compileMakeupTopologyProjectionV2 } from "./topology-v2.ts";
import { assertMakeupDenseAtlasV3, compileMakeupDenseAtlasV3 } from "./topology-v3.ts";
import { compileMakeupZoneModulesV1, type MakeupHairContext } from "./zone-policy.ts";
import { applyMakeupPracticalityV1, applyMakeupRecipeV1, type MakeupRecipeV1 } from "./catalog.ts";

export function buildMakeupFoundationSnapshotV1(input: {
  id: string;
  consultationId: string;
  version: number;
  source: MakeupDirectionSnapshot["source"];
  context: MakeupContextProfile;
  observation: FaceObservationBundleV2;
  personalColor: PersonalColorProfileV2;
  hair?: MakeupHairContext;
  createdAt: string;
  recipe?: MakeupRecipeV1 | null;
}) {
  const geometry = compileMakeupGeometryV1(input.observation);
  const topologyProjection = compileMakeupTopologyProjectionV2(input.observation);
  const denseAtlas = compileMakeupDenseAtlasV3(input.observation);
  assertMakeupDenseAtlasV3(denseAtlas);
  const baseModules = compileMakeupZoneModulesV1({
    context: input.context,
    geometry,
    personalColor: input.personalColor,
    hair: input.hair ?? { colorFamily: null, fringe: null, parting: null },
    evidenceIds: [input.source.faceObservationBundleId, input.source.personalColorProfileId, input.source.selectedStyleId],
  });
  const modules = input.recipe ? applyMakeupPracticalityV1(applyMakeupRecipeV1(baseModules, input.recipe), input.context) : baseModules;
  const snapshot: MakeupDirectionSnapshot = {
    schemaVersion: "makeup-direction-snapshot-v1",
    id: input.id,
    consultationId: input.consultationId,
    version: input.version,
    status: "map_ready",
    source: input.source,
    context: input.context,
    modules,
    topologyProjection,
    denseAtlas,
    modelManifest: { geometryPolicyVersion: denseAtlas.degradedReason ? (topologyProjection.degradedReason ? "makeup-geometry-mediapipe-v1-fallback" : "makeup-geometry-mediapipe-v2") : "makeup-dense-atlas-v3", directionPolicyVersion: input.recipe ? "makeup-recipe-catalog-v1" : "makeup-zone-policy-v1", routinePolicyVersion: "pending-phase-07", explanationModel: null, createdAt: input.createdAt },
    ...(input.recipe ? { recipeBinding: { cycleId: input.recipe.cycleId, cycleVersion: input.recipe.cycleVersion, recipeId: input.recipe.id, recipeFingerprint: input.recipe.fingerprint, presentationFamily: input.recipe.presentationFamily } } : {}),
    confirmedAt: null,
    createdAt: input.createdAt,
  };
  assertMakeupDirectionSnapshot(snapshot);
  return snapshot;
}

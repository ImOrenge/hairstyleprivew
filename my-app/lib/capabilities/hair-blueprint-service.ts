import "server-only";

import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import { analyzeFaceForCatalog, generateRecommendationSet } from "../recommendation-generator";
import { runDurableCapability } from "./durable-runtime";
import { HAIRFIT_LEGACY_SOURCE_REVISION, runInlineCapability, type CapabilityEngineAdapter } from "./runtime";
import { getPromptVisionModel, getVisionProvider } from "../vision-model";

type RecommendationArgs = Parameters<typeof generateRecommendationSet>;
type RecommendationOutput = Awaited<ReturnType<typeof generateRecommendationSet>>;

export interface HairBlueprintCapabilityInput {
  referenceImageDataUrl: string;
  sourceImageFingerprint: string;
  styleTarget: RecommendationArgs[1];
  hairProfile: RecommendationArgs[2];
  personalizationMode?: RecommendationArgs[3];
}

const visionModel = getPromptVisionModel();

const adapter: CapabilityEngineAdapter<HairBlueprintCapabilityInput, RecommendationOutput> = {
  capability: "hair-blueprint-recommendation",
  engineVersion: "hairstyle-blueprint-v4",
  sourceRevision: HAIRFIT_LEGACY_SOURCE_REVISION,
  provider: getVisionProvider(visionModel),
  model: visionModel,
  promptPolicyVersion: "catalog-v4",
  catalogCycleId: null,
  fallbackMode: "none",
  execute: (input) => generateRecommendationSet(input.referenceImageDataUrl, input.styleTarget, input.hairProfile, input.personalizationMode),
  failureCode: () => "HAIR_BLUEPRINT_RECOMMENDATION_FAILED",
  failureMessage: () => "헤어 방향 추천을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export function runHairBlueprintCapability(input: HairBlueprintCapabilityInput & { userId?: string; consultationId: string; idempotencyKey: string }): Promise<CapabilityResult<RecommendationOutput>> {
  const execution = { consultationId: input.consultationId, idempotencyKey: input.idempotencyKey, input };
  return input.userId ? runDurableCapability(adapter, { ...execution, userId: input.userId }) : runInlineCapability(adapter, execution);
}

export async function runFaceAnalysisCapability(input: { userId?: string; consultationId: string; idempotencyKey: string; referenceImageDataUrl: string; sourceImageFingerprint: string }) {
  const faceAdapter = { ...adapter, engineVersion: "face-analysis-catalog-v4", execute: ({ referenceImageDataUrl }: HairBlueprintCapabilityInput) => analyzeFaceForCatalog(referenceImageDataUrl) };
  const capabilityInput: HairBlueprintCapabilityInput = {
    referenceImageDataUrl: input.referenceImageDataUrl,
    sourceImageFingerprint: input.sourceImageFingerprint,
    styleTarget: "female",
    hairProfile: null,
  };
  const execution = {
    consultationId: input.consultationId,
    idempotencyKey: input.idempotencyKey,
    input: capabilityInput,
  };
  return input.userId ? runDurableCapability(faceAdapter, { ...execution, userId: input.userId }) : runInlineCapability(faceAdapter, execution);
}

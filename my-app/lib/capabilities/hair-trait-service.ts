import "server-only";

import type { HairTraitProviderOutput } from "../consulting/hair-trait-provider";
import { analyzeHairTraitsWithVision } from "../consulting/hair-trait-provider";
import { getPromptVisionModel, getVisionProvider } from "../vision-model";
import { runDurableCapability } from "./durable-runtime";
import { HAIRFIT_LEGACY_SOURCE_REVISION, type CapabilityEngineAdapter } from "./runtime";

export interface HairTraitCapabilityInput {
  referenceImageDataUrl: string;
  sourceImageFingerprint: string;
}

const model = getPromptVisionModel();
const adapter: CapabilityEngineAdapter<HairTraitCapabilityInput, HairTraitProviderOutput> = {
  capability: "hair-trait-analysis",
  engineVersion: "hair-trait-vision-v1",
  sourceRevision: HAIRFIT_LEGACY_SOURCE_REVISION,
  provider: getVisionProvider(model),
  model,
  promptPolicyVersion: "hair-trait-observation-v1",
  catalogCycleId: null,
  fallbackMode: "none",
  execute: (input) => analyzeHairTraitsWithVision(input.referenceImageDataUrl),
  failureCode: () => "HAIR_TRAIT_ANALYSIS_FAILED",
  failureMessage: () => "모질 특성 분석을 완료하지 못했습니다. 얼굴 분석 결과는 그대로 사용할 수 있습니다.",
};

export function runHairTraitCapability(input: HairTraitCapabilityInput & { userId: string; consultationId: string; idempotencyKey: string }) {
  return runDurableCapability(adapter, { userId: input.userId, consultationId: input.consultationId, idempotencyKey: input.idempotencyKey, input });
}

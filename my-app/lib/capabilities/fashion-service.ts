import "server-only";

import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import { generateFashionRecommendation } from "../fashion-recommendation-generator";
import type { FashionRecommendation, FashionRecommendationInput } from "../fashion-types";
import { runDurableCapability } from "./durable-runtime";
import { HAIRFIT_LEGACY_SOURCE_REVISION, runInlineCapability, type CapabilityEngineAdapter } from "./runtime";

const adapter: CapabilityEngineAdapter<FashionRecommendationInput, FashionRecommendation> = {
  capability: "fashion-recommendation-generation",
  engineVersion: "fashion-catalog-recommendation-v1",
  sourceRevision: HAIRFIT_LEGACY_SOURCE_REVISION,
  provider: null,
  model: null,
  promptPolicyVersion: "fashion-direction-v1",
  catalogCycleId: null,
  fallbackMode: "deterministic",
  execute: async (input) => generateFashionRecommendation(input),
  failureCode: () => "FASHION_RECOMMENDATION_FAILED",
  failureMessage: () => "패션 방향 추천을 준비하지 못했습니다. 인터뷰 답변은 유지됩니다.",
};

export function runFashionRecommendationCapability(input: { userId?: string; consultationId: string; idempotencyKey: string; recommendationInput: FashionRecommendationInput }): Promise<CapabilityResult<FashionRecommendation>> {
  const execution = { consultationId: input.consultationId, idempotencyKey: input.idempotencyKey, input: input.recommendationInput };
  return input.userId ? runDurableCapability(adapter, { ...execution, userId: input.userId }) : runInlineCapability(adapter, execution);
}

import assert from "node:assert/strict";
import test from "node:test";
import { HAIRFIT_V2_FEATURE_FLAGS } from "../../../packages/shared/src/v2/feature-flags.ts";
import {
  isAiLedHairDecisionEnabled,
  isConsultationAsyncAnalysisEnabled,
  isFashionAdaptiveBatchEnabled,
  isFashionProductTruthEnabled,
  isFashionTrendSignalsV2Enabled,
  isHairRankerShadowEnabled,
  isOnboardingFashionPersonalizationEnabled,
} from "./feature-flag.ts";

const names = [
  "CONSULTATION_AI_LED_HAIR_DECISION_ENABLED",
  "CONSULTATION_HAIR_RANKER_SHADOW_ENABLED",
  "FASHION_PRODUCT_TRUTH_ENABLED",
  "ONBOARDING_FASHION_PERSONALIZATION_ENABLED",
  "FASHION_ADAPTIVE_BATCH_ENABLED",
  "FASHION_TREND_SIGNALS_V2_ENABLED",
] as const;

test("P46 rollout flags are registered and default off", () => {
  for (const name of names) assert.equal(HAIRFIT_V2_FEATURE_FLAGS.includes(name), true);
  assert.equal(isAiLedHairDecisionEnabled({}), false);
  assert.equal(isHairRankerShadowEnabled({}), false);
  assert.equal(isFashionProductTruthEnabled({}), false);
  assert.equal(isOnboardingFashionPersonalizationEnabled({}), false);
  assert.equal(isFashionAdaptiveBatchEnabled({}), false);
  assert.equal(isFashionTrendSignalsV2Enabled({}), false);
});

test("P46 rollout flags require the exact true literal", () => {
  const env = Object.fromEntries(names.map((name) => [name, "true"]));
  assert.equal(isAiLedHairDecisionEnabled(env), true);
  assert.equal(isHairRankerShadowEnabled(env), true);
  assert.equal(isFashionProductTruthEnabled(env), true);
  assert.equal(isOnboardingFashionPersonalizationEnabled(env), true);
  assert.equal(isFashionAdaptiveBatchEnabled(env), true);
  assert.equal(isFashionTrendSignalsV2Enabled(env), true);
  assert.equal(isAiLedHairDecisionEnabled({ CONSULTATION_AI_LED_HAIR_DECISION_ENABLED: "1" }), false);
});

test("async photo analysis is fail-closed and requires the exact true literal", () => {
  assert.equal(isConsultationAsyncAnalysisEnabled({}), false);
  assert.equal(isConsultationAsyncAnalysisEnabled({ CONSULTATION_ASYNC_ANALYSIS_V2_ENABLED: "false" }), false);
  assert.equal(isConsultationAsyncAnalysisEnabled({ CONSULTATION_ASYNC_ANALYSIS_V2_ENABLED: "1" }), false);
  assert.equal(isConsultationAsyncAnalysisEnabled({ CONSULTATION_ASYNC_ANALYSIS_V2_ENABLED: "true" }), true);
});

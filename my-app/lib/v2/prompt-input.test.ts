import assert from "node:assert/strict";
import test from "node:test";
import type { PromptInputV2 } from "@hairfit/shared/v2";
import { compilePromptSpecsV2 } from "@hairfit/shared/v2/prompt";
import type { ConsultationSnapshot } from "../consulting/contracts.ts";
import type { RecommendationCandidate } from "../recommendation-types.ts";
import { buildPromptInputV2 } from "./prompt-input.ts";

const consultationId = "00000000-0000-4000-8000-000000000001";

function recommendations(): RecommendationCandidate[] {
  return Array.from({ length: 9 }, (_, index) => ({
    id: `candidate-${index + 1}`,
    rank: index + 1,
    label: `카탈로그 ${index + 1}`,
    reason: "실제 분석 근거 추천",
    prompt: `catalog provider prompt ${index + 1}`,
    negativePrompt: "different person",
    tags: ["balanced"],
    lengthBucket: "medium",
    correctionFocus: "crown",
    catalogItemId: `catalog-${index + 1}`,
    catalogCycleId: "catalog-v4-live",
    promptTemplateVersion: "catalog-v4",
  }));
}

test("consultation preferences and confirmed strategy become protected provider prompt data", () => {
  const snapshot = {
    discovery: {
      purpose: "일상 이미지 정리",
      goals: ["얼굴 균형 보완"],
      currentHair: "snapshot fallback",
      hairLength: "중간",
      hairDensity: "보통",
      strandThickness: "보통",
      hairTexture: "직모",
      treatmentHistory: [],
      damageLevel: "낮음",
      allowedServices: ["커트"],
      morningMinutes: 10,
      heatStyling: "sometimes",
      salonCycleWeeks: 8,
      maintenanceLevel: "medium",
      changeLevel: "moderate",
      avoid: ["매일 고데기"],
      notes: "손질 시간을 줄이고 싶음",
    },
    strategy: { length: "medium", confirmedAt: "2026-08-09T00:00:00.000Z" },
  } as unknown as ConsultationSnapshot;
  const analysisEvidence: PromptInputV2["analysisEvidence"] = {
    id: "00000000-0000-4000-8000-000000000002",
    model: { provider: "tensorflow-js", name: "MediaPipeFaceMesh", version: "1" },
    quality: { status: "pass", overall: 0.9, frontal: 0.9, lighting: 0.9, resolution: 0.9, blur: 0.9, occlusion: 0.9, hairlineVisibility: 0.9, warnings: [] },
    faceShape: { primary: "oblong", secondary: null, blend: {}, summary: "세로 균형을 보완" },
  };
  const input = buildPromptInputV2({
    id: consultationId,
    snapshot,
    generationInput: {
      styleTarget: "male",
      inputFingerprint: "input-fingerprint-male",
    } as never,
    preferences: {
      currentHair: {
        description: "어깨 아래 중간 길이의 직모이며 끝부분이 건조함",
        length: "중간",
        density: "보통",
        strandThickness: "보통",
        texture: "직모",
        treatmentHistory: [],
        damageLevel: "낮음",
      },
      styleGoal: {
        imageKeywords: ["일상 이미지 정리", "얼굴 균형 보완"],
        changeLevel: "moderate",
        desiredServices: ["커트"],
        notes: "손질 시간을 줄이고 싶음",
      },
      maintenance: {
        morningMinutes: 10,
        heatStyling: "sometimes",
        salonCycleWeeks: 8,
        maintenanceLevel: "medium",
      },
      avoidConditions: ["매일 고데기"],
    },
  }, analysisEvidence, null, recommendations());

  assert.equal(input.currentHair.description, "어깨 아래 중간 길이의 직모이며 끝부분이 건조함");
  assert.deepEqual(input.styleGoal.imageKeywords, ["일상 이미지 정리", "얼굴 균형 보완"]);
  assert.equal(input.styleGoal.desiredLength, "medium");
  assert.deepEqual(input.styleGoal.desiredServices, ["커트"]);
  assert.deepEqual(input.avoidConditions, ["매일 고데기"]);
  assert.equal(input.styleTarget, "male");
  assert.equal(input.generationInputFingerprint, "input-fingerprint-male");

  const plans = compilePromptSpecsV2(input);
  assert.equal(plans.length, 9);
  const combined = plans.map((plan) => `${plan.positivePrompt}\n${plan.negativePrompt}`).join("\n");
  for (const expected of [
    "어깨 아래 중간 길이의 직모이며 끝부분이 건조함",
    "일상 이미지 정리",
    "얼굴 균형 보완",
    "medium",
    "커트",
    "10",
    "sometimes",
    "8",
    "매일 고데기",
    "ONBOARDING_STYLE_TARGET=male",
    "input-fingerprint-male",
  ]) {
    assert.match(combined, new RegExp(expected));
  }
});

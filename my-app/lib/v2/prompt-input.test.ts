import assert from "node:assert/strict";
import test from "node:test";
import type { PromptInputV2 } from "@hairfit/shared/v2";
import { compilePromptSpecsV2 } from "@hairfit/shared/v2/prompt";
import type { ConsultationSnapshot } from "../consulting/contracts.ts";
import type { RecommendationCandidate } from "../recommendation-types.ts";
import {
  alignRecommendationsWithPromptSpecsV2,
  buildPromptInputV2,
} from "./prompt-input.ts";

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
  assert.ok(input.catalog.every((item) => item.lengthBucket === "medium"));

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

test("prompt slot ordering and recommendation card ordering stay on the same catalog item", () => {
  const candidates = recommendations();
  const lengths = ["medium", "long", "medium", "short", "medium", "long", "medium", "medium", "medium"] as const;
  candidates.forEach((candidate, index) => {
    candidate.lengthBucket = lengths[index];
  });
  const input = {
    schemaVersion: "prompt-input-v2",
    consultationId,
    styleTarget: "female",
    generationInputFingerprint: "alignment-fingerprint",
    analysisEvidence: {
      id: "00000000-0000-4000-8000-000000000002",
      model: { provider: "fixture", name: "fixture", version: "1" },
      quality: { status: "pass", overall: 1, frontal: 1, lighting: 1, resolution: 1, blur: 1, occlusion: 1, hairlineVisibility: 1, warnings: [] },
      faceShape: { primary: "oval", secondary: null, blend: { oval: 1 }, summary: "balanced" },
    },
    personalColor: null,
    currentHair: { description: "medium", length: "medium", density: "medium", strandThickness: "medium", texture: "straight", treatmentHistory: ["unknown"], damageLevel: "low" },
    styleGoal: { imageKeywords: ["soft"], desiredLength: "medium", changeLevel: "moderate", desiredServices: ["cut"], notes: "none" },
    maintenance: { morningMinutes: 10, heatStyling: "sometimes", salonCycleWeeks: 8, maintenanceLevel: "medium" },
    avoidConditions: [],
    catalogCycleId: "catalog-v4-live",
    catalog: candidates.map((candidate) => ({
      id: candidate.catalogItemId ?? candidate.id,
      cycleId: candidate.catalogCycleId ?? "unknown",
      name: candidate.label,
      lengthBucket: candidate.lengthBucket,
      design: { lengthBucket: candidate.lengthBucket },
      promptTemplateVersion: candidate.promptTemplateVersion ?? "unknown",
    })),
  } satisfies PromptInputV2;

  const specs = compilePromptSpecsV2(input);
  const aligned = alignRecommendationsWithPromptSpecsV2(candidates, specs);
  assert.deepEqual(
    aligned.map((candidate) => candidate.catalogItemId),
    specs.map((spec) => spec.catalogItemId),
  );
  assert.deepEqual(
    aligned.map((candidate) => candidate.lengthBucket),
    specs.map((spec) => spec.requiredLengthBucket),
  );
});

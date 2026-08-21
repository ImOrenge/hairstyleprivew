import assert from "node:assert/strict";
import test from "node:test";
import type { PersonalColorResult } from "../fashion-types";
import { createPersonalColorEvidence, enrichPersonalColorEvidenceFromCapabilityResult, mapPersonalColorDiagnosis, mapPersonalColorProfile } from "./personal-color-mapping.ts";

const result: PersonalColorResult = {
  detailVersion: "color-detail-v2",
  tone: "cool",
  contrast: "high",
  primaryType: "winter_cool",
  secondaryType: "winter_bright",
  blend: { winter_cool: 0.7, winter_bright: 0.3 },
  axes: { temperature: 0.2, value: 0.45, chroma: 0.8, contrast: 0.85 },
  confidence: 0.82,
  bestColors: [{ nameKo: "코발트 블루", nameEn: "Cobalt Blue", hex: "#2E5AAC", reason: "cool clear blue", recommendationReason: "차가운 선명도를 살립니다.", nonRecommendationReason: "저채도 조합에서는 강할 수 있습니다.", meaning: "선명하고 지적인 인상", stylingTip: "얼굴 가까운 포인트로 사용", colorCombinations: [{ title: "쿨 대비", hexes: ["#2E5AAC", "#F8F8F5"], reason: "맑은 대비를 유지합니다." }] }],
  avoidColors: [{ nameKo: "카멜", nameEn: "Camel", hex: "#B98248", reason: "warm medium neutral", recommendationReason: "작은 소품에는 사용할 수 있습니다.", nonRecommendationReason: "얼굴 가까이 쓰면 노란 기가 강조됩니다.", meaning: "따뜻하고 편안한 인상", stylingTip: "얼굴에서 떨어진 위치에 제한", colorCombinations: [{ title: "제한 조합", hexes: ["#B98248", "#34363A"], reason: "차콜로 온기를 완충합니다." }] }],
  stylingPalette: ["#112233", "#ddeeff"],
  hairColorHints: ["블루 블랙", "쿨 다크 브라운"],
  summary: "cool high contrast",
  diagnosedAt: "2026-08-11T00:00:00.000Z",
  model: "vision-test",
};

test("maps detailed personal color output into the consultation snapshot", () => {
  assert.deepEqual(mapPersonalColorProfile(result), {
    season: "cool · high",
    undertone: "cool",
    palette: ["#112233", "#ddeeff"],
    confidence: "high",
  });
});

test("caps personal color evidence confidence by photo color reliability", () => {
  const evidence = createPersonalColorEvidence({
    id: "personal-color-evidence-id",
    consultationId: "consultation-id",
    sourceAnalysisEvidenceId: "analysis-evidence-id",
    result,
    photoQuality: {
      status: "pass_with_warning",
      overall: 0.8,
      frontal: 0.9,
      lighting: 0.62,
      resolution: 0.9,
      blur: 0.9,
      occlusion: 0.9,
      hairlineVisibility: 0.9,
      skinColorReliability: 0.55,
      warnings: [{ code: "COLOR_CAST", message: "색조 치우침", severity: "warning" }],
    },
    createdAt: "2026-08-11T00:00:00.000Z",
  });
  assert.equal(evidence.quality.confidence, 0.55);
  assert.equal(evidence.quality.status, "warning");
  assert.deepEqual(evidence.quality.warnings, ["색조 치우침"]);
  assert.equal(evidence.result.confidence, 0.82);
  assert.equal(evidence.result.detailVersion, "color-detail-v2");
  assert.equal(evidence.result.bestColors?.[0]?.recommendationReason, "차가운 선명도를 살립니다.");
  assert.equal(evidence.result.avoidColors?.[0]?.nonRecommendationReason, "얼굴 가까이 쓰면 노란 기가 강조됩니다.");
  assert.deepEqual(evidence.result.hairColorHints, ["블루 블랙", "쿨 다크 브라운"]);

  const diagnosis = mapPersonalColorDiagnosis(evidence);
  assert.equal(diagnosis.detailVersion, "color-detail-v2");
  assert.equal(diagnosis.summary, "cool high contrast");
  assert.equal(diagnosis.bestColors[0]?.meaning, "선명하고 지적인 인상");
  assert.equal(diagnosis.avoidColors[0]?.stylingTip, "얼굴에서 떨어진 위치에 제한");
  assert.deepEqual(diagnosis.stylingPalette, ["#112233", "#ddeeff"]);
  assert.deepEqual(diagnosis.hairColorHints, ["블루 블랙", "쿨 다크 브라운"]);
  assert.equal(diagnosis.model, "vision-test");
});

test("recovers legacy engine detail from a durable capability result without overwriting evidence", () => {
  const evidence = createPersonalColorEvidence({
    id: "personal-color-evidence-id",
    consultationId: "consultation-id",
    sourceAnalysisEvidenceId: "analysis-evidence-id",
    result: { ...result, detailVersion: undefined, bestColors: [], avoidColors: [], stylingPalette: [], hairColorHints: [] },
    photoQuality: { status: "pass", overall: 0.9, frontal: 0.9, lighting: 0.9, resolution: 0.9, blur: 0.9, occlusion: 0.9, hairlineVisibility: 0.9, skinColorReliability: 0.9, warnings: [] },
    createdAt: "2026-08-11T00:00:00.000Z",
  });
  const recovered = enrichPersonalColorEvidenceFromCapabilityResult(evidence, result);
  assert.equal(recovered.result.detailVersion, "color-detail-v2");
  assert.equal(recovered.result.bestColors?.[0]?.nameKo, "코발트 블루");
  assert.equal(recovered.result.avoidColors?.[0]?.nameKo, "카멜");
  assert.deepEqual(recovered.result.hairColorHints, ["블루 블랙", "쿨 다크 브라운"]);
  assert.equal(recovered.result.confidence, evidence.result.confidence);
});

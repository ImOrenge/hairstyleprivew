import assert from "node:assert/strict";
import test from "node:test";
import { compileHairColorPreviewCandidates } from "./color-preview-candidates.ts";

test("compiles three stable personal-color hair candidates with implementation guidance", () => {
  const source: Parameters<typeof compileHairColorPreviewCandidates>[0] = {
    discovery: {
      purpose: "변화", goals: ["컬러"], currentHair: "자연 모발", hairLength: "중간", hairDensity: "보통", strandThickness: "보통", hairTexture: "직모",
      damageLevel: "높음", treatmentHistory: [], desiredServices: ["염색"], allowedServices: ["염색"], maintenanceLevel: "medium", morningMinutes: 10,
      heatStyling: "sometimes", salonCycleWeeks: 8, changeLevel: "moderate", avoid: [], notes: "",
    },
    personalColorDiagnosis: {
    state: "ready",
    evidenceId: "evidence", qualityStatus: "reliable", qualityConfidence: .9, warnings: [],
    primaryType: "autumn_deep",
    secondaryType: "autumn_warm", blend: { autumn_deep: .7 },
    axes: { temperature: 0.74, value: 0.32, chroma: 0.58, contrast: 0.67 },
    palette: { best: ["#4D3426"], neutrals: ["#5B4033"], accents: ["#B98248"], caution: [], metals: [] },
    detailVersion: "color-detail-v2", summary: "딥 웜 컬러가 안정적입니다.", bestColors: [], avoidColors: [], stylingPalette: [], hairColorHints: [], model: "test",
    hairColorDirections: [{ id: "deep", name: "딥 초콜릿 브라운", reason: "깊이와 온기를 연결합니다.", targetLevel: 5, bleachPolicy: "현재 베이스 진단", maintenance: "6~8주" }],
    startedAt: null, completedAt: null, errorCode: null, errorMessage: null,
  }};
  const candidates = compileHairColorPreviewCandidates(source);
  assert.deepEqual(candidates.map((candidate) => candidate.key), ["best-match", "natural", "accent"]);
  assert.equal(candidates[0].salonName, "딥 초콜릿 브라운");
  assert.equal(candidates[2].technique, "highlight");
  assert.ok(candidates.every((candidate) => candidate.rationale.length > 0));
  assert.ok(candidates.every((candidate) => candidate.bleachPolicy.length > 0 && candidate.maintenance.length > 0));
});

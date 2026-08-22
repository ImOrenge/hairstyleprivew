import assert from "node:assert/strict";
import test from "node:test";
import { buildMakeupProfessionalReportFallbackV1, normalizeMakeupProfessionalReportV1, type MakeupDirectionProfessionalReportInputV1 } from "./professional-report.ts";

const input: MakeupDirectionProfessionalReportInputV1 = {
  schemaVersion: "makeup-direction-professional-report-input-v1",
  enabledModules: ["base", "lip"],
  facts: [
    { id: "decision", kind: "decision", module: null, label: "방향", value: "데일리 내추럴 방향을 확정했습니다." },
    { id: "reason", kind: "reason", module: null, label: "조화", value: "부드러운 대비가 확정한 스타일과 이어집니다." },
    { id: "guide", kind: "guidance", module: null, label: "활용", value: "경계를 얇게 풀어 자연스럽게 연결하세요." },
    { id: "base", kind: "module", module: "base", label: "베이스", value: "필요한 부위만 얇게 정돈합니다." },
    { id: "lip", kind: "module", module: "lip", label: "립", value: "입술 중앙에서 바깥으로 색을 연결합니다." },
    { id: "limit", kind: "limitation", module: null, label: "확인", value: "실제 발색은 조명과 적용 방법에 따라 달라질 수 있습니다." },
  ],
};

function valid() {
  return {
    schemaVersion: "makeup-direction-professional-report-v1",
    headline: "부드러운 대비를 살린 데일리 메이크업",
    summary: [
      { text: "데일리 내추럴 방향을 확정했습니다.", evidenceIds: ["decision"] },
      { text: "부드러운 대비가 확정한 스타일과 이어집니다.", evidenceIds: ["reason"] },
      { text: "경계를 얇게 풀어 자연스럽게 연결하세요.", evidenceIds: ["guide"] },
    ],
    fitReasons: [{ text: "부드러운 대비가 확정한 스타일과 이어집니다.", evidenceIds: ["reason"] }],
    moduleInsights: [
      { module: "base", summary: [{ text: "필요한 부위만 얇게 정돈합니다.", evidenceIds: ["base"] }] },
      { module: "lip", summary: [{ text: "입술 중앙에서 바깥으로 색을 연결합니다.", evidenceIds: ["lip"] }] },
    ],
    applicationTips: [{ text: "경계를 얇게 풀어 자연스럽게 연결하세요.", evidenceIds: ["guide"] }],
  };
}

test("professional makeup fallback is complete and covers every enabled module", () => {
  const report = buildMakeupProfessionalReportFallbackV1(input);
  assert.equal(report.summary.length, 3);
  assert.deepEqual(report.moduleInsights.map((item) => item.module), input.enabledModules);
  assert.ok(report.applicationTips.length);
});

test("professional makeup report accepts only grounded structured output", () => {
  assert.deepEqual(normalizeMakeupProfessionalReportV1(valid(), input).moduleInsights.map((item) => item.module), ["base", "lip"]);
  const invalidEvidence = valid();
  invalidEvidence.summary[0].evidenceIds = ["unknown"];
  assert.throws(() => normalizeMakeupProfessionalReportV1(invalidEvidence, input), /EVIDENCE_INVALID/);
  const inventedNumber = valid();
  inventedNumber.applicationTips[0].text = "강도를 99로 올리세요.";
  assert.throws(() => normalizeMakeupProfessionalReportV1(inventedNumber, input), /NUMBER_UNGROUNDED/);
  const inventedProduct = valid();
  inventedProduct.applicationTips[0].text = "MAC Ruby Woo 립스틱을 사용하세요.";
  assert.throws(() => normalizeMakeupProfessionalReportV1(inventedProduct, input), /PRODUCT_UNGROUNDED/);
  const inventedFaceFeature = valid();
  inventedFaceFeature.fitReasons[0].text = "광대를 낮춰 보이게 합니다.";
  assert.throws(() => normalizeMakeupProfessionalReportV1(inventedFaceFeature, input), /FACE_FEATURE_UNGROUNDED/);
  const medicalClaim = valid();
  medicalClaim.summary[0].text = "피부 질환을 치료합니다.";
  assert.throws(() => normalizeMakeupProfessionalReportV1(medicalClaim, input), /TEXT_INVALID/);
  const internalTerm = valid();
  internalTerm.summary[0].text = "모델 fingerprint를 기준으로 정리했습니다.";
  assert.throws(() => normalizeMakeupProfessionalReportV1(internalTerm, input), /TEXT_INVALID/);
});

test("professional makeup report rejects disabled or duplicate module coverage", () => {
  const invalid = valid();
  invalid.moduleInsights[1] = { module: "eyeliner", summary: [{ text: "아이라인을 추가합니다.", evidenceIds: ["guide"] }] };
  assert.throws(() => normalizeMakeupProfessionalReportV1(invalid, input), /MODULE_INVALID/);
});

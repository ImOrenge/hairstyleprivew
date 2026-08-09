/* global __dirname, expect, test */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Expo defaults to the resumable non-wizard V2 AI consultant", () => {
  const home = read("app/index.tsx");
  const navigation = read("lib/role-navigation.ts");
  const consulting = read("app/consulting.tsx");
  const resume = read("lib/v2-consultation-resume.ts");
  expect(home).toMatch(/AI 헤어 컨설턴트 시작/);
  expect(home).toMatch(/router\.push\("\/consulting"\)/);
  expect(navigation).toMatch(/href: "\/consulting", label: "상담"/);
  expect(resume).toMatch(/SecureStore/);
  expect(consulting).toMatch(/readActiveV2ConsultationId/);
  expect(consulting).toMatch(/isMobileV2ConsultationEnabled/);
  expect(consulting).toMatch(/getV2Consultation/);
  expect(consulting).not.toMatch(/currentStep|Wizard/);
});

test("Expo photo analysis and generation stay linked to the same consultation", () => {
  const upload = read("app/upload.tsx");
  const generate = read("app/generate.tsx");
  expect(upload).toMatch(/analyzeV2ConsultationPhoto/);
  expect(upload.indexOf("await analyzeForConsultation(receipt.draftId)")).toBeLessThan(
    upload.indexOf("flow.setDraftReceipt({"),
  );
  expect(generate).toMatch(/acceptGenerationDraft\(receipt\.draftId, quote\.quoteId, consultationId\)/);
});

test("Expo renders server normalized evidence and real V2 board decisions", () => {
  const consulting = read("app/consulting.tsx");
  const overlay = read("components/consulting/NativeFaceEvidenceOverlay.tsx");
  expect(consulting).toMatch(/getV2AnalysisEvidence/);
  expect(consulting).toMatch(/getV2PreviewBoard/);
  expect(consulting).toMatch(/saveV2Shortlist/);
  expect(consulting).toMatch(/getV2Shortlist/);
  expect(consulting).toMatch(/selectV2Style/);
  expect(consulting).toMatch(/confirmV2Style/);
  expect(overlay).toMatch(/point\.x \* 100/);
  expect(overlay).toMatch(/point\.y \* 100/);
  expect(overlay).toMatch(/evidence\.landmarks/);
  expect(overlay).toMatch(/evidence\.contours/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { projectConsultationReportV1 } from "@hairfit/shared/consulting/report";
import { createConsultationSnapshot } from "./defaults.ts";

test("full journey report has every current lifecycle section and excludes the raw face photo", () => {
  const snapshot = createConsultationSnapshot({
    sessionId: "11111111-1111-4111-8111-111111111111",
    userId: "test-user",
    now: "2026-08-16T00:00:00.000Z",
  });
  const report = projectConsultationReportV1(snapshot);
  assert.equal(report.schemaVersion, "consultation-report-view-model-v1");
  assert.equal(report.sections.length, 14);
  assert.deepEqual(report.sections.map((section) => section.key), [
    "identity", "request", "input-quality", "analysis", "personal-color", "direction", "preview-comparison",
    "decision", "color-studio", "salon-brief", "makeup", "fashion", "aftercare", "integrity",
  ]);
  assert.equal(report.rawPhotoIncluded, false);
  assert.equal(report.sections.at(-1)?.fields.find((field) => field.label === "원본 얼굴 사진")?.value, "개인정보 보호를 위해 제외됨");
});

test("salon handoff profile keeps only decision-critical sections and canonical detail routes", () => {
  const snapshot = createConsultationSnapshot({
    sessionId: "22222222-2222-4222-8222-222222222222",
    userId: "test-user",
    now: "2026-08-16T00:00:00.000Z",
  });
  const report = projectConsultationReportV1(snapshot, "salon_handoff");
  assert.deepEqual(report.sections.map((section) => section.key), ["identity", "request", "analysis", "decision", "color-studio", "salon-brief", "integrity"]);
  assert.equal(report.sections.find((section) => section.key === "decision")?.detailHref, "/consulting/22222222-2222-4222-8222-222222222222/decision");
});

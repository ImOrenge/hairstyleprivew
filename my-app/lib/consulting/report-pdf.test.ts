import assert from "node:assert/strict";
import test from "node:test";
import { projectConsultationReportV1 } from "@hairfit/shared/consulting/report";
import { projectConsultationReportV2 } from "@hairfit/shared/consulting/report-v2";
import { createConsultationSnapshot } from "./defaults.ts";
import { renderConsultationReportPdf } from "./render-report-pdf.tsx";
import { renderConsultationReportPdfV2 } from "./render-report-pdf-v2.tsx";

test("report renderer produces a real PDF document with the bundled Korean font", async () => {
  const snapshot = createConsultationSnapshot({
    sessionId: "33333333-3333-4333-8333-333333333333",
    userId: "test-user",
    now: "2026-08-16T00:00:00.000Z",
  });
  const pdf = await renderConsultationReportPdf(projectConsultationReportV1(snapshot));
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.byteLength > 10_000);
});

test("V2 report renderer produces a real PDF from the same tabbed view model", async () => {
  const snapshot = createConsultationSnapshot({
    sessionId: "44444444-4444-4444-8444-444444444444",
    userId: "test-user-v2",
    now: "2026-08-16T00:00:00.000Z",
  });
  const report = projectConsultationReportV2(snapshot);
  assert.equal(report.schemaVersion, "consultation-report-view-model-v2");
  assert.equal(report.tabs.at(-1)?.key, "final");
  const pdf = await renderConsultationReportPdfV2(report);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.byteLength > 10_000);
});

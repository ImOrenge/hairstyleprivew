import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("Result uses the dedicated vertical report document instead of the split workbench", () => {
  const result = read("../../components/consulting/workbenches/ResultWorkbench.tsx");
  const tabs = read("../../components/consulting/report/ReportTabsV2.tsx");
  const scene = read("../../components/consulting/scene/ConsultationScene.tsx");
  assert.match(result, /projectConsultationReportV2/);
  assert.match(result, /ReportReceiptV2/);
  assert.match(result, /initialReport\?\.consultationVersion === snapshot\.version/);
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /ArrowRight/);
  assert.match(tabs, /searchParams/);
  assert.doesNotMatch(result, /WorkbenchGrid|data-consulting-split-canvas/);
  assert.match(scene, /reportMode = stage === "result"/);
  assert.match(scene, /data-consulting-layout=\{reportMode \? "report" : "workbench"\}/);
});

test("print CSS removes interactive chrome and preserves a single document flow", () => {
  const css = read("../../app/globals.css");
  assert.match(css, /@media print[\s\S]*\[data-report-toolbar="true"\]/);
  assert.match(css, /@media print[\s\S]*\[data-report-tab-panel\][\s\S]*display: block !important/);
  assert.match(css, /\[data-consulting-layout="report"\][\s\S]*overflow: visible/);
  assert.match(css, /@page\s*\{[\s\S]*size: A4/);
});

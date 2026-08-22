import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..");
const repo = join(app, "..");
const readApp = (path: string) => readFileSync(join(app, path), "utf8");
const readRepo = (path: string) => readFileSync(join(repo, path), "utf8");

test("professional makeup report is a separate grounded durable capability", () => {
  const service = readApp("lib/capabilities/makeup-professional-report-service.ts");
  const capability = readRepo("packages/shared/src/consulting/capability.ts");
  const flag = readApp("lib/consulting/feature-flag.ts");
  assert.match(service, /projectMakeupProfessionalReportInputV1/);
  assert.match(service, /enabledModules each|enabledModules/);
  assert.doesNotMatch(service, /sourcePhotoUrl|storage_path|storagePath/);
  assert.match(capability, /makeup-direction-professional-report-generation/);
  assert.match(flag, /MAKEUP_PROFESSIONAL_REPORT_AI_ENABLED === "true"/);
});

test("confirmation, API and customer surfaces keep fallback nonblocking", () => {
  const confirmation = readApp("app/api/consultations/[sessionId]/makeup/confirm/route.ts");
  const route = readApp("app/api/consultations/[sessionId]/makeup/report/route.ts");
  const stage = readApp("components/consulting/makeup/MakeupDirectionStage.tsx");
  const report = readApp("components/consulting/makeup/MakeupProfessionalReport.tsx");
  const result = readApp("components/consulting/report/ReportSectionV2.tsx");
  const pdf = readApp("lib/consulting/render-report-pdf-v2.tsx");
  const share = readApp("app/makeup/share/[token]/page.tsx");
  assert.match(confirmation, /after\(async/);
  for (const method of ["GET", "POST", "PUT"]) assert.match(route, new RegExp(`export async function ${method}`));
  assert.match(stage, /reportState !== "fallback"/);
  assert.match(stage, /reportState !== "preparing"/);
  assert.match(stage, /retryProfessionalReport/);
  assert.match(report, /해설 다시 준비하기/);
  for (const source of [result, pdf, share]) assert.match(source, /professionalReport/);
});

test("professional report capability migration is mirrored and preserves current capabilities", () => {
  const name = "20260822120000_makeup_professional_report.sql";
  const root = readRepo(`supabase/migrations/${name}`);
  const mirror = readApp(`supabase/migrations/${name}`);
  assert.equal(root, mirror);
  for (const capability of ["makeup-direction-professional-report-generation", "consultation-result-narrative-generation", "aftercare-checkin-response-generation"]) assert.match(root, new RegExp(capability));
});

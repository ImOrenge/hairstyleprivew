import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("report export API is authenticated, owner-scoped, idempotent, expiring, and serves only PDF", () => {
  const createRoute = read("../../app/api/v2/consultations/[consultationId]/report-exports/route.ts");
  const downloadRoute = read("../../app/api/v2/consultations/[consultationId]/report-exports/[exportId]/download/route.ts");
  const service = read("./report-export-server.ts");
  assert.match(createRoute, /await auth\(\)/);
  assert.match(createRoute, /Idempotency-Key/);
  assert.match(service, /\.eq\("user_id", input\.userId\)/);
  assert.match(service, /IDEMPOTENCY_SCOPE_CONFLICT/);
  assert.match(service, /assertExportVersionScope/);
  assert.match(service, /REPORT_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(service, /new TextDecoder\("ascii"\)[\s\S]*%PDF-/);
  assert.match(service, /allowedReportImageHosts/);
  assert.match(service, /secureReportImagesV2/);
  assert.match(service, /view_model_version/);
  assert.match(service, /renderer_version/);
  assert.match(service, /renderConsultationReportPdfV2/);
  assert.match(createRoute, /viewModelVersion/);
  assert.match(downloadRoute, /Cache-Control": "private, no-store/);
  assert.match(downloadRoute, /"Content-Type": "application\/pdf"/);
});

test("report V2 version migration is mirrored and preserves V1 snapshots", () => {
  const root = read("../../../supabase/migrations/20260816095830_consultation_report_v2_versions.sql");
  const mirror = read("../../supabase/migrations/20260816095830_consultation_report_v2_versions.sql");
  assert.equal(root, mirror);
  assert.match(root, /view_model_version integer not null default 1/);
  assert.match(root, /renderer_version text not null default 'report-pdf-v1'/);
  assert.match(root, /uq_consultation_report_snapshots_v2_source_version/);
  assert.match(root, /uq_consultation_report_snapshots_v2_content_version/);
  assert.doesNotMatch(root, /delete from consultation_report_snapshots_v2/i);
});

test("report migration is mirrored, private, service-role only, and account-deletion aware", () => {
  const root = read("../../../supabase/migrations/20260816110000_consultation_report_exports.sql");
  const mirror = read("../../supabase/migrations/20260816110000_consultation_report_exports.sql");
  assert.equal(root, mirror);
  assert.match(root, /'consultation-report-exports', 'consultation-report-exports', false/);
  assert.match(root, /force row level security/);
  assert.match(root, /revoke all [\s\S]* from public, anon, authenticated/);
  assert.match(root, /grant select, insert[\s\S]*service_role/);
  assert.match(root, /queue_hairfit_report_exports_for_account_deletion_v2/);
});

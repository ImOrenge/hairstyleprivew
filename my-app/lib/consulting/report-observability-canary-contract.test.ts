import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONSULTATION_CANARY_FLAG_ORDER_V1, nextConsultationCanaryFlagV1 } from "@hairfit/shared/consulting/report-observability";
import { sanitizeV2EventPayload } from "../v2/observability-payload.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("P53 canary order is deterministic and rollback registration contains every new flag", () => {
  assert.equal(nextConsultationCanaryFlagV1([]), "FASHION_PRODUCT_TRUTH_ENABLED");
  assert.equal(nextConsultationCanaryFlagV1(CONSULTATION_CANARY_FLAG_ORDER_V1.slice(0, 4)), "CONSULTATION_AI_LED_HAIR_DECISION_ENABLED");
  assert.equal(nextConsultationCanaryFlagV1([...CONSULTATION_CANARY_FLAG_ORDER_V1]), null);
  const readiness = read("../../scripts/verify-hairfit-v2-live-readiness.mjs");
  let cursor = -1;
  for (const flag of CONSULTATION_CANARY_FLAG_ORDER_V1) {
    const index = readiness.indexOf(`"${flag}"`);
    assert.ok(index > cursor, `${flag} must be registered in rollout order`);
    cursor = index;
  }
  const off = read("../../scripts/set-hairfit-v2-cloudflare-off.mjs");
  assert.match(off, /EXPLICIT_ROLLOUT_FLAGS/);
  assert.match(off, /buildOffPayload/);
});

test("P53 report observability retains only aggregate lineage and never raw customer content", () => {
  const safe = sanitizeV2EventPayload({
    surface: "web",
    reportRevision: 3,
    reportFingerprint: "a1b2c3d4",
    hairGeneratedCount: 9,
    fashionGeneratedCount: 6,
    fashionRequestedCount: 6,
    mismatch: false,
    rawPhotoUrl: "https://private.example/photo.jpg",
    freeText: "고객 자유 입력",
    clerkToken: "secret",
  });
  assert.deepEqual(safe, {
    surface: "web",
    reportRevision: 3,
    reportFingerprint: "a1b2c3d4",
    hairGeneratedCount: 9,
    fashionGeneratedCount: 6,
    fashionRequestedCount: 6,
    mismatch: false,
  });
});

test("P53 Web Native PDF use one provenance projection and expose all generated contents", () => {
  const report = read("../../../packages/shared/src/consulting/report-v2.ts");
  const web = read("../../components/consulting/report/ReportSectionV2.tsx");
  const native = read("../../../apps/hairfit-app/app/consulting.tsx");
  const pdf = read("./render-report-pdf-v2.tsx");
  const server = read("./report-v2-server.ts");
  const reconciliation = read("../v2/reconciliation-server.ts");
  const route = read("../../app/api/v2/consultations/[consultationId]/report/route.ts");
  assert.match(report, /consulting-result-provenance-v3/);
  assert.match(report, /snapshot\.previews\.map/);
  assert.match(report, /candidates\.map/);
  assert.match(web, /data-report-generated-gallery="hair-all"/);
  assert.match(web, /data-report-generated-gallery="fashion-all"/);
  assert.match(native, /Hair 생성 결과 9개 전체/);
  assert.match(native, /Fashion 생성 결과 전체/);
  assert.match(pdf, /Hair 전체/);
  assert.match(pdf, /Fashion 전체/);
  assert.match(server, /recordConsultationReportProjectionEvent/);
  assert.match(reconciliation, /reconcileConsultationReportProjectionsV3/);
  assert.match(reconciliation, /report_generated_content_mismatch/);
  assert.match(reconciliation, /report_fingerprint_mismatch/);
  assert.match(route, /surface=native|searchParams\.get\("surface"\)/);
});

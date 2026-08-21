import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("result narrative uses allowlisted report facts, durable idempotency, fallback, and retry", () => {
  const service = source("./result-narrative-service.ts");
  const route = source("../../app/api/v2/consultations/[consultationId]/report-narrative/route.ts");
  assert.match(service, /projectConsultationResultNarrativeInputV1/);
  assert.match(service, /resultNarrativeIdempotencyKey/);
  assert.match(service, /runDurableCapability/);
  assert.match(service, /buildConsultationResultNarrativeFallbackV1/);
  assert.match(service, /consultationResultNarrativeStateV1/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PUT/);
  assert.match(service, /return \{ schemaVersion: "consultation-result-narrative-input-v1", reportFingerprint: baseFingerprint, availableTabs, facts \}/);
  assert.doesNotMatch(service, /facts\.push\([^\n]*(?:photoUrl|primaryUrl|userId)/);
});

test("screen and PDF consume the same narrative content without customer-facing internals", () => {
  const report = source("../../components/consulting/report/ReportReceiptV2.tsx");
  const tabs = source("../../components/consulting/report/ReportTabsV2.tsx");
  const pdf = source("./render-report-pdf-v2.tsx");
  const journey = [
    source("../../components/consulting/transition/ConsultantActivityRail.tsx"),
    source("../../components/consulting/transition/ConsultationTransitionScreen.tsx"),
    source("../../components/consulting/transition/PartialResultReveal.tsx"),
  ].join("\n");
  assert.match(report, /report\.narrative/);
  assert.match(tabs, /ReportNarrativeV2/);
  assert.match(pdf, /report\.narrative\.content\.overall/);
  assert.match(pdf, /문서 확인번호/);
  assert.doesNotMatch([report, tabs, pdf].join("\n"), /AI 판단 근거|RESULT GROUP|무결성|report projection/);
  assert.doesNotMatch(journey, />Live task<|>First evidence<|>Brief draft<|>Fashion batch<|AI consultant is working/);
});

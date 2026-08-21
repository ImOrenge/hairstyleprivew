import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { projectConsultationReportV2 } from "@hairfit/shared/consulting/report-v2";
import { handleReportPdfRequest } from "../../workers/report-pdf/src/index.ts";
import { createConsultationSnapshot } from "./defaults.ts";

test("private PDF worker renders a V2 report with the bound Korean font asset", async () => {
  const font = readFileSync(new URL("../../assets/fonts/NanumGothic-Regular.ttf", import.meta.url));
  const assets = { fetch: async () => new Response(font) } as Pick<Fetcher, "fetch">;
  const report = projectConsultationReportV2(createConsultationSnapshot({
    sessionId: "55555555-5555-4555-8555-555555555555",
    userId: "pdf-worker-test-user",
    now: "2026-08-21T00:00:00.000Z",
  }));
  const response = await handleReportPdfRequest(new Request("https://report-pdf.internal/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
  }), assets);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(new TextDecoder("ascii").decode(bytes.slice(0, 5)), "%PDF-");
  assert.ok(bytes.byteLength > 10_000);
});

test("private PDF worker rejects unknown schemas and oversized payloads", async () => {
  const unusedAssets = { fetch: async () => new Response(null, { status: 404 }) } as Pick<Fetcher, "fetch">;
  const invalid = await handleReportPdfRequest(new Request("https://report-pdf.internal/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schemaVersion: "unknown" }),
  }), unusedAssets);
  assert.equal(invalid.status, 400);

  const oversized = await handleReportPdfRequest(new Request("https://report-pdf.internal/render", {
    method: "POST",
    headers: { "content-length": String(2 * 1024 * 1024 + 1) },
    body: "{}",
  }), unusedAssets);
  assert.equal(oversized.status, 413);
});

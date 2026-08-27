import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..");
const repo = join(app, "..");
const readApp = (path: string) => readFileSync(join(app, path), "utf8");

test("photo diagnosis migration is mirrored and uses durable claim fencing", () => {
  const name = "20260827093000_consultation_photo_diagnosis_hardening.sql";
  const root = readFileSync(join(repo, "supabase", "migrations", name), "utf8");
  const mirror = readFileSync(join(app, "supabase", "migrations", name), "utf8");
  assert.equal(root, mirror);
  assert.match(root, /input_snapshot jsonb/);
  assert.match(root, /lease_owner uuid/);
  assert.match(root, /fencing_token bigint/);
  assert.match(root, /for update skip locked/i);
  assert.match(root, /coalesce\(run\.lease_expires_at, '-infinity'::timestamptz\)/);
  assert.match(root, /v_existing\.state in \('completed', 'queued', 'preflight', 'landmarks', 'analyzing'\)/);
  assert.match(root, /state in \('queued', 'retry_required', 'preflight', 'landmarks', 'analyzing'\)/);
  assert.match(root, /PHOTO_ANALYSIS_STALE_FENCE/);
  assert.match(root, /queue_expired_personal_color_capture_cleanup/);
  assert.match(root, /revoke all[\s\S]*authenticated[\s\S]*grant execute[\s\S]*service_role/i);
});

test("new photo analysis clears old evidence and fences persistence by run id", () => {
  const server = readApp("lib/consulting/photo-analysis-server.ts");
  assert.match(server, /analysisRunId: run\.id/);
  assert.match(server, /evidence: clean\.evidence/);
  assert.match(server, /personalColorDiagnosis: clean\.personalColorDiagnosis/);
  assert.match(server, /current\.photo\.analysisRunId !== input\.runId/);
  assert.match(server, /PHOTO_ANALYSIS_SUPERSEDED/);
  assert.match(server, /claim_consultation_photo_analyses_v2/);
  assert.match(server, /\.order\("updated_at", \{ ascending: false \}\)/);
});

test("precision capture requires and uploads independently validated primary and assist photos", () => {
  const photo = readApp("components/consulting/workbenches/PhotoWorkbench.tsx");
  assert.match(photo, /정밀 진단 · 정면\+자연광 2장/);
  assert.match(photo, /assistValidation\.validateImage/);
  assert.match(photo, /role: "color_primary"/);
  assert.match(photo, /role: "color_secondary"/);
  assert.match(photo, /captureMode === "precision" && !sourceAssistFile/);
  assert.match(photo, /retentionDays: sourcePhoto\.retentionDays/);
  assert.match(photo, /stablePhotoUploadId/);
  assert.match(photo, /customer_reselected_primary_photo/);
  assert.match(photo, /colorAssistCaptureAssetId: null/);
  assert.doesNotMatch(photo, /const colorFile = sourceAssistFile \?\? preparedFile/);
});

test("scan waits for the matching run with bounded backoff and explicit recovery", () => {
  const scan = readApp("components/consulting/workbenches/ScanWorkbench.tsx");
  assert.match(scan, /snapshot\.photo\.analysisRunId === run\.id/);
  assert.match(scan, /Date\.now\(\) - startedAt >= 120_000/);
  assert.match(scan, /Math\.min\(8_000/);
  assert.match(scan, /AbortController/);
  assert.match(scan, /method: "PUT"/);
  assert.match(scan, /setPollRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(scan, /분석 다시 연결하기/);
  assert.doesNotMatch(scan, /const ready = snapshot\.evidence\.items\.length > 0 \|\|/);
});

test("retention selection controls both draft and personal color capture expiry", () => {
  const photo = readApp("components/consulting/workbenches/PhotoWorkbench.tsx");
  const draft = readApp("app/api/generations/drafts/route.ts");
  const capture = readApp("lib/personal-color-capture.ts");
  const worker = readApp("workers/generation-workflow/src/index.ts");
  assert.match(photo, /retentionDays: sourcePhoto\.retentionDays/);
  assert.match(draft, /retentionDays \* DAY_MS/);
  assert.match(capture, /input\.retentionDays \* DAY_MS/);
  assert.match(worker, /\/api\/consultations\/photo-captures\/cleanup/);
  assert.match(worker, /\/api\/consultations\/photo-analysis\/drain/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workbench = readFileSync(new URL("../../components/consulting/workbenches/FashionBatchWorkbench.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("./fashion-batch-server.ts", import.meta.url), "utf8");
const recommendationServer = readFileSync(new URL("./fashion-recommendation-batch-server.ts", import.meta.url), "utf8");
const outputServer = readFileSync(new URL("../v2/outputs-server.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260820180000_fashion_adaptive_batch_v2.sql", import.meta.url), "utf8");

test("Web keeps all requested generated slots visible instead of a shortlist projection", () => {
  assert.match(workbench, /data-fashion-generated-gallery="all-generated"/);
  assert.match(workbench, /visibleSlots = SLOTS\.slice\(0, visibleSlotCount\)/);
  assert.match(workbench, /완료·생성 중·정체·실패 상태를 포함해 어떤 슬롯도 숨기지 않습니다/);
  assert.doesNotMatch(workbench, /Fashion comparison/);
});

test("adaptive expansion appends exactly three sessions and protects the fingerprint", () => {
  assert.match(server, /addedSessionIds\.length !== 3/);
  assert.match(server, /prepared\.generationInputFingerprint !== row\.generation_input_fingerprint/);
  assert.match(server, /requested_count: input\.targetRequestedCount/);
  assert.match(server, /revision: row\.revision \+ 1/);
  assert.match(server, /consumption_receipt_ids: \[\.\.\.new Set\(attempts/);
  assert.match(recommendationServer, /input\.adaptive \? input\.direction : slotDirection/);
});

test("single AI recommendation can be confirmed without a forced comparison shortlist", () => {
  assert.match(outputServer, /stylingSessionIds\.length < 1 \|\| stylingSessionIds\.length > 3/);
  assert.match(workbench, /AI 권장 룩 확정/);
  assert.match(workbench, /decision = chosenId === batchState\.batch\.recommendedPreviewId/);
});

test("migration preserves legacy nine while allowing only 3 6 9", () => {
  assert.match(migration, /requested_count in \(3, 6, 9\)/);
  assert.match(migration, /requested_count = 9 and expansion_level = 2/);
  assert.match(migration, /base_batch_id/);
});

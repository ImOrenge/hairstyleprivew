import assert from "node:assert/strict";
import test from "node:test";
import { parseCustomerFashionPreviewSetRowV2 } from "./customer-stylebook-parser.ts";

function fashionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "fashion-set-1",
    consultation_id: "consultation-1",
    selection_snapshot_id: "selection-1",
    version: 2,
    created_at: "2026-08-25T09:00:00.000Z",
    preview_set: {
      schemaVersion: "fashion-preview-set-v2",
      consultationId: "consultation-1",
      selectionSnapshotId: "selection-1",
      selectedStylingSessionId: "styling-1",
      selectedHairSnapshotId: "selection-1",
      selectedLook: {
        label: "아이보리 모던 데일리",
        category: "DAILY",
        genre: "minimal",
        palette: ["#F4F1E8", "#34322C"],
        silhouette: "릴랙스드 스트레이트",
        neckline: "소프트 V넥",
        items: [{ slot: "top", name: "아이보리 니트", color: "ivory", fit: "regular", material: "knit" }],
        shoppingKeywords: ["아이보리 니트"],
      },
    },
    ...overrides,
  };
}

test("parses the durable final fashion selection into the customer stylebook contract", () => {
  const parsed = parseCustomerFashionPreviewSetRowV2(fashionRow());
  assert.deepEqual(parsed, {
    kind: "fashion",
    id: "fashion-set-1",
    consultationId: "consultation-1",
    selectionSnapshotId: "selection-1",
    selectedStylingSessionId: "styling-1",
    title: "아이보리 모던 데일리",
    category: "DAILY",
    genre: "minimal",
    palette: ["#F4F1E8", "#34322C"],
    silhouette: "릴랙스드 스트레이트",
    neckline: "소프트 V넥",
    items: [{ slot: "top", name: "아이보리 니트", color: "ivory", fit: "regular", material: "knit" }],
    shoppingKeywords: ["아이보리 니트"],
    imagePath: null,
    confirmedAt: "2026-08-25T09:00:00.000Z",
  });
});

test("rejects legacy or incomplete fashion payloads", () => {
  assert.equal(parseCustomerFashionPreviewSetRowV2(fashionRow({ preview_set: { schemaVersion: "fashion-preview-set-v1" } })), null);
  assert.equal(parseCustomerFashionPreviewSetRowV2(fashionRow({
    preview_set: {
      schemaVersion: "fashion-preview-set-v2",
      selectedStylingSessionId: "styling-1",
      selectedLook: { category: "UNKNOWN" },
    },
  })), null);
  assert.equal(parseCustomerFashionPreviewSetRowV2(fashionRow({
    preview_set: {
      schemaVersion: "fashion-preview-set-v2",
      consultationId: "another-consultation",
      selectionSnapshotId: "selection-1",
      selectedStylingSessionId: "styling-1",
      selectedLook: { category: "DAILY" },
    },
  })), null);
});

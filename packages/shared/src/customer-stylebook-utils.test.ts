import assert from "node:assert/strict";
import test from "node:test";
import type { CustomerStylebookV2 } from "./customer-stylebook.ts";
import { filterCustomerStylebookEntriesV2 } from "./customer-stylebook-utils.ts";

const state = { customTitle: null, note: "", tags: [] as string[], favorite: false, archivedAt: null, updatedAt: null };
const collection: CustomerStylebookV2 = {
  schemaVersion: "customer-stylebook-v2",
  hair: [
    {
      kind: "hair",
      id: "hair-favorite",
      consultationId: "consultation-1",
      previewVariantId: "preview-1",
      title: "레이어드 보브",
      description: "손질이 쉬운 웨이브",
      imageUrl: null,
      confirmedAt: "2026-08-20T00:00:00.000Z",
      strategyBucket: "soft",
      length: "medium",
      bang: "see_through",
      texture: "wavy",
      volume: ["crown"],
      maintenanceLevel: "low",
      state: { ...state, favorite: true, tags: ["출근"] },
    },
    {
      kind: "hair",
      id: "hair-archived",
      consultationId: "consultation-2",
      previewVariantId: "preview-2",
      title: "롱 스트레이트",
      description: "정돈된 실루엣",
      imageUrl: null,
      confirmedAt: "2026-08-25T00:00:00.000Z",
      strategyBucket: "classic",
      length: "long",
      bang: "none",
      texture: "straight",
      volume: [],
      maintenanceLevel: "high",
      state: { ...state, archivedAt: "2026-08-26T00:00:00.000Z" },
    },
  ],
  fashion: [],
  sets: [],
  collections: [{
    id: "work",
    name: "출근",
    colorKey: "champagne",
    sortOrder: 0,
    itemRefs: [{ kind: "hair", id: "hair-favorite", consultationId: "consultation-1" }],
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  }],
  wearLogs: [{
    id: "log-1",
    item: { kind: "hair", id: "hair-favorite", consultationId: "consultation-1" },
    appliedOn: "2026-08-21",
    applicationType: "hair_service",
    satisfaction: 5,
    convenience: 5,
    reactionNote: "",
    note: "",
    wouldRepeat: true,
    photoUrl: null,
    photoConsentedAt: null,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
  }],
  activeShares: [],
  references: [],
  metadataAvailable: true,
};

test("searches title, tags and facets while hiding archived entries by default", () => {
  assert.deepEqual(filterCustomerStylebookEntriesV2(collection, "hair", { query: "출근" }).map((entry) => entry.id), ["hair-favorite"]);
  assert.deepEqual(filterCustomerStylebookEntriesV2(collection, "hair", { facet: "wavy" }).map((entry) => entry.id), ["hair-favorite"]);
  assert.deepEqual(filterCustomerStylebookEntriesV2(collection, "hair", {}).map((entry) => entry.id), ["hair-favorite"]);
});

test("filters collections and can explicitly include archived entries", () => {
  assert.deepEqual(filterCustomerStylebookEntriesV2(collection, "hair", { collectionId: "work" }).map((entry) => entry.id), ["hair-favorite"]);
  assert.deepEqual(filterCustomerStylebookEntriesV2(collection, "hair", { includeArchived: true, sort: "confirmed" }).map((entry) => entry.id), ["hair-archived", "hair-favorite"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { StyleSelectionSnapshotV2 } from "@hairfit/shared/v2";
import type { SelectedStyleSnapshot } from "./contracts.ts";
import { resolveConfirmedHairDecisionV2 } from "./generation-input-resolution.ts";

const activeStyle = {
  id: "draft-style", label: "Draft label", reason: "draft reason", services: ["cut"], maintenance: "draft maintenance", limitations: ["draft limitation"], selectedAt: "2026-08-11T00:00:00.000Z",
  strategy: { length: "medium", fringe: "side", parting: "6:4", crownVolume: "high", sideVolume: "low", texture: "soft", color: "natural" },
} as SelectedStyleSnapshot;

const confirmedSelection = {
  id: "confirmed-selection", confirmedAt: "2026-08-12T00:00:00.000Z", selectedAt: "2026-08-12T00:00:00.000Z",
  style: { name: "Confirmed label", recommendationReason: "confirmed evidence", design: {}, color: null },
} as StyleSelectionSnapshotV2;

test("immutable confirmed selection wins conflicts while draft details only fill missing fields", () => {
  const resolved = resolveConfirmedHairDecisionV2({ selectionSnapshot: confirmedSelection, selectionId: "confirmed-row", selectionConfirmedAt: confirmedSelection.confirmedAt, activeStyle });
  assert.equal(resolved?.selectionSnapshotId, "confirmed-row");
  assert.equal(resolved?.label, "Confirmed label");
  assert.equal(resolved?.reason, "confirmed evidence");
  assert.equal(resolved?.design.length, "medium");
  assert.deepEqual(resolved?.services, ["cut"]);
});

test("legacy consultation falls back to active style only when no confirmed selection exists", () => {
  const resolved = resolveConfirmedHairDecisionV2({ selectionSnapshot: null, activeStyle });
  assert.equal(resolved?.selectionSnapshotId, "draft-style");
  assert.equal(resolved?.label, "Draft label");
});

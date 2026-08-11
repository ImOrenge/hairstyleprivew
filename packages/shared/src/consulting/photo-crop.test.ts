import assert from "node:assert/strict";
import test from "node:test";
import { createConsultationPhotoCrop, isConsultationPhotoCrop, moveConsultationPhotoCrop } from "./photo-crop.ts";

test("creates a face-aware 4:5 crop without leaving the source image", () => {
  const crop = createConsultationPhotoCrop({
    sourceWidth: 1600,
    sourceHeight: 1200,
    faceBox: { x: 0.62, y: 0.18, width: 0.2, height: 0.35 },
  });
  assert.ok(Math.abs((crop.outputWidth / crop.outputHeight) - (4 / 5)) < 0.01);
  assert.ok(crop.x >= 0 && crop.x + crop.width <= 1);
  assert.ok(crop.y >= 0 && crop.y + crop.height <= 1);
  assert.equal(isConsultationPhotoCrop(crop), true);
});

test("clamps user pan adjustments and rejects invalid transforms", () => {
  const crop = createConsultationPhotoCrop({ sourceWidth: 900, sourceHeight: 1600 });
  const moved = moveConsultationPhotoCrop(crop, { x: 9, y: -2 });
  assert.equal(moved.x, 0);
  assert.equal(moved.y, 0);
  assert.equal(isConsultationPhotoCrop({ ...crop, width: 2 }), false);
});

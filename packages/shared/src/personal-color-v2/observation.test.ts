import assert from "node:assert/strict";
import test from "node:test";
import { deltaE76V2, rgbToLabD65V2, robustLabStatisticsV2 } from "./color-science.ts";
import { projectNormalizedPointV2 } from "./observation.ts";

test("D65 Lab conversion preserves standard white and black anchors", () => {
  const white = rgbToLabD65V2(255, 255, 255);
  const black = rgbToLabD65V2(0, 0, 0);
  assert.ok(Math.abs(white.l - 100) < 0.001);
  assert.ok(Math.abs(white.a) < 0.01);
  assert.ok(Math.abs(white.b) < 0.01);
  assert.equal(black.l, 0);
});

test("robust statistics resist a single highlight outlier", () => {
  const values = Array.from({ length: 9 }, () => ({ l: 62, a: 12, b: 18 })).concat([{ l: 100, a: 0, b: 0 }]);
  const statistics = robustLabStatisticsV2(values);
  assert.deepEqual(statistics.median, { l: 62, a: 12, b: 18 });
  assert.equal(statistics.mad.l, 0);
  assert.ok(deltaE76V2(statistics.median, { l: 62, a: 12, b: 18 }) < 0.001);
});

test("Web and Expo share one normalized coordinate projection", () => {
  const fixture = { x: 0.25, y: 0.75 };
  assert.deepEqual(projectNormalizedPointV2(fixture, 1080, 1440), { x: 270, y: 1080 });
});

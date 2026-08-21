import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createProviderEditMask, measureHairMaskGeometry, measureHairOnlyQuality, renderHairAlphaMask } from "./hair-mask-image.ts";

const dataUrl = (buffer: Buffer, mime = "image/png") => `data:${mime};base64,${buffer.toString("base64")}`;

test("confirmed-preview hair mask keeps live alpha and inverts only for provider edits", async () => {
  const mask = await renderHairAlphaMask(20, 20, [[{ x: .25, y: .25 }, { x: .5, y: .2 }, { x: .75, y: .25 }, { x: .8, y: .5 }, { x: .7, y: .75 }, { x: .3, y: .75 }, { x: .2, y: .5 }]]);
  const raw = await sharp(mask).ensureAlpha().raw().toBuffer();
  assert.equal(raw[3], 0);
  assert.ok(raw[(10 * 20 + 10) * 4 + 3] > 200);
  const provider = Buffer.from((await createProviderEditMask(dataUrl(mask))).split(",")[1], "base64");
  const providerRaw = await sharp(provider).ensureAlpha().raw().toBuffer();
  assert.equal(providerRaw[3], 255);
  assert.ok(providerRaw[(10 * 20 + 10) * 4 + 3] < 55);
});

test("AI hair matte cuts face and skin gaps out of the included silhouette", async () => {
  const outer = [{ x: .1, y: .1 }, { x: .5, y: .05 }, { x: .9, y: .1 }, { x: .95, y: .5 }, { x: .9, y: .9 }, { x: .1, y: .9 }, { x: .05, y: .5 }];
  const face = [{ x: .3, y: .3 }, { x: .5, y: .25 }, { x: .7, y: .3 }, { x: .75, y: .55 }, { x: .65, y: .75 }, { x: .35, y: .75 }, { x: .25, y: .55 }];
  const mask = await renderHairAlphaMask(100, 100, { includePolygons: [outer], excludePolygons: [face] });
  const raw = await sharp(mask).ensureAlpha().raw().toBuffer();
  assert.ok(raw[(15 * 100 + 50) * 4 + 3] > 200);
  assert.ok(raw[(50 * 100 + 50) * 4 + 3] < 15);
  const quality = await measureHairMaskGeometry(mask);
  assert.equal(quality.passed, true);
  assert.ok(quality.coverage > .1 && quality.coverage < .65);
});

test("hair-only quality gate accepts pigment change and rejects background drift", async () => {
  const source = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#808080" } }).png().toBuffer();
  const mask = await renderHairAlphaMask(20, 20, [[{ x: .25, y: .25 }, { x: .5, y: .2 }, { x: .75, y: .25 }, { x: .8, y: .5 }, { x: .7, y: .75 }, { x: .3, y: .75 }, { x: .2, y: .5 }]]);
  const hairChange = await sharp(source).composite([{ input: Buffer.from(`<svg width="20" height="20"><rect x="5" y="5" width="10" height="10" fill="#5A1F2A"/></svg>`) }]).png().toBuffer();
  const backgroundDrift = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#FFFFFF" } }).png().toBuffer();
  const accepted = await measureHairOnlyQuality(dataUrl(source), dataUrl(hairChange), dataUrl(mask));
  const rejected = await measureHairOnlyQuality(dataUrl(source), dataUrl(backgroundDrift), dataUrl(mask));
  assert.equal(accepted.passed, true);
  assert.equal(rejected.passed, false);
  assert.ok(rejected.outsideMaskDrift > accepted.outsideMaskDrift);
});

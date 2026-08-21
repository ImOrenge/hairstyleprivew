import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { measureReferenceRecolorQuality } from "./color-preview-quality.ts";

const dataUrl = (buffer: Buffer) => `data:image/png;base64,${buffer.toString("base64")}`;

test("maskless reference quality accepts visible recolor and rejects no-op or structural rewrite", async () => {
  const source = await sharp({ create: { width: 100, height: 120, channels: 3, background: "#4D3426" } }).png().toBuffer();
  const recolor = await sharp({ create: { width: 100, height: 120, channels: 3, background: "#6B4E3D" } }).png().toBuffer();
  const wrongAspect = await sharp({ create: { width: 180, height: 100, channels: 3, background: "#FFFFFF" } }).png().toBuffer();
  assert.equal((await measureReferenceRecolorQuality(dataUrl(source), dataUrl(recolor))).passed, true);
  assert.equal((await measureReferenceRecolorQuality(dataUrl(source), dataUrl(source))).passed, false);
  assert.equal((await measureReferenceRecolorQuality(dataUrl(source), dataUrl(wrongAspect))).passed, false);
});

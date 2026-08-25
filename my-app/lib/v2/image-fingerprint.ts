import "server-only";

import { createHash } from "node:crypto";
import { loadSharp } from "../sharp-loader.ts";

function decodeImageDataUrl(value: string) {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("Generated image must be a base64 data URL");
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length) throw new Error("Generated image is empty");
  return buffer;
}

export async function createOutputFingerprintV2(imageDataUrl: string) {
  const sharp = await loadSharp();
  const buffer = decodeImageDataUrl(imageDataUrl);
  const image = sharp(buffer, { limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Generated image dimensions are unavailable");
  const pixels = await image
    .extract({ left: 0, top: 0, width: metadata.width, height: Math.max(1, Math.round(metadata.height * 0.75)) })
    .resize(17, 16, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  let perceptualHash = BigInt(0);
  for (let row = 0; row < 16; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      const current = pixels[row * 17 + column];
      const next = pixels[row * 17 + column + 1];
      perceptualHash = (perceptualHash << BigInt(1)) | (current > next ? BigInt(1) : BigInt(0));
    }
  }
  return `sha256:${createHash("sha256").update(buffer).digest("hex")};dhash:${perceptualHash.toString(16).padStart(64, "0")}`;
}

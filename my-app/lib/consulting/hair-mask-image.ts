import sharp from "sharp";

function dataUrlBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error("INVALID_IMAGE_DATA_URL");
  return Buffer.from(match[1], "base64");
}

interface HairMaskGeometry {
  includePolygons: Array<Array<{ x: number; y: number }>>;
  excludePolygons?: Array<Array<{ x: number; y: number }>>;
}

function polygonPath(width: number, height: number, polygon: Array<{ x: number; y: number }>) {
  return polygon.map((point, index) => `${index ? "L" : "M"}${Math.round(point.x * width)} ${Math.round(point.y * height)}`).join(" ") + " Z";
}

export async function renderHairAlphaMask(width: number, height: number, geometry: HairMaskGeometry | HairMaskGeometry["includePolygons"]) {
  const includePolygons = Array.isArray(geometry) ? geometry : geometry.includePolygons;
  const excludePolygons = Array.isArray(geometry) ? [] : geometry.excludePolygons || [];
  const path = [...includePolygons, ...excludePolygons].map((polygon) => polygonPath(width, height, polygon)).join(" ");
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="white" fill-rule="evenodd"/></svg>`;
  return sharp(Buffer.from(svg)).blur(0.8).png().toBuffer();
}

export async function measureHairMaskGeometry(mask: Buffer) {
  const { data, info } = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let weightedHairPixels = 0;
  let confidentHairPixels = 0;
  let confidentHairSum = 0;
  let ambiguousPixels = 0;
  for (let offset = 3; offset < data.length; offset += info.channels) {
    const alpha = data[offset] / 255;
    weightedHairPixels += alpha;
    if (alpha >= .5) { confidentHairPixels += 1; confidentHairSum += alpha; }
    if (alpha > .15 && alpha < .85) ambiguousPixels += 1;
  }
  const coverage = weightedHairPixels / Math.max(1, info.width * info.height);
  const confidence = confidentHairSum / Math.max(1, confidentHairPixels);
  const boundaryScore = Math.max(0, Math.min(1, 1 - ambiguousPixels / Math.max(1, confidentHairPixels) * .75));
  return { coverage, confidence, boundaryScore, passed: coverage >= 0.03 && coverage <= 0.65 && confidentHairPixels > 0, policy: "dedicated-ai-hair-matte-v3" };
}

export async function normalizeClientHairMask(maskDataUrl: string, width: number, height: number) {
  if (maskDataUrl.length > 4_000_000) throw new Error("HAIR_MASK_PAYLOAD_TOO_LARGE");
  const input = dataUrlBuffer(maskDataUrl);
  const metadata = await sharp(input).metadata();
  if (metadata.format !== "png" || metadata.width !== width || metadata.height !== height || !metadata.hasAlpha) throw new Error("HAIR_MASK_DIMENSIONS_INVALID");
  return sharp(input).ensureAlpha().png().toBuffer();
}

export async function createProviderEditMask(maskDataUrl: string) {
  const { data, info } = await sharp(dataUrlBuffer(maskDataUrl)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const hair = data[offset + 3];
    data[offset] = 255; data[offset + 1] = 255; data[offset + 2] = 255; data[offset + 3] = 255 - hair;
  }
  const output = await sharp(data, { raw: info }).png().toBuffer();
  return `data:image/png;base64,${output.toString("base64")}`;
}

export async function measureHairOnlyQuality(sourceDataUrl: string, outputUrl: string, maskDataUrl: string) {
  const source = dataUrlBuffer(sourceDataUrl);
  const output = outputUrl.startsWith("data:") ? dataUrlBuffer(outputUrl) : Buffer.from(await (await fetch(outputUrl)).arrayBuffer());
  const metadata = await sharp(source).metadata();
  const width = metadata.width || 1024; const height = metadata.height || 1280;
  const [sourceRaw, outputRaw, maskRaw] = await Promise.all([
    sharp(source).resize(width, height).removeAlpha().raw().toBuffer(),
    sharp(output).resize(width, height).removeAlpha().raw().toBuffer(),
    sharp(dataUrlBuffer(maskDataUrl)).resize(width, height).flatten({ background: "#000000" }).grayscale().raw().toBuffer(),
  ]);
  let outside = 0; let outsideWeight = 0; let inside = 0; let insideWeight = 0;
  for (let pixel = 0; pixel < maskRaw.length; pixel += 1) {
    const hairWeight = maskRaw[pixel] / 255; const backgroundWeight = 1 - hairWeight;
    const offset = pixel * 3;
    const difference = (Math.abs(sourceRaw[offset] - outputRaw[offset]) + Math.abs(sourceRaw[offset + 1] - outputRaw[offset + 1]) + Math.abs(sourceRaw[offset + 2] - outputRaw[offset + 2])) / (3 * 255);
    outside += difference * backgroundWeight; outsideWeight += backgroundWeight;
    inside += difference * hairWeight; insideWeight += hairWeight;
  }
  const outsideMaskDrift = outside / Math.max(1, outsideWeight);
  const insideMaskChange = inside / Math.max(1, insideWeight);
  return { passed: outsideMaskDrift <= 0.09 && insideMaskChange >= 0.015, outsideMaskDrift, insideMaskChange, width, height, policy: "hair-only-pixel-drift-v1" };
}

import sharp from "sharp";

function dataUrlBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error("INVALID_IMAGE_DATA_URL");
  return Buffer.from(match[1], "base64");
}

async function imageBuffer(value: string) {
  if (value.startsWith("data:")) return dataUrlBuffer(value);
  const response = await fetch(value);
  if (!response.ok) throw new Error("COLOR_PREVIEW_OUTPUT_UNAVAILABLE");
  return Buffer.from(await response.arrayBuffer());
}

export async function measureReferenceRecolorQuality(sourceDataUrl: string, outputUrl: string) {
  const source = dataUrlBuffer(sourceDataUrl);
  const output = await imageBuffer(outputUrl);
  const [sourceMetadata, outputMetadata] = await Promise.all([sharp(source).metadata(), sharp(output).metadata()]);
  const sourceRatio = (sourceMetadata.width || 1) / (sourceMetadata.height || 1);
  const outputRatio = (outputMetadata.width || 1) / (outputMetadata.height || 1);
  const aspectRatioDelta = Math.abs(sourceRatio - outputRatio) / Math.max(sourceRatio, 0.001);
  const [sourceRaw, outputRaw] = await Promise.all([
    sharp(source).resize(96, 120, { fit: "fill" }).removeAlpha().raw().toBuffer(),
    sharp(output).resize(96, 120, { fit: "fill" }).removeAlpha().raw().toBuffer(),
  ]);
  let difference = 0;
  for (let index = 0; index < sourceRaw.length; index += 1) difference += Math.abs(sourceRaw[index] - outputRaw[index]);
  const globalChange = difference / Math.max(1, sourceRaw.length * 255);
  return {
    passed: aspectRatioDelta <= 0.03 && globalChange >= 0.008 && globalChange <= 0.42,
    aspectRatioDelta,
    globalChange,
    width: outputMetadata.width || null,
    height: outputMetadata.height || null,
    policy: "maskless-reference-drift-v1",
  };
}

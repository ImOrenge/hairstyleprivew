import sharp from "sharp";

/**
 * Applies a watermark to the center of an image.
 * @param base64DataUrl The original image as a base64 data URL.
 * @returns The watermarked image as a base64 data URL.
 */
export async function applyWatermark(base64DataUrl: string): Promise<string> {
    const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        throw new Error("Invalid base64 data URL");
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const inputBuffer = Buffer.from(base64Data, "base64");

    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    const width = metadata.width || 1024;
    const height = metadata.height || 1024;

    // Create an SVG with the watermark text
    const fontSize = 40;
    const text = "hairfit beauty";

    // Simple SVG for the watermark
    const svg = `
    <svg width="${width}" height="${height}">
      <style>
        .watermark {
          fill: rgba(255, 255, 255, 0.4);
          font-family: sans-serif;
          font-size: ${fontSize}px;
          font-weight: bold;
          text-anchor: middle;
          dominant-baseline: middle;
        }
        .watermark-outline {
          fill: none;
          stroke: rgba(0, 0, 0, 0.2);
          stroke-width: 1px;
          font-family: sans-serif;
          font-size: ${fontSize}px;
          font-weight: bold;
          text-anchor: middle;
          dominant-baseline: middle;
        }
      </style>
      <text x="50%" y="50%" class="watermark-outline">${text}</text>
      <text x="50%" y="50%" class="watermark">${text}</text>
    </svg>
  `;

    const watermarkedBuffer = await image
        .composite([
            {
                input: Buffer.from(svg),
                top: 0,
                left: 0,
            },
        ])
        .toBuffer();

    return `data:${mimeType};base64,${watermarkedBuffer.toString("base64")}`;
}

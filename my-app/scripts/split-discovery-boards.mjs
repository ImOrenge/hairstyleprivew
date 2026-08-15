import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");

const pages = [
  {
    slug: "ai-hairstyle-simulation",
    source: "public/hero/rolling/model-03-hair.webp",
    board:
      "C:/Users/user/.codex/generated_images/019f657d-4559-7832-a692-46785bc7a40b/exec-0248d1d5-7d6b-4832-9357-6d0164e95c75.png",
  },
  {
    slug: "face-shape-hairstyle",
    source: "public/hero/rolling/model-05-hair.webp",
    board:
      "C:/Users/user/.codex/generated_images/019f657d-4559-7832-a692-46785bc7a40b/exec-a138527a-325e-4310-9e98-ea95944ccf29.png",
  },
  {
    slug: "men-hairstyle",
    source: "public/hero/demo/male-original.webp",
    board:
      "C:/Users/user/.codex/generated_images/019f657d-4559-7832-a692-46785bc7a40b/exec-a7161e3d-3b7c-4600-a416-1657ea064ba7.png",
  },
  {
    slug: "women-hairstyle",
    source: "public/hero/rolling/model-07-hair.webp",
    board:
      "C:/Users/user/.codex/generated_images/019f657d-4559-7832-a692-46785bc7a40b/exec-c5612ad7-2564-438e-9303-bb88dc2adbfe.png",
  },
  {
    slug: "bangs-hairstyle",
    source: "public/hero/rolling/model-09-hair.webp",
    board:
      "C:/Users/user/.codex/generated_images/019f657d-4559-7832-a692-46785bc7a40b/exec-15f63c3e-c9ed-4d14-951e-32b8c4d34c0a.png",
  },
  {
    slug: "bob-hairstyle",
    source: "public/hero/rolling/model-11-hair.webp",
    board:
      "C:/Users/user/.codex/generated_images/019f657d-4559-7832-a692-46785bc7a40b/exec-34aa2c20-6364-45fe-9ee8-b5991b6063b7.png",
  },
  {
    slug: "salon-consultation",
    source: "public/hero/rolling/model-13-hair.webp",
    board:
      "C:/Users/user/.codex/generated_images/019f657d-4559-7832-a692-46785bc7a40b/exec-b622bd5e-ba96-4e87-b74f-dae5799ad231.png",
  },
];

for (const page of pages) {
  const outputDirectory = path.join(
    projectRoot,
    "public/discovery/models",
    page.slug,
  );
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.copyFile(path.join(projectRoot, page.source), path.join(outputDirectory, "source.webp"));

  const metadata = await sharp(page.board).metadata();
  if (!metadata.width || !metadata.height || metadata.width !== metadata.height) {
    throw new Error(`${page.slug}: expected a square board`);
  }

  const x = [0, Math.floor(metadata.width / 3), Math.floor((metadata.width * 2) / 3), metadata.width];
  const y = [0, Math.floor(metadata.height / 3), Math.floor((metadata.height * 2) / 3), metadata.height];

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const index = row * 3 + column + 1;
      await sharp(page.board)
        .extract({
          left: x[column],
          top: y[row],
          width: x[column + 1] - x[column],
          height: y[row + 1] - y[row],
        })
        .webp({ quality: 86 })
        .toFile(path.join(outputDirectory, `preview-${String(index).padStart(2, "0")}.webp`));
    }
  }
}

console.log(`Prepared ${pages.length} page-specific model sets.`);

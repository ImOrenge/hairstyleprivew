import "client-only";

const MEDIAPIPE_VERSION = "1.0.1";
export const HAIR_SEGMENTATION_MODEL_VERSION = "mediapipe-hair-segmenter-float32-v1";
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_PATH = "/images/consulting/models/hair-segmenter-float32-v1.tflite";

let segmenterPromise: Promise<import("@mediapipe/tasks-vision").ImageSegmenter> | null = null;

async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = import("@mediapipe/tasks-vision").then(async ({ FilesetResolver, ImageSegmenter }) => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
        runningMode: "IMAGE",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    }).catch((error) => {
      segmenterPromise = null;
      throw error;
    });
  }
  return segmenterPromise;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("HAIR_SEGMENTATION_IMAGE_LOAD_FAILED"));
    image.src = url;
  });
}

function normalizedAlpha(probability: number) {
  const value = Math.max(0, Math.min(1, (probability - 0.18) / 0.64));
  return value * value * (3 - 2 * value);
}

export interface ClientHairMaskResult {
  maskDataUrl: string;
  modelVersion: typeof HAIR_SEGMENTATION_MODEL_VERSION;
  width: number;
  height: number;
  confidence: number;
}

export async function segmentHairOnDevice(imageUrl: string): Promise<ClientHairMaskResult> {
  const [image, segmenter] = await Promise.all([loadImage(imageUrl), getSegmenter()]);
  const result = segmenter.segment(image);
  try {
    const labels = segmenter.getLabels().map((label) => label.toLowerCase());
    const hairIndex = Math.max(0, labels.findIndex((label) => label.includes("hair")));
    const confidenceMask = result.confidenceMasks?.[hairIndex] || result.confidenceMasks?.at(-1);
    if (!confidenceMask) throw new Error("HAIR_SEGMENTATION_MASK_MISSING");
    const values = confidenceMask.getAsFloat32Array();
    const pixels = new Uint8ClampedArray(confidenceMask.width * confidenceMask.height * 4);
    let confidentSum = 0;
    let confidentCount = 0;
    for (let index = 0; index < values.length; index += 1) {
      const probability = Math.max(0, Math.min(1, values[index]));
      const alpha = Math.round(normalizedAlpha(probability) * 255);
      const offset = index * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = alpha;
      if (probability >= 0.5) { confidentSum += probability; confidentCount += 1; }
    }
    const inferenceCanvas = document.createElement("canvas");
    inferenceCanvas.width = confidenceMask.width;
    inferenceCanvas.height = confidenceMask.height;
    const inferenceContext = inferenceCanvas.getContext("2d");
    if (!inferenceContext) throw new Error("HAIR_SEGMENTATION_CANVAS_UNAVAILABLE");
    inferenceContext.putImageData(new ImageData(pixels, confidenceMask.width, confidenceMask.height), 0, 0);
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = image.naturalWidth;
    outputCanvas.height = image.naturalHeight;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) throw new Error("HAIR_SEGMENTATION_CANVAS_UNAVAILABLE");
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.drawImage(inferenceCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
    return {
      maskDataUrl: outputCanvas.toDataURL("image/png"),
      modelVersion: HAIR_SEGMENTATION_MODEL_VERSION,
      width: outputCanvas.width,
      height: outputCanvas.height,
      confidence: confidentSum / Math.max(1, confidentCount),
    };
  } finally {
    result.close();
  }
}

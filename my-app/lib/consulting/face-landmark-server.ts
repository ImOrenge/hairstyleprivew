import "server-only";

import type { FaceLandmarksDetector } from "@tensorflow-models/face-landmarks-detection";
import type * as TensorFlow from "@tensorflow/tfjs";
import type { NormalizedPointV2, PhotoQualityV2 } from "@hairfit/shared/v2";
import { buildFaceGeometryV2 } from "@hairfit/shared/v2";
import sharp from "sharp";

const LANDMARK_MODEL = {
  provider: "tensorflow-js",
  name: "MediaPipeFaceMesh",
  version: "face-landmarks-detection@1.0.6/tfjs@4.22.0",
} as const;
const MAX_INFERENCE_DIMENSION = 512;

interface LandmarkRuntime {
  detector: FaceLandmarksDetector;
  tf: typeof TensorFlow;
}

let runtimePromise: Promise<LandmarkRuntime> | null = null;
let inferenceTail: Promise<void> = Promise.resolve();

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function imageBufferFromDataUrl(dataUrl: string) {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) throw new Error("FACE_LANDMARK_IMAGE_DATA_INVALID");
  return Buffer.from(match[1], "base64");
}

async function createRuntime(): Promise<LandmarkRuntime> {
  const [faceLandmarksDetection, tf] = await Promise.all([
    import("@tensorflow-models/face-landmarks-detection"),
    import("@tensorflow/tfjs"),
  ]);
  if (tf.getBackend() !== "cpu") await tf.setBackend("cpu");
  await tf.ready();
  const detector = await faceLandmarksDetection.createDetector(
    faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
    { runtime: "tfjs", refineLandmarks: true, maxFaces: 2 },
  );
  return { detector, tf };
}

function getRuntime() {
  runtimePromise ??= createRuntime().catch((error) => {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

async function serializedInference<T>(operation: () => Promise<T>) {
  const previous = inferenceTail;
  let release: () => void = () => {};
  inferenceTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function geometryConfidence(quality: PhotoQualityV2) {
  return clamp((quality.overall + quality.frontal + quality.occlusion) / 3, 0.5, 0.96);
}

export async function extractFaceLandmarkEvidence(
  imageDataUrl: string,
  quality: PhotoQualityV2,
) {
  const decoded = await sharp(imageBufferFromDataUrl(imageDataUrl))
    .rotate()
    .resize({
      width: MAX_INFERENCE_DIMENSION,
      height: MAX_INFERENCE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (decoded.info.channels !== 3 || !decoded.info.width || !decoded.info.height) {
    throw new Error("FACE_LANDMARK_IMAGE_CHANNELS_INVALID");
  }

  return serializedInference(async () => {
    const { detector, tf } = await getRuntime();
    const tensor = tf.tensor3d(
      new Uint8Array(decoded.data),
      [decoded.info.height, decoded.info.width, decoded.info.channels],
      "int32",
    );
    try {
      const faces = await detector.estimateFaces(tensor, { flipHorizontal: false, staticImageMode: true });
      if (faces.length !== 1) {
        return {
          faceCount: faces.length,
          model: LANDMARK_MODEL,
          sourceSize: { width: decoded.info.width, height: decoded.info.height },
          geometry: null,
        } as const;
      }
      const depthScale = Math.max(decoded.info.width, decoded.info.height);
      const normalizedPoints: NormalizedPointV2[] = faces[0].keypoints.map((point) => ({
        x: clamp(point.x / decoded.info.width),
        y: clamp(point.y / decoded.info.height),
        ...(Number.isFinite(point.z) ? { z: point.z! / depthScale } : {}),
      }));
      const geometry = buildFaceGeometryV2(
        normalizedPoints,
        geometryConfidence(quality),
        quality.hairlineVisibility,
      );
      return {
        faceCount: 1,
        model: LANDMARK_MODEL,
        sourceSize: { width: decoded.info.width, height: decoded.info.height },
        geometry,
      } as const;
    } finally {
      tensor.dispose();
    }
  });
}

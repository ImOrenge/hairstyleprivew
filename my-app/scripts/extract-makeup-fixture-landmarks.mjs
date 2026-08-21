import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-cpu";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(scriptDirectory, "../public/images/consulting/models/hairfit-semi-real-model-v1.png");
const source = await readFile(sourcePath);
const decoded = await sharp(source).resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
await tf.setBackend("cpu");
await tf.ready();
const detector = await faceLandmarksDetection.createDetector(faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh, { runtime: "tfjs", refineLandmarks: true, maxFaces: 1 });
const tensor = tf.tensor3d(new Uint8Array(decoded.data), [decoded.info.height, decoded.info.width, decoded.info.channels], "int32");
try {
  const faces = await detector.estimateFaces(tensor, { flipHorizontal: false, staticImageMode: true });
  if (faces.length !== 1) throw new Error(`Expected one face, received ${faces.length}`);
  const points = faces[0].keypoints.map((point) => ({ x: Number((point.x / decoded.info.width).toFixed(5)), y: Number((point.y / decoded.info.height).toFixed(5)) }));
  process.stdout.write(JSON.stringify(points));
} finally {
  tensor.dispose();
  detector.dispose();
}

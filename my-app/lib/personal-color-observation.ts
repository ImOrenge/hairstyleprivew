import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  assertFaceObservationBundleV2,
  deltaE76V2,
  rgbToLabD65V2,
  robustLabStatisticsV2,
  type FaceGeometryV2,
  type FaceObservationBundleV2,
  type FaceObservationPolygonV2,
  type FaceObservationRegionIdV2,
  type FaceObservationRegionSampleV2,
  type FaceSemanticMaskKindV2,
  type NormalizedPointV2,
  type PhotoQualityV2,
} from "@hairfit/shared/v2";
import sharp from "sharp";
import { getSupabaseAdminClient } from "./supabase";

const MAX_DIMENSION = 512;
const MODEL_MANIFEST: FaceObservationBundleV2["modelManifest"] = [
  { component: "landmarks", provider: "tensorflow-js", name: "MediaPipeFaceMesh", version: "face-landmarks-detection@1.0.6" },
  { component: "semantic-mask", provider: "hairfit", name: "landmark-semantic-mask-adapter", version: "2.0.0" },
  { component: "color-management", provider: "hairfit", name: "srgb-lab-d65-pipeline", version: "2.0.0" },
];

function hash(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function imageBufferFromDataUrl(dataUrl: string) {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) throw new Error("FACE_OBSERVATION_IMAGE_DATA_INVALID");
  return Buffer.from(match[1], "base64");
}

function maskKind(id: string): FaceSemanticMaskKindV2 {
  if (id.includes("brow")) return "brow";
  if (id.includes("eye")) return "eye";
  if (id.includes("lip")) return "lip";
  if (id.includes("nostril")) return "nostril";
  if (id.includes("facial_hair")) return "facial_hair";
  return "skin";
}

function regionId(id: string): FaceObservationRegionIdV2 | null {
  const normalized = id.replace(/^observation_/, "").replace(/^skin_/, "");
  if (normalized === "forehead" || normalized === "left_cheek_upper" || normalized === "left_cheek_lower"
    || normalized === "right_cheek_upper" || normalized === "right_cheek_lower" || normalized === "jaw"
    || normalized === "neck") return normalized;
  if (normalized === "left_cheek") return "left_cheek_upper";
  if (normalized === "right_cheek") return "right_cheek_upper";
  if (normalized === "chin") return "jaw";
  return null;
}

function expandedPolygon(points: readonly NormalizedPointV2[], factor: number) {
  const center = points.reduce((result, point) => ({ x: result.x + point.x, y: result.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length;
  center.y /= points.length;
  return points.map((point) => ({
    x: clamp(center.x + (point.x - center.x) * factor),
    y: clamp(center.y + (point.y - center.y) * factor),
    confidence: point.confidence,
  }));
}

function semanticMasks(geometry: FaceGeometryV2): FaceObservationPolygonV2[] {
  const masks: FaceObservationPolygonV2[] = [];
  for (const region of geometry.skinSampleRegions) {
    if (!regionId(region.id)) continue;
    masks.push({ ...region, label: region.label || region.id, kind: "skin", operation: "include" });
  }
  for (const excluded of geometry.excludedRegions) {
    const kind = maskKind(excluded.id);
    masks.push({ ...excluded, label: excluded.label || excluded.id, kind, operation: "exclude" });
    if (kind === "eye") {
      masks.push({
        ...excluded,
        id: `${excluded.id}_periorbital`,
        label: `${excluded.label || excluded.id} periorbital exclusion`,
        kind: "periorbital",
        operation: "exclude",
        source: "inferred",
        confidence: clamp(excluded.confidence * 0.82),
        points: expandedPolygon(excluded.points, 1.32),
      });
    }
  }
  const hairline = geometry.hairline?.lines[0];
  if (hairline?.points.length) {
    masks.push({
      id: "excluded_hairline_band",
      label: "Hairline exclusion band",
      kind: "hair",
      operation: "exclude",
      source: "inferred",
      confidence: hairline.confidence,
      points: [...hairline.points, ...[...hairline.points].reverse().map((point) => ({ ...point, y: clamp(point.y - 0.08) }))],
    });
  }
  return masks;
}

function pointInPolygon(x: number, y: number, polygon: readonly NormalizedPointV2[]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    const intersects = a.y > y !== b.y > y
      && x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function estimateWhiteBalanceGains(data: Buffer, channels: number): [number, number, number] {
  let red = 0; let green = 0; let blue = 0; let count = 0;
  for (let offset = 0; offset < data.length; offset += channels * 4) {
    red += data[offset]; green += data[offset + 1]; blue += data[offset + 2]; count += 1;
  }
  const average = (red + green + blue) / Math.max(1, count * 3);
  const gain = (sum: number) => clamp(average / Math.max(1, sum / Math.max(1, count)), 0.8, 1.2);
  return [gain(red), gain(green), gain(blue)];
}

function rounded(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function sampleRegions(input: {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
  masks: FaceObservationPolygonV2[];
  whiteBalanceGains: [number, number, number];
}) {
  const includes = input.masks.filter((mask) => mask.operation === "include");
  const excludes = input.masks.filter((mask) => mask.operation === "exclude");
  const samples: FaceObservationRegionSampleV2[] = [];
  for (const region of includes) {
    const id = regionId(region.id);
    if (!id || samples.some((sample) => sample.regionId === id)) continue;
    const labValues: ReturnType<typeof rgbToLabD65V2>[] = [];
    const excludedByKind: Partial<Record<FaceSemanticMaskKindV2, number>> = {};
    let sampledPixelCount = 0;
    for (let y = 0; y < input.height; y += 1) {
      for (let x = 0; x < input.width; x += 1) {
        const normalizedX = (x + 0.5) / input.width;
        const normalizedY = (y + 0.5) / input.height;
        if (!pointInPolygon(normalizedX, normalizedY, region.points)) continue;
        sampledPixelCount += 1;
        const semanticExclusion = excludes.find((mask) => pointInPolygon(normalizedX, normalizedY, mask.points));
        if (semanticExclusion) {
          excludedByKind[semanticExclusion.kind] = (excludedByKind[semanticExclusion.kind] ?? 0) + 1;
          continue;
        }
        const offset = (y * input.width + x) * input.channels;
        const lab = rgbToLabD65V2(
          input.data[offset] * input.whiteBalanceGains[0],
          input.data[offset + 1] * input.whiteBalanceGains[1],
          input.data[offset + 2] * input.whiteBalanceGains[2],
        );
        const chroma = Math.hypot(lab.a, lab.b);
        const pixelKind: FaceSemanticMaskKindV2 | null = lab.l > 94
          ? "highlight"
          : lab.l < 18 ? "shadow" : lab.l > 88 && chroma < 6 ? "reflection" : null;
        if (pixelKind) {
          excludedByKind[pixelKind] = (excludedByKind[pixelKind] ?? 0) + 1;
          continue;
        }
        labValues.push(lab);
      }
    }
    const robust = robustLabStatisticsV2(labValues);
    const validPixelRatio = sampledPixelCount ? labValues.length / sampledPixelCount : 0;
    samples.push({
      regionId: id,
      polygon: region.points,
      statistics: {
        ...robust,
        sampledPixelCount,
        validPixelCount: labValues.length,
        validPixelRatio: rounded(validPixelRatio),
      },
      excludedByKind,
      warnings: validPixelRatio < 0.35 ? ["LOW_VALID_PIXEL_RATIO"] : [],
    });
  }
  return samples;
}

function buildQuality(samples: FaceObservationRegionSampleV2[], photoQuality: PhotoQualityV2) {
  const valid = samples.filter((sample) => sample.statistics.validPixelCount > 0);
  const totalPixels = samples.reduce((sum, sample) => sum + sample.statistics.sampledPixelCount, 0);
  const validPixels = samples.reduce((sum, sample) => sum + sample.statistics.validPixelCount, 0);
  let maxDeltaE: number | null = null;
  for (let first = 0; first < valid.length; first += 1) {
    for (let second = first + 1; second < valid.length; second += 1) {
      const delta = deltaE76V2(valid[first].statistics.median, valid[second].statistics.median);
      maxDeltaE = maxDeltaE === null ? delta : Math.max(maxDeltaE, delta);
    }
  }
  const warnings: FaceObservationBundleV2["quality"]["warnings"] = [];
  if (maxDeltaE !== null && maxDeltaE > 8) warnings.push({
    code: "CROSS_REGION_COLOR_INCONSISTENCY",
    message: "얼굴 영역 사이의 색 차이가 커서 조명 또는 부분 색조 영향을 확인해야 합니다.",
    severity: "warning",
    regionIds: valid.map((sample) => sample.regionId),
    measuredDeltaE: rounded(maxDeltaE),
  });
  const validSkinPixelRatio = totalPixels ? validPixels / totalPixels : 0;
  if (validSkinPixelRatio < 0.35) warnings.push({
    code: "INSUFFICIENT_VALID_SKIN_PIXELS",
    message: "제외 조건을 통과한 피부 픽셀이 부족합니다.",
    severity: validSkinPixelRatio < 0.15 ? "blocking" : "warning",
    regionIds: samples.map((sample) => sample.regionId),
    measuredDeltaE: null,
  });
  if (photoQuality.skinColorReliability !== undefined && photoQuality.skinColorReliability < 0.55) warnings.push({
    code: "SOURCE_COLOR_RELIABILITY_LOW",
    message: "원본 사진의 색 신뢰도가 낮아 결과를 보조 근거로만 사용합니다.",
    severity: "warning",
    regionIds: [],
    measuredDeltaE: null,
  });
  return {
    status: warnings.some((warning) => warning.severity === "blocking") ? "unusable" as const
      : warnings.length ? "warning" as const : "usable" as const,
    validSkinPixelRatio: rounded(validSkinPixelRatio),
    crossRegionMaxDeltaE: maxDeltaE === null ? null : rounded(maxDeltaE),
    warnings,
  };
}

export async function createOrReuseFaceObservationBundleV2(input: {
  userId: string;
  consultationId: string;
  sourceAnalysisEvidenceId: string;
  sourceAssetId: string;
  sourceCaptureAssetId: string | null;
  sourceFingerprint: string;
  imageDataUrl: string;
  normalizedLandmarks: NormalizedPointV2[];
  geometry: FaceGeometryV2;
  photoQuality: PhotoQualityV2;
}) {
  const modelHash = hash(MODEL_MANIFEST);
  const inputHash = hash({ fingerprint: input.sourceFingerprint, landmarks: input.normalizedLandmarks });
  const db = getSupabaseAdminClient();
  const existing = await db.from("face_observation_bundles")
    .select("id")
    .eq("consultation_id", input.consultationId)
    .eq("user_id", input.userId)
    .eq("input_hash", inputHash)
    .eq("model_hash", modelHash)
    .eq("state", "ready")
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { bundle: await getFaceObservationBundleV2(input.userId, input.consultationId), reused: true };

  const decoded = await sharp(imageBufferFromDataUrl(input.imageDataUrl)).rotate().resize({
    width: MAX_DIMENSION,
    height: MAX_DIMENSION,
    fit: "inside",
    withoutEnlargement: true,
  }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.channels !== 3) throw new Error("FACE_OBSERVATION_IMAGE_CHANNELS_INVALID");
  const masks = semanticMasks(input.geometry);
  const whiteBalanceGains = estimateWhiteBalanceGains(decoded.data, decoded.info.channels);
  const regionSamples = sampleRegions({
    data: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
    channels: decoded.info.channels,
    masks,
    whiteBalanceGains,
  });
  const now = new Date().toISOString();
  const bundle: FaceObservationBundleV2 = {
    schemaVersion: "face-observation-bundle-v2",
    id: randomUUID(),
    consultationId: input.consultationId,
    sourceAnalysisEvidenceId: input.sourceAnalysisEvidenceId,
    inputHash,
    modelHash,
    sourceAssets: [{
      assetId: input.sourceAssetId,
      role: input.sourceCaptureAssetId ? "personal_color_capture" : "consultation_photo",
      checksumSha256: input.sourceFingerprint,
      width: decoded.info.width,
      height: decoded.info.height,
    }],
    sourceTransform: {
      rotationDegrees: 0,
      sourceWidth: decoded.info.width,
      sourceHeight: decoded.info.height,
      coordinateSpace: "normalized-upright-source-v1",
    },
    landmarks: input.normalizedLandmarks,
    masks,
    calibration: {
      inputColorSpace: "sRGB",
      workingColorSpace: "linear-srgb",
      referenceWhite: "D65",
      method: "srgb-estimated-white-balance-v1",
      whiteBalanceGains: whiteBalanceGains.map(rounded) as [number, number, number],
    },
    regionSamples,
    quality: buildQuality(regionSamples, input.photoQuality),
    modelManifest: MODEL_MANIFEST,
    correctionRevision: 0,
    createdAt: now,
  };
  assertFaceObservationBundleV2(bundle);

  const enqueued = await db.rpc("enqueue_face_observation_job", {
    p_user_id: input.userId,
    p_consultation_id: input.consultationId,
    p_source_analysis_evidence_id: input.sourceAnalysisEvidenceId,
    p_source_capture_asset_id: input.sourceCaptureAssetId,
    p_request_hash: inputHash,
    p_model_hash: modelHash,
  });
  if (enqueued.error) throw new Error(enqueued.error.message);
  const jobId = (enqueued.data as { jobId?: string } | null)?.jobId;
  const inserted = await db.from("face_observation_bundles").insert({
    id: bundle.id,
    consultation_id: input.consultationId,
    user_id: input.userId,
    source_analysis_evidence_id: input.sourceAnalysisEvidenceId,
    source_capture_asset_id: input.sourceCaptureAssetId,
    input_hash: inputHash,
    model_hash: modelHash,
    state: "ready",
    source_assets: bundle.sourceAssets,
    source_transform: bundle.sourceTransform,
    landmarks: bundle.landmarks,
    semantic_masks: bundle.masks,
    calibration: bundle.calibration,
    quality: bundle.quality,
    model_manifest: bundle.modelManifest,
    ready_at: now,
    updated_at: now,
  });
  if (inserted.error) throw new Error(inserted.error.message);
  if (regionSamples.length) {
    const sampleInsert = await db.from("face_observation_region_samples").insert(regionSamples.map((sample) => ({
      bundle_id: bundle.id,
      region_id: sample.regionId,
      polygon: sample.polygon,
      sampled_pixel_count: sample.statistics.sampledPixelCount,
      valid_pixel_count: sample.statistics.validPixelCount,
      lab_statistics: sample.statistics,
      excluded_by_kind: sample.excludedByKind,
      warnings: sample.warnings,
    })));
    if (sampleInsert.error) throw new Error(sampleInsert.error.message);
  }
  if (jobId) {
    const jobUpdate = await db.from("face_observation_jobs").update({ state: "completed", bundle_id: bundle.id, updated_at: now }).eq("id", jobId);
    if (jobUpdate.error) throw new Error(jobUpdate.error.message);
    const outboxUpdate = await db.from("face_observation_outbox").update({ state: "completed", completed_at: now, updated_at: now }).eq("job_id", jobId);
    if (outboxUpdate.error) throw new Error(outboxUpdate.error.message);
  }
  return { bundle, reused: false };
}

export async function getFaceObservationBundleV2(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const result = await db.from("face_observation_bundles")
    .select("id,consultation_id,source_analysis_evidence_id,input_hash,model_hash,source_assets,source_transform,landmarks,semantic_masks,calibration,quality,model_manifest,correction_revision,created_at")
    .eq("consultation_id", consultationId).eq("user_id", userId).eq("state", "ready")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  const row = result.data as unknown as Record<string, unknown>;
  const samplesResult = await db.from("face_observation_region_samples")
    .select("region_id,polygon,lab_statistics,excluded_by_kind,warnings")
    .eq("bundle_id", String(row.id)).order("region_id");
  if (samplesResult.error) throw new Error(samplesResult.error.message);
  const bundle = {
    schemaVersion: "face-observation-bundle-v2",
    id: String(row.id),
    consultationId: String(row.consultation_id),
    sourceAnalysisEvidenceId: String(row.source_analysis_evidence_id),
    inputHash: String(row.input_hash),
    modelHash: String(row.model_hash),
    sourceAssets: row.source_assets,
    sourceTransform: row.source_transform,
    landmarks: row.landmarks,
    masks: row.semantic_masks,
    calibration: row.calibration,
    regionSamples: (samplesResult.data ?? []).map((sample) => ({
      regionId: sample.region_id,
      polygon: sample.polygon,
      statistics: sample.lab_statistics,
      excludedByKind: sample.excluded_by_kind,
      warnings: sample.warnings,
    })),
    quality: row.quality,
    modelManifest: row.model_manifest,
    correctionRevision: Number(row.correction_revision),
    createdAt: String(row.created_at),
  } as unknown as FaceObservationBundleV2;
  assertFaceObservationBundleV2(bundle);
  return bundle;
}

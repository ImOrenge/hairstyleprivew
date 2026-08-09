import type { PhotoQualityV2 } from "../v2/analysis/contract";
import type { PhotoQualityDiagnostic } from "./contract";

export interface NormalizedFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhotoFaceDetectionEvidence {
  status: "detected" | "not_detected" | "unsupported";
  count: number | null;
  box: NormalizedFaceBox | null;
}

export interface PhotoPixelSignals {
  meanLuminance: number;
  luminanceDeviation: number;
  clippedPixelRatio: number;
  horizontalLuminanceDelta: number;
  colorCast: number;
  backgroundSeparation: number;
  sharpness: number;
}

export interface ConsultationPhotoPreflightSignals extends PhotoPixelSignals {
  width: number;
  height: number;
  face: PhotoFaceDetectionEvidence;
}

export interface ConsultationPhotoPreflightAssessment {
  canAnalyze: boolean;
  diagnostics: PhotoQualityDiagnostic[];
  quality: PhotoQualityV2;
}

const LABELS: Record<PhotoQualityDiagnostic["id"], string> = {
  faceVisible: "얼굴 전체 노출",
  frontal: "정면 각도",
  lighting: "균일한 조명",
  resolution: "충분한 해상도",
  hairline: "헤어라인 노출",
  occlusion: "가림 없음",
  color: "색상 왜곡 없음",
  background: "배경 분리",
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function diagnostic(
  id: PhotoQualityDiagnostic["id"],
  score: number,
  passMessage: string,
  warningMessage: string,
): PhotoQualityDiagnostic {
  const pass = score >= 0.7;
  return { id, label: LABELS[id], status: pass ? "pass" : "warning", message: pass ? passMessage : warningMessage };
}

export function createPendingPhotoDiagnostics(message = "사진 사전검사 대기"): PhotoQualityDiagnostic[] {
  return (Object.entries(LABELS) as Array<[PhotoQualityDiagnostic["id"], string]>).map(([id, label]) => ({
    id,
    label,
    status: "pending",
    message,
  }));
}

export function summarizePhotoPixels(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  channels: 3 | 4,
): PhotoPixelSignals {
  const count = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || count <= 0 || pixels.length < count * channels) {
    throw new Error("PHOTO_PIXEL_SAMPLE_INVALID");
  }

  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  let clipped = 0;
  let leftSum = 0;
  let leftCount = 0;
  let rightSum = 0;
  let rightCount = 0;
  let centerSum = 0;
  let centerCount = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let neighborDeltaSum = 0;
  let neighborCount = 0;
  const previousRow = new Float64Array(width);

  for (let y = 0; y < height; y += 1) {
    let previousLuminance: number | null = null;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

      luminanceSum += luminance;
      luminanceSquareSum += luminance * luminance;
      redSum += red;
      greenSum += green;
      blueSum += blue;
      if (luminance <= 0.035 || luminance >= 0.965) clipped += 1;
      if (x < width / 2) {
        leftSum += luminance;
        leftCount += 1;
      } else {
        rightSum += luminance;
        rightCount += 1;
      }

      const normalizedX = x / width;
      const normalizedY = y / height;
      if (normalizedX >= 0.25 && normalizedX <= 0.75 && normalizedY >= 0.18 && normalizedY <= 0.82) {
        centerSum += luminance;
        centerCount += 1;
      }
      if (normalizedX <= 0.12 || normalizedX >= 0.88 || normalizedY <= 0.1 || normalizedY >= 0.9) {
        edgeSum += luminance;
        edgeCount += 1;
      }

      if (previousLuminance !== null) {
        neighborDeltaSum += Math.abs(luminance - previousLuminance);
        neighborCount += 1;
      }
      if (y > 0) {
        neighborDeltaSum += Math.abs(luminance - previousRow[x]);
        neighborCount += 1;
      }
      previousLuminance = luminance;
      previousRow[x] = luminance;
    }
  }

  const meanLuminance = luminanceSum / count;
  const variance = Math.max(0, luminanceSquareSum / count - meanLuminance * meanLuminance);
  const channelMeans = [redSum / count, greenSum / count, blueSum / count];
  const centerMean = centerCount ? centerSum / centerCount : meanLuminance;
  const edgeMean = edgeCount ? edgeSum / edgeCount : meanLuminance;

  return {
    meanLuminance: clamp(meanLuminance),
    luminanceDeviation: clamp(Math.sqrt(variance) / 0.35),
    clippedPixelRatio: clamp(clipped / count),
    horizontalLuminanceDelta: clamp(Math.abs(leftSum / Math.max(1, leftCount) - rightSum / Math.max(1, rightCount)) / 0.3),
    colorCast: clamp((Math.max(...channelMeans) - Math.min(...channelMeans)) / 95),
    backgroundSeparation: clamp(Math.abs(centerMean - edgeMean) / 0.18),
    sharpness: clamp((neighborDeltaSum / Math.max(1, neighborCount)) / 0.12),
  };
}

function scoreFaceVisible(face: PhotoFaceDetectionEvidence) {
  if (face.status === "not_detected") return 0;
  if (face.status === "unsupported") return 0.5;
  if (!face.box) return 0.72;
  const area = face.box.width * face.box.height;
  const hasMargin = face.box.x >= 0.01 && face.box.y >= 0.01
    && face.box.x + face.box.width <= 0.99 && face.box.y + face.box.height <= 0.99;
  return hasMargin && area >= 0.06 && area <= 0.7 ? 0.92 : 0.58;
}

function scoreFrontal(face: PhotoFaceDetectionEvidence) {
  if (face.status === "not_detected") return 0;
  if (face.status === "unsupported") return 0.5;
  if (!face.box) return 0.7;
  const centerOffset = Math.abs(face.box.x + face.box.width / 2 - 0.5);
  const centerScore = clamp(1 - centerOffset / 0.28);
  const ratio = face.box.width / Math.max(face.box.height, 0.01);
  const ratioScore = clamp(1 - Math.abs(ratio - 0.78) / 0.48);
  return centerScore * 0.65 + ratioScore * 0.35;
}

function scoreHairline(face: PhotoFaceDetectionEvidence) {
  if (face.status === "not_detected") return 0;
  if (face.status === "unsupported") return 0.5;
  if (!face.box) return 0.68;
  if (face.box.y < 0.015) return 0.35;
  if (face.box.y <= 0.34) return 0.86;
  return 0.58;
}

function scoreOcclusion(face: PhotoFaceDetectionEvidence) {
  if (face.status === "not_detected") return 0;
  if (face.status === "unsupported") return 0.5;
  if (face.count !== null && face.count !== 1) return 0.35;
  return face.box ? 0.84 : 0.7;
}

export function assessConsultationPhotoPreflight(
  signals: ConsultationPhotoPreflightSignals,
): ConsultationPhotoPreflightAssessment {
  const resolution = clamp(Math.min(signals.width, signals.height) / 768);
  const faceVisible = scoreFaceVisible(signals.face);
  const frontal = scoreFrontal(signals.face);
  const hairlineVisibility = scoreHairline(signals.face);
  const occlusion = scoreOcclusion(signals.face);
  const exposureScore = clamp(1 - Math.abs(signals.meanLuminance - 0.56) / 0.48);
  const lighting = clamp(exposureScore - signals.clippedPixelRatio * 1.1 - signals.horizontalLuminanceDelta * 0.3);
  const skinColorReliability = clamp(1 - signals.colorCast * 0.72 - signals.clippedPixelRatio * 0.5);
  const background = signals.backgroundSeparation;
  const blur = signals.sharpness;
  const blocking = signals.width < 512 || signals.height < 512
    || signals.face.status === "not_detected"
    || signals.meanLuminance < 0.12 || signals.meanLuminance > 0.92
    || signals.clippedPixelRatio > 0.55 || blur < 0.08;

  const diagnostics = [
    diagnostic("faceVisible", faceVisible, "얼굴 검출 영역과 사진 가장자리 여유가 확인됐습니다.", signals.face.status === "unsupported" ? "현재 브라우저에서 얼굴 자동 감지를 지원하지 않습니다." : "얼굴 전체가 프레임 안에 들어오도록 다시 촬영해 주세요."),
    diagnostic("frontal", frontal, "얼굴 위치와 비율이 정면 촬영 범위에 들어옵니다.", "고개를 기울이지 않은 정면 사진인지 확인해 주세요."),
    diagnostic("lighting", lighting, "노출과 좌우 밝기 차이가 분석 가능한 범위입니다.", "너무 어둡거나 밝지 않은 균일한 조명에서 촬영해 주세요."),
    diagnostic("resolution", resolution, `${signals.width}×${signals.height}px 해상도를 확인했습니다.`, "가로·세로 모두 512px 이상인 사진이 필요합니다."),
    diagnostic("hairline", hairlineVisibility, "얼굴 위쪽 여백이 확보되어 헤어라인을 확인할 수 있습니다.", "이마와 헤어라인이 잘리지 않도록 촬영해 주세요."),
    diagnostic("occlusion", occlusion, "한 명의 얼굴이 안정적으로 감지됐습니다.", "손·마스크·소품으로 얼굴이 가려지지 않았는지 확인해 주세요."),
    diagnostic("color", skinColorReliability, "과도한 색상 치우침이 감지되지 않았습니다.", "색조 필터를 끄고 자연광에 가까운 조명에서 촬영해 주세요."),
    diagnostic("background", background, "중앙 피사체와 배경의 명암 차이가 확인됐습니다.", "머리 윤곽과 구분되는 단순한 배경을 사용해 주세요."),
  ];

  const blockingIds = new Set<PhotoQualityDiagnostic["id"]>(["faceVisible", "lighting", "resolution"]);
  const warnings: PhotoQualityV2["warnings"] = diagnostics
    .filter((item) => item.status === "warning")
    .map((item) => ({
      code: `PHOTO_PREFLIGHT_${item.id.toUpperCase()}`,
      message: item.message,
      severity: blocking && blockingIds.has(item.id) ? "blocking" : "warning",
    }));
  const scores = [faceVisible, frontal, lighting, resolution, blur, occlusion, hairlineVisibility, skinColorReliability, background];
  const overall = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  return {
    canAnalyze: !blocking,
    diagnostics,
    quality: {
      status: blocking ? "retry_required" : warnings.length ? "pass_with_warning" : "pass",
      overall: clamp(overall),
      frontal,
      lighting,
      resolution,
      blur,
      occlusion,
      hairlineVisibility,
      skinColorReliability,
      warnings,
    },
  };
}

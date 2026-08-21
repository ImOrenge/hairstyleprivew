import "server-only";

import sharp from "sharp";
import type {
  PersonalColorCaptureQualityV2,
  PersonalColorQualityObservationV2,
} from "@hairfit/shared/personal-color-v2";
import type { PhotoFaceDetectionEvidence } from "@hairfit/shared";
import { assertPersonalColorCaptureQualityV2 } from "@hairfit/shared/personal-color-v2";
import { inspectConsultationPhotoPreflightBuffer } from "./consulting/photo-preflight-server";

const POLICY_VERSION = "personal-color-capture-quality-v1";

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function observation(code: string, message: string, remediation: string | null): PersonalColorQualityObservationV2 {
  return { code, message, remediation };
}

function faceCoverage(face: PhotoFaceDetectionEvidence) {
  if (face.status === "not_detected") return 0;
  if (face.status === "unsupported") return 0.5;
  if (!face.box) return 0.65;
  const area = face.box.width * face.box.height;
  return clamp(1 - Math.abs(area - 0.28) / 0.28);
}

export async function assessPersonalColorCaptureQuality(input: {
  buffer: Buffer;
  face: PhotoFaceDetectionEvidence;
  makeupInfluence?: "low" | "possible" | "high";
}): Promise<PersonalColorCaptureQualityV2> {
  const preflight = await inspectConsultationPhotoPreflightBuffer(input.buffer, input.face);
  const sample = await sharp(input.buffer, { failOn: "warning" })
    .rotate()
    .resize(160, 160, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let red = 0;
  let green = 0;
  let blue = 0;
  let highlights = 0;
  let shadows = 0;
  let leftLuminance = 0;
  let rightLuminance = 0;
  const pixelCount = sample.info.width * sample.info.height;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 3;
    const r = sample.data[offset] ?? 0;
    const g = sample.data[offset + 1] ?? 0;
    const b = sample.data[offset + 2] ?? 0;
    red += r;
    green += g;
    blue += b;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (luminance >= 0.96) highlights += 1;
    if (luminance <= 0.08) shadows += 1;
    if (index % sample.info.width < sample.info.width / 2) leftLuminance += luminance;
    else rightLuminance += luminance;
  }

  const channelMeans = [red, green, blue].map((value) => value / Math.max(1, pixelCount) / 255);
  const [rMean, gMean, bMean] = channelMeans as [number, number, number];
  const warmCool = rMean - bMean;
  const greenMagenta = gMean - (rMean + bMean) / 2;
  const dominant = Math.abs(warmCool) >= Math.abs(greenMagenta) ? warmCool : greenMagenta;
  const colorCastStrength = clamp(Math.abs(dominant) / 0.18);
  const colorVector = colorCastStrength < 0.18
    ? null
    : Math.abs(warmCool) >= Math.abs(greenMagenta)
      ? warmCool > 0 ? "warm" as const : "cool" as const
      : greenMagenta > 0 ? "green" as const : "magenta" as const;
  const halfPixels = pixelCount / 2;
  const illuminationUniformity = clamp(1 - Math.abs(leftLuminance / halfPixels - rightLuminance / halfPixels) / 0.28);
  const highlightClipping = clamp(1 - highlights / pixelCount / 0.16);
  const shadowCoverage = clamp(1 - shadows / pixelCount / 0.28);
  const coverage = faceCoverage(input.face);
  const validSkinPixelRatio = input.face.status === "detected" ? clamp(0.35 + coverage * 0.55) : 0.45;
  const makeupInfluence = input.makeupInfluence ?? "possible";
  const filterLikelihood = 0.5;
  const whiteBalance = clamp(1 - colorCastStrength);

  const blockers: PersonalColorQualityObservationV2[] = [];
  const warnings: PersonalColorQualityObservationV2[] = [];
  if (input.face.status === "not_detected") blockers.push(observation("FACE_NOT_DETECTED", "얼굴을 확인하지 못했습니다.", "한 명의 얼굴 전체가 정면으로 보이게 다시 촬영해 주세요."));
  if (input.face.status === "detected" && input.face.count !== 1) blockers.push(observation("MULTIPLE_FACES", "한 명보다 많은 얼굴이 감지됐습니다.", "한 명만 나온 사진을 사용해 주세요."));
  for (const item of preflight.quality.warnings) {
    const target = item.severity === "blocking" ? blockers : warnings;
    target.push(observation(item.code, item.message, "필터를 끄고 균일한 중성광에서 정면으로 다시 촬영해 주세요."));
  }
  if (colorCastStrength >= 0.35) warnings.push(observation("COLOR_CAST_DETECTED", `${colorVector ?? "unknown"} 계열 색조 치우침이 감지됐습니다.`, "자연광 또는 중성광에서 다시 촬영하면 온도·채도 축이 더 안정적입니다."));
  if (makeupInfluence !== "low") warnings.push(observation("MAKEUP_INFLUENCE_UNCONFIRMED", "현재 메이크업 영향은 사진만으로 확정하지 않았습니다.", "정밀 진단은 베이스 메이크업을 최소화한 보조 사진을 권장합니다."));
  warnings.push(observation("FILTER_CHECK_DEFERRED", "필터 사용 가능성은 이 단계에서 확정하지 않습니다.", "후속 얼굴 관찰에서 원본 특성과 피부 영역을 함께 확인합니다."));
  if (input.face.status === "unsupported") warnings.push(observation("FACE_CHECK_UNAVAILABLE", "이 환경에서는 업로드 전 얼굴 수 확인을 지원하지 않습니다.", "서버 관찰 단계에서 얼굴 수와 피부 영역을 다시 확인합니다."));

  const usableAxes = {
    temperature: blockers.length === 0 && whiteBalance >= 0.58 && makeupInfluence !== "high",
    value: blockers.length === 0 && highlightClipping >= 0.55 && shadowCoverage >= 0.5,
    chroma: blockers.length === 0 && whiteBalance >= 0.62 && makeupInfluence === "low",
    contrast: blockers.length === 0 && preflight.quality.lighting >= 0.55,
    hueCharacter: blockers.length === 0 && whiteBalance >= 0.7 && makeupInfluence === "low",
  };
  const scores = [
    preflight.quality.frontal,
    coverage,
    preflight.quality.blur,
    whiteBalance,
    illuminationUniformity,
    highlightClipping,
    shadowCoverage,
    validSkinPixelRatio,
  ];
  const quality: PersonalColorCaptureQualityV2 = {
    overall: clamp(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    faceFrontal: preflight.quality.frontal,
    faceCoverage: coverage,
    focus: preflight.quality.blur,
    whiteBalance,
    illuminationUniformity,
    highlightClipping,
    shadowCoverage,
    colorCast: { detected: colorVector !== null, vector: colorVector, strength: colorCastStrength },
    makeupInfluence,
    filterLikelihood,
    validSkinPixelRatio,
    usableAxes,
    blockers,
    warnings,
    policyVersion: POLICY_VERSION,
  };
  assertPersonalColorCaptureQualityV2(quality);
  return quality;
}

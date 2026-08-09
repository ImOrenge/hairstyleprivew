import type {
  AnalysisEvidenceV2,
  EvidenceLandmarkV2,
  FacialMeasurementV2,
  NormalizedPointV2,
} from "./contract.ts";

// MediaPipe FaceMesh topology. Keep this list versioned with the provider
// recorded on AnalysisEvidenceV2; the renderer never reconstructs geometry.
export const MEDIAPIPE_FACE_OVAL_INDICES = [
  10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,
  152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10,
] as const;

const LANDMARK_DEFINITIONS: ReadonlyArray<{
  id: string;
  group: EvidenceLandmarkV2["group"];
  index: number;
}> = [
  { id: "forehead-center", group: "face", index: 10 },
  { id: "chin", group: "face", index: 152 },
  { id: "left-temple", group: "face", index: 234 },
  { id: "right-temple", group: "face", index: 454 },
  { id: "left-cheekbone", group: "face", index: 50 },
  { id: "right-cheekbone", group: "face", index: 280 },
  { id: "left-eye-outer", group: "eye", index: 33 },
  { id: "left-eye-inner", group: "eye", index: 133 },
  { id: "right-eye-inner", group: "eye", index: 362 },
  { id: "right-eye-outer", group: "eye", index: 263 },
  { id: "nose-tip", group: "nose", index: 1 },
  { id: "left-mouth-corner", group: "mouth", index: 61 },
  { id: "right-mouth-corner", group: "mouth", index: 291 },
];

export interface FaceGeometryV2 {
  landmarks: AnalysisEvidenceV2["landmarks"];
  contours: AnalysisEvidenceV2["contours"];
  hairline: AnalysisEvidenceV2["hairline"];
  measurements: AnalysisEvidenceV2["measurements"];
}

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointAt(points: readonly NormalizedPointV2[], index: number) {
  const point = points[index];
  if (!point) throw new Error(`FACE_LANDMARK_INDEX_MISSING:${index}`);
  return point;
}

function distance(a: NormalizedPointV2, b: NormalizedPointV2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angle(a: NormalizedPointV2, vertex: NormalizedPointV2, b: NormalizedPointV2) {
  const first = { x: a.x - vertex.x, y: a.y - vertex.y };
  const second = { x: b.x - vertex.x, y: b.y - vertex.y };
  const denominator = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
  if (!denominator) return 0;
  const cosine = clamp((first.x * second.x + first.y * second.y) / denominator, -1, 1);
  return Math.acos(cosine) / Math.PI;
}

function widthCategory(value: number) {
  if (value < 0.18) return "compact";
  if (value > 0.32) return "broad";
  return "balanced";
}

function lengthCategory(value: number) {
  if (value < 0.28) return "compact";
  if (value > 0.46) return "elongated";
  return "balanced";
}

function ratioCategory(value: number) {
  if (value < 0.88) return "lower";
  if (value > 1.12) return "higher";
  return "balanced";
}

function measurement(
  input: Omit<FacialMeasurementV2, "normalizedValue" | "confidence"> & { normalizedValue: number },
  confidence: number,
): FacialMeasurementV2 {
  return { ...input, normalizedValue: round(input.normalizedValue), confidence };
}

export function buildFaceGeometryV2(
  keypoints: readonly NormalizedPointV2[],
  inputConfidence: number,
  hairlineVisibility: number,
): FaceGeometryV2 {
  if (keypoints.length < 468) throw new Error("FACE_LANDMARK_COUNT_INVALID");
  const confidence = round(clamp(inputConfidence));
  const detectedPoint = (index: number) => ({ ...pointAt(keypoints, index), confidence });
  const landmarks: EvidenceLandmarkV2[] = LANDMARK_DEFINITIONS.map((definition) => ({
    id: definition.id,
    group: definition.group,
    source: "detected",
    confidence,
    point: detectedPoint(definition.index),
  }));

  const contourPoints = MEDIAPIPE_FACE_OVAL_INDICES.map(detectedPoint);
  const top = pointAt(keypoints, 10);
  const chin = pointAt(keypoints, 152);
  const faceHeight = Math.max(0.01, distance(top, chin));
  const hairlineConfidence = round(clamp(confidence * clamp(hairlineVisibility) * 0.82));
  const inferredHairlinePoints = [54,103,10,338,284].map((index) => {
    const source = pointAt(keypoints, index);
    return {
      ...source,
      y: round(clamp(source.y - faceHeight * 0.045)),
      confidence: hairlineConfidence,
    };
  });

  const foreheadLeft = pointAt(keypoints, 54);
  const foreheadRight = pointAt(keypoints, 284);
  const cheekLeft = pointAt(keypoints, 234);
  const cheekRight = pointAt(keypoints, 454);
  const jawLeft = pointAt(keypoints, 172);
  const jawRight = pointAt(keypoints, 397);
  const chinLeft = pointAt(keypoints, 176);
  const chinRight = pointAt(keypoints, 400);
  const betweenEyes = pointAt(keypoints, 168);
  const upperLip = pointAt(keypoints, 13);
  const foreheadWidth = distance(foreheadLeft, foreheadRight);
  const cheekboneWidth = Math.max(0.01, distance(cheekLeft, cheekRight));
  const jawWidth = distance(jawLeft, jawRight);
  const chinWidth = distance(chinLeft, chinRight);

  const measurements: FacialMeasurementV2[] = [
    measurement({ id: "face_length", kind: "length", normalizedValue: faceHeight, category: lengthCategory(faceHeight), geometry: [detectedPoint(10),detectedPoint(152)], explanation: "이마 중심부터 턱 끝까지의 사진 내 정규화 거리" }, confidence),
    measurement({ id: "forehead_width", kind: "width", normalizedValue: foreheadWidth, category: widthCategory(foreheadWidth), geometry: [detectedPoint(54),detectedPoint(284)], explanation: "이마 좌우 경계의 사진 내 정규화 거리" }, confidence),
    measurement({ id: "cheekbone_width", kind: "width", normalizedValue: cheekboneWidth, category: widthCategory(cheekboneWidth), geometry: [detectedPoint(234),detectedPoint(454)], explanation: "광대 좌우 기준점의 사진 내 정규화 거리" }, confidence),
    measurement({ id: "jaw_width", kind: "width", normalizedValue: jawWidth, category: widthCategory(jawWidth), geometry: [detectedPoint(172),detectedPoint(397)], explanation: "턱선 좌우 기준점의 사진 내 정규화 거리" }, confidence),
    measurement({ id: "chin_width", kind: "width", normalizedValue: chinWidth, category: widthCategory(chinWidth), geometry: [detectedPoint(176),detectedPoint(400)], explanation: "턱 끝 주변 좌우 기준점의 사진 내 정규화 거리" }, confidence),
    measurement({ id: "upper_face_length", kind: "length", normalizedValue: distance(top, betweenEyes), category: "upper-face", geometry: [detectedPoint(10),detectedPoint(168)] }, confidence),
    measurement({ id: "mid_face_length", kind: "length", normalizedValue: distance(betweenEyes, upperLip), category: "mid-face", geometry: [detectedPoint(168),detectedPoint(13)] }, confidence),
    measurement({ id: "lower_face_length", kind: "length", normalizedValue: distance(upperLip, chin), category: "lower-face", geometry: [detectedPoint(13),detectedPoint(152)] }, confidence),
    measurement({ id: "jaw_angle_left", kind: "angle", normalizedValue: angle(cheekLeft, jawLeft, chin), category: "left-jaw", geometry: [detectedPoint(234),detectedPoint(172),detectedPoint(152)] }, confidence),
    measurement({ id: "jaw_angle_right", kind: "angle", normalizedValue: angle(cheekRight, jawRight, chin), category: "right-jaw", geometry: [detectedPoint(454),detectedPoint(397),detectedPoint(152)] }, confidence),
    measurement({ id: "vertical_symmetry_axis", kind: "length", normalizedValue: faceHeight, category: "center-axis", geometry: [detectedPoint(10),detectedPoint(168),detectedPoint(1),detectedPoint(13),detectedPoint(152)] }, confidence),
    measurement({ id: "face_length_ratio", kind: "ratio", normalizedValue: faceHeight / cheekboneWidth, category: ratioCategory(faceHeight / cheekboneWidth), geometry: [detectedPoint(10),detectedPoint(152),detectedPoint(234),detectedPoint(454)], explanation: "얼굴 길이와 광대 폭의 비율이며 실제 cm가 아닙니다." }, confidence),
    measurement({ id: "forehead_jaw_ratio", kind: "ratio", normalizedValue: foreheadWidth / Math.max(0.01, jawWidth), category: ratioCategory(foreheadWidth / Math.max(0.01, jawWidth)), geometry: [detectedPoint(54),detectedPoint(284),detectedPoint(172),detectedPoint(397)] }, confidence),
  ];

  return {
    landmarks,
    contours: [{ id: "face_contour", source: "detected", confidence, points: contourPoints }],
    hairline: {
      confidence: hairlineConfidence,
      adjustmentAllowed: hairlineConfidence < 0.75,
      lines: [{ id: "hairline_estimate", source: "inferred", confidence: hairlineConfidence, points: inferredHairlinePoints }],
    },
    measurements,
  };
}

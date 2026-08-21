import type { FacialMeasurementV2 } from "@hairfit/shared/v2";

export type KoreanFaceShapeReference = "male" | "female" | "neutral";

const REFERENCE_KEYS = {
  female: ["oval", "round", "oblong", "square", "triangle"],
  male: ["oval", "round", "long", "rectangle", "triangle"],
  neutral: ["oval", "round", "long", "angular", "triangle"],
} as const;

function measurementValueById(measurements: readonly FacialMeasurementV2[], id: string) {
  return measurements.find((item) => item.id === id)?.normalizedValue ?? null;
}

export function deriveKoreanFaceShapeBlend(
  measurements: readonly FacialMeasurementV2[],
  reference: KoreanFaceShapeReference = "neutral",
): Record<string, number> {
  const faceLengthRatio = measurementValueById(measurements, "face_length_ratio");
  const foreheadWidth = measurementValueById(measurements, "forehead_width");
  const cheekboneWidth = measurementValueById(measurements, "cheekbone_width");
  const jawWidth = measurementValueById(measurements, "jaw_width");
  const chinWidth = measurementValueById(measurements, "chin_width");
  if (faceLengthRatio === null || foreheadWidth === null || cheekboneWidth === null || jawWidth === null || chinWidth === null || cheekboneWidth <= 0) return {};

  const observed = {
    length: faceLengthRatio,
    forehead: foreheadWidth / cheekboneWidth,
    jaw: jawWidth / cheekboneWidth,
    chin: chinWidth / cheekboneWidth,
  };
  const references = {
    female: {
      oval: { length: 1.40, forehead: 0.80, jaw: 0.68, chin: 0.28 },
      round: { length: 1.20, forehead: 0.82, jaw: 0.74, chin: 0.34 },
      oblong: { length: 1.58, forehead: 0.80, jaw: 0.68, chin: 0.28 },
      square: { length: 1.27, forehead: 0.84, jaw: 0.82, chin: 0.38 },
      triangle: { length: 1.32, forehead: 0.72, jaw: 0.84, chin: 0.38 },
    },
    male: {
      oval: { length: 1.46, forehead: 0.80, jaw: 0.74, chin: 0.34 },
      round: { length: 1.24, forehead: 0.82, jaw: 0.78, chin: 0.38 },
      long: { length: 1.66, forehead: 0.80, jaw: 0.74, chin: 0.34 },
      rectangle: { length: 1.43, forehead: 0.82, jaw: 0.84, chin: 0.40 },
      triangle: { length: 1.37, forehead: 0.72, jaw: 0.88, chin: 0.42 },
    },
    neutral: {
      oval: { length: 1.43, forehead: 0.80, jaw: 0.71, chin: 0.31 },
      round: { length: 1.22, forehead: 0.82, jaw: 0.76, chin: 0.36 },
      long: { length: 1.62, forehead: 0.80, jaw: 0.71, chin: 0.31 },
      angular: { length: 1.35, forehead: 0.83, jaw: 0.83, chin: 0.39 },
      triangle: { length: 1.35, forehead: 0.72, jaw: 0.86, chin: 0.40 },
    },
  } as const;
  const tolerances = { length: 0.22, forehead: 0.14, jaw: 0.16, chin: 0.12 };
  const keys = REFERENCE_KEYS[reference];
  const scores = keys.map((key) => {
    const prototype = references[reference][key as keyof (typeof references)[typeof reference]];
    const distance = (Object.keys(observed) as Array<keyof typeof observed>).reduce((total, field) => {
      const delta = (observed[field] - prototype[field]) / tolerances[field];
      return total + delta * delta;
    }, 0);
    return [`${reference}:${key}`, Math.exp(-distance / 2)] as const;
  });
  const total = scores.reduce((sum, [, score]) => sum + score, 0);
  if (!Number.isFinite(total) || total <= 0) return {};
  return Object.fromEntries(scores.map(([key, score]) => [key, Math.round((score / total) * 10_000) / 10_000]));
}

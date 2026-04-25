import type {
  FashionMood,
  FashionOccasion,
  FashionRecommendation,
  FashionRecommendationInput,
} from "./fashion-types";
import {
  BODY_SHAPES,
  EXPOSURE_PREFERENCES,
  FASHION_MOODS,
  FASHION_OCCASIONS,
  FIT_PREFERENCES,
} from "./fashion-types";
import { getFashionTemplate } from "./fashion-template-catalog";

export function isFashionOccasion(value: string): value is FashionOccasion {
  return FASHION_OCCASIONS.includes(value as FashionOccasion);
}

export function isFashionMood(value: string): value is FashionMood {
  return FASHION_MOODS.includes(value as FashionMood);
}

export function isSupportedBodyShape(value: string) {
  return BODY_SHAPES.includes(value as never);
}

export function isSupportedFitPreference(value: string) {
  return FIT_PREFERENCES.includes(value as never);
}

export function isSupportedExposurePreference(value: string) {
  return EXPOSURE_PREFERENCES.includes(value as never);
}

function bodyShapeNote(shape: string | null) {
  if (shape === "triangle") return "Add visual weight near the shoulder line and keep the lower half clean.";
  if (shape === "inverted_triangle") return "Use a calmer shoulder area and add movement below the waist.";
  if (shape === "round") return "Use long vertical lines and avoid bulky layering at the center.";
  if (shape === "hourglass") return "Keep the waist line visible and avoid over-boxy proportions.";
  return "Keep the top and bottom proportions balanced.";
}

function exposureNote(value: string | null) {
  if (value === "low") return "Keep necklines and hemlines modest while using texture for interest.";
  if (value === "bold") return "A stronger neckline or leg line can be used, but the hair remains the focal point.";
  return "Use balanced coverage suitable for repeat wear.";
}

export function generateFashionRecommendation(input: FashionRecommendationInput): FashionRecommendation {
  const template = getFashionTemplate(input.occasion, input.mood);
  const hairLabel = input.hairVariant.label || "selected hairstyle";
  const faceContext = input.analysis?.faceShape ? `${input.analysis.faceShape} face balance` : "current face balance";
  const fit = input.profile.fitPreference || "regular";
  const preferredColor = input.profile.colorPreference?.trim();

  const palette = preferredColor
    ? [preferredColor, ...template.palette.filter((item) => item.toLowerCase() !== preferredColor.toLowerCase())]
    : template.palette;

  return {
    headline: `${template.headline} for ${hairLabel}`,
    summary: `This outfit direction keeps ${hairLabel} visible while balancing ${faceContext}, ${input.profile.heightCm ?? "profile"}cm body scale, and a ${fit} fit preference.`,
    occasion: input.occasion,
    mood: input.mood,
    palette: palette.slice(0, 4),
    silhouette: template.silhouette,
    items: template.items.map((item) => ({
      ...item,
      fit: item.slot === "top" || item.slot === "outer" ? `${item.fit}, ${fit} friendly` : item.fit,
    })),
    stylingNotes: [
      bodyShapeNote(input.profile.bodyShape),
      exposureNote(input.profile.exposurePreference),
      "Keep the face and hairstyle unobstructed; avoid hats or heavy collars in the generated lookbook image.",
      input.profile.avoidItems.length
        ? `Avoid these customer-listed items: ${input.profile.avoidItems.join(", ")}.`
        : "No avoided fashion items were listed.",
    ],
    generatedAt: new Date().toISOString(),
  };
}

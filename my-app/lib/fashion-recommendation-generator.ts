import { getFashionGenreLabelKo } from "./fashion-catalog";
import type {
  FashionGenre,
  FashionMood,
  FashionOccasion,
  FashionRecommendation,
  FashionRecommendationInput,
} from "./fashion-types";
import {
  BODY_SHAPES,
  EXPOSURE_PREFERENCES,
  FASHION_GENRES,
  FASHION_MOODS,
  FASHION_OCCASIONS,
  FIT_PREFERENCES,
} from "./fashion-types";

export function isFashionOccasion(value: string): value is FashionOccasion {
  return FASHION_OCCASIONS.includes(value as FashionOccasion);
}

export function isFashionMood(value: string): value is FashionMood {
  return FASHION_MOODS.includes(value as FashionMood);
}

export function isFashionGenre(value: string): value is FashionGenre {
  return FASHION_GENRES.includes(value as FashionGenre);
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
  if (shape === "triangle") return "하체 비중이 커 보이지 않도록 상체 쪽에 시선을 조금 더 주세요.";
  if (shape === "inverted_triangle") return "어깨 주변은 담백하게 잡고 허리 아래 움직임을 더하면 균형이 좋아집니다.";
  if (shape === "round") return "중심부에 여백과 세로선을 만들어 전체 인상을 정리하세요.";
  if (shape === "hourglass") return "허리선이 과하게 조이지 않도록 자연스러운 비율을 유지하세요.";
  return "상체와 하체 볼륨이 한쪽으로 치우치지 않게 균형을 맞추세요.";
}

function exposureNote(value: string | null) {
  if (value === "low") return "노출은 낮게 유지하고 소재감과 색 대비로 포인트를 주세요.";
  if (value === "bold") return "넥라인이나 레그 라인을 조금 더 선명하게 써도 좋지만 헤어가 가려지지 않게 유지하세요.";
  return "반복해서 입기 좋은 커버리지 안에서 얼굴과 헤어 주변을 가볍게 열어주세요.";
}

function fitLabel(value: string | null) {
  if (value === "slim") return "슬림핏";
  if (value === "relaxed") return "릴랙스핏";
  if (value === "oversized") return "오버핏";
  return "레귤러핏";
}

function dedupePalette(colors: string[]) {
  const seen = new Set<string>();
  return colors
    .map((color) => color.trim())
    .filter(Boolean)
    .filter((color) => {
      const key = color.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function avoidColorKeys(input: FashionRecommendationInput) {
  return new Set(
    (input.profile.personalColor?.avoidColors || [])
      .flatMap((color) => [color.nameKo, color.nameEn, color.hex])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isAvoidedColor(color: string, avoided: Set<string>) {
  const normalized = color.trim().toLowerCase();
  return Boolean(normalized && avoided.has(normalized));
}

function personalColorNote(input: FashionRecommendationInput) {
  const personalColor = input.profile.personalColor;
  if (!personalColor) {
    return null;
  }

  const best = personalColor.bestColors.map((color) => color.nameKo).slice(0, 4).join(", ");
  const avoid = personalColor.avoidColors.map((color) => color.nameKo).slice(0, 4).join(", ");
  return `퍼스널컬러 ${personalColor.tone}/${personalColor.contrast} 대비 기준으로 ${best || "추천 팔레트"} 계열을 우선하고 ${avoid || "비추천 색상"} 계열은 얼굴 가까이 크게 쓰지 않습니다.`;
}

export function generateFashionRecommendation(input: FashionRecommendationInput): FashionRecommendation {
  const hairLabel = input.hairVariant.label || "선택한 헤어스타일";
  const faceContext = input.analysis?.faceShape ? `${input.analysis.faceShape} 얼굴 균형` : "현재 얼굴 균형";
  const fit = fitLabel(input.profile.fitPreference);
  const preferredColor = input.profile.colorPreference?.trim();
  const genreLabel = getFashionGenreLabelKo(input.genre);
  const personalPalette = input.profile.personalColor?.stylingPalette || [];
  const avoidedColors = avoidColorKeys(input);
  const catalogPalette = input.catalogItem.palette.filter((item) => !isAvoidedColor(item, avoidedColors));
  const palette = dedupePalette(
    personalPalette.length
      ? [...personalPalette, ...catalogPalette]
      : preferredColor
        ? [
            preferredColor,
            ...catalogPalette.filter((item) => item.toLowerCase() !== preferredColor.toLowerCase()),
          ]
        : catalogPalette,
  );
  const replacementColor = palette[0] || input.catalogItem.palette[0] || "neutral";
  const personalNote = personalColorNote(input);

  return {
    headline: `${hairLabel}에 맞춘 ${genreLabel} 코디`,
    summary:
      `${input.catalogItem.summary} ${faceContext}, ${input.profile.heightCm ?? "미입력"}cm 체형 정보, ${fit} 선호를 함께 반영했습니다.`,
    genre: input.genre,
    palette: palette.slice(0, 5),
    silhouette: input.catalogItem.silhouette,
    items: input.catalogItem.items.map((item) => ({
      ...item,
      color: isAvoidedColor(item.color, avoidedColors) ? replacementColor : item.color,
      fit: item.slot === "top" || item.slot === "outer" ? `${item.fit}, ${fit} 기준 조정` : item.fit,
      brandName: null,
      productUrl: null,
    })),
    stylingNotes: [
      ...(personalNote ? [personalNote] : []),
      ...input.catalogItem.stylingNotes.slice(0, 3),
      bodyShapeNote(input.profile.bodyShape),
      exposureNote(input.profile.exposurePreference),
      "헤어스타일이 보이도록 모자, 두꺼운 스카프, 높은 칼라는 피하세요.",
      input.profile.avoidItems.length
        ? `사용자가 피하고 싶은 아이템: ${input.profile.avoidItems.join(", ")}.`
        : "별도로 피하고 싶은 아이템은 입력되지 않았습니다.",
    ],
    catalogItemId: input.catalogItem.id,
    catalogCycleId: input.catalogItem.sourceCycleId,
    sourceSummary: input.catalogItem.sourceSummary,
    generatedAt: new Date().toISOString(),
  };
}

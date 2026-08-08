import type {
  CurrentHairProfile,
  HairConditionTag,
  HairDamageLevel,
  HairStrandThickness,
  HairTextureProfile,
  RecommendationLengthBucket,
} from "./recommendation-types";

const LENGTHS = new Set<RecommendationLengthBucket>(["short", "medium", "long"]);
const TEXTURES = new Set<HairTextureProfile>(["straight", "wavy_curly", "tight_curly_frizzy"]);
const STRAND_THICKNESSES = new Set<HairStrandThickness>(["fine", "medium", "coarse"]);
const CONDITIONS = new Set<HairConditionTag>([
  "untreated",
  "damaged",
  "bleached",
  "colored",
  "permed",
  "severely_damaged",
]);
const DAMAGE_LEVELS = new Set<HairDamageLevel>(["low", "medium", "high", "unknown"]);
const SOURCES = new Set<NonNullable<CurrentHairProfile["source"]>>([
  "user",
  "salon",
  "image_estimate",
  "unknown",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === "string" && allowed.has(value as T) ? value as T : fallback;
}

export function normalizeCurrentHairProfile(value: unknown): CurrentHairProfile | null {
  if (!isObject(value)) return null;

  const currentLength = typeof value.currentLength === "string" && LENGTHS.has(value.currentLength as RecommendationLengthBucket)
    ? value.currentLength as RecommendationLengthBucket
    : "unknown";
  const textureType = typeof value.textureType === "string" && TEXTURES.has(value.textureType as HairTextureProfile)
    ? value.textureType as HairTextureProfile
    : "unknown";
  const strandThickness = typeof value.strandThickness === "string" && STRAND_THICKNESSES.has(value.strandThickness as HairStrandThickness)
    ? value.strandThickness as HairStrandThickness
    : "unknown";
  const damageLevel = enumValue(value.damageLevel, DAMAGE_LEVELS, "unknown");
  const desiredLength = value.desiredLength === null
    ? null
    : LENGTHS.has(value.desiredLength as RecommendationLengthBucket)
      ? value.desiredLength as RecommendationLengthBucket
      : null;
  const conditionTags = Array.isArray(value.conditionTags)
    ? Array.from(new Set(value.conditionTags.filter(
        (item): item is HairConditionTag => typeof item === "string" && CONDITIONS.has(item as HairConditionTag),
      ))).slice(0, CONDITIONS.size)
    : [];
  const source = enumValue(value.source, SOURCES, "unknown");

  return {
    currentLength,
    textureType,
    strandThickness,
    conditionTags,
    damageLevel,
    desiredLength,
    source,
  };
}

export function isHairProfilePersonalizationEnabled() {
  return process.env.HAIR_PROFILE_MATCHING_V2_ENABLED?.trim().toLowerCase() === "true";
}

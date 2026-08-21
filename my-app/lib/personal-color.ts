import type {
  PersonalColorCombination,
  PersonalColorContrast,
  PersonalColorDetailVersion,
  PersonalColorResult,
  PersonalColorSwatch,
  PersonalColorTone,
  PersonalColorType,
} from "./fashion-types";

interface OpenAIResponsesOutputContent {
  type?: string;
  text?: string;
}

interface OpenAIResponsesOutput {
  type?: string;
  content?: OpenAIResponsesOutputContent[];
}

interface OpenAIResponsesResponse {
  output_text?: string;
  output?: OpenAIResponsesOutput[];
  error?: {
    message?: string;
  };
}

export interface RawPersonalColorResult {
  detailVersion?: unknown;
  tone?: unknown;
  contrast?: unknown;
  primaryType?: unknown;
  secondaryType?: unknown;
  blend?: unknown;
  axes?: unknown;
  confidence?: unknown;
  bestColors?: unknown;
  avoidColors?: unknown;
  stylingPalette?: unknown;
  hairColorHints?: unknown;
  summary?: unknown;
}

const DEFAULT_OPENAI_VISION_MODEL = "gpt-5.4-mini";
const PERSONAL_COLOR_DETAIL_VERSION: PersonalColorDetailVersion = "color-detail-v2";
const PERSONAL_COLOR_TYPES: PersonalColorType[] = [
  "spring_light", "spring_warm", "spring_bright",
  "summer_light", "summer_cool", "summer_muted",
  "autumn_muted", "autumn_warm", "autumn_deep",
  "winter_bright", "winter_cool", "winter_deep",
];

export const PERSONAL_COLOR_COMPARISON_PALETTE: PersonalColorSwatch[] = [
  { nameKo: "아이보리", nameEn: "Ivory", hex: "#F6E8D7", reason: "warm light neutral" },
  { nameKo: "크림 베이지", nameEn: "Cream Beige", hex: "#D8B58A", reason: "warm muted neutral" },
  { nameKo: "카멜", nameEn: "Camel", hex: "#B98248", reason: "warm medium neutral" },
  { nameKo: "토마토 레드", nameEn: "Tomato Red", hex: "#D94A32", reason: "warm vivid red" },
  { nameKo: "코랄 핑크", nameEn: "Coral Pink", hex: "#F07B73", reason: "warm bright pink" },
  { nameKo: "올리브", nameEn: "Olive", hex: "#6E7045", reason: "warm muted green" },
  { nameKo: "퓨어 화이트", nameEn: "Pure White", hex: "#F8F8F5", reason: "cool clear neutral" },
  { nameKo: "쿨 그레이", nameEn: "Cool Gray", hex: "#A9B0B8", reason: "cool muted neutral" },
  { nameKo: "차콜", nameEn: "Charcoal", hex: "#34363A", reason: "cool deep neutral" },
  { nameKo: "체리 레드", nameEn: "Cherry Red", hex: "#B5122B", reason: "cool vivid red" },
  { nameKo: "라즈베리 핑크", nameEn: "Raspberry Pink", hex: "#C44575", reason: "cool vivid pink" },
  { nameKo: "코발트 블루", nameEn: "Cobalt Blue", hex: "#2E5AAC", reason: "cool clear blue" },
  { nameKo: "소프트 라벤더", nameEn: "Soft Lavender", hex: "#B8A9D9", reason: "cool light pastel" },
  { nameKo: "세이지", nameEn: "Sage", hex: "#A8B8A0", reason: "neutral muted green" },
  { nameKo: "네이비", nameEn: "Navy", hex: "#182642", reason: "cool deep neutral" },
  { nameKo: "초콜릿 브라운", nameEn: "Chocolate Brown", hex: "#4D3426", reason: "warm deep neutral" },
];
const PERSONAL_COLOR_PALETTE_HEXES = PERSONAL_COLOR_COMPARISON_PALETTE.map((swatch) => swatch.hex);
const PERSONAL_COLOR_PALETTE_HEX_SET = new Set(PERSONAL_COLOR_PALETTE_HEXES);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.includes("YOUR_")) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function sanitizeEnvValue(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("YOUR_")) {
    return null;
  }
  return trimmed;
}

export function getOpenAIVisionModel() {
  return sanitizeEnvValue(process.env.OPENAI_VISION_MODEL) || DEFAULT_OPENAI_VISION_MODEL;
}

function isTone(value: unknown): value is PersonalColorTone {
  return value === "warm" || value === "cool" || value === "neutral";
}

function isContrast(value: unknown): value is PersonalColorContrast {
  return value === "low" || value === "medium" || value === "high";
}

function isPersonalColorType(value: unknown): value is PersonalColorType {
  return typeof value === "string" && PERSONAL_COLOR_TYPES.includes(value as PersonalColorType);
}

function clampAxis(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function fallbackAxes(tone: PersonalColorTone, contrast: PersonalColorContrast) {
  return {
    temperature: tone === "warm" ? 0.75 : tone === "cool" ? 0.25 : 0.5,
    value: 0.5,
    chroma: contrast === "high" ? 0.75 : contrast === "low" ? 0.3 : 0.5,
    contrast: contrast === "high" ? 0.8 : contrast === "low" ? 0.25 : 0.5,
  };
}

function fallbackType(tone: PersonalColorTone, contrast: PersonalColorContrast): PersonalColorType {
  if (tone === "warm") return contrast === "high" ? "spring_bright" : contrast === "low" ? "autumn_muted" : "autumn_warm";
  if (tone === "cool") return contrast === "high" ? "winter_bright" : contrast === "low" ? "summer_muted" : "summer_cool";
  return contrast === "high" ? "winter_cool" : contrast === "low" ? "summer_muted" : "summer_cool";
}

function normalizeBlend(value: unknown, primaryType: PersonalColorType, secondaryType: PersonalColorType | null) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const blend = Object.fromEntries(PERSONAL_COLOR_TYPES.map((type) => [type, clampAxis(source[type], 0)])) as Partial<Record<PersonalColorType, number>>;
  const sum = Object.values(blend).reduce((total, score) => total + (score ?? 0), 0);
  if (sum > 0) {
    for (const type of PERSONAL_COLOR_TYPES) blend[type] = Number(((blend[type] ?? 0) / sum).toFixed(4));
    return blend;
  }
  blend[primaryType] = secondaryType ? 0.7 : 1;
  if (secondaryType) blend[secondaryType] = 0.3;
  return blend;
}

function clampConfidence(value: unknown) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0.6;
  return Math.max(0, Math.min(1, numeric));
}

function toShortString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : "";
}

function normalizeHexList(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toUpperCase())
        .filter((item) => PERSONAL_COLOR_PALETTE_HEX_SET.has(item)),
    ),
  ).slice(0, limit);
}

function normalizeColorCombinations(value: unknown, limit: number): PersonalColorCombination[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const source = item as Record<string, unknown>;
      const title = toShortString(source.title, 40);
      const hexes = normalizeHexList(source.hexes, 4);
      const reason = toShortString(source.reason, 160);
      if (!title || hexes.length < 2 || !reason) {
        return null;
      }

      return { title, hexes, reason };
    })
    .filter((item): item is PersonalColorCombination => item !== null)
    .slice(0, limit);
}

function normalizeSwatches(value: unknown, limit: number): PersonalColorSwatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const source = item as Record<string, unknown>;
      const nameKo = toShortString(source.nameKo, 40);
      const nameEn = toShortString(source.nameEn, 40);
      const hex = toShortString(source.hex, 16).toUpperCase();
      const reason = toShortString(source.reason, 160);
      if (!nameKo || !nameEn || !/^#[0-9A-F]{6}$/.test(hex)) {
        return null;
      }

      const colorCombinations = normalizeColorCombinations(source.colorCombinations, 3);
      const swatch: PersonalColorSwatch = {
        nameKo,
        nameEn,
        hex,
        reason,
      };
      const recommendationReason = toShortString(source.recommendationReason, 220);
      const nonRecommendationReason = toShortString(source.nonRecommendationReason, 220);
      const meaning = toShortString(source.meaning, 180);
      const stylingTip = toShortString(source.stylingTip, 220);

      if (recommendationReason) swatch.recommendationReason = recommendationReason;
      if (nonRecommendationReason) swatch.nonRecommendationReason = nonRecommendationReason;
      if (meaning) swatch.meaning = meaning;
      if (stylingTip) swatch.stylingTip = stylingTip;
      if (colorCombinations.length) swatch.colorCombinations = colorCombinations;

      return swatch;
    })
    .filter((item): item is PersonalColorSwatch => item !== null)
    .slice(0, limit);
}

function normalizeStringList(value: unknown, limit: number, maxLength: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, limit);
}

function extractOutputText(response: OpenAIResponsesResponse) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  for (const output of response.output || []) {
    for (const content of output.content || []) {
      if ((content.type === "output_text" || content.type === "text") && content.text?.trim()) {
        return content.text.trim();
      }
    }
  }

  return "";
}

function fallbackSwatches(tone: PersonalColorTone, contrast: PersonalColorContrast) {
  const preferred = PERSONAL_COLOR_COMPARISON_PALETTE.filter((swatch) => {
    if (tone === "warm") return /warm/.test(swatch.reason);
    if (tone === "cool") return /cool/.test(swatch.reason);
    return /neutral|muted/.test(swatch.reason);
  });
  const avoided = PERSONAL_COLOR_COMPARISON_PALETTE.filter((swatch) => !preferred.includes(swatch));
  const highContrast = contrast === "high";

  return {
    bestColors: preferred.slice(0, 5),
    avoidColors: avoided.slice(0, 4),
    stylingPalette: preferred.slice(0, highContrast ? 5 : 4).map((swatch) => swatch.hex),
  };
}

function swatchHasDetail(swatch: PersonalColorSwatch) {
  return Boolean(
    swatch.recommendationReason &&
      swatch.nonRecommendationReason &&
      swatch.meaning &&
      swatch.stylingTip &&
      swatch.colorCombinations?.length,
  );
}

export function normalizePersonalColorResult(raw: RawPersonalColorResult, model: string, diagnosedAt = new Date().toISOString()): PersonalColorResult {
  const tone = isTone(raw.tone) ? raw.tone : "neutral";
  const contrast = isContrast(raw.contrast) ? raw.contrast : "medium";
  const axesFallback = fallbackAxes(tone, contrast);
  const axesSource = raw.axes && typeof raw.axes === "object" && !Array.isArray(raw.axes)
    ? raw.axes as Record<string, unknown>
    : {};
  const primaryType = isPersonalColorType(raw.primaryType) ? raw.primaryType : fallbackType(tone, contrast);
  const secondaryType = isPersonalColorType(raw.secondaryType) && raw.secondaryType !== primaryType ? raw.secondaryType : null;
  const fallback = fallbackSwatches(tone, contrast);
  const bestColors = normalizeSwatches(raw.bestColors, 6);
  const avoidColors = normalizeSwatches(raw.avoidColors, 6);
  const resolvedBestColors = bestColors.length ? bestColors : fallback.bestColors;
  const resolvedAvoidColors = avoidColors.length ? avoidColors : fallback.avoidColors;
  const hasDetailedSwatches =
    raw.detailVersion === PERSONAL_COLOR_DETAIL_VERSION &&
    resolvedBestColors.length > 0 &&
    resolvedAvoidColors.length > 0 &&
    resolvedBestColors.every(swatchHasDetail) &&
    resolvedAvoidColors.every(swatchHasDetail);
  const stylingPalette = normalizeStringList(raw.stylingPalette, 8, 16)
    .map((value) => value.toUpperCase())
    .filter((value) => /^#[0-9A-F]{6}$/.test(value));

  const normalized: PersonalColorResult = {
    tone,
    contrast,
    primaryType,
    secondaryType,
    blend: normalizeBlend(raw.blend, primaryType, secondaryType),
    axes: {
      temperature: clampAxis(axesSource.temperature, axesFallback.temperature),
      value: clampAxis(axesSource.value, axesFallback.value),
      chroma: clampAxis(axesSource.chroma, axesFallback.chroma),
      contrast: clampAxis(axesSource.contrast, axesFallback.contrast),
    },
    confidence: clampConfidence(raw.confidence),
    bestColors: resolvedBestColors,
    avoidColors: resolvedAvoidColors,
    stylingPalette: stylingPalette.length ? stylingPalette : fallback.stylingPalette,
    hairColorHints: normalizeStringList(raw.hairColorHints, 5, 80),
    summary:
      toShortString(raw.summary, 320) ||
      "Personal color guidance was saved for fashion styling recommendations.",
    diagnosedAt,
    model,
  };
  if (hasDetailedSwatches) {
    normalized.detailVersion = PERSONAL_COLOR_DETAIL_VERSION;
  }

  return normalized;
}

const personalColorJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "detailVersion",
    "tone",
    "contrast",
    "primaryType",
    "secondaryType",
    "blend",
    "axes",
    "confidence",
    "bestColors",
    "avoidColors",
    "stylingPalette",
    "hairColorHints",
    "summary",
  ],
  properties: {
    detailVersion: { type: "string", enum: [PERSONAL_COLOR_DETAIL_VERSION] },
    tone: { type: "string", enum: ["warm", "cool", "neutral"] },
    contrast: { type: "string", enum: ["low", "medium", "high"] },
    primaryType: { type: "string", enum: PERSONAL_COLOR_TYPES },
    secondaryType: {
      anyOf: [
        { type: "string", enum: PERSONAL_COLOR_TYPES },
        { type: "null" },
      ],
    },
    blend: {
      type: "object",
      additionalProperties: false,
      required: PERSONAL_COLOR_TYPES,
      properties: Object.fromEntries(PERSONAL_COLOR_TYPES.map((type) => [type, { type: "number", minimum: 0, maximum: 1 }])),
    },
    axes: {
      type: "object",
      additionalProperties: false,
      required: ["temperature", "value", "chroma", "contrast"],
      properties: {
        temperature: { type: "number", minimum: 0, maximum: 1 },
        value: { type: "number", minimum: 0, maximum: 1 },
        chroma: { type: "number", minimum: 0, maximum: 1 },
        contrast: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    bestColors: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "nameKo",
          "nameEn",
          "hex",
          "reason",
          "recommendationReason",
          "nonRecommendationReason",
          "meaning",
          "stylingTip",
          "colorCombinations",
        ],
        properties: {
          nameKo: { type: "string" },
          nameEn: { type: "string" },
          hex: { type: "string", enum: PERSONAL_COLOR_PALETTE_HEXES },
          reason: { type: "string" },
          recommendationReason: { type: "string" },
          nonRecommendationReason: { type: "string" },
          meaning: { type: "string" },
          stylingTip: { type: "string" },
          colorCombinations: {
            type: "array",
            minItems: 2,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "hexes", "reason"],
              properties: {
                title: { type: "string" },
                hexes: {
                  type: "array",
                  minItems: 2,
                  maxItems: 4,
                  items: { type: "string", enum: PERSONAL_COLOR_PALETTE_HEXES },
                },
                reason: { type: "string" },
              },
            },
          },
        },
      },
    },
    avoidColors: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "nameKo",
          "nameEn",
          "hex",
          "reason",
          "recommendationReason",
          "nonRecommendationReason",
          "meaning",
          "stylingTip",
          "colorCombinations",
        ],
        properties: {
          nameKo: { type: "string" },
          nameEn: { type: "string" },
          hex: { type: "string", enum: PERSONAL_COLOR_PALETTE_HEXES },
          reason: { type: "string" },
          recommendationReason: { type: "string" },
          nonRecommendationReason: { type: "string" },
          meaning: { type: "string" },
          stylingTip: { type: "string" },
          colorCombinations: {
            type: "array",
            minItems: 2,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "hexes", "reason"],
              properties: {
                title: { type: "string" },
                hexes: {
                  type: "array",
                  minItems: 2,
                  maxItems: 4,
                  items: { type: "string", enum: PERSONAL_COLOR_PALETTE_HEXES },
                },
                reason: { type: "string" },
              },
            },
          },
        },
      },
    },
    stylingPalette: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: { type: "string", enum: PERSONAL_COLOR_PALETTE_HEXES },
    },
    hairColorHints: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" },
    },
    summary: { type: "string" },
  },
} as const;

export async function analyzePersonalColor(referenceImageDataUrl: string): Promise<PersonalColorResult> {
  if (!referenceImageDataUrl?.trim()) {
    throw new Error("referenceImageDataUrl is required");
  }

  const apiKey = requiredEnv("OPENAI_API_KEY");
  const model = getOpenAIVisionModel();
  const palette = PERSONAL_COLOR_COMPARISON_PALETTE.map(
    (swatch) => `${swatch.nameKo} (${swatch.nameEn}, ${swatch.hex}, ${swatch.reason})`,
  ).join("\n");

  const prompt = `
Analyze the visible face tone for personal color styling only. This is not a medical, dermatology, ethnicity, or health diagnosis.

Process:
1. Estimate warm, cool, or neutral undertone from visible face tone.
2. Estimate low, medium, or high contrast from face, hair, and feature contrast.
3. Compare the face against the fixed palette below and score which swatches are most harmonious.
4. Classify the closest primary and secondary types among the 12 Korean personal-color types and return a normalized blend across all 12 types.
5. Score four continuous axes from 0 to 1: temperature (cool to warm), value (deep to light), chroma (muted to bright), and contrast (low to high).
6. Return best colors, colors to avoid, a styling palette for outfit recommendations, hair color hints, and a concise Korean summary.
7. For every bestColors and avoidColors swatch, provide detailed Korean styling information:
   - recommendationReason: why this color can work for the diagnosis.
   - nonRecommendationReason: when this color may look wrong or why it should be used carefully.
   - meaning: the visual/emotional meaning of the color in styling.
   - stylingTip: practical outfit, makeup, hair, or accessory usage guidance.
   - colorCombinations: 2-3 outfit palette combinations using only fixed palette hex values.

Fixed comparison palette:
${palette}

Rules:
- Return detailVersion exactly as "${PERSONAL_COLOR_DETAIL_VERSION}".
- primaryType and secondaryType must be selected from the supplied 12-type enum; secondaryType may be null.
- blend must contain all 12 keys, use non-negative values, and sum approximately to 1.
- Do not infer sex, ethnicity, age, health, or attractiveness. Base the four axes only on visible color relationships and state uncertainty through confidence.
- Choose bestColors and avoidColors only from the fixed palette.
- stylingPalette must use hex values from the fixed palette.
- colorCombinations hexes must use only hex values from the fixed palette.
- Keep detailed Korean text practical and concise: 1 sentence per detail field, no long essays.
- Avoid sensitive claims about race, disease, skin condition, age, or attractiveness.
- Mention uncertainty when the photo lighting may affect the result.
`.trim();

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: referenceImageDataUrl, detail: "high" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "personal_color_result",
          strict: true,
          schema: personalColorJsonSchema,
        },
      },
    }),
  });

  const json = (await response.json().catch(() => ({}))) as OpenAIResponsesResponse;
  if (!response.ok) {
    throw new Error(json.error?.message || "OpenAI personal color analysis request failed");
  }

  const outputText = extractOutputText(json);
  if (!outputText) {
    throw new Error("OpenAI personal color analysis returned no structured output");
  }

  const raw = JSON.parse(outputText) as RawPersonalColorResult;
  return normalizePersonalColorResult(raw, model);
}

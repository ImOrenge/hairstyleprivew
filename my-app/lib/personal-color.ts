import type {
  PersonalColorContrast,
  PersonalColorResult,
  PersonalColorSwatch,
  PersonalColorTone,
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

interface RawPersonalColorResult {
  tone?: unknown;
  contrast?: unknown;
  confidence?: unknown;
  bestColors?: unknown;
  avoidColors?: unknown;
  stylingPalette?: unknown;
  hairColorHints?: unknown;
  summary?: unknown;
}

const DEFAULT_OPENAI_VISION_MODEL = "gpt-5.4-mini";

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

function clampConfidence(value: unknown) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0.6;
  return Math.max(0, Math.min(1, numeric));
}

function toShortString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : "";
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
      const reason = toShortString(source.reason, 120);
      if (!nameKo || !nameEn || !/^#[0-9A-F]{6}$/.test(hex)) {
        return null;
      }

      return { nameKo, nameEn, hex, reason };
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

function normalizePersonalColor(raw: RawPersonalColorResult, model: string): PersonalColorResult {
  const tone = isTone(raw.tone) ? raw.tone : "neutral";
  const contrast = isContrast(raw.contrast) ? raw.contrast : "medium";
  const fallback = fallbackSwatches(tone, contrast);
  const bestColors = normalizeSwatches(raw.bestColors, 6);
  const avoidColors = normalizeSwatches(raw.avoidColors, 6);
  const stylingPalette = normalizeStringList(raw.stylingPalette, 8, 16)
    .map((value) => value.toUpperCase())
    .filter((value) => /^#[0-9A-F]{6}$/.test(value));

  return {
    tone,
    contrast,
    confidence: clampConfidence(raw.confidence),
    bestColors: bestColors.length ? bestColors : fallback.bestColors,
    avoidColors: avoidColors.length ? avoidColors : fallback.avoidColors,
    stylingPalette: stylingPalette.length ? stylingPalette : fallback.stylingPalette,
    hairColorHints: normalizeStringList(raw.hairColorHints, 5, 80),
    summary:
      toShortString(raw.summary, 320) ||
      "Personal color guidance was saved for fashion styling recommendations.",
    diagnosedAt: new Date().toISOString(),
    model,
  };
}

const personalColorJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "tone",
    "contrast",
    "confidence",
    "bestColors",
    "avoidColors",
    "stylingPalette",
    "hairColorHints",
    "summary",
  ],
  properties: {
    tone: { type: "string", enum: ["warm", "cool", "neutral"] },
    contrast: { type: "string", enum: ["low", "medium", "high"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    bestColors: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nameKo", "nameEn", "hex", "reason"],
        properties: {
          nameKo: { type: "string" },
          nameEn: { type: "string" },
          hex: { type: "string" },
          reason: { type: "string" },
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
        required: ["nameKo", "nameEn", "hex", "reason"],
        properties: {
          nameKo: { type: "string" },
          nameEn: { type: "string" },
          hex: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    stylingPalette: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: { type: "string" },
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
4. Return best colors, colors to avoid, a styling palette for outfit recommendations, hair color hints, and a concise Korean summary.

Fixed comparison palette:
${palette}

Rules:
- Choose bestColors and avoidColors only from the fixed palette.
- stylingPalette must use hex values from the fixed palette.
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
  return normalizePersonalColor(raw, model);
}

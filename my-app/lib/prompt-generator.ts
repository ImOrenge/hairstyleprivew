import { GoogleGenerativeAI } from "@google/generative-ai";

export const PROMPT_VERSION = "v6";

export interface PromptStyleOptions {
  gender?: "male" | "female" | "unisex";
  length?: "short" | "medium" | "long";
  style?: string;
  color?: string;
}

export interface GeneratePromptInput {
  userInput: string;
  styleOptions?: PromptStyleOptions;
  imageContext?: {
    originalImagePath?: string | null;
    hasReferenceImage?: boolean;
    referenceImageDataUrl?: string | null;
  };
}

export interface GeneratePromptResult {
  prompt: string;
  negativePrompt: string;
  normalizedOptions: PromptStyleOptions;
  promptVersion: string;
  model: string;
}

interface DeepResearchResult {
  hairstyleDetails: string[];
  colorDirection?: string;
  textureDirection?: string;
  structureNotes?: string[];
  riskNotes?: string[];
}

const DEFAULT_NEGATIVE_PROMPT = [
  "low quality",
  "blurry",
  "deformed face",
  "bad anatomy",
  "watermark",
  "text",
  "different person",
  "face swap",
  "changed identity",
  "changed ethnicity",
  "changed skin tone",
  "changed face shape",
  "age change",
  "gender swap",
  "side profile",
  "three-quarter view",
  "head tilt",
  "looking away",
].join(", ");

const QUALITY_PREFIX = "reference photo hair edit";

const STYLE_MAP: Array<{ keywords: string[]; value: string }> = [
  { keywords: ["bob", "\uB2E8\uBC1C"], value: "precise chin-length bob cut" },
  { keywords: ["short", "pixie", "\uC1FC\uD2B8"], value: "clean short haircut silhouette" },
  {
    keywords: ["layer", "layered", "\uB808\uC774\uC5B4\uB4DC"],
    value: "layered cut with textured ends and movement",
  },
  { keywords: ["hush", "\uD5C8\uC26C"], value: "korean hush cut silhouette" },
  {
    keywords: ["see through bang", "see-through bang", "\uC2DC\uC2A4\uB8E8 \uBC45"],
    value: "soft see-through bangs",
  },
  { keywords: ["bang", "fringe", "\uBC45"], value: "natural face-framing bangs" },
  { keywords: ["perm", "wave", "\uD38C"], value: "soft wavy perm texture" },
  { keywords: ["straight", "\uC9C1\uBAA8"], value: "sleek straight hair texture" },
  { keywords: ["c curl", "c-curl", "\uC2DC\uCEE4"], value: "inward C-curl at the hair ends" },
  { keywords: ["s curl", "s-curl", "\uC5D0\uC2A4\uCEE4"], value: "defined S-curl flow" },
  {
    keywords: ["tassel", "\uD0DC\uC2AC\uCEF7", "\uD0DC\uC2AC \uCEF7"],
    value: "Tassel Cut with clean one-length line",
  },
  {
    keywords: ["leaf", "\uB9AC\uD504\uCEF7", "\uB9AC\uD504 \uCEF7"],
    value: "Leaf Cut with semi-long layers flowing back",
  },
  {
    keywords: ["guile", "\uAC00\uC77C\uCEF7", "\uAC00\uC77C \uCEF7"],
    value: "Guile Cut with clean side-part volume",
  },
];

const COLOR_MAP: Array<{ keywords: string[]; value: string }> = [
  { keywords: ["ash brown", "ash", "\uC560\uC26C"], value: "cool ash brown hair color" },
  { keywords: ["black", "\uAC80\uC815"], value: "natural black hair color" },
  { keywords: ["brown", "\uBE0C\uB77C\uC6B4"], value: "neutral medium brown hair color" },
  { keywords: ["blonde", "\uAE08\uBC1C"], value: "soft blonde hair color" },
  { keywords: ["red", "\uB808\uB4DC"], value: "deep red hair color" },
];

const LENGTH_MAP: Record<NonNullable<PromptStyleOptions["length"]>, string> = {
  short: "short length",
  medium: "medium length",
  long: "long length",
};

const STYLE_OPTION_MAP: Record<string, string> = {
  straight: "sleek straight hair texture",
  perm: "soft natural perm with controlled volume",
  bangs: "face-framing bangs with clean separation",
  layered: "layered cut with light movement",
};

const COLOR_OPTION_MAP: Record<string, string> = {
  black: "natural black hair color",
  brown: "neutral medium brown hair color",
  ash: "cool ash brown hair color",
  blonde: "soft blonde hair color",
  red: "deep red hair color",
};

const HAIR_ONLY_CONSTRAINTS = [
  "edit the provided reference photo",
  "same person as the reference photo",
  "change only the hairstyle and hair color",
  "do not change face, skin tone, ethnicity, age, or gender",
  "keep eyes, nose, lips, jawline, and face shape unchanged",
  "keep expression, pose, camera angle, and framing unchanged",
  "keep background and clothing unchanged",
  "keep facial expression, pose, and camera framing unchanged",
];

const REQUIRED_NEGATIVE_TERMS = [
  "different person",
  "face swap",
  "changed identity",
  "changed ethnicity",
  "changed skin tone",
  "changed face shape",
  "side profile",
  "three-quarter view",
  "head tilt",
];

const DEEP_RESEARCH_AGENT_SYSTEM_PROMPT_PLACEHOLDER = "";
const PROMPT_COMPOSER_SYSTEM_PROMPT_PLACEHOLDER = "";

function cleanText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1] || "image/png",
    data: match[2] || "",
  };
}

function buildGeminiAgentRequest(
  systemPromptPlaceholder: string,
  payload: Record<string, unknown>,
  referenceImageDataUrl?: string | null,
) {
  const parsedImage = referenceImageDataUrl ? parseDataUrl(referenceImageDataUrl) : null;
  type GeminiRequestPart = { text: string } | { inlineData: { mimeType: string; data: string } };

  const textSections = [
    systemPromptPlaceholder,
    `Input JSON:\n${JSON.stringify(payload, null, 2)}`,
  ].filter((value) => cleanText(String(value)).length > 0);

  const parts: GeminiRequestPart[] = [
    { text: textSections.join("\n\n") || "{}" },
  ];

  if (parsedImage) {
    parts.push({
      inlineData: {
        mimeType: parsedImage.mimeType,
        data: parsedImage.data,
      },
    });
  }

  return {
    contents: [
      {
        role: "user" as const,
        parts,
      },
    ],
  };
}

function normalizeOptions(options?: PromptStyleOptions): PromptStyleOptions {
  if (!options) {
    return {};
  }

  const normalized: PromptStyleOptions = {};

  if (options.gender === "female" || options.gender === "male" || options.gender === "unisex") {
    normalized.gender = options.gender;
  }

  if (options.length === "short" || options.length === "medium" || options.length === "long") {
    normalized.length = options.length;
  }

  if (typeof options.style === "string" && options.style.trim()) {
    normalized.style = cleanText(options.style.toLowerCase());
  }

  if (typeof options.color === "string" && options.color.trim()) {
    normalized.color = cleanText(options.color.toLowerCase());
  }

  return normalized;
}

function hasAnyKeyword(input: string, keywords: string[]): boolean {
  return keywords.some((keyword) => input.includes(cleanText(keyword).toLowerCase()));
}

function findMappedValues(input: string, mappings: Array<{ keywords: string[]; value: string }>): string[] {
  return mappings.filter((item) => hasAnyKeyword(input, item.keywords)).map((item) => item.value);
}

function mergeCommaParts(base: string, requiredParts: string[]): string {
  const nextParts = base
    .split(",")
    .map((item) => cleanText(item))
    .filter(Boolean);

  const normalizedSet = new Set(nextParts.map((item) => item.toLowerCase()));

  for (const part of requiredParts) {
    const cleaned = cleanText(part);
    const normalized = cleaned.toLowerCase();
    if (!normalizedSet.has(normalized)) {
      nextParts.push(cleaned);
      normalizedSet.add(normalized);
    }
  }

  return nextParts.join(", ");
}

function shouldLockIdentity(input: GeneratePromptInput): boolean {
  if (typeof input.imageContext?.hasReferenceImage === "boolean") {
    return input.imageContext.hasReferenceImage;
  }

  if (input.imageContext?.originalImagePath) {
    return true;
  }

  return true;
}

function applyHairOnlyConstraints(basePrompt: string, lockIdentity: boolean): string {
  if (!lockIdentity) {
    return basePrompt;
  }
  return mergeCommaParts(basePrompt, HAIR_ONLY_CONSTRAINTS);
}

function applyNegativeConstraints(baseNegativePrompt?: string): string {
  return mergeCommaParts(baseNegativePrompt || DEFAULT_NEGATIVE_PROMPT, REQUIRED_NEGATIVE_TERMS);
}

function sanitizePositivePrompt(prompt: string): string {
  return cleanText(
    prompt
      .replace(/--\s*neg(?:ative)?\b.*$/i, "")
      .replace(/\bnegative\s*prompt\s*[:=].*$/i, ""),
  );
}

function extractHairOnlySegments(prompt: string): string[] {
  const hairKeywords = [
    "hairstyle",
    "hair",
    "cut",
    "bang",
    "perm",
    "wave",
    "curl",
    "layer",
    "bob",
    "tassel",
    "hush",
    "leaf",
    "guile",
    "texture",
    "volume",
    "part",
    "color",
    "black",
    "brown",
    "ash",
    "blonde",
    "red",
    "short",
    "medium",
    "long",
  ];

  return sanitizePositivePrompt(prompt)
    .split(",")
    .map((segment) => cleanText(segment))
    .filter(Boolean)
    .filter((segment) => {
      const lower = segment.toLowerCase();
      return hairKeywords.some((keyword) => lower.includes(keyword));
    });
}

function buildHairDetailsFromInput(
  normalizedInput: string,
  normalizedOptions: PromptStyleOptions,
): string[] {
  const lowerInput = normalizedInput.toLowerCase();
  const details: string[] = [];

  if (normalizedOptions.length) {
    details.push(LENGTH_MAP[normalizedOptions.length]);
  }

  if (normalizedOptions.style) {
    details.push(`${normalizedOptions.style} hairstyle`);
    const mappedStyle = STYLE_OPTION_MAP[normalizedOptions.style];
    if (mappedStyle) {
      details.push(mappedStyle);
    }
  }

  if (normalizedOptions.color) {
    details.push(`${normalizedOptions.color} hair color`);
    const mappedColor = COLOR_OPTION_MAP[normalizedOptions.color];
    if (mappedColor) {
      details.push(mappedColor);
    }
  }

  details.push(...findMappedValues(lowerInput, STYLE_MAP));
  details.push(...findMappedValues(lowerInput, COLOR_MAP));

  return Array.from(new Set(details.map((item) => cleanText(item)).filter(Boolean)));
}

function buildHairDetailsFromResearch(research: DeepResearchResult | null): string[] {
  if (!research) {
    return [];
  }

  const details: string[] = [
    ...(Array.isArray(research.hairstyleDetails) ? research.hairstyleDetails : []),
    ...(research.colorDirection ? [research.colorDirection] : []),
    ...(research.textureDirection ? [research.textureDirection] : []),
    ...(Array.isArray(research.structureNotes) ? research.structureNotes : []),
  ];

  return Array.from(new Set(details.map((item) => cleanText(item)).filter(Boolean)));
}

function composeMinimalHairEditPrompt(hairDetails: string[], lockIdentity: boolean): string {
  const sanitizedDetails = hairDetails
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 14);

  const base = sanitizedDetails.length > 0
    ? [QUALITY_PREFIX, ...sanitizedDetails]
    : [QUALITY_PREFIX, "natural clean hairstyle refinement"];

  const withConstraints = applyHairOnlyConstraints(base.join(", "), lockIdentity);
  return sanitizePositivePrompt(withConstraints);
}

function parsePromptJsonFromLLM(text: string): { prompt: string; negativePrompt?: string } | null {
  const trimmed = text.trim();
  const withoutCodeFence = trimmed
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(withoutCodeFence) as { prompt?: unknown; negativePrompt?: unknown };
    if (typeof parsed.prompt !== "string" || !parsed.prompt.trim()) {
      return null;
    }

    return {
      prompt: cleanText(parsed.prompt),
      negativePrompt: typeof parsed.negativePrompt === "string" ? cleanText(parsed.negativePrompt) : undefined,
    };
  } catch {
    return null;
  }
}

function parseResearchJsonFromLLM(text: string): DeepResearchResult | null {
  const trimmed = text.trim();
  const withoutCodeFence = trimmed
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(withoutCodeFence) as {
      hairstyleDetails?: unknown;
      colorDirection?: unknown;
      textureDirection?: unknown;
      structureNotes?: unknown;
      riskNotes?: unknown;
    };

    const hairstyleDetails = Array.isArray(parsed.hairstyleDetails)
      ? parsed.hairstyleDetails.filter((item): item is string => typeof item === "string").map(cleanText)
      : [];

    if (hairstyleDetails.length === 0) {
      return null;
    }

    const structureNotes = Array.isArray(parsed.structureNotes)
      ? parsed.structureNotes.filter((item): item is string => typeof item === "string").map(cleanText)
      : undefined;

    const riskNotes = Array.isArray(parsed.riskNotes)
      ? parsed.riskNotes.filter((item): item is string => typeof item === "string").map(cleanText)
      : undefined;

    return {
      hairstyleDetails,
      colorDirection: typeof parsed.colorDirection === "string" ? cleanText(parsed.colorDirection) : undefined,
      textureDirection: typeof parsed.textureDirection === "string" ? cleanText(parsed.textureDirection) : undefined,
      structureNotes,
      riskNotes,
    };
  } catch {
    return null;
  }
}

async function runDeepResearchAgent(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  input: GeneratePromptInput,
  normalizedOptions: PromptStyleOptions,
  lockIdentity: boolean,
): Promise<DeepResearchResult | null> {
  const payload = {
    userInput: cleanText(input.userInput),
    styleOptions: normalizedOptions,
    imageContext: input.imageContext ?? {},
    lockIdentity,
    constraints: HAIR_ONLY_CONSTRAINTS,
  };

  const result = await model.generateContent(
    buildGeminiAgentRequest(
      DEEP_RESEARCH_AGENT_SYSTEM_PROMPT_PLACEHOLDER,
      payload,
      input.imageContext?.referenceImageDataUrl,
    ),
  );

  return parseResearchJsonFromLLM(result.response.text());
}

async function runPromptComposerAgent(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  input: GeneratePromptInput,
  normalizedOptions: PromptStyleOptions,
  research: DeepResearchResult | null,
  lockIdentity: boolean,
): Promise<{ prompt: string; negativePrompt?: string } | null> {
  const payload = {
    userInput: cleanText(input.userInput),
    styleOptions: normalizedOptions,
    deepResearch: research,
    imageContext: input.imageContext ?? {},
    lockIdentity,
    constraints: HAIR_ONLY_CONSTRAINTS,
    defaultNegativePrompt: DEFAULT_NEGATIVE_PROMPT,
  };

  const result = await model.generateContent(
    buildGeminiAgentRequest(
      PROMPT_COMPOSER_SYSTEM_PROMPT_PLACEHOLDER,
      payload,
      input.imageContext?.referenceImageDataUrl,
    ),
  );

  return parsePromptJsonFromLLM(result.response.text());
}

function buildHeuristicPrompt(input: GeneratePromptInput): GeneratePromptResult {
  const normalizedInput = cleanText(input.userInput);
  const normalizedOptions = normalizeOptions(input.styleOptions);
  const lockIdentity = shouldLockIdentity(input);
  const hairDetails = buildHairDetailsFromInput(normalizedInput, normalizedOptions);
  const prompt = composeMinimalHairEditPrompt(hairDetails, lockIdentity);

  return {
    prompt,
    negativePrompt: applyNegativeConstraints(DEFAULT_NEGATIVE_PROMPT),
    normalizedOptions,
    promptVersion: PROMPT_VERSION,
    model: "heuristic-agent-fallback-v1",
  };
}

async function tryGenerateWithGemini(input: GeneratePromptInput): Promise<GeneratePromptResult | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.includes("YOUR_")) {
    return null;
  }

  const modelName = process.env.PROMPT_LLM_MODEL || "gemini-2.5-pro";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const lockIdentity = shouldLockIdentity(input);

  const normalizedOptions = normalizeOptions(input.styleOptions);

  const research = await runDeepResearchAgent(
    model,
    input,
    normalizedOptions,
    lockIdentity,
  ).catch(() => null);

  const composed = await runPromptComposerAgent(
    model,
    input,
    normalizedOptions,
    research,
    lockIdentity,
  ).catch(() => null);

  if (!composed) {
    return null;
  }

  const fromComposed = extractHairOnlySegments(composed.prompt);
  const fromResearch = buildHairDetailsFromResearch(research);
  const fromFallback = buildHairDetailsFromInput(cleanText(input.userInput), normalizedOptions);

  const mergedDetails = Array.from(
    new Set([...fromComposed, ...fromResearch, ...fromFallback].map((item) => cleanText(item)).filter(Boolean)),
  );

  const prompt = composeMinimalHairEditPrompt(mergedDetails, lockIdentity);
  const negativePrompt = applyNegativeConstraints(composed.negativePrompt || DEFAULT_NEGATIVE_PROMPT);

  return {
    prompt,
    negativePrompt,
    normalizedOptions,
    promptVersion: PROMPT_VERSION,
    model: `${modelName}-deep-research-agent`,
  };
}

export async function generatePrompt(input: GeneratePromptInput): Promise<GeneratePromptResult> {
  const normalizedInput = cleanText(input.userInput);
  if (normalizedInput.length < 2) {
    throw new Error("userInput must be at least 2 characters");
  }

  if (normalizedInput.length > 500) {
    throw new Error("userInput must be 500 characters or less");
  }

  const withGemini = await tryGenerateWithGemini({
    ...input,
    userInput: normalizedInput,
  }).catch(() => null);

  if (withGemini) {
    return withGemini;
  }

  return buildHeuristicPrompt({
    ...input,
    userInput: normalizedInput,
  });
}

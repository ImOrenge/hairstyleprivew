import { GoogleGenerativeAI } from "@google/generative-ai";

export const PROMPT_VERSION = "v10";

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
  researchReport?: string;
  productRequirements?: string;
  normalizedOptions: PromptStyleOptions;
  promptVersion: string;
  model: string;
  deepResearch?: {
    summary?: string;
    references?: string[];
    grounded?: boolean;
    model?: string;
  };
}

interface DeepResearchResult {
  report?: string;
  summary?: string;
  hairstyleDetails: string[];
  colorDirection?: string;
  textureDirection?: string;
  structureNotes?: string[];
  riskNotes?: string[];
  references?: string[];
  grounded?: boolean;
}

interface ComposedPromptResult {
  prompt: string;
  productRequirements?: string;
}

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

const DEEP_RESEARCH_AGENT_SYSTEM_PROMPT_PLACEHOLDER = `
You are the hairstyle prompt-research agent.
Use a Deep Research workflow to analyze the user's request and the provided reference image together.

Return JSON only with this shape:
{
  "report": string,
  "summary": string,
  "hairstyleDetails": string[],
  "colorDirection": string,
  "textureDirection": string,
  "structureNotes": string[],
  "riskNotes": string[],
  "references": string[]
}

Research requirements:
- Perform deep research reasoning: infer explicit and implicit hairstyle intent, then validate terminology consistency.
- Extract concrete hairstyle attributes: length, layering, bangs, parting, curl/wave, volume, silhouette, and named style terms.
- Preserve celebrity/style names if present and convert Korean requests into clear English hairstyle descriptors.
- If request and reference conflict, record the conflict in "riskNotes".
- Write a research report in "report" (multi-paragraph, structured, concrete).
- Add short evidence-style research summary in "summary".
- If available, include source URLs or domains in "references".

Hard constraints:
- Keep the same person identity (face and appearance).
- No ethnicity transformation.
- Keep a frontal face photo.
- Keep white background.
`;

const PROMPT_COMPOSER_SYSTEM_PROMPT_PLACEHOLDER = `
You are the hairstyle prompt-composer agent.
You must use the Deep Research result and produce the final prompt for the image-generation agent.

Return JSON only with this shape:
{
  "productRequirements": string,
  "prompt": string
}

Prompt requirements:
- Write one production-ready English prompt focused on hairstyle transformation.
- Do not compress to one line. The prompt must be multi-line with sections and bullet points.
- Use the deep-research report as mandatory evidence.
- Include that this is the same person from the reference image.
- Explicitly enforce: no ethnicity change, frontal face photo, white background.
- Change only hairstyle and hair color. Keep face, skin tone, age, and gender unchanged.
`;

function cleanText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function sanitizeMultilineBlock(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function readBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function getPromptModelName(): string {
  return process.env.PROMPT_LLM_MODEL || "gemini-2.5-pro";
}

function getResearchModelName(): string {
  return process.env.PROMPT_RESEARCH_MODEL || getPromptModelName();
}

function isDeepResearchGroundingEnabled(): boolean {
  return readBooleanEnv(process.env.PROMPT_DEEP_RESEARCH_GROUNDING, true);
}

interface GroundedGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: {
          uri?: string;
        };
      }>;
    };
    grounding_metadata?: {
      grounding_chunks?: Array<{
        web?: {
          uri?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
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

function extractGroundedText(response: GroundedGenerateResponse): string {
  const parts = response.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function extractGroundedReferences(response: GroundedGenerateResponse): string[] {
  const candidate = response.candidates?.[0];
  const chunks =
    candidate?.groundingMetadata?.groundingChunks ||
    candidate?.grounding_metadata?.grounding_chunks ||
    [];

  const references = chunks
    .map((chunk) => chunk?.web?.uri || "")
    .map((uri) => cleanText(uri))
    .filter(Boolean);

  return Array.from(new Set(references)).slice(0, 12);
}

async function runGroundedDeepResearchAgent(
  payload: Record<string, unknown>,
  referenceImageDataUrl?: string | null,
): Promise<DeepResearchResult | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.includes("YOUR_")) {
    return null;
  }

  const model = getResearchModelName();
  const requestBody = {
    ...buildGeminiAgentRequest(
      DEEP_RESEARCH_AGENT_SYSTEM_PROMPT_PLACEHOLDER,
      payload,
      referenceImageDataUrl,
    ),
    tools: [{ google_search: {} }],
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    },
  );

  const json = (await response.json().catch(() => ({}))) as GroundedGenerateResponse;
  if (!response.ok) {
    return null;
  }

  const text = extractGroundedText(json);
  const parsed = parseResearchJsonFromLLM(text);
  if (!parsed) {
    return null;
  }

  const references = extractGroundedReferences(json);
  if (references.length > 0) {
    parsed.references = Array.from(new Set([...(parsed.references || []), ...references]));
    parsed.grounded = true;
  }

  return parsed;
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

function shouldLockIdentity(input: GeneratePromptInput): boolean {
  if (typeof input.imageContext?.hasReferenceImage === "boolean") {
    return input.imageContext.hasReferenceImage;
  }

  if (input.imageContext?.originalImagePath) {
    return true;
  }

  return true;
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

function buildResearchReport(
  userInput: string,
  research: DeepResearchResult | null,
  fallbackHairDetails: string[],
): string {
  const details = buildHairDetailsFromResearch(research).length > 0
    ? buildHairDetailsFromResearch(research)
    : fallbackHairDetails;

  const lines = [
    "Deep Research Report",
    "",
    `User Request: ${cleanText(userInput)}`,
    "",
    "Findings:",
    ...(details.length > 0 ? details.slice(0, 18).map((item) => `- ${item}`) : ["- No explicit detail extracted"]),
  ];

  if (research?.structureNotes && research.structureNotes.length > 0) {
    lines.push("", "Structure Notes:", ...research.structureNotes.slice(0, 10).map((item) => `- ${item}`));
  }

  if (research?.riskNotes && research.riskNotes.length > 0) {
    lines.push("", "Risk Notes:", ...research.riskNotes.slice(0, 10).map((item) => `- ${item}`));
  }

  if (research?.references && research.references.length > 0) {
    lines.push("", "References:", ...research.references.slice(0, 10).map((item) => `- ${item}`));
  }

  if (research?.summary) {
    lines.push("", `Summary: ${research.summary}`);
  }

  return sanitizeMultilineBlock(lines.join("\n"));
}

function buildProductRequirementsDocument(
  researchReport: string,
  hairDetails: string[],
  lockIdentity: boolean,
): string {
  const requirements = [
    "Product Requirements Document (PRD) - Hairstyle Edit",
    "",
    "Goal:",
    "- Modify only hairstyle and hair color from the reference image.",
    "",
    "Input Requirements:",
    "- Use the provided reference image as identity source.",
    "- Use the deep research report below as mandatory context.",
    "",
    "Acceptance Criteria:",
    ...(hairDetails.length > 0
      ? hairDetails.slice(0, 16).map((item) => `- Must reflect: ${item}`)
      : ["- Must reflect the user's requested hairstyle intent."]),
  ];

  if (lockIdentity) {
    requirements.push(
      "- Must keep the same person identity.",
      "- Must not change ethnicity, age, gender, skin tone, or face geometry.",
      "- Must keep frontal composition and white background.",
    );
  }

  requirements.push(
    "",
    "Deep Research Report:",
    researchReport,
  );

  return sanitizeMultilineBlock(requirements.join("\n"));
}

function composeStructuredPrompt(
  hairDetails: string[],
  lockIdentity: boolean,
  researchReport: string,
  productRequirements: string,
): string {
  const sanitizedDetails = hairDetails
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 18);

  const lines: string[] = [
    "Image Editing Prompt",
    "",
    `Quality Anchor: ${QUALITY_PREFIX}`,
    "",
    "Hairstyle Direction:",
    ...(sanitizedDetails.length > 0
      ? sanitizedDetails.map((item) => `- ${item}`)
      : ["- natural clean hairstyle refinement"]),
    "",
    "Identity and Scene Constraints:",
    "- Use the same person as the reference image.",
    "- Change only hairstyle and hair color.",
    "- Keep frontal portrait and white background.",
  ];

  if (lockIdentity) {
    lines.push(
      "- Do not change ethnicity, skin tone, age, gender, or face geometry.",
      "- Keep expression, pose, camera angle, framing, clothing, and background unchanged.",
    );
  }

  lines.push(
    "",
    "Product Requirements Document:",
    productRequirements,
    "",
    "Deep Research Report:",
    researchReport,
  );

  return sanitizeMultilineBlock(lines.join("\n"));
}

function ensurePromptIsNotSingleLine(prompt: string): string {
  const normalized = sanitizeMultilineBlock(prompt);
  if (normalized.includes("\n")) {
    return normalized;
  }

  return sanitizeMultilineBlock([
    "Image Editing Prompt",
    "",
    `Instruction: ${normalized}`,
  ].join("\n"));
}

function parsePromptJsonFromLLM(text: string): ComposedPromptResult | null {
  const trimmed = text.trim();
  const withoutCodeFence = trimmed
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(withoutCodeFence) as {
      prompt?: unknown;
      productRequirements?: unknown;
    };
    if (typeof parsed.prompt !== "string" || !parsed.prompt.trim()) {
      return null;
    }

    return {
      prompt: sanitizeMultilineBlock(parsed.prompt),
      productRequirements:
        typeof parsed.productRequirements === "string" && parsed.productRequirements.trim()
          ? sanitizeMultilineBlock(parsed.productRequirements)
          : undefined,
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
      report?: unknown;
      summary?: unknown;
      hairstyleDetails?: unknown;
      colorDirection?: unknown;
      textureDirection?: unknown;
      structureNotes?: unknown;
      riskNotes?: unknown;
      references?: unknown;
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

    const references = Array.isArray(parsed.references)
      ? parsed.references.filter((item): item is string => typeof item === "string").map(cleanText)
      : undefined;

    return {
      report: typeof parsed.report === "string" ? sanitizeMultilineBlock(parsed.report) : undefined,
      summary: typeof parsed.summary === "string" ? cleanText(parsed.summary) : undefined,
      hairstyleDetails,
      colorDirection: typeof parsed.colorDirection === "string" ? cleanText(parsed.colorDirection) : undefined,
      textureDirection: typeof parsed.textureDirection === "string" ? cleanText(parsed.textureDirection) : undefined,
      structureNotes,
      riskNotes,
      references,
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

  if (isDeepResearchGroundingEnabled()) {
    const grounded = await runGroundedDeepResearchAgent(
      payload,
      input.imageContext?.referenceImageDataUrl,
    ).catch(() => null);

    if (grounded) {
      grounded.grounded = true;
      return grounded;
    }
  }

  const result = await model.generateContent(
    buildGeminiAgentRequest(
      DEEP_RESEARCH_AGENT_SYSTEM_PROMPT_PLACEHOLDER,
      payload,
      input.imageContext?.referenceImageDataUrl,
    ),
  );
  const parsed = parseResearchJsonFromLLM(result.response.text());
  if (parsed) {
    parsed.grounded = false;
    parsed.references = parsed.references || [];
  }
  return parsed;
}

async function runPromptComposerAgent(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  input: GeneratePromptInput,
  normalizedOptions: PromptStyleOptions,
  research: DeepResearchResult | null,
  researchReport: string,
  lockIdentity: boolean,
): Promise<ComposedPromptResult | null> {
  const payload = {
    userInput: cleanText(input.userInput),
    styleOptions: normalizedOptions,
    deepResearch: research,
    deepResearchReport: researchReport,
    imageContext: input.imageContext ?? {},
    lockIdentity,
    constraints: HAIR_ONLY_CONSTRAINTS,
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
  const researchReport = buildResearchReport(normalizedInput, null, hairDetails);
  const productRequirements = buildProductRequirementsDocument(researchReport, hairDetails, lockIdentity);
  const prompt = composeStructuredPrompt(hairDetails, lockIdentity, researchReport, productRequirements);

  return {
    prompt,
    researchReport,
    productRequirements,
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

  const modelName = getPromptModelName();
  const researchModelName = getResearchModelName();
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

  const fallbackHairDetails = buildHairDetailsFromInput(cleanText(input.userInput), normalizedOptions);
  const researchReport = research?.report
    ? sanitizeMultilineBlock(research.report)
    : buildResearchReport(cleanText(input.userInput), research, fallbackHairDetails);

  const composed = await runPromptComposerAgent(
    model,
    input,
    normalizedOptions,
    research,
    researchReport,
    lockIdentity,
  ).catch(() => null);

  const fromComposed = composed ? extractHairOnlySegments(composed.prompt) : [];
  const fromResearch = buildHairDetailsFromResearch(research);
  const fromFallback = fallbackHairDetails;

  const mergedDetails = Array.from(
    new Set([...fromComposed, ...fromResearch, ...fromFallback].map((item) => cleanText(item)).filter(Boolean)),
  );

  const productRequirements = composed?.productRequirements
    ? sanitizeMultilineBlock(composed.productRequirements)
    : buildProductRequirementsDocument(researchReport, mergedDetails, lockIdentity);
  const prompt = composed?.prompt
    ? ensurePromptIsNotSingleLine(sanitizeMultilineBlock(composed.prompt))
    : composeStructuredPrompt(mergedDetails, lockIdentity, researchReport, productRequirements);

  return {
    prompt,
    researchReport,
    productRequirements,
    normalizedOptions,
    promptVersion: PROMPT_VERSION,
    model: `${modelName}-deep-research-agent`,
    deepResearch: research
      ? {
        summary: research.summary,
        references: research.references || [],
        grounded: research.grounded === true,
        model: research.grounded ? researchModelName : modelName,
      }
      : undefined,
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

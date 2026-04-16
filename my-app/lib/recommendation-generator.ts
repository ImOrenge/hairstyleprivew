import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  FaceAnalysisSummary,
  RecommendationCandidate,
  RecommendationCorrectionFocus,
  RecommendationLengthBucket,
} from "./recommendation-types";

export const RECOMMENDATION_PROMPT_VERSION = "recommendation-grid-v1";

interface RecommendationBlueprint {
  id: string;
  label: string;
  lengthBucket: RecommendationLengthBucket;
  correctionFocus: RecommendationCorrectionFocus;
  tags: string[];
  promptSegments: string[];
}

interface RecommendationGenerationInput {
  referenceImageDataUrl: string;
}

interface RecommendationGenerationResult {
  analysis: FaceAnalysisSummary;
  recommendations: RecommendationCandidate[];
  model: string;
  promptVersion: string;
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
  "hat",
  "glasses change",
  "side profile",
  "three-quarter view",
  "head tilt",
  "looking away",
].join(", ");

const ANALYSIS_SYSTEM_PROMPT = `
You are an expert Korean hairstyle consultant.
Analyze the provided frontal portrait photo and return strict JSON only.
Do not describe clothing, makeup, or background.
Focus on the person's head balance, silhouette, and haircut suitability.

Allowed JSON schema:
{
  "faceShape": "short string",
  "headShape": "short string",
  "foreheadExposure": "short string",
  "balance": "short string",
  "bestLengthStrategy": "short string",
  "volumeFocus": ["short string"],
  "avoidNotes": ["short string"],
  "summary": "one sentence"
}
`;

const RECOMMENDATION_BLUEPRINTS: RecommendationBlueprint[] = [
  {
    id: "short-crown",
    label: "Airy Crop Lift",
    lengthBucket: "short",
    correctionFocus: "crown",
    tags: ["short", "airy", "crown-lift"],
    promptSegments: [
      "soft airy short crop",
      "clean side taper",
      "lifted crown volume",
      "light texture on top",
      "natural black or deep brown hair",
    ],
  },
  {
    id: "short-temple",
    label: "Soft Pixie Balance",
    lengthBucket: "short",
    correctionFocus: "temple",
    tags: ["short", "pixie", "temple-balance"],
    promptSegments: [
      "soft pixie silhouette",
      "gentle side fullness around the temple",
      "wispy texture near the cheekbone",
      "clean neckline",
      "natural hair color",
    ],
  },
  {
    id: "short-jawline",
    label: "Rounded Bob Frame",
    lengthBucket: "short",
    correctionFocus: "jawline",
    tags: ["short", "bob", "jawline-frame"],
    promptSegments: [
      "rounded ear-length bob",
      "face-framing line around the jaw",
      "soft inward ends",
      "controlled side volume",
      "natural hair color",
    ],
  },
  {
    id: "medium-crown",
    label: "Layered Volume Flow",
    lengthBucket: "medium",
    correctionFocus: "crown",
    tags: ["medium", "layered", "crown-lift"],
    promptSegments: [
      "medium layered cut",
      "lifted top volume",
      "soft movement through the crown",
      "light face-framing pieces",
      "natural hair color",
    ],
  },
  {
    id: "medium-temple",
    label: "See-Through Hush",
    lengthBucket: "medium",
    correctionFocus: "temple",
    tags: ["medium", "hush", "see-through-bangs"],
    promptSegments: [
      "korean hush cut",
      "soft see-through bangs",
      "balanced fullness near the temple",
      "gentle layered ends",
      "natural hair color",
    ],
  },
  {
    id: "medium-jawline",
    label: "C-Curl Contour",
    lengthBucket: "medium",
    correctionFocus: "jawline",
    tags: ["medium", "c-curl", "contour"],
    promptSegments: [
      "medium C-curl cut",
      "inward curl at the jawline",
      "clean contour around the lower face",
      "smooth top section",
      "natural hair color",
    ],
  },
  {
    id: "long-crown",
    label: "Long Soft Lift",
    lengthBucket: "long",
    correctionFocus: "crown",
    tags: ["long", "soft-layers", "crown-lift"],
    promptSegments: [
      "long soft layers",
      "subtle crown lift",
      "controlled top volume",
      "long flowing ends",
      "natural hair color",
    ],
  },
  {
    id: "long-temple",
    label: "Long Curtain Flow",
    lengthBucket: "long",
    correctionFocus: "temple",
    tags: ["long", "curtain", "temple-balance"],
    promptSegments: [
      "long curtain layers",
      "gentle width near the temple",
      "face-framing curtain pieces",
      "clean long silhouette",
      "natural hair color",
    ],
  },
  {
    id: "long-jawline",
    label: "Long S-Curl Frame",
    lengthBucket: "long",
    correctionFocus: "jawline",
    tags: ["long", "s-curl", "jawline-frame"],
    promptSegments: [
      "long S-curl flow",
      "soft curve around the jawline",
      "balanced lower silhouette",
      "polished top section",
      "natural hair color",
    ],
  },
];

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

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonResponse<T>(text: string): T | null {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as T;
  } catch {
    return null;
  }
}

function normalizeAnalysis(raw: unknown): FaceAnalysisSummary | null {
  if (!isRecord(raw)) {
    return null;
  }

  const volumeFocus = Array.isArray(raw.volumeFocus)
    ? raw.volumeFocus.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
    : [];
  const avoidNotes = Array.isArray(raw.avoidNotes)
    ? raw.avoidNotes.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
    : [];

  const faceShape = typeof raw.faceShape === "string" ? cleanText(raw.faceShape) : "";
  const headShape = typeof raw.headShape === "string" ? cleanText(raw.headShape) : "";
  const foreheadExposure = typeof raw.foreheadExposure === "string" ? cleanText(raw.foreheadExposure) : "";
  const balance = typeof raw.balance === "string" ? cleanText(raw.balance) : "";
  const bestLengthStrategy = typeof raw.bestLengthStrategy === "string" ? cleanText(raw.bestLengthStrategy) : "";
  const summary = typeof raw.summary === "string" ? cleanText(raw.summary) : "";

  if (!faceShape || !headShape || !balance || !summary) {
    return null;
  }

  return {
    faceShape,
    headShape,
    foreheadExposure: foreheadExposure || "balanced forehead exposure",
    balance,
    bestLengthStrategy: bestLengthStrategy || "medium lengths with controlled volume",
    volumeFocus: volumeFocus.length > 0 ? volumeFocus : ["crown", "temple"],
    avoidNotes,
    summary,
  };
}

function buildFallbackAnalysis(): FaceAnalysisSummary {
  return {
    faceShape: "balanced oval",
    headShape: "symmetrical frontal head shape",
    foreheadExposure: "moderate forehead exposure",
    balance: "balanced proportions that suit controlled volume",
    bestLengthStrategy: "medium to long cuts with soft face framing",
    volumeFocus: ["crown", "temple", "jawline"],
    avoidNotes: ["avoid extreme bulk", "avoid heavy opaque bangs"],
    summary: "Balanced proportions suit soft volume and clean face-framing silhouettes.",
  };
}

function buildReason(
  analysis: FaceAnalysisSummary,
  focus: RecommendationCorrectionFocus,
  lengthBucket: RecommendationLengthBucket,
): string {
  const focusCopy: Record<RecommendationCorrectionFocus, string> = {
    crown: `adds lift around the ${analysis.volumeFocus[0] || "crown"} to support ${analysis.balance}`,
    temple: `creates side balance near the temple to complement your ${analysis.faceShape}`,
    jawline: `frames the jawline to keep the lower silhouette aligned with ${analysis.headShape}`,
  };

  const lengthCopy: Record<RecommendationLengthBucket, string> = {
    short: "keeps the silhouette compact and easy to read",
    medium: "keeps movement while preserving structure",
    long: "adds elegance without losing face definition",
  };

  return `${focusCopy[focus]} and ${lengthCopy[lengthBucket]}.`;
}

function composePrompt(analysis: FaceAnalysisSummary, blueprint: RecommendationBlueprint): string {
  const segments = [
    "reference photo hair edit",
    "same person as the reference photo",
    "change only the hairstyle and natural hair color",
    "keep face, skin tone, identity, expression, camera angle, background, and clothing unchanged",
    ...blueprint.promptSegments,
    `suited for ${analysis.faceShape}`,
    `head balance: ${analysis.balance}`,
    `best length strategy: ${analysis.bestLengthStrategy}`,
  ];

  return segments.map(cleanText).filter(Boolean).join(", ");
}

async function runImageAnalysis(referenceImageDataUrl: string): Promise<{ analysis: FaceAnalysisSummary | null; model: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.includes("YOUR_")) {
    return {
      analysis: null,
      model: "heuristic-fallback",
    };
  }

  const parsed = parseDataUrl(referenceImageDataUrl);
  if (!parsed) {
    return {
      analysis: null,
      model: "heuristic-fallback",
    };
  }

  const modelName = process.env.PROMPT_RESEARCH_MODEL || process.env.PROMPT_LLM_MODEL || "gemini-2.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: ANALYSIS_SYSTEM_PROMPT.trim() },
          {
            inlineData: {
              mimeType: parsed.mimeType,
              data: parsed.data,
            },
          },
        ],
      },
    ],
  });

  const parsedResult = parseJsonResponse<Record<string, unknown>>(result.response.text());
  return {
    analysis: normalizeAnalysis(parsedResult),
    model: modelName,
  };
}

function buildRecommendations(analysis: FaceAnalysisSummary): RecommendationCandidate[] {
  return RECOMMENDATION_BLUEPRINTS.map((blueprint, index) => ({
    id: blueprint.id,
    rank: index + 1,
    label: blueprint.label,
    reason: buildReason(analysis, blueprint.correctionFocus, blueprint.lengthBucket),
    prompt: composePrompt(analysis, blueprint),
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    tags: blueprint.tags,
    lengthBucket: blueprint.lengthBucket,
    correctionFocus: blueprint.correctionFocus,
  }));
}

export async function generateRecommendationSet(
  input: RecommendationGenerationInput,
): Promise<RecommendationGenerationResult> {
  const analysisRun = await runImageAnalysis(input.referenceImageDataUrl).catch(() => ({
    analysis: null,
    model: "heuristic-fallback",
  }));

  const analysis = analysisRun.analysis || buildFallbackAnalysis();
  const recommendations = buildRecommendations(analysis);

  return {
    analysis,
    recommendations,
    model: analysisRun.model,
    promptVersion: RECOMMENDATION_PROMPT_VERSION,
  };
}

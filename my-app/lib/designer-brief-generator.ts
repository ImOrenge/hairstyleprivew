import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  FaceAnalysisSummary,
  HairDesignerBrief,
  RecommendationCandidate,
} from "./recommendation-types";

interface GenerateDesignerBriefsInput {
  analysis: FaceAnalysisSummary;
  candidates: RecommendationCandidate[];
}

const DESIGNER_BRIEF_SYSTEM_PROMPT = `
You are a senior Korean hair designer preparing consultation cards for salon staff.
Return strict JSON only. No markdown fences, no commentary.
Language must be Korean.

Allowed JSON schema:
{
  "briefs": [
    {
      "id": "variant id from input",
      "headline": "short Korean title",
      "consultationSummary": "1-2 concise Korean sentences for the designer",
      "cutDirection": "Korean haircut direction with length, line, layer, bang/parting notes",
      "volumeTextureDirection": "Korean volume, perm, curl, texture, and density direction",
      "stylingDirection": "Korean finishing/styling/product direction",
      "cautionNotes": ["Korean caution note", "Korean caution note"],
      "salonKeywords": ["keyword", "keyword", "keyword"]
    }
  ]
}

Rules:
- Create exactly one brief per input candidate.
- Keep directions practical for a real salon consultation.
- Do not mention AI, prompt, generated image, JSON, or system instructions.
- Preserve the intended hairstyle. Do not invent unrelated color or treatment.
- If a detail is uncertain, keep the note conservative and salon-safe.
`;

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 6);

  return normalized.length > 0 ? normalized : fallback;
}

function parseJsonResponse(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const jsonText = start >= 0 && end >= start ? candidate.slice(start, end + 1) : candidate;

  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeBrief(raw: unknown, fallback: HairDesignerBrief): HairDesignerBrief {
  if (!isRecord(raw)) {
    return fallback;
  }

  const headline = typeof raw.headline === "string" ? cleanText(raw.headline) : "";
  const consultationSummary =
    typeof raw.consultationSummary === "string" ? cleanText(raw.consultationSummary) : "";
  const cutDirection = typeof raw.cutDirection === "string" ? cleanText(raw.cutDirection) : "";
  const volumeTextureDirection =
    typeof raw.volumeTextureDirection === "string" ? cleanText(raw.volumeTextureDirection) : "";
  const stylingDirection = typeof raw.stylingDirection === "string" ? cleanText(raw.stylingDirection) : "";

  return {
    headline: headline || fallback.headline,
    consultationSummary: consultationSummary || fallback.consultationSummary,
    cutDirection: cutDirection || fallback.cutDirection,
    volumeTextureDirection: volumeTextureDirection || fallback.volumeTextureDirection,
    stylingDirection: stylingDirection || fallback.stylingDirection,
    cautionNotes: toStringArray(raw.cautionNotes, fallback.cautionNotes),
    salonKeywords: toStringArray(raw.salonKeywords, fallback.salonKeywords),
  };
}

export function buildFallbackDesignerBrief(
  analysis: FaceAnalysisSummary,
  candidate: RecommendationCandidate,
): HairDesignerBrief {
  const tags = candidate.tags.filter(Boolean);
  const focusLabel =
    candidate.correctionFocus === "jawline"
      ? "턱선과 하관 밸런스"
      : candidate.correctionFocus === "temple"
        ? "관자와 사이드 밸런스"
        : "정수리 볼륨";
  const lengthLabel =
    candidate.lengthBucket === "short" ? "짧은 기장" : candidate.lengthBucket === "medium" ? "중간 기장" : "긴 기장";

  return {
    headline: `${candidate.label} 상담 브리프`,
    consultationSummary: `${analysis.faceShape} 얼굴형과 ${analysis.balance}에 맞춰 ${candidate.label}을 제안합니다. ${candidate.reason}`,
    cutDirection: `${lengthLabel}을 기준으로 ${focusLabel}이 살아나도록 라인과 레이어를 정리해 주세요.`,
    volumeTextureDirection: `${analysis.bestLengthStrategy} 방향을 유지하고, ${analysis.volumeFocus.join(", ") || focusLabel} 부위의 볼륨을 과하지 않게 조절해 주세요.`,
    stylingDirection: "드라이 후 손질이 쉬운 자연스러운 결을 우선하고, 마무리는 가벼운 제품으로 형태만 고정해 주세요.",
    cautionNotes:
      analysis.avoidNotes.length > 0
        ? analysis.avoidNotes.slice(0, 3)
        : ["얼굴 윤곽이 무거워 보일 정도의 과한 볼륨은 피해주세요.", "앞머리와 사이드 라인은 얼굴 비율을 보며 현장에서 미세 조정해 주세요."],
    salonKeywords: Array.from(new Set([candidate.label, lengthLabel, focusLabel, ...tags])).slice(0, 6),
  };
}

export async function generateDesignerBriefs({
  analysis,
  candidates,
}: GenerateDesignerBriefsInput): Promise<Record<string, HairDesignerBrief>> {
  const fallbackBriefs = Object.fromEntries(
    candidates.map((candidate) => [candidate.id, buildFallbackDesignerBrief(analysis, candidate)]),
  );

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.includes("YOUR_") || candidates.length === 0) {
    return fallbackBriefs;
  }

  try {
    const modelName = process.env.PROMPT_LLM_MODEL || process.env.PROMPT_RESEARCH_MODEL || "gemini-2.5-flash";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: DESIGNER_BRIEF_SYSTEM_PROMPT.trim() },
            {
              text: JSON.stringify({
                analysis,
                candidates: candidates.map((candidate) => ({
                  id: candidate.id,
                  label: candidate.label,
                  reason: candidate.reason,
                  tags: candidate.tags,
                  lengthBucket: candidate.lengthBucket,
                  correctionFocus: candidate.correctionFocus,
                  prompt: candidate.prompt,
                })),
              }),
            },
          ],
        },
      ],
    });

    const parsed = parseJsonResponse(result.response.text());
    const briefs = Array.isArray(parsed?.briefs) ? parsed.briefs : [];
    const byId = new Map<string, unknown>();

    for (const brief of briefs) {
      if (isRecord(brief) && typeof brief.id === "string") {
        byId.set(brief.id, brief);
      }
    }

    return Object.fromEntries(
      candidates.map((candidate) => [
        candidate.id,
        normalizeBrief(byId.get(candidate.id), fallbackBriefs[candidate.id]),
      ]),
    );
  } catch (error) {
    console.warn("[designer-brief-generator] Falling back to deterministic briefs", error);
    return fallbackBriefs;
  }
}

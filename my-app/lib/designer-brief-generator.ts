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
Tone should be professional, practical, and concise for an in-salon consultation.

Allowed JSON schema:
{
  "briefs": [
    {
      "id": "variant id from input",
      "headline": "short Korean title under 24 characters",
      "consultationSummary": "1-2 Korean sentences explaining face/balance fit and the core salon goal",
      "cutDirection": "1-2 Korean sentences with length, silhouette, outer line, layer, bang, and parting direction",
      "volumeTextureDirection": "1-2 Korean sentences with volume placement, perm/curl/texture, density, and weight control",
      "stylingDirection": "1-2 Korean sentences with blow-dry direction, finishing method, home styling difficulty, and product suggestion",
      "cautionNotes": ["Korean caution note", "Korean caution note"],
      "salonKeywords": ["keyword", "keyword", "keyword"]
    }
  ]
}

Rules:
- Create exactly one brief per input candidate.
- Keep each main text field compact: no field should exceed 2 sentences.
- Make the brief more detailed than a simple recommendation, but short enough to fit a consultation card.
- Include concrete salon terms when useful: 기장, 외곽선, 레이어, 앞머리, 가르마, 뿌리 볼륨, 모량, 질감, 드라이 방향, 제품.
- Provide 2-3 caution notes and 4-6 salon keywords.
- Keep directions practical for a real salon consultation and avoid vague marketing copy.
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

function toStringArray(value: unknown, fallback: string[], limit = 6): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map(cleanText)
    .filter(Boolean)
    .slice(0, limit);

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
    cautionNotes: toStringArray(raw.cautionNotes, fallback.cautionNotes, 3),
    salonKeywords: toStringArray(raw.salonKeywords, fallback.salonKeywords, 6),
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
  const lengthDirection =
    candidate.lengthBucket === "short"
      ? "목선과 턱선이 깔끔하게 드러나는 짧은 실루엣"
      : candidate.lengthBucket === "medium"
        ? "쇄골 전후에서 얼굴선을 부드럽게 감싸는 중간 실루엣"
        : "무게감은 유지하되 얼굴 주변 흐름을 가볍게 만든 긴 실루엣";
  const volumeFocus = analysis.volumeFocus.filter(Boolean).join(", ") || focusLabel;

  return {
    headline: `${candidate.label} 상담 브리프`,
    consultationSummary: `${analysis.faceShape} 얼굴형과 ${analysis.balance}을 기준으로 ${candidate.label}을 제안합니다. ${candidate.reason} 상담 시에는 ${focusLabel}을 보완하면서 전체 인상이 무겁지 않게 보이는지를 우선 확인해 주세요.`,
    cutDirection: `${lengthLabel} 기준의 ${lengthDirection}으로 외곽선을 먼저 정리하고, 얼굴 가까운 레이어는 과하게 끊기지 않게 연결해 주세요. 앞머리와 가르마는 ${analysis.foreheadExposure}를 보며 이마와 사이드가 답답해 보이지 않는 방향으로 조정합니다.`,
    volumeTextureDirection: `${analysis.bestLengthStrategy} 방향은 유지하되, ${volumeFocus} 부위는 뿌리 볼륨과 표면 질감을 분리해서 설계해 주세요. 모량이 많은 경우 안쪽 무게를 덜고, 모량이 적은 경우 끝선이 비어 보이지 않도록 컬감과 질감 처리를 절제합니다.`,
    stylingDirection: "드라이는 얼굴 바깥으로 흐르는 결을 먼저 만들고, 필요한 부분만 롤 브러시나 아이론으로 형태를 보강해 주세요. 마무리는 가벼운 크림이나 소프트 왁스로 잔머리와 끝선을 정리해 집에서도 재현 가능한 난이도로 안내합니다.",
    cautionNotes:
      analysis.avoidNotes.length > 0
        ? analysis.avoidNotes.slice(0, 3)
        : [
            `${focusLabel}을 보정하려다 전체 볼륨이 과해지면 얼굴 폭이 넓어 보일 수 있으니 필요한 지점에만 볼륨을 집중해 주세요.`,
            "앞머리 길이와 사이드 연결은 실제 모량, 모류, 이마 노출감을 확인한 뒤 현장에서 미세 조정해 주세요.",
            "무거운 오일이나 강한 고정 제품은 결을 뭉치게 만들 수 있어 소량만 사용하도록 안내해 주세요.",
          ],
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

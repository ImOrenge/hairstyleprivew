import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_TRANSLATION_MODEL = "gemini-2.5-flash";
const MAX_TEXT_COUNT = 20;
const MAX_TEXT_LENGTH = 800;

interface TranslationRequestBody {
  texts?: unknown;
}

function getTranslationModelName() {
  const candidate =
    process.env.EVALUATION_MODEL?.trim() ||
    process.env.PROMPT_RESEARCH_MODEL?.trim() ||
    process.env.PROMPT_LLM_MODEL?.trim() ||
    "";

  if (!candidate || candidate.includes("YOUR_")) {
    return DEFAULT_TRANSLATION_MODEL;
  }

  return candidate;
}

function parseTranslationsPayload(raw: string, fallback: string[]) {
  let jsonStr = raw.trim();

  if (jsonStr.includes("```")) {
    const matches = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (matches?.[1]) {
      jsonStr = matches[1].trim();
    }
  } else {
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      jsonStr = jsonStr.slice(start, end + 1);
    }
  }

  try {
    const parsed = JSON.parse(jsonStr) as { translations?: unknown };
    if (!Array.isArray(parsed.translations)) {
      return fallback;
    }

    return parsed.translations.map((item, index) => {
      if (typeof item !== "string") {
        return fallback[index] ?? "";
      }

      return item.trim() || fallback[index] || "";
    });
  } catch {
    return fallback;
  }
}

function normalizeTexts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_TEXT_COUNT)
    .map((item) => item.slice(0, MAX_TEXT_LENGTH));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as TranslationRequestBody;
  const texts = normalizeTexts(body.texts);

  if (texts.length === 0) {
    return NextResponse.json({ translations: [] }, { status: 200 });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ translations: texts }, { status: 200 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: getTranslationModelName() });

  try {
    const result = await model.generateContent([
      {
        text: [
          "You translate result-screen copy for an AI hairstyle preview app from English to Korean.",
          "Return strict JSON only in this shape:",
          '{"translations":["..."]}',
          "Rules:",
          "- Keep the same order and number of items as the input array.",
          "- Translate into concise, natural Korean suitable for UI and hairstyle analysis.",
          "- Preserve hairstyle names, IDs, product names, numbers, and proper nouns.",
          "- If an item is already Korean or should remain unchanged, return it as-is.",
          "- Do not add explanations or markdown fences.",
        ].join("\n"),
      },
      {
        text: `Input JSON: ${JSON.stringify({ texts })}`,
      },
    ]);

    const responseText = result.response.text();
    const translations = parseTranslationsPayload(responseText, texts);

    if (translations.length !== texts.length) {
      return NextResponse.json({ translations: texts }, { status: 200 });
    }

    return NextResponse.json({ translations }, { status: 200 });
  } catch {
    return NextResponse.json({ translations: texts }, { status: 200 });
  }
}

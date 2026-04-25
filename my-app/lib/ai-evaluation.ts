import { GoogleGenerativeAI } from "@google/generative-ai";

export interface AIEvaluationResult {
    score: number;
    comment: string;
    tips: string[];
}

const EVALUATION_SYSTEM_PROMPT = `
You are a professional hair stylist and fashion critic.
Evaluate the hairstyle change between the original image and the generated result based on the provided prompt.

Criteria:
1. Accuracy: How well did it follow the prompt?
2. Naturalness: Does the hair integrate well with the person's face and identity?
3. Aesthetics: Is the style flattering?

Output MUST be strict JSON:
{
  "score": number (1-100),
  "comment": "1-2 sentences summarizing the result",
  "tips": ["tip 1", "tip 2", "tip 3"]
}

Rules:
- Give professional, encouraging but honest feedback.
- Tips should be practical (styling products, maintenance, face shape compatibility).
- Return JSON only. No markdown fences.
`;

const DEFAULT_EVALUATION_MODEL = "gemini-2.5-flash";

function getEvaluationModelName() {
    const candidate =
        process.env.EVALUATION_MODEL?.trim() ||
        process.env.PROMPT_RESEARCH_MODEL?.trim() ||
        process.env.PROMPT_LLM_MODEL?.trim() ||
        "";

    if (!candidate || candidate.includes("YOUR_")) {
        return DEFAULT_EVALUATION_MODEL;
    }

    return candidate;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        throw new Error("Invalid data URL");
    }

    return {
        mimeType: match[1] || "image/png",
        data: match[2] || "",
    };
}

export async function runAIEvaluation(
    prompt: string,
    originalImageDataUrl: string,
    generatedImageDataUrl: string,
): Promise<AIEvaluationResult> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error("Missing GOOGLE_API_KEY");
    }

    const modelName = getEvaluationModelName();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const original = parseDataUrl(originalImageDataUrl);
    const generated = parseDataUrl(generatedImageDataUrl);

    console.log("[ai-evaluation] Running evaluation", {
        model: modelName,
        prompt,
    });

    try {
        const result = await model.generateContent([
            { text: EVALUATION_SYSTEM_PROMPT },
            { text: `Target Prompt: ${prompt}` },
            {
                inlineData: {
                    mimeType: original.mimeType,
                    data: original.data,
                },
            },
            {
                inlineData: {
                    mimeType: generated.mimeType,
                    data: generated.data,
                },
            },
        ]);

        const responseText = result.response.text().trim();
        console.log("[ai-evaluation] Gemini Response:", responseText);

        let jsonStr = responseText;
        if (responseText.includes("```")) {
            const matches = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (matches && matches[1]) {
                jsonStr = matches[1].trim();
            }
        } else {
            const start = responseText.indexOf("{");
            const end = responseText.lastIndexOf("}");
            if (start !== -1 && end !== -1) {
                jsonStr = responseText.substring(start, end + 1);
            }
        }

        const json = JSON.parse(jsonStr);
        return {
            score: typeof json.score === "number" ? json.score : 0,
            comment: typeof json.comment === "string" ? json.comment : "",
            tips: Array.isArray(json.tips) ? json.tips : [],
        };
    } catch (error) {
        console.error("[ai-evaluation] Evaluation failed", error);
        return {
            score: 0,
            comment: "AI evaluation could not be completed for this result.",
            tips: [
                "Try the generation again after confirming the source image is valid.",
                "Check that the configured Gemini evaluation model supports generateContent.",
            ],
        };
    }
}

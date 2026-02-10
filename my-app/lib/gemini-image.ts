export interface GeminiImageRunRequest {
  prompt: string;
  productRequirements?: string;
  researchReport?: string;
  imageDataUrl?: string;
}

export interface GeminiImageGenerationResult {
  id: string;
  status: "completed" | "failed";
  outputUrl?: string;
  error?: string;
}

interface GeminiInlinePart {
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
  inline_data?: {
    mime_type?: string;
    data?: string;
  };
  text?: string;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiInlinePart[];
    };
  }>;
  error?: {
    message?: string;
  };
}

const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";
const IMAGE_GENERATION_AGENT_INSTRUCTION = `
You are the hairstyle image-generation agent.
You receive a deep-research report, a product requirements document, and a final prompt from the prompt agent.
You must follow the product requirements first, then execute the final prompt.
Generate a professional hairstyle template image while preserving the same person identity.
`;

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

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("imageDataUrl must be a valid base64 data URL");
  }

  return {
    mimeType: match[1] || "image/png",
    data: match[2] || "",
  };
}

function toOutputDataUrl(response: GeminiGenerateResponse): string | null {
  const parts = response.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const base64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
  if (!base64) {
    return null;
  }

  const mimeType = imagePart?.inlineData?.mimeType || imagePart?.inline_data?.mime_type || "image/png";
  return `data:${mimeType};base64,${base64}`;
}

export function getGeminiImageModel() {
  return sanitizeEnvValue(process.env.GEMINI_IMAGE_MODEL) || DEFAULT_GEMINI_IMAGE_MODEL;
}

export async function runGeminiImageGeneration(
  request: GeminiImageRunRequest,
): Promise<GeminiImageGenerationResult> {
  if (!request.prompt?.trim()) {
    throw new Error("prompt is required");
  }

  if (!request.imageDataUrl) {
    throw new Error("imageDataUrl is required for hairstyle editing");
  }

  const apiKey = requiredEnv("GOOGLE_API_KEY");
  const model = getGeminiImageModel();
  const { mimeType, data } = parseDataUrl(request.imageDataUrl);

  const promptWithConstraints = [
    IMAGE_GENERATION_AGENT_INSTRUCTION.trim(),
    "",
    "Global Constraints:",
    "- Use the provided reference image as the identity source.",
    "- Keep identity and ethnicity unchanged.",
    "- Keep frontal portrait and white background.",
    "- Change only hairstyle and hair color.",
    "- Do not alter face geometry, skin tone, expression, pose, camera angle, framing, or clothing.",
    "",
    request.productRequirements?.trim()
      ? `Product Requirements Document:\n${request.productRequirements}`
      : "",
    request.researchReport?.trim()
      ? `Deep Research Report:\n${request.researchReport}`
      : "",
    `Final Prompt From Prompt Agent:\n${request.prompt}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptWithConstraints },
              {
                inline_data: {
                  mime_type: mimeType,
                  data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    },
  );

  const json = (await response.json().catch(() => ({}))) as GeminiGenerateResponse;
  if (!response.ok) {
    throw new Error(json.error?.message || "Gemini image generation request failed");
  }

  const outputUrl = toOutputDataUrl(json);
  if (!outputUrl) {
    throw new Error("Gemini image generation returned no image output");
  }

  return {
    id: `gemini_${Date.now()}`,
    status: "completed",
    outputUrl,
  };
}

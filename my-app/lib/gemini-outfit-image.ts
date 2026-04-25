import type { FashionRecommendation, StyleProfile } from "./fashion-types";
import type { GeneratedVariant } from "./recommendation-types";

export interface GeminiOutfitRunRequest {
  bodyImageDataUrl: string;
  hairImageDataUrl: string;
  recommendation: FashionRecommendation;
  profile: StyleProfile;
  hairVariant: GeneratedVariant;
}

export interface GeminiOutfitGenerationResult {
  id: string;
  outputUrl: string;
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

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.includes("YOUR_")) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getGeminiImageModel() {
  const value = process.env.GEMINI_IMAGE_MODEL?.trim();
  return value && !value.includes("YOUR_") ? value : DEFAULT_GEMINI_IMAGE_MODEL;
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

export function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const { mimeType, data } = parseDataUrl(dataUrl);
  return {
    mimeType,
    buffer: Buffer.from(data, "base64"),
  };
}

export async function runGeminiOutfitGeneration(
  request: GeminiOutfitRunRequest,
): Promise<GeminiOutfitGenerationResult> {
  const apiKey = requiredEnv("GOOGLE_API_KEY");
  const model = getGeminiImageModel();
  const bodyImage = parseDataUrl(request.bodyImageDataUrl);
  const hairImage = parseDataUrl(request.hairImageDataUrl);

  const itemList = request.recommendation.items
    .map((item) => `${item.slot}: ${item.name}, ${item.color}, ${item.fit}, ${item.material}`)
    .join("\n");

  const prompt = `
You are a fashion lookbook image-generation agent.
Use the first image as the customer's full-body reference and the second image as the confirmed hairstyle reference.
Generate a realistic full-body lookbook outfit image, not a guaranteed exact virtual fitting.

Global constraints:
- Preserve the person's identity, face, hairstyle impression, body proportions, skin tone, pose category, and natural body scale.
- Do not make the customer thinner, taller, younger, older, or change ethnicity.
- Keep the confirmed hairstyle visible and consistent with the second reference image.
- Change clothing, shoes, and accessories only.
- Do not add hats, heavy scarves, or collars that hide the hairstyle.
- Render a clean editorial shopping lookbook image with the full outfit visible.

Customer profile:
- Height: ${request.profile.heightCm ?? "unknown"}cm
- Body shape: ${request.profile.bodyShape ?? "unknown"}
- Top size: ${request.profile.topSize ?? "unknown"}
- Bottom size: ${request.profile.bottomSize ?? "unknown"}
- Fit preference: ${request.profile.fitPreference ?? "regular"}
- Exposure preference: ${request.profile.exposurePreference ?? "balanced"}
- Avoid items: ${request.profile.avoidItems.join(", ") || "none"}

Confirmed hairstyle: ${request.hairVariant.label}
Outfit headline: ${request.recommendation.headline}
Occasion: ${request.recommendation.occasion}
Mood: ${request.recommendation.mood}
Palette: ${request.recommendation.palette.join(", ")}
Silhouette: ${request.recommendation.silhouette}
Items:
${itemList}
`.trim();

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
              { text: prompt },
              {
                inline_data: {
                  mime_type: bodyImage.mimeType,
                  data: bodyImage.data,
                },
              },
              {
                inline_data: {
                  mime_type: hairImage.mimeType,
                  data: hairImage.data,
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
    throw new Error(json.error?.message || "Gemini outfit generation request failed");
  }

  const outputUrl = toOutputDataUrl(json);
  if (!outputUrl) {
    throw new Error("Gemini outfit generation returned no image output");
  }

  return {
    id: `gemini_outfit_${Date.now()}`,
    outputUrl,
  };
}

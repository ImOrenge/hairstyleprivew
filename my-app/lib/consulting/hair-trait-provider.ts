import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { HAIR_TRAIT_IDS, type HairTraitObservationV1 } from "@hairfit/shared/consulting/hair-profile";
import { getPromptVisionModel, getVisionProvider } from "../vision-model";

const PROMPT = `You are a visual hair-trait observation engine. Return JSON only.
Observe only what is visibly supported by this single portrait. Never diagnose scalp disease, hair loss, porosity, elasticity, internal damage, chemical history, or treatment safety.
Allowed traitId values: ${HAIR_TRAIT_IDS.join(", ")}.
For every observation return traitId, value, confidence 0..1, evidenceRegions (normalized x,y,width,height), and limitations.
Omit traits that are not visible. Do not infer gender, identity, ethnicity, medical condition, or exact physical strand diameter.
Schema: {"observations":[{"traitId":"texture_pattern","value":"string","confidence":0.0,"evidenceRegions":[{"x":0,"y":0,"width":1,"height":1}],"limitations":["string"]}],"modelVersion":"string"}`;

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("HAIR_TRAIT_SOURCE_INVALID");
  return { mimeType: match[1], data: match[2] };
}

function jsonObject(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function clamp(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

export interface HairTraitProviderOutput {
  observations: HairTraitObservationV1[];
  model: { provider: string; name: string; version: string };
}

function normalize(payload: Record<string, unknown>, provider: string, model: string): HairTraitProviderOutput {
  const rows = Array.isArray(payload.observations) ? payload.observations : [];
  const observations = rows.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const traitId = String(row.traitId ?? "");
    if (!HAIR_TRAIT_IDS.includes(traitId as (typeof HAIR_TRAIT_IDS)[number])) return [];
    const confidence = clamp(row.confidence);
    if (!String(row.value ?? "").trim() || confidence <= 0) return [];
    const evidenceRegions = (Array.isArray(row.evidenceRegions) ? row.evidenceRegions : []).flatMap((region) => {
      if (!region || typeof region !== "object") return [];
      const item = region as Record<string, unknown>;
      const normalized = { x: clamp(item.x), y: clamp(item.y), width: clamp(item.width), height: clamp(item.height) };
      return normalized.width > 0 && normalized.height > 0 ? [normalized] : [];
    }).slice(0, 4);
    return [{
      id: `hair-observation-${index + 1}`,
      traitId: traitId as HairTraitObservationV1["traitId"],
      source: "observed" as const,
      value: String(row.value),
      confidence,
      evidenceRegions,
      evidenceIds: [],
      limitations: (Array.isArray(row.limitations) ? row.limitations : []).map(String).filter(Boolean).slice(0, 4),
      model: { provider, name: model, version: String(payload.modelVersion ?? model) },
    }];
  });
  return { observations, model: { provider, name: model, version: String(payload.modelVersion ?? model) } };
}

export async function analyzeHairTraitsWithVision(imageDataUrl: string): Promise<HairTraitProviderOutput> {
  const model = getPromptVisionModel();
  const provider = getVisionProvider(model);
  const parsed = parseDataUrl(imageDataUrl);
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error("HAIR_TRAIT_PROVIDER_NOT_CONFIGURED");
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: [{ role: "user", content: [{ type: "input_text", text: PROMPT }, { type: "input_image", image_url: imageDataUrl, detail: "high" }] }] }),
    });
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || "HAIR_TRAIT_PROVIDER_FAILED");
    const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "";
    return normalize(jsonObject(text), provider, model);
  }
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)?.trim();
  if (!apiKey) throw new Error("HAIR_TRAIT_PROVIDER_NOT_CONFIGURED");
  const result = await new GoogleGenerativeAI(apiKey).getGenerativeModel({ model }).generateContent({ contents: [{ role: "user", parts: [{ text: PROMPT }, { inlineData: parsed }] }] });
  return normalize(jsonObject(result.response.text()), provider, model);
}

import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import type { MakeupRationaleNarrativeV1, MakeupRecommendationRationaleV1 } from "@hairfit/shared/makeup";
import { isMakeupRationaleAiEnabled } from "../consulting/feature-flag";
import { readDurableCapabilityResult, requestDurableCapabilityRetry, runDurableCapability } from "./durable-runtime";
import { capabilityFingerprint, type CapabilityEngineAdapter } from "./runtime";

export const MAKEUP_RATIONALE_ENGINE_VERSION = "makeup-rationale-v1";
export const MAKEUP_RATIONALE_PROMPT_POLICY_VERSION = "makeup-rationale-evidence-only-v1";
const model = process.env.PROMPT_LLM_MODEL || process.env.PROMPT_RESEARCH_MODEL || "gemini-2.5-flash";
const provider = /^(gpt-|o\d|chatgpt-)/i.test(model) ? "openai" : "gemini";

function prompt(input: MakeupRecommendationRationaleV1) {
  return [
    "당신은 HairFit 메이크업 컨설턴트입니다.",
    "제공된 구조화 근거만 사용해 고객용 한국어 설명을 작성하세요.",
    "새 컬러, 얼굴 특징, 제품 호수, 좌표를 추정하거나 추가하지 마세요.",
    "evidenceIds는 입력에 존재하는 ID만 사용하세요.",
    "JSON만 반환하세요: {schemaVersion,headline,summary,adjustmentReason,evidenceIds}.",
    JSON.stringify(input),
  ].join("\n");
}

function normalize(raw: unknown, input: MakeupRecommendationRationaleV1): MakeupRationaleNarrativeV1 {
  const value = raw as Partial<MakeupRationaleNarrativeV1> | null;
  const allowed = new Set(input.evidence.map((item) => item.id));
  const evidenceIds = Array.isArray(value?.evidenceIds) && value.evidenceIds.every((id): id is string => typeof id === "string") ? value.evidenceIds : [];
  if (evidenceIds.some((id) => !allowed.has(id))) throw new Error("MAKEUP_RATIONALE_EVIDENCE_REFERENCE_INVALID");
  if (!value || typeof value.headline !== "string" || typeof value.summary !== "string" || typeof value.adjustmentReason !== "string" || !evidenceIds.length) throw new Error("MAKEUP_RATIONALE_OUTPUT_INVALID");
  return { schemaVersion: "makeup-rationale-narrative-v1", headline: value.headline.slice(0, 120), summary: value.summary.slice(0, 500), adjustmentReason: value.adjustmentReason.slice(0, 300), evidenceIds };
}

function extractOpenAIText(value: unknown) {
  const output = (value as { output?: Array<{ content?: Array<{ text?: string }> }> } | null)?.output ?? [];
  return output.flatMap((item) => item.content ?? []).map((item) => item.text).find((text): text is string => typeof text === "string") ?? null;
}

async function execute(input: MakeupRecommendationRationaleV1) {
  const text = prompt(input);
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("MAKEUP_RATIONALE_PROVIDER_UNAVAILABLE");
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
      model,
      input: text,
      text: { format: { type: "json_schema", name: "makeup_rationale", strict: true, schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          schemaVersion: { type: "string", enum: ["makeup-rationale-narrative-v1"] },
          headline: { type: "string" }, summary: { type: "string" }, adjustmentReason: { type: "string" },
          evidenceIds: { type: "array", minItems: 1, items: { type: "string", enum: input.evidence.map((item) => item.id) } },
        },
        required: ["schemaVersion", "headline", "summary", "adjustmentReason", "evidenceIds"],
      } } },
    }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("MAKEUP_RATIONALE_PROVIDER_FAILED");
    const output = extractOpenAIText(json); if (!output) throw new Error("MAKEUP_RATIONALE_OUTPUT_INVALID");
    return normalize(JSON.parse(output), input);
  }
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("MAKEUP_RATIONALE_PROVIDER_UNAVAILABLE");
  const result = await new GoogleGenerativeAI(apiKey).getGenerativeModel({ model }).generateContent(text);
  const raw = result.response.text().replace(/^```json\s*|\s*```$/g, "").trim();
  return normalize(JSON.parse(raw), input);
}

export const makeupRationaleAdapter: CapabilityEngineAdapter<MakeupRecommendationRationaleV1, MakeupRationaleNarrativeV1> = {
  capability: "makeup-rationale-generation",
  engineVersion: MAKEUP_RATIONALE_ENGINE_VERSION,
  sourceRevision: MAKEUP_RATIONALE_ENGINE_VERSION,
  provider,
  model,
  promptPolicyVersion: MAKEUP_RATIONALE_PROMPT_POLICY_VERSION,
  catalogCycleId: null,
  fallbackMode: "deterministic",
  execute,
  failureCode: (error) => error instanceof Error && error.message.startsWith("MAKEUP_") ? error.message : "MAKEUP_RATIONALE_GENERATION_FAILED",
  failureMessage: () => "AI 설명을 불러오지 못해 검증된 구조화 근거를 표시합니다.",
};

export function makeupRationaleIdempotencyKey(input: MakeupRecommendationRationaleV1) {
  return `makeup-rationale:${capabilityFingerprint({ input, promptPolicy: MAKEUP_RATIONALE_PROMPT_POLICY_VERSION, model })}`;
}

export function runMakeupRationaleCapability(input: { userId: string; consultationId: string; rationale: MakeupRecommendationRationaleV1 }): Promise<CapabilityResult<MakeupRationaleNarrativeV1> | null> {
  if (!isMakeupRationaleAiEnabled()) return Promise.resolve(null);
  return runDurableCapability(makeupRationaleAdapter, { userId: input.userId, consultationId: input.consultationId, idempotencyKey: makeupRationaleIdempotencyKey(input.rationale), input: input.rationale });
}

export function readMakeupRationaleCapability(input: { userId: string; rationale: MakeupRecommendationRationaleV1 }) {
  if (!isMakeupRationaleAiEnabled()) return Promise.resolve(null);
  return readDurableCapabilityResult(makeupRationaleAdapter, { userId: input.userId, idempotencyKey: makeupRationaleIdempotencyKey(input.rationale) });
}

export async function retryMakeupRationaleCapability(input: { userId: string; consultationId: string; rationale: MakeupRecommendationRationaleV1 }) {
  if (!isMakeupRationaleAiEnabled()) return null;
  await requestDurableCapabilityRetry({ userId: input.userId, idempotencyKey: makeupRationaleIdempotencyKey(input.rationale) });
  return runMakeupRationaleCapability(input);
}

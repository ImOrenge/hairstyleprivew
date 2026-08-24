import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import {
  MAKEUP_MODE_LABELS,
  buildMakeupProfessionalReportFallbackV1,
  makeupProfessionalReportEnvelopeStateV1,
  normalizeMakeupProfessionalReportV1,
  type MakeupArtistBrief,
  type MakeupDirectionProfessionalReportEnvelopeV1,
  type MakeupDirectionProfessionalReportInputV1,
  type MakeupDirectionProfessionalReportV1,
  type MakeupDirectionSnapshot,
  type MakeupModule,
  type MakeupRoutine,
} from "@hairfit/shared/makeup";
import { isMakeupProfessionalReportAiEnabled } from "../consulting/feature-flag";
import { readDurableCapabilityResult, requestDurableCapabilityRetry, runDurableCapability } from "./durable-runtime";
import { capabilityFingerprint, type CapabilityEngineAdapter } from "./runtime";

export const MAKEUP_PROFESSIONAL_REPORT_ENGINE_VERSION = "makeup-professional-report-v1";
export const MAKEUP_PROFESSIONAL_REPORT_PROMPT_POLICY_VERSION = "makeup-professional-report-evidence-only-v1";
const model = process.env.PROMPT_LLM_MODEL || process.env.PROMPT_RESEARCH_MODEL || "gemini-2.5-flash";
const provider = /^(gpt-|o\d|chatgpt-)/i.test(model) ? "openai" : "gemini";
const MODULE_LABELS: Record<MakeupModule, string> = { base: "베이스", brow: "눈썹", eyeshadow: "아이섀도", eyeliner: "아이라인", blush: "블러셔", lip: "립", lashes: "속눈썹" };

export function projectMakeupProfessionalReportInputV1(input: {
  snapshot: MakeupDirectionSnapshot;
  routine: MakeupRoutine;
  brief: MakeupArtistBrief;
}): MakeupDirectionProfessionalReportInputV1 {
  const { snapshot, routine, brief } = input;
  const enabledModules = brief.moduleSummaries.filter((item) => item.enabled).map((item) => item.module);
  const acceptedMode = snapshot.rationale?.acceptedMode ?? snapshot.rationale?.requestedMode;
  const facts: MakeupDirectionProfessionalReportInputV1["facts"] = [];
  facts.push({ id: "direction-decision", kind: "decision", module: null, label: "확정한 메이크업 방향", value: acceptedMode ? `${MAKEUP_MODE_LABELS[acceptedMode]} 방향을 확정했습니다.` : `${snapshot.context.presentation} 표현을 확정했습니다.` });
  snapshot.rationale?.evidence.forEach((item, index) => facts.push({ id: `fit-reason-${index}`, kind: "reason", module: null, label: item.label, value: `${item.finding}. ${item.impact}` }));
  facts.push({ id: "occasion-guidance", kind: "guidance", module: null, label: "활용 상황", value: snapshot.context.occasions.length ? `${snapshot.context.occasions.join(" · ")} 상황에 맞춘 방향입니다.` : "일상에서 활용하기 좋은 방향입니다." });
  facts.push({ id: "finish-guidance", kind: "guidance", module: null, label: "마감 선호", value: `${snapshot.context.finishPreference} 마감 선호를 반영했습니다.` });
  routine.steps.forEach((step) => facts.push({ id: `routine-${step.module}`, kind: "guidance", module: step.module, label: `${MODULE_LABELS[step.module]} 적용`, value: step.instruction }));
  brief.moduleSummaries.filter((item) => item.enabled).forEach((item) => {
    const rationale = snapshot.rationale?.modules.find((candidate) => candidate.module === item.module)?.summary;
    const exactDirection = [item.colorFamily, item.finish, item.placement.join(" · "), item.technique].filter(Boolean).join(" · ");
    facts.push({ id: `module-${item.module}`, kind: "module", module: item.module, label: `${MODULE_LABELS[item.module]} 방향`, value: [rationale, exactDirection].filter(Boolean).join(" ") || `${MODULE_LABELS[item.module]} 방향을 사용합니다.` });
  });
  [...snapshot.rationale?.limitations ?? [], ...brief.exclusions].filter(Boolean).forEach((item, index) => facts.push({ id: `limitation-${index}`, kind: "limitation", module: null, label: "확인할 점", value: item }));
  if (!facts.some((fact) => fact.kind === "reason")) facts.push({ id: "fit-reason-fallback", kind: "reason", module: null, label: "조화 기준", value: "확정한 헤어와 퍼스널 컬러 흐름에 맞춰 메이크업 방향을 연결했습니다." });
  if (!facts.some((fact) => fact.kind === "limitation")) facts.push({ id: "limitation-fallback", kind: "limitation", module: null, label: "확인할 점", value: "실제 발색과 질감은 피부 상태, 제품, 조명과 적용 방법에 따라 달라질 수 있습니다." });
  return { schemaVersion: "makeup-direction-professional-report-input-v1", enabledModules, facts, ...(snapshot.recipeBinding ? { recipeBinding: snapshot.recipeBinding } : {}) };
}

function prompt(input: MakeupDirectionProfessionalReportInputV1) {
  const modelInput = { schemaVersion: input.schemaVersion, enabledModules: input.enabledModules, facts: input.facts };
  return [
    "당신은 HairFit의 전문 메이크업 디렉터입니다.",
    "제공된 구조화 사실만 사용해 고객이 이해하기 쉬운 한국어 메이크업 결과 리포트를 작성하세요.",
    "사진, 사용자 정보, 내부 시스템을 추정하거나 언급하지 마세요.",
    "새 점수, 순위, 제품명, 제품 호수, 얼굴 특징, 의학적 판단, 수치나 시술 명세를 만들지 마세요.",
    "비활성 부위는 추천하지 말고 enabledModules 각각을 정확히 한 번 설명하세요.",
    "모든 문장은 직접 뒷받침하는 fact id를 evidenceIds로 포함하세요.",
    "summary는 3~5개, fitReasons와 applicationTips는 각각 1~4개, 부위별 summary는 1~2개로 제한하세요.",
    "JSON만 반환하세요.",
    JSON.stringify(modelInput),
  ].join("\n");
}

function lineSchema(input: MakeupDirectionProfessionalReportInputV1, module?: MakeupModule) {
  const ids = input.facts.filter((fact) => !module || fact.module === null || fact.module === module).map((fact) => fact.id);
  return { type: "object", additionalProperties: false, properties: { text: { type: "string" }, evidenceIds: { type: "array", minItems: 1, maxItems: 5, items: { type: "string", enum: ids } } }, required: ["text", "evidenceIds"] };
}

function outputSchema(input: MakeupDirectionProfessionalReportInputV1) {
  const line = lineSchema(input);
  const moduleItems = input.enabledModules.length
    ? {
        oneOf: input.enabledModules.map((module) => ({ type: "object", additionalProperties: false, properties: { module: { type: "string", enum: [module] }, summary: { type: "array", minItems: 1, maxItems: 2, items: lineSchema(input, module) } }, required: ["module", "summary"] })),
      }
    : { type: "object", additionalProperties: false, properties: { module: { type: "string", enum: [] }, summary: { type: "array", maxItems: 0, items: line } }, required: ["module", "summary"] };
  return {
    type: "object", additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", enum: ["makeup-direction-professional-report-v1"] },
      headline: { type: "string" },
      summary: { type: "array", minItems: 3, maxItems: 5, items: line },
      fitReasons: { type: "array", minItems: 1, maxItems: 4, items: line },
      moduleInsights: { type: "array", minItems: input.enabledModules.length, maxItems: input.enabledModules.length, items: moduleItems },
      applicationTips: { type: "array", minItems: 1, maxItems: 4, items: line },
    },
    required: ["schemaVersion", "headline", "summary", "fitReasons", "moduleInsights", "applicationTips"],
  };
}

function extractOpenAIText(value: unknown) {
  const direct = (value as { output_text?: unknown } | null)?.output_text;
  if (typeof direct === "string") return direct;
  const output = (value as { output?: Array<{ content?: Array<{ text?: string }> }> } | null)?.output ?? [];
  return output.flatMap((item) => item.content ?? []).map((item) => item.text).find((item): item is string => typeof item === "string") ?? null;
}

async function execute(input: MakeupDirectionProfessionalReportInputV1) {
  const source = prompt(input);
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("MAKEUP_PROFESSIONAL_REPORT_PROVIDER_UNAVAILABLE");
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: source, text: { format: { type: "json_schema", name: "makeup_professional_report", strict: true, schema: outputSchema(input) } } }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("MAKEUP_PROFESSIONAL_REPORT_PROVIDER_FAILED");
    const output = extractOpenAIText(json);
    if (!output) throw new Error("MAKEUP_PROFESSIONAL_REPORT_OUTPUT_INVALID");
    return normalizeMakeupProfessionalReportV1(JSON.parse(output), input);
  }
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("MAKEUP_PROFESSIONAL_REPORT_PROVIDER_UNAVAILABLE");
  const result = await new GoogleGenerativeAI(apiKey).getGenerativeModel({ model }).generateContent(source);
  const raw = result.response.text().replace(/^```json\s*|\s*```$/g, "").trim();
  return normalizeMakeupProfessionalReportV1(JSON.parse(raw), input);
}

const makeupProfessionalReportAdapter = (catalogCycleId: string | null): CapabilityEngineAdapter<MakeupDirectionProfessionalReportInputV1, MakeupDirectionProfessionalReportV1> => ({
  capability: "makeup-direction-professional-report-generation",
  engineVersion: MAKEUP_PROFESSIONAL_REPORT_ENGINE_VERSION,
  sourceRevision: MAKEUP_PROFESSIONAL_REPORT_ENGINE_VERSION,
  provider,
  model,
  promptPolicyVersion: MAKEUP_PROFESSIONAL_REPORT_PROMPT_POLICY_VERSION,
  catalogCycleId,
  fallbackMode: "deterministic",
  execute,
  failureCode: (error) => error instanceof Error && error.message.startsWith("MAKEUP_PROFESSIONAL_REPORT_") ? error.message : "MAKEUP_PROFESSIONAL_REPORT_GENERATION_FAILED",
  failureMessage: () => "AI 해설을 더 다듬지 못해 확정한 메이크업 방향을 기준으로 안내합니다.",
});

export function makeupProfessionalReportIdempotencyKey(input: MakeupDirectionProfessionalReportInputV1) {
  return `makeup-professional-report:${capabilityFingerprint({ input, promptPolicy: MAKEUP_PROFESSIONAL_REPORT_PROMPT_POLICY_VERSION, model })}`;
}

export function runMakeupProfessionalReportCapability(input: { userId: string; consultationId: string; reportInput: MakeupDirectionProfessionalReportInputV1 }) {
  if (!isMakeupProfessionalReportAiEnabled()) return Promise.resolve(null);
  return runDurableCapability(makeupProfessionalReportAdapter(input.reportInput.recipeBinding?.cycleId ?? null), { userId: input.userId, consultationId: input.consultationId, idempotencyKey: makeupProfessionalReportIdempotencyKey(input.reportInput), input: input.reportInput });
}

export function readMakeupProfessionalReportCapability(input: { userId: string; reportInput: MakeupDirectionProfessionalReportInputV1 }) {
  if (!isMakeupProfessionalReportAiEnabled()) return Promise.resolve(null);
  return readDurableCapabilityResult(makeupProfessionalReportAdapter(input.reportInput.recipeBinding?.cycleId ?? null), { userId: input.userId, idempotencyKey: makeupProfessionalReportIdempotencyKey(input.reportInput) });
}

export async function retryMakeupProfessionalReportCapability(input: { userId: string; consultationId: string; reportInput: MakeupDirectionProfessionalReportInputV1 }) {
  if (!isMakeupProfessionalReportAiEnabled()) return null;
  await requestDurableCapabilityRetry({ userId: input.userId, idempotencyKey: makeupProfessionalReportIdempotencyKey(input.reportInput) });
  return runMakeupProfessionalReportCapability(input);
}

export function attachMakeupProfessionalReport(
  input: MakeupDirectionProfessionalReportInputV1,
  result: CapabilityResult<MakeupDirectionProfessionalReportV1> | null,
): MakeupDirectionProfessionalReportEnvelopeV1 {
  const ready = result?.state === "completed" && result.output ? result.output : null;
  return {
    schemaVersion: "makeup-direction-professional-report-envelope-v1",
    state: makeupProfessionalReportEnvelopeStateV1(result?.state ?? null, Boolean(ready)),
    canEnhance: isMakeupProfessionalReportAiEnabled(),
    content: ready ?? buildMakeupProfessionalReportFallbackV1(input),
    outputFingerprint: ready ? result?.provenance.outputFingerprint ?? capabilityFingerprint(ready) : null,
    updatedAt: result?.updatedAt ?? null,
  };
}

export async function readMakeupProfessionalReportForArtifacts(input: { userId: string; snapshot: MakeupDirectionSnapshot; routine: MakeupRoutine; brief: MakeupArtistBrief }) {
  const reportInput = projectMakeupProfessionalReportInputV1(input);
  const result = await readMakeupProfessionalReportCapability({ userId: input.userId, reportInput });
  return attachMakeupProfessionalReport(reportInput, result);
}

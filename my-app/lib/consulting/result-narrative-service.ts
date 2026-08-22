import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import {
  CONSULTATION_RESULT_NARRATIVE_TAB_KEYS,
  buildConsultationResultNarrativeFallbackV1,
  consultationResultNarrativeStateV1,
  normalizeConsultationResultNarrativeV1,
  type ConsultationReportNarrativeEnvelopeV1,
  type ConsultationResultNarrativeFactV1,
  type ConsultationResultNarrativeInputV1,
  type ConsultationResultNarrativeTabKeyV1,
  type ConsultationResultNarrativeV1,
} from "@hairfit/shared/consulting/report-narrative";
import type { ConsultationReportSectionV2, ConsultationReportViewModelV2 } from "@hairfit/shared/consulting/report-v2";
import { readDurableCapabilityResult, requestDurableCapabilityRetry, runDurableCapability } from "../capabilities/durable-runtime";
import { capabilityFingerprint, type CapabilityEngineAdapter } from "../capabilities/runtime";
import { isConsultationResultNarrativeAiEnabled } from "./feature-flag";

export const RESULT_NARRATIVE_ENGINE_VERSION = "consultation-result-narrative-v1";
export const RESULT_NARRATIVE_PROMPT_POLICY_VERSION = "consultation-result-grounded-explanation-v1";
const model = process.env.PROMPT_LLM_MODEL || process.env.PROMPT_RESEARCH_MODEL || "gemini-2.5-flash";
const provider = /^(gpt-|o\d|chatgpt-)/i.test(model) ? "openai" : "gemini";
const INTERNAL_COPY = /(?:revision|snapshot|terminal|projection|fingerprint|pipeline|provider|model|schema|queue|slot|리비전|스냅샷|터미널|프로젝션|핑거프린트|파이프라인|프로바이더|모델|큐|슬롯)/iu;

function clean(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized && !INTERNAL_COPY.test(normalized) ? normalized.slice(0, 500) : "";
}

function sectionFacts(section: ConsultationReportSectionV2, tab: ConsultationResultNarrativeTabKeyV1) {
  const facts: Array<{ kind: ConsultationResultNarrativeFactV1["kind"]; label: string; value: string }> = [];
  const conclusion = clean(section.conclusion);
  if (conclusion) facts.push({ kind: "decision", label: section.title, value: conclusion });
  section.rationale.forEach((value) => {
    const normalized = clean(value);
    if (normalized) facts.push({ kind: "reason", label: `${section.title}의 선택 이유`, value: normalized });
  });
  section.effects.forEach((value) => {
    const normalized = clean(value);
    if (normalized) facts.push({ kind: "effect", label: `${section.title}의 기대 변화`, value: normalized });
  });
  if (section.key === "final-hair") {
    facts.push({ kind: "decision", label: "확정 헤어", value: section.payload.label });
    if (section.payload.maintenance) facts.push({ kind: "guidance", label: "헤어 관리", value: section.payload.maintenance });
  }
  if (section.key === "final-color") {
    facts.push({ kind: "decision", label: "확정 컬러", value: section.payload.colorName });
    if (section.payload.maintenance) facts.push({ kind: "guidance", label: "컬러 관리", value: section.payload.maintenance });
  }
  if (section.key === "makeup-result") {
    const mode = clean(section.payload.acceptedMode ?? section.payload.requestedMode);
    if (mode) facts.push({ kind: "decision", label: "메이크업 방향", value: mode });
  }
  if (section.key === "fashion-result") {
    const selected = section.payload.looks.find((look) => look.isSelected) ?? section.payload.looks.find((look) => look.isRecommended);
    if (selected) {
      facts.push({ kind: "decision", label: "패션 방향", value: selected.label });
      if (selected.silhouette) facts.push({ kind: "guidance", label: "실루엣", value: selected.silhouette });
    }
  }
  if (!facts.some((fact) => fact.kind === "guidance")) {
    facts.push({ kind: "guidance", label: `${section.title} 활용`, value: `${section.title}의 확정 내용과 주의점을 함께 확인하세요.` });
  }
  return facts.map((fact, index) => ({ ...fact, id: `${tab}-${section.key}-${fact.kind}-${index}`, tab } satisfies ConsultationResultNarrativeFactV1));
}

export function projectConsultationResultNarrativeInputV1(report: ConsultationReportViewModelV2): ConsultationResultNarrativeInputV1 {
  const baseFingerprint = report.narrative?.content.reportFingerprint ?? report.sourceFingerprint;
  const hasDedicatedMakeupReport = report.tabs.some((tab) => tab.key === "makeup" && tab.sections.some((section) => section.key === "makeup-result" && Boolean(section.payload.professionalReport)));
  const availableTabs = report.tabs.map((tab) => tab.key).filter((key): key is ConsultationResultNarrativeTabKeyV1 => CONSULTATION_RESULT_NARRATIVE_TAB_KEYS.includes(key as ConsultationResultNarrativeTabKeyV1) && !(key === "makeup" && hasDedicatedMakeupReport));
  const facts: ConsultationResultNarrativeFactV1[] = [
    { id: "final-report-headline", tab: "final", kind: "decision", label: "종합 결론", value: clean(report.headline) || "확인된 상담 결과를 하나의 스타일 방향으로 정리했습니다." },
  ];
  const finalSections = report.tabs.find((tab) => tab.key === "final")?.sections ?? [];
  for (const section of finalSections) {
    const conclusion = clean(section.conclusion);
    if (conclusion) facts.push({ id: `final-${section.key}-decision`, tab: "final", kind: "decision", label: section.title, value: conclusion });
    section.rationale.map(clean).filter(Boolean).slice(0, 3).forEach((value, index) => facts.push({ id: `final-${section.key}-reason-${index}`, tab: "final", kind: "reason", label: `${section.title}의 이유`, value }));
  }
  for (const tabKey of availableTabs) {
    const tab = report.tabs.find((item) => item.key === tabKey);
    for (const section of tab?.sections ?? []) {
      if (section.key === "candidate-comparison") continue;
      facts.push(...sectionFacts(section, tabKey));
    }
  }
  if (facts.filter((fact) => fact.tab === "final").length < 2) {
    facts.push({ id: "final-review-guidance", tab: "final", kind: "guidance", label: "결과 활용", value: "분야별 결과와 시술 전 확인 사항을 함께 살펴보세요." });
  }
  return { schemaVersion: "consultation-result-narrative-input-v1", reportFingerprint: baseFingerprint, availableTabs, facts };
}

function prompt(input: ConsultationResultNarrativeInputV1) {
  return [
    "당신은 HairFit의 전문 스타일 컨설턴트입니다.",
    "제공된 구조화 사실만 사용해 고객이 이해할 수 있는 상세한 한국어 결과 해설을 작성하세요.",
    "내부 시스템, 데이터 구조, 모델, 생성 상태를 설명하지 마세요.",
    "새 점수, 순위, 수치, 얼굴 특징, 시술 수치, 의학적 판단을 만들지 마세요.",
    "주의사항과 정확한 시술 명세는 다른 영역에서 원문으로 제공되므로 새로 쓰지 마세요.",
    "모든 summary, fitReasons, actions 문장에는 그 문장을 직접 뒷받침하는 입력 fact id를 evidenceIds로 넣으세요.",
    "overall summary는 3~5문장, 탭별 summary는 2~4문장으로 작성하고 나머지 목록은 최대 4개로 제한하세요.",
    "JSON만 반환하세요.",
    JSON.stringify(input),
  ].join("\n");
}

function lineSchema(input: ConsultationResultNarrativeInputV1) {
  return { type: "object", additionalProperties: false, properties: { text: { type: "string" }, evidenceIds: { type: "array", minItems: 1, maxItems: 5, items: { type: "string", enum: input.facts.map((fact) => fact.id) } } }, required: ["text", "evidenceIds"] };
}

function panelSchema(input: ConsultationResultNarrativeInputV1, overall = false) {
  const item = lineSchema(input);
  return { type: "object", additionalProperties: false, properties: { headline: { type: "string" }, summary: { type: "array", minItems: overall ? 3 : 2, maxItems: overall ? 5 : 4, items: item }, fitReasons: { type: "array", minItems: 1, maxItems: 4, items: item }, actions: { type: "array", minItems: 1, maxItems: 4, items: item } }, required: ["headline", "summary", "fitReasons", "actions"] };
}

function extractOpenAIText(value: unknown) {
  const direct = (value as { output_text?: unknown } | null)?.output_text;
  if (typeof direct === "string") return direct;
  const output = (value as { output?: Array<{ content?: Array<{ text?: string }> }> } | null)?.output ?? [];
  return output.flatMap((item) => item.content ?? []).map((item) => item.text).find((item): item is string => typeof item === "string") ?? null;
}

async function execute(input: ConsultationResultNarrativeInputV1) {
  const source = prompt(input);
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("RESULT_NARRATIVE_PROVIDER_UNAVAILABLE");
    const panel = panelSchema(input);
    const overallPanel = panelSchema(input, true);
    const tabs = Object.fromEntries(input.availableTabs.map((key) => [key, panel]));
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
      model,
      input: source,
      text: { format: { type: "json_schema", name: "consultation_result_narrative", strict: true, schema: { type: "object", additionalProperties: false, properties: { schemaVersion: { type: "string", enum: ["consultation-result-narrative-v1"] }, reportFingerprint: { type: "string", enum: [input.reportFingerprint] }, overall: overallPanel, tabs: { type: "object", additionalProperties: false, properties: tabs, required: input.availableTabs } }, required: ["schemaVersion", "reportFingerprint", "overall", "tabs"] } } },
    }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("RESULT_NARRATIVE_PROVIDER_FAILED");
    const output = extractOpenAIText(json);
    if (!output) throw new Error("RESULT_NARRATIVE_OUTPUT_INVALID");
    return normalizeConsultationResultNarrativeV1(JSON.parse(output), input);
  }
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("RESULT_NARRATIVE_PROVIDER_UNAVAILABLE");
  const result = await new GoogleGenerativeAI(apiKey).getGenerativeModel({ model }).generateContent(source);
  const raw = result.response.text().replace(/^```json\s*|\s*```$/g, "").trim();
  return normalizeConsultationResultNarrativeV1(JSON.parse(raw), input);
}

export const resultNarrativeAdapter: CapabilityEngineAdapter<ConsultationResultNarrativeInputV1, ConsultationResultNarrativeV1> = {
  capability: "consultation-result-narrative-generation",
  engineVersion: RESULT_NARRATIVE_ENGINE_VERSION,
  sourceRevision: RESULT_NARRATIVE_ENGINE_VERSION,
  provider,
  model,
  promptPolicyVersion: RESULT_NARRATIVE_PROMPT_POLICY_VERSION,
  catalogCycleId: null,
  fallbackMode: "deterministic",
  execute,
  failureCode: (error) => error instanceof Error && error.message.startsWith("RESULT_NARRATIVE_") ? error.message : "RESULT_NARRATIVE_GENERATION_FAILED",
  failureMessage: () => "AI 해설을 더 다듬지 못해 확인된 상담 결과를 기준으로 안내합니다.",
};

export function resultNarrativeIdempotencyKey(input: ConsultationResultNarrativeInputV1) {
  return `consultation-result-narrative:${capabilityFingerprint({ input, promptPolicy: RESULT_NARRATIVE_PROMPT_POLICY_VERSION, model })}`;
}

export function runConsultationResultNarrative(input: { userId: string; consultationId: string; report: ConsultationReportViewModelV2 }) {
  const narrativeInput = projectConsultationResultNarrativeInputV1(input.report);
  if (!isConsultationResultNarrativeAiEnabled()) return Promise.resolve(null);
  return runDurableCapability(resultNarrativeAdapter, { userId: input.userId, consultationId: input.consultationId, idempotencyKey: resultNarrativeIdempotencyKey(narrativeInput), input: narrativeInput });
}

export function readConsultationResultNarrative(input: { userId: string; report: ConsultationReportViewModelV2 }) {
  const narrativeInput = projectConsultationResultNarrativeInputV1(input.report);
  if (!isConsultationResultNarrativeAiEnabled()) return Promise.resolve(null);
  return readDurableCapabilityResult(resultNarrativeAdapter, { userId: input.userId, idempotencyKey: resultNarrativeIdempotencyKey(narrativeInput) });
}

export async function retryConsultationResultNarrative(input: { userId: string; consultationId: string; report: ConsultationReportViewModelV2 }) {
  const narrativeInput = projectConsultationResultNarrativeInputV1(input.report);
  if (!isConsultationResultNarrativeAiEnabled()) return null;
  await requestDurableCapabilityRetry({ userId: input.userId, idempotencyKey: resultNarrativeIdempotencyKey(narrativeInput) });
  return runConsultationResultNarrative(input);
}

export function attachConsultationResultNarrative(
  report: ConsultationReportViewModelV2,
  result: CapabilityResult<ConsultationResultNarrativeV1> | null,
): ConsultationReportViewModelV2 {
  const input = projectConsultationResultNarrativeInputV1(report);
  const ready = result?.state === "completed" && result.output ? result.output : null;
  const state: ConsultationReportNarrativeEnvelopeV1["state"] = consultationResultNarrativeStateV1(result?.state ?? null, Boolean(ready));
  const narrative: ConsultationReportNarrativeEnvelopeV1 = {
    schemaVersion: "consultation-report-narrative-envelope-v1",
    state,
    canEnhance: isConsultationResultNarrativeAiEnabled(),
    content: ready ?? buildConsultationResultNarrativeFallbackV1(input),
    outputFingerprint: ready ? result?.provenance.outputFingerprint ?? capabilityFingerprint(ready) : null,
    updatedAt: result?.updatedAt ?? null,
  };
  if (!narrative.outputFingerprint) return { ...report, narrative };
  const combinedFingerprint = capabilityFingerprint({ report: report.sourceFingerprint, narrative: narrative.outputFingerprint });
  return {
    ...report,
    sourceFingerprint: combinedFingerprint,
    provenance: { ...report.provenance, fingerprint: combinedFingerprint },
    integrityCode: combinedFingerprint.slice(0, 12),
    narrative,
  };
}

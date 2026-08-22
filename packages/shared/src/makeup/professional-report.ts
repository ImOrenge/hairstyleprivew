import type { MakeupModule } from "./contract.ts";

export type MakeupProfessionalReportFactKindV1 = "decision" | "reason" | "guidance" | "limitation" | "module";

export interface MakeupProfessionalReportFactV1 {
  id: string;
  kind: MakeupProfessionalReportFactKindV1;
  module: MakeupModule | null;
  label: string;
  value: string;
}

export interface MakeupDirectionProfessionalReportInputV1 {
  schemaVersion: "makeup-direction-professional-report-input-v1";
  enabledModules: MakeupModule[];
  facts: MakeupProfessionalReportFactV1[];
}

export interface MakeupProfessionalReportLineV1 {
  text: string;
  evidenceIds: string[];
}

export interface MakeupProfessionalReportModuleInsightV1 {
  module: MakeupModule;
  summary: MakeupProfessionalReportLineV1[];
}

export interface MakeupDirectionProfessionalReportV1 {
  schemaVersion: "makeup-direction-professional-report-v1";
  headline: string;
  summary: MakeupProfessionalReportLineV1[];
  fitReasons: MakeupProfessionalReportLineV1[];
  moduleInsights: MakeupProfessionalReportModuleInsightV1[];
  applicationTips: MakeupProfessionalReportLineV1[];
}

export interface MakeupDirectionProfessionalReportEnvelopeV1 {
  schemaVersion: "makeup-direction-professional-report-envelope-v1";
  state: "fallback" | "preparing" | "ready" | "failed";
  canEnhance: boolean;
  content: MakeupDirectionProfessionalReportV1;
  outputFingerprint: string | null;
  updatedAt: string | null;
}

const INTERNAL_TERMS = /(?:revision|snapshot|terminal|projection|fingerprint|pipeline|provider|model|schema|queue|slot|리비전|스냅샷|터미널|프로젝션|핑거프린트|파이프라인|프로바이더|모델|큐|슬롯)/iu;
const UNSUPPORTED_TERMS = /(?:완치|치료|질환|의학적|의료적 진단|제품\s*호수|브랜드명|제품명)/u;
const NUMBER_TOKEN = /\d+(?:[.,]\d+)?/g;
const LATIN_TOKEN = /[a-z][a-z0-9-]*/giu;
const FACE_FEATURE_TERMS = ["얼굴형", "광대", "턱선", "콧대", "이마", "눈매", "쌍꺼풀", "입술 두께"] as const;

function normalizeText(value: unknown, maximum: number) {
  if (typeof value !== "string") throw new Error("MAKEUP_PROFESSIONAL_REPORT_TEXT_INVALID");
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maximum || INTERNAL_TERMS.test(normalized) || UNSUPPORTED_TERMS.test(normalized)) {
    throw new Error("MAKEUP_PROFESSIONAL_REPORT_TEXT_INVALID");
  }
  return normalized;
}

function numberTokens(value: string) {
  return value.match(NUMBER_TOKEN) ?? [];
}

function assertGroundedLanguage(text: string, facts: MakeupProfessionalReportFactV1[]) {
  if (numberTokens(text).length) throw new Error("MAKEUP_PROFESSIONAL_REPORT_NUMBER_UNGROUNDED");
  const source = facts.map((fact) => fact.value).join(" ");
  const sourceLatin = new Set((source.match(LATIN_TOKEN) ?? []).map((token) => token.toLocaleLowerCase()));
  if ((text.match(LATIN_TOKEN) ?? []).some((token) => !sourceLatin.has(token.toLocaleLowerCase()))) {
    throw new Error("MAKEUP_PROFESSIONAL_REPORT_PRODUCT_UNGROUNDED");
  }
  if (FACE_FEATURE_TERMS.some((term) => text.includes(term) && !source.includes(term))) {
    throw new Error("MAKEUP_PROFESSIONAL_REPORT_FACE_FEATURE_UNGROUNDED");
  }
}

function normalizeLines(
  value: unknown,
  input: MakeupDirectionProfessionalReportInputV1,
  options: { minimum: number; maximum: number; module?: MakeupModule },
) {
  if (!Array.isArray(value) || value.length < options.minimum || value.length > options.maximum) {
    throw new Error("MAKEUP_PROFESSIONAL_REPORT_LINES_INVALID");
  }
  const facts = input.facts.filter((fact) => !options.module || fact.module === null || fact.module === options.module);
  const allowed = new Set(facts.map((fact) => fact.id));
  return value.map((item) => {
    const row = item as { text?: unknown; evidenceIds?: unknown } | null;
    const text = normalizeText(row?.text, 360);
    const evidenceIds = Array.isArray(row?.evidenceIds)
      ? row.evidenceIds.filter((id): id is string => typeof id === "string")
      : [];
    if (!evidenceIds.length || evidenceIds.length > 5 || evidenceIds.some((id) => !allowed.has(id))) {
      throw new Error("MAKEUP_PROFESSIONAL_REPORT_EVIDENCE_INVALID");
    }
    assertGroundedLanguage(text, facts);
    return { text, evidenceIds: Array.from(new Set(evidenceIds)) };
  });
}

function grounded(fact: MakeupProfessionalReportFactV1, prefix = ""): MakeupProfessionalReportLineV1 {
  return { text: `${prefix}${fact.value}`.trim(), evidenceIds: [fact.id] };
}

function firstFact(input: MakeupDirectionProfessionalReportInputV1, kind: MakeupProfessionalReportFactKindV1, module?: MakeupModule) {
  return input.facts.find((fact) => fact.kind === kind && (!module || fact.module === module));
}

export function buildMakeupProfessionalReportFallbackV1(input: MakeupDirectionProfessionalReportInputV1): MakeupDirectionProfessionalReportV1 {
  const decision = firstFact(input, "decision") ?? input.facts[0];
  const reason = firstFact(input, "reason") ?? decision;
  const guidance = firstFact(input, "guidance") ?? reason;
  const limitation = firstFact(input, "limitation") ?? guidance;
  if (!decision) throw new Error("MAKEUP_PROFESSIONAL_REPORT_FACTS_REQUIRED");
  return {
    schemaVersion: "makeup-direction-professional-report-v1",
    headline: "확정한 분위기를 실제 메이크업으로 연결했어요",
    summary: [
      grounded(decision),
      grounded(reason, reason.id === decision.id ? "선택한 방향을 중심으로 " : ""),
      grounded(guidance, guidance.id === reason.id ? "실제 적용에서는 " : ""),
    ],
    fitReasons: [grounded(reason)],
    moduleInsights: input.enabledModules.map((module) => {
      const fact = firstFact(input, "module", module) ?? reason;
      return { module, summary: [grounded(fact)] };
    }),
    applicationTips: [grounded(guidance), grounded(limitation, limitation.id === guidance.id ? "마지막으로 " : "")],
  };
}

export function normalizeMakeupProfessionalReportV1(
  value: unknown,
  input: MakeupDirectionProfessionalReportInputV1,
): MakeupDirectionProfessionalReportV1 {
  const source = value as Partial<MakeupDirectionProfessionalReportV1> | null;
  if (!source || source.schemaVersion !== "makeup-direction-professional-report-v1") {
    throw new Error("MAKEUP_PROFESSIONAL_REPORT_OUTPUT_INVALID");
  }
  if (!Array.isArray(source.moduleInsights) || source.moduleInsights.length !== input.enabledModules.length) {
    throw new Error("MAKEUP_PROFESSIONAL_REPORT_MODULES_INVALID");
  }
  const moduleInsights = source.moduleInsights.map((item) => {
    const row = item as Partial<MakeupProfessionalReportModuleInsightV1>;
    if (!row.module || !input.enabledModules.includes(row.module)) throw new Error("MAKEUP_PROFESSIONAL_REPORT_MODULE_INVALID");
    return { module: row.module, summary: normalizeLines(row.summary, input, { minimum: 1, maximum: 2, module: row.module }) };
  });
  if (new Set(moduleInsights.map((item) => item.module)).size !== input.enabledModules.length) {
    throw new Error("MAKEUP_PROFESSIONAL_REPORT_MODULES_INVALID");
  }
  return {
    schemaVersion: "makeup-direction-professional-report-v1",
    headline: (() => {
      const headline = normalizeText(source.headline, 120);
      assertGroundedLanguage(headline, input.facts);
      return headline;
    })(),
    summary: normalizeLines(source.summary, input, { minimum: 3, maximum: 5 }),
    fitReasons: normalizeLines(source.fitReasons, input, { minimum: 1, maximum: 4 }),
    moduleInsights,
    applicationTips: normalizeLines(source.applicationTips, input, { minimum: 1, maximum: 4 }),
  };
}

export function makeupProfessionalReportEnvelopeStateV1(resultState: string | null, hasOutput: boolean): MakeupDirectionProfessionalReportEnvelopeV1["state"] {
  if (resultState === "completed" && hasOutput) return "ready";
  if (resultState === "failed" || resultState === "retry_required") return "failed";
  return resultState ? "preparing" : "fallback";
}

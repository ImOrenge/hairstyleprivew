export const CONSULTATION_RESULT_NARRATIVE_TAB_KEYS = ["hair", "color", "makeup", "fashion"] as const;
export type ConsultationResultNarrativeTabKeyV1 = (typeof CONSULTATION_RESULT_NARRATIVE_TAB_KEYS)[number];

export type ConsultationResultNarrativeFactKindV1 = "decision" | "reason" | "effect" | "guidance";

export interface ConsultationResultNarrativeFactV1 {
  id: string;
  tab: "final" | ConsultationResultNarrativeTabKeyV1;
  kind: ConsultationResultNarrativeFactKindV1;
  label: string;
  value: string;
}

export interface ConsultationResultNarrativeInputV1 {
  schemaVersion: "consultation-result-narrative-input-v1";
  reportFingerprint: string;
  availableTabs: ConsultationResultNarrativeTabKeyV1[];
  facts: ConsultationResultNarrativeFactV1[];
}

export interface ConsultationResultNarrativeLineV1 {
  text: string;
  evidenceIds: string[];
}

export interface ConsultationResultNarrativePanelV1 {
  headline: string;
  summary: ConsultationResultNarrativeLineV1[];
  fitReasons: ConsultationResultNarrativeLineV1[];
  actions: ConsultationResultNarrativeLineV1[];
}

export interface ConsultationResultNarrativeV1 {
  schemaVersion: "consultation-result-narrative-v1";
  reportFingerprint: string;
  overall: ConsultationResultNarrativePanelV1;
  tabs: Partial<Record<ConsultationResultNarrativeTabKeyV1, ConsultationResultNarrativePanelV1>>;
}

export interface ConsultationReportNarrativeEnvelopeV1 {
  schemaVersion: "consultation-report-narrative-envelope-v1";
  state: "fallback" | "preparing" | "ready" | "failed";
  canEnhance: boolean;
  content: ConsultationResultNarrativeV1;
  outputFingerprint: string | null;
  updatedAt: string | null;
}

const INTERNAL_TERMS = /(?:revision|snapshot|terminal|projection|fingerprint|pipeline|provider|model|schema|queue|slot|리비전|스냅샷|터미널|프로젝션|핑거프린트|파이프라인|프로바이더|모델|큐|슬롯)/iu;
const UNSUPPORTED_MEDICAL_TERMS = /(?:완치|치료|질환|의학적|의료적 진단)/u;
const NUMBER_TOKEN = /\d+(?:[.,]\d+)?/g;

function text(value: unknown, max: number) {
  if (typeof value !== "string") throw new Error("RESULT_NARRATIVE_TEXT_INVALID");
  const normalized = value.trim();
  if (!normalized || normalized.length > max || INTERNAL_TERMS.test(normalized) || UNSUPPORTED_MEDICAL_TERMS.test(normalized)) {
    throw new Error("RESULT_NARRATIVE_TEXT_INVALID");
  }
  return normalized;
}

function numberTokens(value: string) {
  return value.match(NUMBER_TOKEN) ?? [];
}

function normalizeLines(
  value: unknown,
  input: ConsultationResultNarrativeInputV1,
  options: { minimum: number; maximum: number },
  tab: ConsultationResultNarrativeTabKeyV1 | null,
): ConsultationResultNarrativeLineV1[] {
  if (!Array.isArray(value) || value.length < options.minimum || value.length > options.maximum) {
    throw new Error("RESULT_NARRATIVE_LINES_INVALID");
  }
  const allowed = new Set(input.facts.filter((fact) => tab === null || fact.tab === tab).map((fact) => fact.id));
  const sourceNumbers = new Set(numberTokens(input.facts.filter((fact) => tab === null || fact.tab === tab).map((fact) => fact.value).join(" ")));
  return value.map((item) => {
    const row = item as { text?: unknown; evidenceIds?: unknown } | null;
    const normalizedText = text(row?.text, 360);
    const evidenceIds = Array.isArray(row?.evidenceIds)
      ? row.evidenceIds.filter((id): id is string => typeof id === "string")
      : [];
    if (!evidenceIds.length || evidenceIds.length > 5 || evidenceIds.some((id) => !allowed.has(id))) {
      throw new Error("RESULT_NARRATIVE_EVIDENCE_INVALID");
    }
    if (numberTokens(normalizedText).some((token) => !sourceNumbers.has(token))) {
      throw new Error("RESULT_NARRATIVE_NUMBER_UNGROUNDED");
    }
    return { text: normalizedText, evidenceIds: Array.from(new Set(evidenceIds)) };
  });
}

function normalizePanel(value: unknown, input: ConsultationResultNarrativeInputV1, tab: ConsultationResultNarrativeTabKeyV1 | null): ConsultationResultNarrativePanelV1 {
  const panel = value as Partial<ConsultationResultNarrativePanelV1> | null;
  if (!panel) throw new Error("RESULT_NARRATIVE_PANEL_INVALID");
  return {
    headline: text(panel.headline, 120),
    summary: normalizeLines(panel.summary, input, tab === null ? { minimum: 3, maximum: 5 } : { minimum: 2, maximum: 4 }, tab),
    fitReasons: normalizeLines(panel.fitReasons, input, { minimum: 1, maximum: 4 }, tab),
    actions: normalizeLines(panel.actions, input, { minimum: 1, maximum: 4 }, tab),
  };
}

function groundedLine(fact: ConsultationResultNarrativeFactV1, prefix = ""): ConsultationResultNarrativeLineV1 {
  return { text: `${prefix}${fact.value}`.trim(), evidenceIds: [fact.id] };
}

function fallbackPanel(
  facts: ConsultationResultNarrativeFactV1[],
  headline: string,
  summaryCount: 2 | 3,
): ConsultationResultNarrativePanelV1 {
  const usable = facts.length ? facts : [{ id: "fallback", tab: "final", kind: "guidance", label: "결과", value: "확인된 결과를 기준으로 안내합니다." } satisfies ConsultationResultNarrativeFactV1];
  const first = usable[0];
  const second = usable[1] ?? first;
  const third = usable[2] ?? second;
  const reason = usable.find((fact) => fact.kind === "reason" || fact.kind === "effect") ?? second;
  const action = usable.find((fact) => fact.kind === "guidance") ?? usable.at(-1)!;
  const summary = [
    groundedLine(first),
    groundedLine(second, second.id === first.id ? "이 방향을 중심으로 세부 결과를 함께 확인해 보세요. " : ""),
  ];
  if (summaryCount === 3) summary.push(groundedLine(third, third.id === second.id ? "분야별 추천도 같은 방향으로 이어집니다. " : ""));
  return { headline, summary, fitReasons: [groundedLine(reason)], actions: [groundedLine(action)] };
}

export function buildConsultationResultNarrativeFallbackV1(input: ConsultationResultNarrativeInputV1): ConsultationResultNarrativeV1 {
  const tabs: ConsultationResultNarrativeV1["tabs"] = {};
  const labels: Record<ConsultationResultNarrativeTabKeyV1, string> = { hair: "헤어 결과 해설", color: "컬러 결과 해설", makeup: "메이크업 결과 해설", fashion: "패션 결과 해설" };
  for (const key of input.availableTabs) tabs[key] = fallbackPanel(input.facts.filter((fact) => fact.tab === key), labels[key], 2);
  return {
    schemaVersion: "consultation-result-narrative-v1",
    reportFingerprint: input.reportFingerprint,
    overall: fallbackPanel(input.facts, "당신의 결과를 하나의 스타일로 정리했어요", 3),
    tabs,
  };
}

export function consultationResultNarrativeStateV1(resultState: string | null, hasOutput: boolean): ConsultationReportNarrativeEnvelopeV1["state"] {
  if (resultState === "completed" && hasOutput) return "ready";
  if (resultState === "failed" || resultState === "retry_required") return "failed";
  return resultState ? "preparing" : "fallback";
}

export function normalizeConsultationResultNarrativeV1(
  value: unknown,
  input: ConsultationResultNarrativeInputV1,
): ConsultationResultNarrativeV1 {
  const source = value as Partial<ConsultationResultNarrativeV1> | null;
  if (!source || source.schemaVersion !== "consultation-result-narrative-v1" || source.reportFingerprint !== input.reportFingerprint) {
    throw new Error("RESULT_NARRATIVE_OUTPUT_INVALID");
  }
  const rawTabs = source.tabs && typeof source.tabs === "object" ? source.tabs : {};
  const tabs: ConsultationResultNarrativeV1["tabs"] = {};
  for (const key of input.availableTabs) {
    const panel = (rawTabs as Record<string, unknown>)[key];
    if (!panel) throw new Error("RESULT_NARRATIVE_TAB_MISSING");
    tabs[key] = normalizePanel(panel, input, key);
  }
  for (const key of Object.keys(rawTabs)) {
    if (!input.availableTabs.includes(key as ConsultationResultNarrativeTabKeyV1)) throw new Error("RESULT_NARRATIVE_TAB_INVALID");
  }
  return {
    schemaVersion: "consultation-result-narrative-v1",
    reportFingerprint: input.reportFingerprint,
    overall: normalizePanel(source.overall, input, null),
    tabs,
  };
}

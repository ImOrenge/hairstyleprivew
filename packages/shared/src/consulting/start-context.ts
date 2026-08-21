export const OPTIONAL_OPENING_INTENTS = [
  "leave_it_to_ai",
  "tidy_current_impression",
  "natural_change",
  "clear_change",
] as const;

export type OptionalOpeningIntent = (typeof OPTIONAL_OPENING_INTENTS)[number];
export type ConsultationStartDisposition = "direct_analysis" | "optional_intent_answered" | "legacy_intent_confirmed";
export type ConsultationValueSource = "user" | "onboarding" | "entry_route" | "system_default" | "ai_observation" | "ai_followup" | "salon_confirmation";

export interface ConsultationStartContextV1 {
  schemaVersion: "consultation-start-context-v1";
  disposition: ConsultationStartDisposition;
  optionalOpeningIntent: OptionalOpeningIntent | null;
  optionalNote: string | null;
  fieldSources: {
    optionalOpeningIntent: ConsultationValueSource | null;
    optionalNote: ConsultationValueSource | null;
  };
  sourceProfileId: string | null;
  revision: number;
  startedAt: string;
  updatedAt: string;
}

export interface EffectiveConsultationIntentV3 {
  schemaVersion: "effective-consultation-intent-v3";
  scope: "hair" | "hair_color" | "total_styling";
  changeLevel: "maintain" | "natural_change" | "clear_change" | "undecided";
  scopeSource: ConsultationValueSource;
  changeLevelSource: ConsultationValueSource | null;
  exclusions: Array<{ code: string; state: "selected" | "none" | "unknown"; source: ConsultationValueSource | null }>;
  unresolvedSafetyFieldIds: string[];
  fingerprint: string;
}

type LegacyIntent = {
  scope?: string;
  changeLevel?: string;
  exclusions?: string[];
  exclusionsConfirmed?: boolean;
  confirmedAt?: string | null;
} | null | undefined;

function legacyScope(value: string | undefined): EffectiveConsultationIntentV3["scope"] | null {
  return value === "hair" || value === "hair_color" || value === "total_styling" ? value : null;
}

function legacyChange(value: string | undefined): EffectiveConsultationIntentV3["changeLevel"] | null {
  return value === "maintain" || value === "natural_change" || value === "clear_change" ? value : null;
}

function startChange(value: OptionalOpeningIntent | null): EffectiveConsultationIntentV3["changeLevel"] {
  if (value === "tidy_current_impression") return "maintain";
  if (value === "natural_change") return "natural_change";
  if (value === "clear_change") return "clear_change";
  return "undecided";
}

export function createConsultationStartContext(input: {
  now: string;
  disposition?: ConsultationStartDisposition;
  optionalOpeningIntent?: OptionalOpeningIntent | null;
  optionalNote?: string | null;
  sourceProfileId?: string | null;
  revision?: number;
}): ConsultationStartContextV1 {
  const openingIntent = input.optionalOpeningIntent ?? null;
  const note = input.optionalNote?.trim() || null;
  const answered = Boolean(openingIntent || note);
  return {
    schemaVersion: "consultation-start-context-v1",
    disposition: input.disposition ?? (answered ? "optional_intent_answered" : "direct_analysis"),
    optionalOpeningIntent: openingIntent,
    optionalNote: note,
    fieldSources: {
      optionalOpeningIntent: openingIntent ? "user" : null,
      optionalNote: note ? "user" : null,
    },
    sourceProfileId: input.sourceProfileId ?? null,
    revision: Math.max(1, input.revision ?? 1),
    startedAt: input.now,
    updatedAt: input.now,
  };
}

export function isConsultationStartContextReady(value: ConsultationStartContextV1 | null | undefined) {
  return Boolean(value
    && value.schemaVersion === "consultation-start-context-v1"
    && ["direct_analysis", "optional_intent_answered", "legacy_intent_confirmed"].includes(value.disposition)
    && Number.isInteger(value.revision)
    && value.revision > 0
    && value.startedAt
    && value.updatedAt);
}

export function deriveEffectiveConsultationIntent(input: {
  startContext?: ConsultationStartContextV1 | null;
  legacyIntent?: LegacyIntent;
}): EffectiveConsultationIntentV3 {
  const confirmedLegacy = Boolean(input.legacyIntent?.confirmedAt);
  const scope = legacyScope(input.legacyIntent?.scope) ?? "total_styling";
  const startLevel = startChange(input.startContext?.optionalOpeningIntent ?? null);
  const changeLevel = confirmedLegacy ? legacyChange(input.legacyIntent?.changeLevel) ?? "undecided" : startLevel;
  const selectedExclusions = confirmedLegacy && input.legacyIntent?.exclusionsConfirmed
    ? [...new Set(input.legacyIntent.exclusions ?? [])]
    : [];
  const exclusions = selectedExclusions.length
    ? selectedExclusions.map((code) => ({ code, state: "selected" as const, source: "user" as const }))
    : [{ code: "all", state: confirmedLegacy && input.legacyIntent?.exclusionsConfirmed ? "none" as const : "unknown" as const, source: confirmedLegacy ? "user" as const : null }];
  const canonical = JSON.stringify({
    scope,
    changeLevel,
    scopeSource: confirmedLegacy ? "user" : "system_default",
    changeLevelSource: confirmedLegacy ? "user" : startLevel === "undecided" ? null : "user",
    exclusions,
    startRevision: input.startContext?.revision ?? null,
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const fingerprint = Array.from({ length: 8 }, (_, index) => ((hash + Math.imul(index + 1, 2654435761)) >>> 0).toString(16).padStart(8, "0")).join("");
  return {
    schemaVersion: "effective-consultation-intent-v3",
    scope,
    changeLevel,
    scopeSource: confirmedLegacy ? "user" : "system_default",
    changeLevelSource: confirmedLegacy ? "user" : startLevel === "undecided" ? null : "user",
    exclusions,
    unresolvedSafetyFieldIds: confirmedLegacy && input.legacyIntent?.exclusionsConfirmed ? [] : ["chemical_history", "scalp_sensitivity"],
    fingerprint,
  };
}

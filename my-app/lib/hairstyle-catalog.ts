import { randomUUID } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseAdminClient } from "./supabase";
import {
  HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION,
  buildCatalogRowsForCycle,
  buildKoreanWeeklyStyleQueries,
  type BlueprintTrendSignal,
} from "./hairstyle-catalog-seed";
import { collectKoreanHairstyleTrendResearch } from "./hairstyle-trend-research";
import type {
  CatalogBackedRecommendationCandidate,
  CatalogSelectionContext,
  FaceAnalysisSummary,
  HairstyleCatalogActiveCycle,
  HairstyleCatalogCycle,
  HairstyleCatalogLineupRow,
  HairstyleCatalogSourceSummary,
  HairstyleCatalogRow,
  MemberStyleTarget,
  RecommendationCorrectionFocus,
  RecommendationLengthBucket,
} from "./recommendation-types";

const ANALYSIS_SYSTEM_PROMPT = `
You are an expert Korean hairstyle consultant.
Analyze the provided frontal portrait photo and return strict JSON only.
Do not describe clothing, makeup, or background.
Focus on the person's head balance, silhouette, and haircut suitability.

Allowed JSON schema:
{
  "faceShape": "short string",
  "headShape": "short string",
  "foreheadExposure": "short string",
  "observedPartingShape": "short string",
  "recommendedPartingShape": "short string",
  "partingStrategy": "short string",
  "balance": "short string",
  "bestLengthStrategy": "short string",
  "volumeFocus": ["short string"],
  "avoidNotes": ["short string"],
  "summary": "one sentence"
}

Rules:
- Read the current visible parting separately from the recommended parting direction.
- observedPartingShape should use concise hair terms such as center part, left side part, right side part, soft off-center part, curtain part, or bangs/no clear parting.
- recommendedPartingShape must consider face shape, forehead exposure, hairline, temple balance, jawline balance, and crown volume.
- If the visible parting is unclear, covered by bangs, or not reliable, recommend a conservative soft off-center parting unless full bangs are clearly the better fit.
- partingStrategy should explain the recommended parting in one short generation-safe phrase.
`;

export const RECOMMENDATION_PROMPT_VERSION = "catalog-backed-grid-v2";

export type CatalogRebuildMode = "auto" | "researched" | "seeded";
type CatalogSourceMode = "researched-weekly" | "seeded-weekly";
type CatalogRebuildStatus = "succeeded" | "skipped";
type CatalogSkipReason = "not_due" | "dry_run";
type CatalogLineupSlotKey = "trend" | "face_fit" | "evergreen" | "experimental";

const CATALOG_MARKET = "kr";
const CATALOG_BOOTSTRAP_MAX_POLLS = 8;
const CATALOG_BOOTSTRAP_POLL_MS = 500;
const UNIQUE_CONSTRAINT_VIOLATION_CODE = "23505";
const CATALOG_ROTATION_TTL_DAYS = 7;
const TARGET_BLUEPRINT_POOL_SIZE = 32;
const TARGET_STYLE_TARGET_POOL_SIZE = 18;
const MIN_STYLE_TARGET_RECOMMENDATION_ROWS = 9;
const AUTOMATIC_ROTATION_CRON_UTC_HOUR = 0;
const AUTOMATIC_ROTATION_CRON_UTC_MINUTE = 20;
const DEFAULT_OBSERVED_PARTING = "soft off-center parting";
const DEFAULT_RECOMMENDED_PARTING = "soft off-center parting";
const DEFAULT_PARTING_STRATEGY =
  "Use a conservative soft off-center parting to balance forehead exposure and side volume.";
const PARTING_MATCH_TOKENS = new Set([
  "bang",
  "bangs",
  "center",
  "comma",
  "curtain",
  "forehead",
  "fringe",
  "left",
  "middle",
  "off",
  "open",
  "part",
  "parting",
  "right",
  "side",
]);

interface QueryError {
  message: string;
  code?: string;
}

interface CatalogRebuildResult {
  cycleId: string | null;
  status: CatalogRebuildStatus;
  skipReason?: CatalogSkipReason;
  activeCycleId: string | null;
  activated: boolean;
  dryRun: boolean;
  insertedCount: number;
  updatedCount: number;
  itemCount: number;
  sourceSummary: HairstyleCatalogSourceSummary;
  requestedMode: CatalogRebuildMode;
  resolvedMode: CatalogSourceMode;
  validation: CatalogValidationResult;
  activatedAt: string | null;
  expiresAt: string | null;
  nextAutomaticAttemptAt: string;
  trendAlertId: string | null;
  trendAlertScheduledSendAt: string | null;
  staleRunningCyclesFailed: number;
}

interface CatalogRebuildOptions {
  mode: CatalogRebuildMode;
  force: boolean;
  onlyIfDue: boolean;
  activate: boolean;
  dryRun: boolean;
  reason: string;
  notify: boolean | null;
  notifyPlans: string[];
  notifyDelayMinutes: number;
}

interface CatalogValidationResult {
  passed: boolean;
  rowCount: number;
  requiredRowCount: number;
  targetBlueprintCount: number;
  maleCandidateCount: number;
  femaleCandidateCount: number;
  targetStyleTargetCount: number;
  promptTemplateVersion: string;
  promptVersionMismatchCount: number;
  lineupCounts: Record<MemberStyleTarget, number>;
  warnings: string[];
}

interface CatalogLineupInsert {
  cycle_id: string;
  market: string;
  style_target: MemberStyleTarget;
  slot_key: CatalogLineupSlotKey;
  rank: number;
  catalog_item_id: string;
  rotation_score: number;
  selection_reason: string;
}

interface CatalogAvailabilityResult {
  activeCycle: HairstyleCatalogActiveCycle;
  cycle: HairstyleCatalogCycle;
  rows: HairstyleCatalogRow[];
  lineups: HairstyleCatalogLineupRow[];
}

interface ActiveCatalogCycleResult {
  activeCycle: HairstyleCatalogActiveCycle;
  cycle: HairstyleCatalogCycle;
}

interface SupabaseSelectResponse {
  data: Array<Record<string, unknown>> | Record<string, unknown> | null;
  error: QueryError | null;
}

interface SupabaseSingleResponse {
  data: Record<string, unknown> | null;
  error: QueryError | null;
}

interface SupabaseSelectBuilder extends PromiseLike<SupabaseSelectResponse> {
  eq: (column: string, value: string) => SupabaseSelectBuilder;
  in: (column: string, values: string[]) => SupabaseSelectBuilder;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseSelectBuilder;
  limit: (count: number) => SupabaseSelectBuilder;
  maybeSingle: () => Promise<SupabaseSingleResponse>;
  single: () => Promise<SupabaseSingleResponse>;
}

interface SupabaseCatalogClient {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<SupabaseSingleResponse>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: QueryError | null }>;
    };
    select: (columns: string) => SupabaseSelectBuilder;
    upsert: (
      values: Record<string, unknown>[],
      options: { onConflict: string },
    ) => Promise<{ error: QueryError | null }>;
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: QueryError | null;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1] || "image/png",
    data: match[2] || "",
  };
}

function parseJsonResponse<T>(text: string): T | null {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as T;
  } catch {
    return null;
  }
}

function normalizeAnalysis(raw: unknown): FaceAnalysisSummary | null {
  if (!isRecord(raw)) {
    return null;
  }

  const volumeFocus = Array.isArray(raw.volumeFocus)
    ? raw.volumeFocus.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
    : [];
  const avoidNotes = Array.isArray(raw.avoidNotes)
    ? raw.avoidNotes.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
    : [];

  const faceShape = typeof raw.faceShape === "string" ? cleanText(raw.faceShape) : "";
  const headShape = typeof raw.headShape === "string" ? cleanText(raw.headShape) : "";
  const foreheadExposure = typeof raw.foreheadExposure === "string" ? cleanText(raw.foreheadExposure) : "";
  const observedPartingShape =
    typeof raw.observedPartingShape === "string" ? cleanText(raw.observedPartingShape) : "";
  const recommendedPartingShape =
    typeof raw.recommendedPartingShape === "string" ? cleanText(raw.recommendedPartingShape) : "";
  const partingStrategy = typeof raw.partingStrategy === "string" ? cleanText(raw.partingStrategy) : "";
  const balance = typeof raw.balance === "string" ? cleanText(raw.balance) : "";
  const bestLengthStrategy = typeof raw.bestLengthStrategy === "string" ? cleanText(raw.bestLengthStrategy) : "";
  const summary = typeof raw.summary === "string" ? cleanText(raw.summary) : "";

  if (!faceShape || !headShape || !balance || !summary) {
    return null;
  }

  return {
    faceShape,
    headShape,
    foreheadExposure: foreheadExposure || "balanced forehead exposure",
    observedPartingShape: observedPartingShape || DEFAULT_OBSERVED_PARTING,
    recommendedPartingShape: recommendedPartingShape || DEFAULT_RECOMMENDED_PARTING,
    partingStrategy: partingStrategy || DEFAULT_PARTING_STRATEGY,
    balance,
    bestLengthStrategy: bestLengthStrategy || "medium lengths with controlled volume",
    volumeFocus: volumeFocus.length > 0 ? volumeFocus : ["crown", "temple"],
    avoidNotes,
    summary,
  };
}

function buildFallbackAnalysis(): FaceAnalysisSummary {
  return {
    faceShape: "balanced oval",
    headShape: "symmetrical frontal head shape",
    foreheadExposure: "moderate forehead exposure",
    observedPartingShape: DEFAULT_OBSERVED_PARTING,
    recommendedPartingShape: DEFAULT_RECOMMENDED_PARTING,
    partingStrategy: DEFAULT_PARTING_STRATEGY,
    balance: "balanced proportions that suit controlled volume",
    bestLengthStrategy: "medium to long cuts with soft face framing",
    volumeFocus: ["crown", "temple", "jawline"],
    avoidNotes: ["avoid extreme bulk", "avoid heavy opaque bangs"],
    summary: "Balanced proportions suit soft volume and clean face-framing silhouettes.",
  };
}

function tokenize(value: string): string[] {
  return cleanText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function tokenizeParting(value: string): string[] {
  return tokenize(value).filter((token) => PARTING_MATCH_TOKENS.has(token));
}

function isMemberStyleTarget(value: unknown): value is MemberStyleTarget {
  return value === "male" || value === "female";
}

function normalizeStyleTargets(raw: unknown): MemberStyleTarget[] {
  if (!Array.isArray(raw)) {
    return ["male", "female"];
  }

  const targets = raw.filter(isMemberStyleTarget);
  return targets.length > 0 ? Array.from(new Set(targets)) : ["male", "female"];
}

function normalizeCatalogRow(raw: Record<string, unknown>): HairstyleCatalogRow | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  const slug = typeof raw.slug === "string" ? raw.slug : "";
  const nameKo = typeof raw.name_ko === "string" ? raw.name_ko : "";
  const description = typeof raw.description === "string" ? raw.description : "";
  const market = typeof raw.market === "string" ? raw.market : "";
  const lengthBucket = raw.length_bucket;
  const silhouette = typeof raw.silhouette === "string" ? raw.silhouette : "";
  const texture = typeof raw.texture === "string" ? raw.texture : "";
  const bangType = typeof raw.bang_type === "string" ? raw.bang_type : "";
  const promptTemplate = typeof raw.prompt_template === "string" ? raw.prompt_template : "";
  const negativePrompt = typeof raw.negative_prompt === "string" ? raw.negative_prompt : "";
  const promptTemplateVersion = typeof raw.prompt_template_version === "string" ? raw.prompt_template_version : "";
  const status = raw.status;
  const sourceCycleId = typeof raw.source_cycle_id === "string" ? raw.source_cycle_id : "";
  const createdAt = typeof raw.created_at === "string" ? raw.created_at : "";
  const updatedAt = typeof raw.updated_at === "string" ? raw.updated_at : "";

  if (
    !id ||
    !slug ||
    !nameKo ||
    !market ||
    !promptTemplate ||
    !negativePrompt ||
    !sourceCycleId ||
    (lengthBucket !== "short" && lengthBucket !== "medium" && lengthBucket !== "long") ||
    (status !== "active" && status !== "archived")
  ) {
    return null;
  }

  return {
    id,
    slug,
    nameKo,
    description,
    market,
    lengthBucket,
    silhouette,
    texture,
    bangType,
    volumeFocusTags: Array.isArray(raw.volume_focus_tags)
      ? raw.volume_focus_tags.filter((item): item is string => typeof item === "string")
      : [],
    faceShapeFitTags: Array.isArray(raw.face_shape_fit_tags)
      ? raw.face_shape_fit_tags.filter((item): item is string => typeof item === "string")
      : [],
    avoidTags: Array.isArray(raw.avoid_tags)
      ? raw.avoid_tags.filter((item): item is string => typeof item === "string")
      : [],
    trendScore: typeof raw.trend_score === "number" ? raw.trend_score : 0,
    freshnessScore: typeof raw.freshness_score === "number" ? raw.freshness_score : 0,
    promptTemplate,
    negativePrompt,
    promptTemplateVersion,
    styleTargets: normalizeStyleTargets(raw.style_targets),
    status,
    sourceCycleId,
    createdAt,
    updatedAt,
  };
}

function normalizeCatalogCycle(raw: Record<string, unknown>): HairstyleCatalogCycle | null {
  const cycleId = typeof raw.cycle_id === "string" ? raw.cycle_id : "";
  const market = typeof raw.market === "string" ? raw.market : "";
  const status = raw.status;
  const startedAt = typeof raw.started_at === "string" ? raw.started_at : "";

  if (!cycleId || !market || !startedAt || (status !== "running" && status !== "succeeded" && status !== "failed")) {
    return null;
  }

  return {
    cycleId,
    status,
    market,
    startedAt,
    finishedAt: typeof raw.finished_at === "string" ? raw.finished_at : null,
    itemCount: typeof raw.item_count === "number" ? raw.item_count : 0,
    sourceSummary: normalizeSourceSummary(raw.source_summary),
    errorLog: typeof raw.error_log === "string" ? raw.error_log : null,
  };
}

function normalizeActiveCatalogCycle(raw: Record<string, unknown>): HairstyleCatalogActiveCycle | null {
  const market = typeof raw.market === "string" ? raw.market : "";
  const activeCycleId = typeof raw.active_cycle_id === "string" ? raw.active_cycle_id : "";
  const activatedAt = typeof raw.activated_at === "string" ? raw.activated_at : "";
  const expiresAt = typeof raw.expires_at === "string" ? raw.expires_at : "";
  const rotationPeriod = typeof raw.rotation_period === "string" ? raw.rotation_period : "";
  const rotationSeed = typeof raw.rotation_seed === "string" ? raw.rotation_seed : "";
  const lastRebuildStatus = typeof raw.last_rebuild_status === "string" ? raw.last_rebuild_status : "";
  const createdAt = typeof raw.created_at === "string" ? raw.created_at : "";
  const updatedAt = typeof raw.updated_at === "string" ? raw.updated_at : "";

  if (!market || !activeCycleId || !activatedAt || !expiresAt || !rotationPeriod || !rotationSeed || !lastRebuildStatus) {
    return null;
  }

  return {
    market,
    activeCycleId,
    previousCycleId: typeof raw.previous_cycle_id === "string" ? raw.previous_cycle_id : null,
    activatedAt,
    expiresAt,
    rotationPeriod,
    rotationSeed,
    lastRebuildCycleId: typeof raw.last_rebuild_cycle_id === "string" ? raw.last_rebuild_cycle_id : null,
    lastRebuildStatus,
    lastErrorLog: typeof raw.last_error_log === "string" ? raw.last_error_log : null,
    sourceSummary: normalizeSourceSummary(raw.source_summary),
    createdAt,
    updatedAt,
  };
}

function normalizeLineupRow(raw: Record<string, unknown>): HairstyleCatalogLineupRow | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  const cycleId = typeof raw.cycle_id === "string" ? raw.cycle_id : "";
  const market = typeof raw.market === "string" ? raw.market : "";
  const styleTarget = raw.style_target;
  const slotKey = raw.slot_key;
  const rank = typeof raw.rank === "number" ? raw.rank : 0;
  const catalogItemId = typeof raw.catalog_item_id === "string" ? raw.catalog_item_id : "";
  const rotationScore = typeof raw.rotation_score === "number" ? raw.rotation_score : 0;
  const selectionReason = typeof raw.selection_reason === "string" ? raw.selection_reason : "";
  const createdAt = typeof raw.created_at === "string" ? raw.created_at : "";

  if (
    !id ||
    !cycleId ||
    !market ||
    !isMemberStyleTarget(styleTarget) ||
    (slotKey !== "trend" && slotKey !== "face_fit" && slotKey !== "evergreen" && slotKey !== "experimental") ||
    rank <= 0 ||
    !catalogItemId
  ) {
    return null;
  }

  return {
    id,
    cycleId,
    market,
    styleTarget,
    slotKey,
    rank,
    catalogItemId,
    rotationScore,
    selectionReason,
    createdAt,
  };
}

function normalizeSourceSummary(raw: unknown): HairstyleCatalogSourceSummary | null {
  if (!isRecord(raw)) {
    return null;
  }

  const mode = raw.mode;
  const queries = Array.isArray(raw.queries)
    ? raw.queries.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
    : [];
  const notes = typeof raw.notes === "string" ? cleanText(raw.notes) : "";

  if ((mode !== "seeded-weekly" && mode !== "researched-weekly") || queries.length === 0 || !notes) {
    return null;
  }

  return {
    mode,
    queries,
    notes,
    providers: Array.isArray(raw.providers)
      ? raw.providers.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
      : undefined,
    primaryLookbackDays: typeof raw.primaryLookbackDays === "number" ? raw.primaryLookbackDays : undefined,
    fallbackLookbackDays: typeof raw.fallbackLookbackDays === "number" ? raw.fallbackLookbackDays : undefined,
    effectiveLookbackDays: typeof raw.effectiveLookbackDays === "number" ? raw.effectiveLookbackDays : undefined,
    freshnessWindowDays: typeof raw.freshnessWindowDays === "number" ? raw.freshnessWindowDays : undefined,
    freshnessStatus:
      raw.freshnessStatus === "fresh" ||
      raw.freshnessStatus === "lowFreshness" ||
      raw.freshnessStatus === "fallback" ||
      raw.freshnessStatus === "seeded"
        ? raw.freshnessStatus
        : undefined,
    documentsCollected: typeof raw.documentsCollected === "number" ? raw.documentsCollected : undefined,
    documentsUsed: typeof raw.documentsUsed === "number" ? raw.documentsUsed : undefined,
    sourceNames: Array.isArray(raw.sourceNames)
      ? raw.sourceNames.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
      : undefined,
    topStyleSignals: Array.isArray(raw.topStyleSignals)
      ? raw.topStyleSignals
          .filter(isRecord)
          .map((item) => {
            const slug = typeof item.slug === "string" ? cleanText(item.slug) : "";
            const nameKo = typeof item.nameKo === "string" ? cleanText(item.nameKo) : "";
            const signalCount = typeof item.signalCount === "number" ? item.signalCount : null;

            if (!slug || !nameKo || signalCount === null) {
              return null;
            }

            return { slug, nameKo, signalCount };
          })
          .filter((item): item is NonNullable<HairstyleCatalogSourceSummary["topStyleSignals"]>[number] => item !== null)
      : undefined,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCycleSourceSummary(mode: CatalogSourceMode, startedAt: string): HairstyleCatalogSourceSummary {
  const queries = buildKoreanWeeklyStyleQueries(new Date(startedAt));

  if (mode === "seeded-weekly") {
    return {
      mode,
      queries,
      notes: "Weekly Korean hairstyle catalog rebuilt from curated seed blueprints without live research.",
      providers: ["catalog-seed"],
      documentsCollected: 0,
      documentsUsed: 0,
    };
  }

  return {
    mode,
    queries,
    notes: "Weekly Korean hairstyle rebuild is collecting live search signals.",
    providers: ["google-news-rss"],
  };
}

function buildSeededTrendSignals() {
  return new Map<string, BlueprintTrendSignal>();
}

function normalizeCatalogRebuildOptions(modeOrOptions: CatalogRebuildMode | Partial<CatalogRebuildOptions>): CatalogRebuildOptions {
  if (typeof modeOrOptions === "string") {
    return {
      mode: modeOrOptions,
      force: false,
      onlyIfDue: false,
      activate: true,
      dryRun: false,
      reason: "manual",
      notify: null,
      notifyPlans: ["standard", "pro", "salon"],
      notifyDelayMinutes: 10,
    };
  }

  return {
    mode: modeOrOptions.mode ?? "auto",
    force: modeOrOptions.force ?? false,
    onlyIfDue: modeOrOptions.onlyIfDue ?? false,
    activate: modeOrOptions.activate ?? true,
    dryRun: modeOrOptions.dryRun ?? false,
    reason: cleanText(modeOrOptions.reason ?? "manual") || "manual",
    notify: typeof modeOrOptions.notify === "boolean" ? modeOrOptions.notify : null,
    notifyPlans: modeOrOptions.notifyPlans?.length
      ? Array.from(new Set(modeOrOptions.notifyPlans.map(cleanText).filter(Boolean)))
      : ["standard", "pro", "salon"],
    notifyDelayMinutes: Math.max(0, Math.min(120, modeOrOptions.notifyDelayMinutes ?? 10)),
  };
}

function resolveCatalogSourceMode(mode: CatalogRebuildMode): CatalogSourceMode {
  return mode === "seeded" ? "seeded-weekly" : "researched-weekly";
}

function shouldSendCatalogRotationAlert(
  options: CatalogRebuildOptions,
  sourceMode: CatalogSourceMode,
  sourceSummary: HairstyleCatalogSourceSummary,
) {
  if (options.dryRun || !options.activate) {
    return false;
  }

  if (options.notify === false) {
    return false;
  }

  const lowFreshness = sourceSummary.freshnessStatus === "lowFreshness" || sourceSummary.freshnessStatus === "fallback";
  if (lowFreshness && options.notify !== true) {
    return false;
  }

  if (options.notify === true) {
    return true;
  }

  return sourceMode === "researched-weekly";
}

function computeCycleExpiresAt(activatedAt: Date) {
  return new Date(activatedAt.getTime() + CATALOG_ROTATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function formatRotationPeriod(date: Date) {
  const weekDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = weekDate.getUTCDay() || 7;
  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((weekDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `${weekDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function buildRotationSeed(cycleId: string, rotationPeriod: string) {
  return `${CATALOG_MARKET}:${rotationPeriod}:${cycleId}`;
}

function hashToUnitInterval(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function rotationBias(rotationSeed: string, row: HairstyleCatalogRow, styleTarget: MemberStyleTarget) {
  return hashToUnitInterval(`${rotationSeed}:${styleTarget}:${row.slug}`);
}

function computeNextAutomaticAttemptAt(now = new Date()) {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    AUTOMATIC_ROTATION_CRON_UTC_HOUR,
    AUTOMATIC_ROTATION_CRON_UTC_MINUTE,
    0,
    0,
  ));

  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.toISOString();
}

function isActiveCatalogDue(activeCycle: HairstyleCatalogActiveCycle | null, now = new Date()) {
  if (!activeCycle) {
    return true;
  }

  const expiresAt = Date.parse(activeCycle.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

function validateCatalogRowsForActivation(rows: Array<Omit<HairstyleCatalogRow, "id"> | HairstyleCatalogRow>): CatalogValidationResult {
  const maleCandidateCount = rows.filter((row) => row.styleTargets.includes("male")).length;
  const femaleCandidateCount = rows.filter((row) => row.styleTargets.includes("female")).length;
  const promptVersionMismatchCount = rows.filter(
    (row) => row.promptTemplateVersion !== HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION,
  ).length;
  const warnings: string[] = [];

  if (rows.length < TARGET_BLUEPRINT_POOL_SIZE) {
    warnings.push(`blueprint_pool_below_target:${rows.length}/${TARGET_BLUEPRINT_POOL_SIZE}`);
  }

  if (maleCandidateCount < TARGET_STYLE_TARGET_POOL_SIZE) {
    warnings.push(`male_candidate_pool_below_target:${maleCandidateCount}/${TARGET_STYLE_TARGET_POOL_SIZE}`);
  }

  if (femaleCandidateCount < TARGET_STYLE_TARGET_POOL_SIZE) {
    warnings.push(`female_candidate_pool_below_target:${femaleCandidateCount}/${TARGET_STYLE_TARGET_POOL_SIZE}`);
  }

  if (promptVersionMismatchCount > 0) {
    warnings.push(`prompt_template_version_mismatch:${promptVersionMismatchCount}`);
  }

  return {
    passed:
      rows.length >= MIN_STYLE_TARGET_RECOMMENDATION_ROWS &&
      maleCandidateCount >= MIN_STYLE_TARGET_RECOMMENDATION_ROWS &&
      femaleCandidateCount >= MIN_STYLE_TARGET_RECOMMENDATION_ROWS &&
      promptVersionMismatchCount === 0,
    rowCount: rows.length,
    requiredRowCount: MIN_STYLE_TARGET_RECOMMENDATION_ROWS,
    targetBlueprintCount: TARGET_BLUEPRINT_POOL_SIZE,
    maleCandidateCount,
    femaleCandidateCount,
    targetStyleTargetCount: TARGET_STYLE_TARGET_POOL_SIZE,
    promptTemplateVersion: HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION,
    promptVersionMismatchCount,
    lineupCounts: { male: 0, female: 0 },
    warnings,
  };
}

function scoreLineupCandidate(
  row: HairstyleCatalogRow,
  slotKey: CatalogLineupSlotKey,
  rotationSeed: string,
  styleTarget: MemberStyleTarget,
) {
  const bias = rotationBias(rotationSeed, row, styleTarget) * 10;
  const baseScore = row.trendScore * 0.45 + row.freshnessScore * 0.35 + bias;

  if (slotKey === "trend") {
    return baseScore + row.trendScore * 0.25;
  }

  if (slotKey === "face_fit") {
    return baseScore + row.faceShapeFitTags.length * 4 + row.volumeFocusTags.length * 3;
  }

  if (slotKey === "experimental") {
    return baseScore + bias * 2;
  }

  return baseScore + (100 - Math.abs(70 - row.trendScore)) * 0.08;
}

function buildLineupForStyleTarget(
  rows: HairstyleCatalogRow[],
  cycleId: string,
  rotationSeed: string,
  styleTarget: MemberStyleTarget,
): CatalogLineupInsert[] {
  const targetRows = rows.filter((row) => row.styleTargets.includes(styleTarget));
  const picked = new Set<string>();
  const lineup: CatalogLineupInsert[] = [];
  const slotPlan: Array<{ slotKey: CatalogLineupSlotKey; count: number }> = [
    { slotKey: "trend", count: 3 },
    { slotKey: "face_fit", count: 3 },
    { slotKey: "evergreen", count: 2 },
    { slotKey: "experimental", count: 1 },
  ];

  for (const { slotKey, count } of slotPlan) {
    const candidates = targetRows
      .filter((row) => !picked.has(row.id))
      .sort((a, b) =>
        scoreLineupCandidate(b, slotKey, rotationSeed, styleTarget) -
        scoreLineupCandidate(a, slotKey, rotationSeed, styleTarget),
      );

    for (const row of candidates.slice(0, count)) {
      picked.add(row.id);
      lineup.push({
        cycle_id: cycleId,
        market: row.market,
        style_target: styleTarget,
        slot_key: slotKey,
        rank: lineup.length + 1,
        catalog_item_id: row.id,
        rotation_score: Math.round(scoreLineupCandidate(row, slotKey, rotationSeed, styleTarget) * 100) / 100,
        selection_reason: `${slotKey} slot selected by rotation seed ${rotationSeed}`,
      });
    }
  }

  if (lineup.length < MIN_STYLE_TARGET_RECOMMENDATION_ROWS) {
    const fillers = targetRows
      .filter((row) => !picked.has(row.id))
      .sort((a, b) => scoreLineupCandidate(b, "trend", rotationSeed, styleTarget) - scoreLineupCandidate(a, "trend", rotationSeed, styleTarget));

    for (const row of fillers) {
      if (lineup.length >= MIN_STYLE_TARGET_RECOMMENDATION_ROWS) {
        break;
      }

      picked.add(row.id);
      lineup.push({
        cycle_id: cycleId,
        market: row.market,
        style_target: styleTarget,
        slot_key: "trend",
        rank: lineup.length + 1,
        catalog_item_id: row.id,
        rotation_score: Math.round(scoreLineupCandidate(row, "trend", rotationSeed, styleTarget) * 100) / 100,
        selection_reason: `fill slot selected by rotation seed ${rotationSeed}`,
      });
    }
  }

  return lineup.slice(0, MIN_STYLE_TARGET_RECOMMENDATION_ROWS);
}

function buildCatalogLineupsForCycle(rows: HairstyleCatalogRow[], cycleId: string, rotationSeed: string) {
  return [
    ...buildLineupForStyleTarget(rows, cycleId, rotationSeed, "male"),
    ...buildLineupForStyleTarget(rows, cycleId, rotationSeed, "female"),
  ];
}

async function recordCatalogRotationAttempt(
  supabase: SupabaseCatalogClient,
  status: string,
  cycleId: string | null,
  errorLog?: string,
) {
  const response = await supabase.rpc("record_hairstyle_catalog_rotation_attempt", {
    p_market: CATALOG_MARKET,
    p_status: status,
    p_cycle_id: cycleId,
    p_error_log: errorLog ?? null,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }
}

async function markStaleRunningCatalogCyclesFailed(supabase: SupabaseCatalogClient) {
  const response = await supabase.rpc("mark_stale_running_hairstyle_cycles_failed", {
    p_market: CATALOG_MARKET,
    p_timeout_minutes: 30,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return typeof response.data === "number" ? response.data : 0;
}

async function activateCatalogCycle(
  supabase: SupabaseCatalogClient,
  cycleId: string,
  activatedAt: Date,
) {
  const rotationPeriod = formatRotationPeriod(activatedAt);
  const expiresAt = computeCycleExpiresAt(activatedAt);
  const rotationSeed = buildRotationSeed(cycleId, rotationPeriod);
  const response = await supabase.rpc("activate_hairstyle_catalog_cycle", {
    p_market: CATALOG_MARKET,
    p_cycle_id: cycleId,
    p_expires_at: expiresAt,
    p_rotation_period: rotationPeriod,
    p_rotation_seed: rotationSeed,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return {
    expiresAt,
    rotationPeriod,
    rotationSeed,
  };
}

async function enqueueCatalogRotationTrendAlert(
  supabase: SupabaseCatalogClient,
  cycleId: string,
  scheduledSendAt: string,
  targetPlans: string[],
) {
  const response = await supabase.rpc("enqueue_catalog_rotation_trend_alert", {
    p_market: CATALOG_MARKET,
    p_cycle_id: cycleId,
    p_scheduled_send_at: scheduledSendAt,
    p_target_plans: targetPlans,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return typeof response.data === "string" ? response.data : null;
}

function isBootstrapInProgressError(error: unknown) {
  return error instanceof Error && error.message.includes("bootstrap is already in progress");
}

async function loadCatalogRows(
  supabase: SupabaseCatalogClient,
  cycleId: string,
): Promise<HairstyleCatalogRow[]> {
  const response = await ((supabase
    .from("hairstyle_catalog")
    .select(
      "id,slug,name_ko,description,market,length_bucket,silhouette,texture,bang_type,volume_focus_tags,face_shape_fit_tags,avoid_tags,trend_score,freshness_score,prompt_template,negative_prompt,prompt_template_version,style_targets,status,source_cycle_id,created_at,updated_at",
    )
    .eq("source_cycle_id", cycleId)) as unknown as Promise<{
    data: Array<Record<string, unknown>> | null;
    error: QueryError | null;
  }>);

  if (response.error) {
    throw new Error(response.error.message);
  }

  return (response.data || [])
    .map((row) => normalizeCatalogRow(row))
    .filter((row): row is HairstyleCatalogRow => row !== null && row.status === "active");
}

async function getActiveCatalogCycle(supabase: SupabaseCatalogClient): Promise<ActiveCatalogCycleResult | null> {
  const activeResponse = await supabase
    .from("hairstyle_catalog_active_cycles")
    .select(
      "market,active_cycle_id,previous_cycle_id,activated_at,expires_at,rotation_period,rotation_seed,last_rebuild_cycle_id,last_rebuild_status,last_error_log,source_summary,created_at,updated_at",
    )
    .eq("market", CATALOG_MARKET)
    .maybeSingle();

  if (activeResponse.error) {
    throw new Error(activeResponse.error.message);
  }

  if (!activeResponse.data) {
    return null;
  }

  const activeCycle = normalizeActiveCatalogCycle(activeResponse.data);
  if (!activeCycle) {
    throw new Error("Active hairstyle catalog pointer is malformed.");
  }

  const cycleResponse = await supabase
    .from("hairstyle_catalog_cycles")
    .select("cycle_id,status,market,started_at,finished_at,item_count,source_summary,error_log")
    .eq("cycle_id", activeCycle.activeCycleId)
    .maybeSingle();

  if (cycleResponse.error) {
    throw new Error(cycleResponse.error.message);
  }

  if (!cycleResponse.data) {
    throw new Error(`Active hairstyle catalog cycle was not found: ${activeCycle.activeCycleId}`);
  }

  const cycle = normalizeCatalogCycle(cycleResponse.data);
  if (!cycle || cycle.status !== "succeeded" || cycle.market !== activeCycle.market) {
    throw new Error(`Active hairstyle catalog cycle is not usable: ${activeCycle.activeCycleId}`);
  }

  return {
    activeCycle,
    cycle,
  };
}

async function loadActiveCatalogRows(
  supabase: SupabaseCatalogClient,
  activeCycle: HairstyleCatalogActiveCycle,
): Promise<HairstyleCatalogRow[]> {
  return (await loadCatalogRows(supabase, activeCycle.activeCycleId)).filter((row) => row.market === activeCycle.market);
}

async function loadActiveLineups(
  supabase: SupabaseCatalogClient,
  activeCycle: HairstyleCatalogActiveCycle,
): Promise<HairstyleCatalogLineupRow[]> {
  const response = await ((supabase
    .from("hairstyle_catalog_lineups")
    .select(
      "id,cycle_id,market,style_target,slot_key,rank,catalog_item_id,rotation_score,selection_reason,created_at",
    )
    .eq("cycle_id", activeCycle.activeCycleId)
    .eq("market", activeCycle.market)
    .order("style_target", { ascending: true })
    .order("rank", { ascending: true })) as unknown as Promise<{
    data: Array<Record<string, unknown>> | null;
    error: QueryError | null;
  }>);

  if (response.error) {
    throw new Error(response.error.message);
  }

  return (response.data || [])
    .map((row) => normalizeLineupRow(row))
    .filter((row): row is HairstyleCatalogLineupRow => row !== null);
}

async function getLatestCatalogCycleByStatus(
  supabase: SupabaseCatalogClient,
  status: HairstyleCatalogCycle["status"],
) {
  const query = supabase
    .from("hairstyle_catalog_cycles")
    .select("cycle_id,status,market,started_at,finished_at,item_count,source_summary,error_log")
    .eq("status", status) as unknown as {
    order: (column: string, options?: { ascending?: boolean }) => {
      limit: (count: number) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: QueryError | null;
        }>;
      };
    };
  };

  const response = await query.order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (response.error) {
    throw new Error(response.error.message);
  }

  if (!response.data) {
    return null;
  }

  return normalizeCatalogCycle(response.data);
}

async function waitForSuccessfulCatalogCycle(supabase: SupabaseCatalogClient) {
  for (let attempt = 0; attempt < CATALOG_BOOTSTRAP_MAX_POLLS; attempt += 1) {
    const cycle = await getLatestCatalogCycleByStatus(supabase, "succeeded");
    if (cycle) {
      const rows = await loadCatalogRows(supabase, cycle.cycleId);
      if (rows.length > 0) {
        return { cycle, rows };
      }
    }

    await sleep(CATALOG_BOOTSTRAP_POLL_MS);
  }

  return null;
}

export function getAdminSecret() {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret || secret.includes("YOUR_")) {
    throw new Error("Missing INTERNAL_API_SECRET");
  }

  return secret;
}

export function isAuthorizedAdminRequest(request: Request) {
  const provided = request.headers.get("x-admin-secret")?.trim();
  if (!provided) {
    return false;
  }

  try {
    return provided === getAdminSecret();
  } catch {
    return false;
  }
}

function buildReason(row: HairstyleCatalogRow, selectionContext: CatalogSelectionContext): string {
  const matchedFace = row.faceShapeFitTags.find((tag) => selectionContext.faceShapeTags.includes(tag));
  const matchedVolume = row.volumeFocusTags.find((tag) => selectionContext.volumeFocusTags.includes(tag));

  const reasonParts = [
    matchedFace ? `${matchedFace} face balance` : row.description,
    matchedVolume ? `supports ${matchedVolume} volume control` : `${row.lengthBucket} silhouette balance`,
  ];

  return reasonParts.join(" and ") + ".";
}

function deriveCorrectionFocusFromRow(row: HairstyleCatalogRow): RecommendationCorrectionFocus {
  if (row.volumeFocusTags.some((tag) => ["jawline", "lower-contour", "lower-frame", "line-definition"].includes(tag))) {
    return "jawline";
  }

  if (row.volumeFocusTags.some((tag) => ["temple", "side-balance", "side-softness", "soft-side-volume"].includes(tag))) {
    return "temple";
  }

  return "crown";
}

function composePrompt(row: HairstyleCatalogRow, analysis: FaceAnalysisSummary, styleTarget: MemberStyleTarget) {
  const genderDirection =
    styleTarget === "male"
      ? "Korean men's hairstyle direction"
      : "Korean women's hairstyle direction";

  return [
    "reference photo hair edit",
    "same person as the reference photo",
    "change only the hairstyle and natural hair color",
    genderDirection,
    "keep face, skin tone, identity, expression, camera angle, background, and clothing unchanged",
    "do not change the person's gender or identity",
    row.promptTemplate,
    `suited for ${analysis.faceShape}`,
    `head balance: ${analysis.balance}`,
    `best length strategy: ${analysis.bestLengthStrategy}`,
    `observed parting: ${analysis.observedPartingShape}`,
    `recommended parting direction: ${analysis.recommendedPartingShape}`,
    `parting strategy: ${analysis.partingStrategy}`,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(", ");
}

function derivePreferredLengthBuckets(analysis: FaceAnalysisSummary): RecommendationLengthBucket[] {
  const normalized = analysis.bestLengthStrategy.toLowerCase();
  const result: RecommendationLengthBucket[] = [];

  if (normalized.includes("short")) {
    result.push("short");
  }
  if (normalized.includes("medium")) {
    result.push("medium");
  }
  if (normalized.includes("long")) {
    result.push("long");
  }

  if (result.length === 0) {
    return ["medium", "long", "short"];
  }

  const fallbackOrder: RecommendationLengthBucket[] = ["medium", "long", "short"];
  for (const bucket of fallbackOrder) {
    if (!result.includes(bucket)) {
      result.push(bucket);
    }
  }

  return result;
}

export function buildCatalogSelectionContext(
  analysis: FaceAnalysisSummary,
  styleTarget: MemberStyleTarget,
): CatalogSelectionContext {
  return {
    analysis,
    styleTarget,
    faceShapeTags: Array.from(new Set([
      ...tokenize(analysis.faceShape),
      ...tokenize(analysis.headShape),
    ])),
    volumeFocusTags: Array.from(new Set(analysis.volumeFocus.flatMap(tokenize))),
    partingPreferenceTags: Array.from(new Set([
      ...tokenizeParting(analysis.recommendedPartingShape),
      ...tokenizeParting(analysis.partingStrategy),
      ...tokenizeParting(analysis.observedPartingShape),
    ])),
    avoidTags: Array.from(new Set(analysis.avoidNotes.flatMap(tokenize))),
    preferredLengthBuckets: derivePreferredLengthBuckets(analysis),
  };
}

function scoreCatalogRow(row: HairstyleCatalogRow, context: CatalogSelectionContext): number {
  let score = row.trendScore * 0.35 + row.freshnessScore * 0.25;

  const faceMatches = row.faceShapeFitTags.filter((tag) => context.faceShapeTags.includes(tag)).length;
  const volumeMatches = row.volumeFocusTags.filter((tag) => context.volumeFocusTags.includes(tag)).length;
  const avoidMatches = row.avoidTags.filter((tag) => context.avoidTags.includes(tag)).length;
  const rowPartingTags = Array.from(new Set([
    ...tokenizeParting(row.bangType),
    ...tokenizeParting(row.promptTemplate),
  ]));
  const partingMatches = rowPartingTags.filter((tag) => context.partingPreferenceTags.includes(tag)).length;

  score += faceMatches * 12;
  score += volumeMatches * 8;
  score += Math.min(partingMatches, 3) * 2;
  score -= avoidMatches * 10;

  const preferredIndex = context.preferredLengthBuckets.indexOf(row.lengthBucket);
  if (preferredIndex >= 0) {
    score += Math.max(0, 6 - preferredIndex * 2);
  }

  return Math.round(score * 100) / 100;
}

function buildTopNine(rows: HairstyleCatalogRow[], context: CatalogSelectionContext, cycleId: string): CatalogBackedRecommendationCandidate[] {
  const scored = rows
    .map((row) => ({ row, score: scoreCatalogRow(row, context) }))
    .sort((a, b) => b.score - a.score);

  const selected: Array<{ row: HairstyleCatalogRow; score: number }> = [];
  const picked = new Set<string>();
  const requiredBuckets: RecommendationLengthBucket[] = ["short", "medium", "long"];

  for (const bucket of requiredBuckets) {
    const match = scored.find((item) => item.row.lengthBucket === bucket && !picked.has(item.row.id));
    if (match) {
      selected.push(match);
      picked.add(match.row.id);
    }
  }

  for (const item of scored) {
    if (selected.length >= 9) {
      break;
    }
    if (picked.has(item.row.id)) {
      continue;
    }
    selected.push(item);
    picked.add(item.row.id);
  }

  return selected.slice(0, 9).map(({ row, score }, index) => ({
    id: row.slug,
    rank: index + 1,
    label: row.nameKo,
    reason: buildReason(row, context),
    prompt: composePrompt(row, context.analysis, context.styleTarget),
    negativePrompt: row.negativePrompt,
    tags: [row.lengthBucket, row.silhouette, row.texture, row.bangType, ...row.volumeFocusTags].filter(Boolean),
    lengthBucket: row.lengthBucket,
    correctionFocus: deriveCorrectionFocusFromRow(row),
    catalogItemId: row.id,
    catalogCycleId: cycleId,
    selectionScore: score,
    promptTemplateVersion: row.promptTemplateVersion,
    styleTarget: context.styleTarget,
  }));
}

async function runImageAnalysis(referenceImageDataUrl: string): Promise<{ analysis: FaceAnalysisSummary | null; model: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.includes("YOUR_")) {
    return {
      analysis: null,
      model: "heuristic-fallback",
    };
  }

  const parsed = parseDataUrl(referenceImageDataUrl);
  if (!parsed) {
    return {
      analysis: null,
      model: "heuristic-fallback",
    };
  }

  const modelName = process.env.PROMPT_RESEARCH_MODEL || process.env.PROMPT_LLM_MODEL || "gemini-2.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: ANALYSIS_SYSTEM_PROMPT.trim() },
          {
            inlineData: {
              mimeType: parsed.mimeType,
              data: parsed.data,
            },
          },
        ],
      },
    ],
  });

  const parsedResult = parseJsonResponse<Record<string, unknown>>(result.response.text());
  return {
    analysis: normalizeAnalysis(parsedResult),
    model: modelName,
  };
}

export async function createHairstyleCatalogCycle() {
  return createHairstyleCatalogCycleForMode("researched-weekly");
}

async function createHairstyleCatalogCycleForMode(mode: CatalogSourceMode) {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseCatalogClient;
  const startedAt = new Date().toISOString();
  const sourceSummary = buildCycleSourceSummary(mode, startedAt);

  const { data, error } = await supabase
    .from("hairstyle_catalog_cycles")
    .insert({
      status: "running",
      market: CATALOG_MARKET,
      started_at: startedAt,
      item_count: 0,
      source_summary: sourceSummary,
    })
    .select("cycle_id,status,market,started_at,finished_at,item_count,source_summary,error_log")
    .single();

  if (error || !data) {
    const insertError = error || { message: "Failed to create hairstyle catalog cycle" };
    if (insertError.code === UNIQUE_CONSTRAINT_VIOLATION_CODE) {
      const runningCycle = await getLatestCatalogCycleByStatus(supabase, "running");
      if (runningCycle) {
        const waited = await waitForSuccessfulCatalogCycle(supabase);
        if (waited) {
          return waited.cycle;
        }

        throw new Error("Hairstyle catalog bootstrap is already in progress. Please retry shortly.");
      }
    }

    throw new Error(insertError.message);
  }

  const cycle = normalizeCatalogCycle(data);
  if (!cycle) {
    throw new Error("Failed to normalize hairstyle catalog cycle");
  }

  return cycle;
}

async function finalizeCatalogCycleFailure(
  supabase: SupabaseCatalogClient,
  cycleId: string,
  message: string,
) {
  const response = await supabase.rpc("fail_hairstyle_catalog_cycle", {
    p_cycle_id: cycleId,
    p_error_log: message,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }
}

async function rebuildCatalogWithMode(
  options: CatalogRebuildOptions,
  sourceMode: CatalogSourceMode,
  staleRunningCyclesFailed: number,
): Promise<CatalogRebuildResult> {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseCatalogClient;
  const cycle = options.dryRun ? null : await createHairstyleCatalogCycleForMode(sourceMode);
  const nowIso = new Date().toISOString();
  const cycleId = cycle?.cycleId ?? randomUUID();

  try {
    if (cycle?.status === "succeeded") {
      const rows = await loadCatalogRows(supabase, cycle.cycleId);
      const validation = validateCatalogRowsForActivation(rows);
      const activeAfter = await getActiveCatalogCycle(supabase).catch(() => null);
      const resolvedMode = cycle.sourceSummary?.mode ?? sourceMode;

      return {
        cycleId: cycle.cycleId,
        status: "succeeded",
        activeCycleId: activeAfter?.activeCycle.activeCycleId ?? null,
        activated: false,
        dryRun: options.dryRun,
        insertedCount: 0,
        updatedCount: rows.length,
        itemCount: rows.length,
        sourceSummary: cycle.sourceSummary ?? buildCycleSourceSummary(resolvedMode, cycle.startedAt),
        requestedMode: options.mode,
        resolvedMode,
        validation,
        activatedAt: null,
        expiresAt: activeAfter?.activeCycle.expiresAt ?? null,
        nextAutomaticAttemptAt: computeNextAutomaticAttemptAt(),
        trendAlertId: null,
        trendAlertScheduledSendAt: null,
        staleRunningCyclesFailed,
      };
    }

    const research =
      sourceMode === "researched-weekly"
        ? await collectKoreanHairstyleTrendResearch(new Date(nowIso))
        : {
            trendSignals: buildSeededTrendSignals(),
            sourceSummary: buildCycleSourceSummary(sourceMode, nowIso),
          };
    const rows = buildCatalogRowsForCycle(cycleId, nowIso, research.trendSignals);
    const validation = validateCatalogRowsForActivation(rows);
    if (research.sourceSummary.freshnessStatus && research.sourceSummary.freshnessStatus !== "fresh") {
      validation.warnings.push(`freshness_status:${research.sourceSummary.freshnessStatus}`);
    }

    if (!validation.passed) {
      throw new Error(`Hairstyle catalog validation failed: ${validation.warnings.join(", ") || "insufficient rows"}`);
    }

    if (options.dryRun) {
      const activeAfter = await getActiveCatalogCycle(supabase).catch(() => null);

      return {
        cycleId,
        status: "succeeded",
        skipReason: "dry_run",
        activeCycleId: activeAfter?.activeCycle.activeCycleId ?? null,
        activated: false,
        dryRun: true,
        insertedCount: 0,
        updatedCount: 0,
        itemCount: rows.length,
        sourceSummary: research.sourceSummary,
        requestedMode: options.mode,
        resolvedMode: sourceMode,
        validation,
        activatedAt: null,
        expiresAt: activeAfter?.activeCycle.expiresAt ?? null,
        nextAutomaticAttemptAt: computeNextAutomaticAttemptAt(),
        trendAlertId: null,
        trendAlertScheduledSendAt: null,
        staleRunningCyclesFailed,
      };
    }

    if (!cycle) {
      throw new Error("Hairstyle catalog cycle was not created.");
    }

    const slugs = rows.map((row) => row.slug);

    const existingResponse = await ((supabase
      .from("hairstyle_catalog")
      .select("slug")
      .eq("source_cycle_id", cycle.cycleId)
      .in("slug", slugs)) as unknown as Promise<{
        data: Array<Record<string, unknown>> | null;
        error: QueryError | null;
      }>);

    if (existingResponse.error) {
      throw new Error(existingResponse.error.message);
    }

    const existingSlugs = new Set(
      (existingResponse.data || [])
        .map((row) => (typeof row.slug === "string" ? row.slug : ""))
        .filter(Boolean),
    );

    const upsertPayload = rows.map((row) => ({
      slug: row.slug,
      name_ko: row.nameKo,
      description: row.description,
      market: row.market,
      length_bucket: row.lengthBucket,
      silhouette: row.silhouette,
      texture: row.texture,
      bang_type: row.bangType,
      volume_focus_tags: row.volumeFocusTags,
      face_shape_fit_tags: row.faceShapeFitTags,
      avoid_tags: row.avoidTags,
      trend_score: row.trendScore,
      freshness_score: row.freshnessScore,
      prompt_template: row.promptTemplate,
      negative_prompt: row.negativePrompt,
      prompt_template_version: row.promptTemplateVersion,
      style_targets: row.styleTargets,
      status: row.status,
      source_cycle_id: row.sourceCycleId,
    }));

    const upsertResult = await supabase
      .from("hairstyle_catalog")
      .upsert(upsertPayload, { onConflict: "source_cycle_id,slug" });

    if (upsertResult.error) {
      throw new Error(upsertResult.error.message);
    }

    const insertedCount = upsertPayload.filter((row) => !existingSlugs.has(row.slug)).length;
    const updatedCount = upsertPayload.length - insertedCount;
    const activationTime = new Date();
    const rotationPeriod = formatRotationPeriod(activationTime);
    const rotationSeed = buildRotationSeed(cycle.cycleId, rotationPeriod);
    const persistedRows = await loadCatalogRows(supabase, cycle.cycleId);
    const lineups = buildCatalogLineupsForCycle(persistedRows, cycle.cycleId, rotationSeed);
    validation.lineupCounts = {
      male: lineups.filter((lineup) => lineup.style_target === "male").length,
      female: lineups.filter((lineup) => lineup.style_target === "female").length,
    };

    if (
      validation.lineupCounts.male < MIN_STYLE_TARGET_RECOMMENDATION_ROWS ||
      validation.lineupCounts.female < MIN_STYLE_TARGET_RECOMMENDATION_ROWS
    ) {
      throw new Error(
        `Hairstyle catalog lineup validation failed: male=${validation.lineupCounts.male}, female=${validation.lineupCounts.female}`,
      );
    }

    const lineupUpsertResult = await supabase
      .from("hairstyle_catalog_lineups")
      .upsert(lineups as unknown as Record<string, unknown>[], { onConflict: "cycle_id,style_target,rank" });

    if (lineupUpsertResult.error) {
      throw new Error(lineupUpsertResult.error.message);
    }

    const finishedAt = new Date().toISOString();
    const cycleUpdateValues = options.activate
      ? {
          item_count: upsertPayload.length,
          error_log: null,
          source_summary: research.sourceSummary,
        }
      : {
          status: "succeeded",
          finished_at: finishedAt,
          item_count: upsertPayload.length,
          error_log: null,
          source_summary: research.sourceSummary,
        };
    const updateResult = await supabase
      .from("hairstyle_catalog_cycles")
      .update(cycleUpdateValues)
      .eq("cycle_id", cycle.cycleId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    let activated = false;
    let activatedAt: string | null = null;
    let expiresAt: string | null = null;
    let trendAlertId: string | null = null;
    let trendAlertScheduledSendAt: string | null = null;

    if (options.activate) {
      const activation = await activateCatalogCycle(supabase, cycle.cycleId, activationTime);
      activated = true;
      activatedAt = activationTime.toISOString();
      expiresAt = activation.expiresAt;

      if (shouldSendCatalogRotationAlert(options, sourceMode, research.sourceSummary)) {
        trendAlertScheduledSendAt = new Date(
          activationTime.getTime() + options.notifyDelayMinutes * 60 * 1000,
        ).toISOString();
        try {
          trendAlertId = await enqueueCatalogRotationTrendAlert(
            supabase,
            cycle.cycleId,
            trendAlertScheduledSendAt,
            options.notifyPlans,
          );
        } catch (alertError) {
          const alertMessage = alertError instanceof Error ? alertError.message : "Unexpected trend alert enqueue error";
          validation.warnings.push(`trend_alert_enqueue_failed:${alertMessage}`);
          trendAlertScheduledSendAt = null;
        }
      }
    }

    await recordCatalogRotationAttempt(supabase, "succeeded", cycle.cycleId);
    const activeAfter = await getActiveCatalogCycle(supabase).catch(() => null);

    return {
      cycleId: cycle.cycleId,
      status: "succeeded",
      activeCycleId: activeAfter?.activeCycle.activeCycleId ?? null,
      activated,
      dryRun: false,
      insertedCount,
      updatedCount,
      itemCount: upsertPayload.length,
      sourceSummary: research.sourceSummary,
      requestedMode: options.mode,
      resolvedMode: sourceMode,
      validation,
      activatedAt,
      expiresAt: expiresAt ?? activeAfter?.activeCycle.expiresAt ?? null,
      nextAutomaticAttemptAt: computeNextAutomaticAttemptAt(),
      trendAlertId,
      trendAlertScheduledSendAt,
      staleRunningCyclesFailed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected catalog rebuild error";
    if (cycle) {
      await finalizeCatalogCycleFailure(supabase, cycle.cycleId, message);
    }
    throw error;
  }
}

export async function rebuildWeeklyHairstyleCatalog(
  modeOrOptions: CatalogRebuildMode | Partial<CatalogRebuildOptions> = "auto",
): Promise<CatalogRebuildResult> {
  const options = normalizeCatalogRebuildOptions(modeOrOptions);
  const supabase = getSupabaseAdminClient() as unknown as SupabaseCatalogClient;
  const now = new Date();
  const sourceMode = resolveCatalogSourceMode(options.mode);
  const staleRunningCyclesFailed = await markStaleRunningCatalogCyclesFailed(supabase);
  const activeBefore = await getActiveCatalogCycle(supabase).catch(() => null);

  if (options.onlyIfDue && !options.force && !isActiveCatalogDue(activeBefore?.activeCycle ?? null, now)) {
    await recordCatalogRotationAttempt(supabase, "skipped", activeBefore?.activeCycle.activeCycleId ?? null);

    return {
      cycleId: null,
      status: "skipped",
      skipReason: "not_due",
      activeCycleId: activeBefore?.activeCycle.activeCycleId ?? null,
      activated: false,
      dryRun: options.dryRun,
      insertedCount: 0,
      updatedCount: 0,
      itemCount: activeBefore?.cycle.itemCount ?? 0,
      sourceSummary: activeBefore?.cycle.sourceSummary ?? buildCycleSourceSummary(sourceMode, now.toISOString()),
      requestedMode: options.mode,
      resolvedMode: activeBefore?.cycle.sourceSummary?.mode ?? sourceMode,
      validation: validateCatalogRowsForActivation([]),
      activatedAt: activeBefore?.activeCycle.activatedAt ?? null,
      expiresAt: activeBefore?.activeCycle.expiresAt ?? null,
      nextAutomaticAttemptAt: computeNextAutomaticAttemptAt(now),
      trendAlertId: null,
      trendAlertScheduledSendAt: null,
      staleRunningCyclesFailed,
    };
  }

  await recordCatalogRotationAttempt(supabase, "started", null);

  if (options.mode === "seeded" || options.mode === "researched") {
    return rebuildCatalogWithMode(options, sourceMode, staleRunningCyclesFailed);
  }

  try {
    return await rebuildCatalogWithMode(options, "researched-weekly", staleRunningCyclesFailed);
  } catch (error) {
    if (isBootstrapInProgressError(error)) {
      throw error;
    }

    console.warn("[catalog] Live research rebuild failed, retrying with seeded fallback.", error);
    return rebuildCatalogWithMode(options, "seeded-weekly", staleRunningCyclesFailed);
  }
}

export async function getLatestSuccessfulCatalogCycle() {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseCatalogClient;
  return getLatestCatalogCycleByStatus(supabase, "succeeded");
}

export async function listCatalogRowsForCycle(cycleId: string) {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseCatalogClient;
  return loadCatalogRows(supabase, cycleId);
}

export async function analyzeFaceForCatalog(referenceImageDataUrl: string) {
  const analysisRun = await runImageAnalysis(referenceImageDataUrl).catch(() => ({
    analysis: null,
    model: "heuristic-fallback",
  }));

  return {
    analysis: analysisRun.analysis || buildFallbackAnalysis(),
    model: analysisRun.model,
  };
}

function buildActiveCatalogOperationMessage(activeCycle: HairstyleCatalogActiveCycle | null) {
  if (!activeCycle) {
    return "Run the hairstyle catalog rotation job before serving catalog-backed recommendations.";
  }

  const expiresAt = Date.parse(activeCycle.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return `Active hairstyle catalog cycle ${activeCycle.activeCycleId} expired at ${activeCycle.expiresAt}; user requests do not trigger live rebuilds. Run the rotation cron or admin rebuild job.`;
  }

  return `Run the hairstyle catalog rotation job for active cycle ${activeCycle.activeCycleId}.`;
}

export async function ensureCatalogAvailable(): Promise<CatalogAvailabilityResult> {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseCatalogClient;
  const activeCatalog = await getActiveCatalogCycle(supabase);

  if (!activeCatalog) {
    throw new Error(`No active hairstyle catalog cycle is configured. ${buildActiveCatalogOperationMessage(null)}`);
  }

  const rows = await loadActiveCatalogRows(supabase, activeCatalog.activeCycle);

  if (rows.length < 9) {
    throw new Error(
      `Active hairstyle catalog cycle ${activeCatalog.cycle.cycleId} has only ${rows.length} usable rows. ${buildActiveCatalogOperationMessage(activeCatalog.activeCycle)}`,
    );
  }

  return {
    activeCycle: activeCatalog.activeCycle,
    cycle: activeCatalog.cycle,
    rows,
    lineups: await loadActiveLineups(supabase, activeCatalog.activeCycle),
  };
}

function filterRowsForStyleTarget(rows: HairstyleCatalogRow[], styleTarget: MemberStyleTarget) {
  return rows.filter((row) => row.styleTargets.includes(styleTarget));
}

function needsStyleTargetCatalogRefresh(rows: HairstyleCatalogRow[]) {
  return (
    rows.length < 9 ||
    rows.some((row) => row.promptTemplateVersion !== HAIRSTYLE_CATALOG_PROMPT_TEMPLATE_VERSION)
  );
}

export async function generateCatalogBackedRecommendationSet(
  referenceImageDataUrl: string,
  styleTarget: MemberStyleTarget,
) {
  const { activeCycle, cycle, rows } = await ensureCatalogAvailable();
  const targetRows = filterRowsForStyleTarget(rows, styleTarget);

  if (needsStyleTargetCatalogRefresh(targetRows)) {
    throw new Error(
      `Active hairstyle catalog cycle ${cycle.cycleId} does not have 9 current ${styleTarget} rows. ${buildActiveCatalogOperationMessage(activeCycle)}`,
    );
  }

  const analysisRun = await analyzeFaceForCatalog(referenceImageDataUrl);
  const selectionContext = buildCatalogSelectionContext(analysisRun.analysis, styleTarget);
  const recommendations = buildTopNine(targetRows, selectionContext, cycle.cycleId);

  if (recommendations.length === 0) {
    throw new Error("No catalog-backed recommendations could be selected.");
  }

  return {
    analysis: analysisRun.analysis,
    recommendations,
    model: analysisRun.model,
    promptVersion: RECOMMENDATION_PROMPT_VERSION,
    catalogCycleId: cycle.cycleId,
    selectionContext,
  };
}

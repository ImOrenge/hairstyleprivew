import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  FASHION_GENRE_DEFINITIONS,
  buildSeedFashionCatalogRows,
  buildSeedFashionSourceSummary,
  getFashionGenreDefinition,
} from "./fashion-genre-seed";
import {
  collectKoreanFashionTrendResearch,
  type FashionTrendResearchDocument,
  type FashionTrendSignal,
} from "./fashion-trend-research";
import type {
  FashionCatalogCycle,
  FashionCatalogRow,
  FashionCatalogSourceSummary,
  FashionGenre,
  FashionRecommendationItem,
  StyleProfile,
} from "./fashion-types";
import { FASHION_GENRES } from "./fashion-types";
import type { FaceAnalysisSummary, GeneratedVariant } from "./recommendation-types";
import { getSupabaseAdminClient } from "./supabase";

export type FashionCatalogRebuildMode = "auto" | "researched" | "seeded";
type FashionCatalogSourceMode = "researched-weekly" | "seeded-weekly";

interface QueryError {
  message: string;
  code?: string;
}

interface FashionCatalogRebuildResult {
  cycleId: string;
  status: "succeeded";
  insertedCount: number;
  updatedCount: number;
  itemCount: number;
  sourceSummary: FashionCatalogSourceSummary;
  requestedMode: FashionCatalogRebuildMode;
  resolvedMode: FashionCatalogSourceMode;
}

interface FashionCatalogAvailabilityResult {
  cycle: FashionCatalogCycle;
  rows: FashionCatalogRow[];
}

interface SupabaseFashionCatalogClient {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: QueryError | null;
        }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: QueryError | null }>;
    };
    select: (columns: string) => {
      eq: (column: string, value: string) => unknown;
      in: (column: string, values: string[]) => unknown;
      order: (column: string, options?: { ascending?: boolean }) => {
        limit: (count: number) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: QueryError | null;
          }>;
        };
      };
    };
    upsert: (
      values: Record<string, unknown>[],
      options: { onConflict: string },
    ) => Promise<{ error: QueryError | null }>;
  };
}

const CATALOG_MARKET = "kr";
const DEFAULT_RESEARCH_MODEL = "gemini-2.5-flash";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
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

function normalizeSourceSummary(raw: unknown): FashionCatalogSourceSummary | null {
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
    documentsCollected: typeof raw.documentsCollected === "number" ? raw.documentsCollected : undefined,
    documentsUsed: typeof raw.documentsUsed === "number" ? raw.documentsUsed : undefined,
    sourceNames: Array.isArray(raw.sourceNames)
      ? raw.sourceNames.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
      : undefined,
    topGenreSignals: Array.isArray(raw.topGenreSignals)
      ? raw.topGenreSignals
          .filter(isRecord)
          .map((item) => {
            const genre = typeof item.genre === "string" && FASHION_GENRES.includes(item.genre as FashionGenre)
              ? (item.genre as FashionGenre)
              : null;
            const labelKo = typeof item.labelKo === "string" ? cleanText(item.labelKo) : "";
            const signalCount = typeof item.signalCount === "number" ? item.signalCount : null;
            if (!genre || !labelKo || signalCount === null) {
              return null;
            }
            return { genre, labelKo, signalCount };
          })
          .filter((item): item is NonNullable<FashionCatalogSourceSummary["topGenreSignals"]>[number] => item !== null)
      : undefined,
  };
}

function normalizeCatalogCycle(raw: Record<string, unknown>): FashionCatalogCycle | null {
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

function normalizeCatalogItem(raw: unknown): FashionRecommendationItem | null {
  if (!isRecord(raw)) {
    return null;
  }

  const slot = raw.slot;
  if (slot !== "outer" && slot !== "top" && slot !== "bottom" && slot !== "shoes" && slot !== "accessory") {
    return null;
  }

  const name = typeof raw.name === "string" ? cleanText(raw.name) : "";
  const description = typeof raw.description === "string" ? cleanText(raw.description) : "";
  const color = typeof raw.color === "string" ? cleanText(raw.color) : "";
  const fit = typeof raw.fit === "string" ? cleanText(raw.fit) : "";
  const material = typeof raw.material === "string" ? cleanText(raw.material) : "";

  if (!name || !description || !color || !fit || !material) {
    return null;
  }

  return {
    slot,
    name,
    description,
    color,
    fit,
    material,
    brandName: typeof raw.brandName === "string" && raw.brandName.trim() ? cleanText(raw.brandName) : null,
    productUrl: typeof raw.productUrl === "string" && raw.productUrl.trim() ? cleanText(raw.productUrl) : null,
  };
}

function normalizeCatalogRow(raw: Record<string, unknown>): FashionCatalogRow | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  const slug = typeof raw.slug === "string" ? raw.slug : "";
  const genre = typeof raw.genre === "string" && FASHION_GENRES.includes(raw.genre as FashionGenre)
    ? (raw.genre as FashionGenre)
    : null;
  const headline = typeof raw.headline === "string" ? cleanText(raw.headline) : "";
  const summary = typeof raw.summary === "string" ? cleanText(raw.summary) : "";
  const market = typeof raw.market === "string" ? raw.market : "";
  const silhouette = typeof raw.silhouette === "string" ? cleanText(raw.silhouette) : "";
  const status = raw.status;
  const sourceCycleId = typeof raw.source_cycle_id === "string" ? raw.source_cycle_id : "";
  const createdAt = typeof raw.created_at === "string" ? raw.created_at : "";
  const updatedAt = typeof raw.updated_at === "string" ? raw.updated_at : "";
  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => normalizeCatalogItem(item)).filter((item): item is FashionRecommendationItem => item !== null)
    : [];

  if (
    !id ||
    !slug ||
    !genre ||
    !headline ||
    !summary ||
    !market ||
    !silhouette ||
    items.length === 0 ||
    !sourceCycleId ||
    (status !== "active" && status !== "archived")
  ) {
    return null;
  }

  return {
    id,
    slug,
    genre,
    headline,
    summary,
    market,
    palette: Array.isArray(raw.palette)
      ? raw.palette.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
      : [],
    silhouette,
    items,
    stylingNotes: Array.isArray(raw.styling_notes)
      ? raw.styling_notes.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
      : [],
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((item): item is string => typeof item === "string").map(cleanText).filter(Boolean)
      : [],
    trendScore: typeof raw.trend_score === "number" ? raw.trend_score : Number(raw.trend_score || 0),
    freshnessScore: typeof raw.freshness_score === "number" ? raw.freshness_score : Number(raw.freshness_score || 0),
    status,
    sourceCycleId,
    sourceSummary: normalizeSourceSummary(raw.source_summary),
    createdAt,
    updatedAt,
  };
}

function buildCycleSourceSummary(mode: FashionCatalogSourceMode, startedAt: string): FashionCatalogSourceSummary {
  if (mode === "seeded-weekly") {
    return buildSeedFashionSourceSummary(new Date(startedAt));
  }

  return {
    mode,
    queries: FASHION_GENRE_DEFINITIONS.flatMap((definition) =>
      definition.queryTerms.map((term) => `${new Date(startedAt).getFullYear()} ${term} 트렌드`),
    ),
    notes: "주간 패션 카탈로그 갱신을 위해 실시간 검색 신호를 수집하는 중입니다.",
    providers: ["google-news-rss", "gemini"],
  };
}

async function createFashionCatalogCycleForMode(mode: FashionCatalogSourceMode) {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseFashionCatalogClient;
  const startedAt = new Date().toISOString();
  const sourceSummary = buildCycleSourceSummary(mode, startedAt);

  const { data, error } = await supabase
    .from("fashion_catalog_cycles")
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
    throw new Error(error?.message || "Failed to create fashion catalog cycle");
  }

  const cycle = normalizeCatalogCycle(data);
  if (!cycle) {
    throw new Error("Failed to normalize fashion catalog cycle");
  }

  return cycle;
}

async function finalizeCatalogCycleFailure(
  supabase: SupabaseFashionCatalogClient,
  cycleId: string,
  message: string,
) {
  await supabase
    .from("fashion_catalog_cycles")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_log: message,
    })
    .eq("cycle_id", cycleId);
}

function summarizeDocumentsForPrompt(documents: FashionTrendResearchDocument[]) {
  return FASHION_GENRE_DEFINITIONS.map((definition) => {
    const genreDocuments = documents
      .filter((document) => document.genre === definition.genre)
      .slice(0, 8)
      .map((document) => ({
        title: document.title,
        snippet: document.snippet,
        sourceName: document.sourceName,
        publishedAt: document.publishedAt,
      }));

    return {
      genre: definition.genre,
      labelKo: definition.labelKo,
      descriptionKo: definition.descriptionKo,
      tags: definition.tags,
      documents: genreDocuments,
    };
  });
}

function getSignalScore(
  trendSignals: Map<FashionGenre, FashionTrendSignal>,
  genre: FashionGenre,
  key: "trendScore" | "freshnessScore",
) {
  return Math.round((trendSignals.get(genre)?.[key] ?? 60) * 100) / 100;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeGeneratedRows(
  raw: unknown,
  cycleId: string,
  nowIso: string,
  sourceSummary: FashionCatalogSourceSummary,
  trendSignals: Map<FashionGenre, FashionTrendSignal>,
) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const rows: FashionCatalogRow[] = [];
  const seedRows = buildSeedFashionCatalogRows(cycleId, nowIso, sourceSummary);

  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }

    const genre = typeof item.genre === "string" && FASHION_GENRES.includes(item.genre as FashionGenre)
      ? (item.genre as FashionGenre)
      : null;
    if (!genre || rows.some((row) => row.genre === genre)) {
      continue;
    }

    const seed = seedRows.find((row) => row.genre === genre);
    if (!seed) {
      continue;
    }

    const headline = typeof item.headline === "string" && item.headline.trim()
      ? cleanText(item.headline)
      : seed.headline;
    const summary = typeof item.summary === "string" && item.summary.trim()
      ? cleanText(item.summary)
      : seed.summary;
    const silhouette = typeof item.silhouette === "string" && item.silhouette.trim()
      ? cleanText(item.silhouette)
      : seed.silhouette;
    const generatedItems = Array.isArray(item.items)
      ? item.items.map((entry) => normalizeCatalogItem(entry)).filter((entry): entry is FashionRecommendationItem => entry !== null)
      : [];

    rows.push({
      ...seed,
      id: `${cycleId}-${genre}`,
      slug: `${genre}-${slugify(headline) || "weekly-catalog"}`,
      headline,
      summary,
      silhouette,
      palette: Array.isArray(item.palette)
        ? item.palette.filter((entry): entry is string => typeof entry === "string").map(cleanText).filter(Boolean).slice(0, 5)
        : seed.palette,
      items: generatedItems.length >= 5 ? generatedItems.slice(0, 5) : seed.items,
      stylingNotes: Array.isArray(item.stylingNotes)
        ? item.stylingNotes.filter((entry): entry is string => typeof entry === "string").map(cleanText).filter(Boolean).slice(0, 5)
        : seed.stylingNotes,
      tags: Array.from(
        new Set([
          ...seed.tags,
          ...(Array.isArray(item.tags)
            ? item.tags.filter((entry): entry is string => typeof entry === "string").map(cleanText).filter(Boolean)
            : []),
        ]),
      ).slice(0, 16),
      trendScore: getSignalScore(trendSignals, genre, "trendScore"),
      freshnessScore: getSignalScore(trendSignals, genre, "freshnessScore"),
      sourceSummary,
    });
  }

  for (const seed of seedRows) {
    if (!rows.some((row) => row.genre === seed.genre)) {
      rows.push({
        ...seed,
        trendScore: getSignalScore(trendSignals, seed.genre, "trendScore"),
        freshnessScore: getSignalScore(trendSignals, seed.genre, "freshnessScore"),
      });
    }
  }

  return rows;
}

async function generateRowsWithGemini(
  documents: FashionTrendResearchDocument[],
  trendSignals: Map<FashionGenre, FashionTrendSignal>,
  cycleId: string,
  nowIso: string,
  sourceSummary: FashionCatalogSourceSummary,
) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.includes("YOUR_")) {
    return buildSeedFashionCatalogRows(cycleId, nowIso, sourceSummary).map((row) => ({
      ...row,
      trendScore: getSignalScore(trendSignals, row.genre, "trendScore"),
      freshnessScore: getSignalScore(trendSignals, row.genre, "freshnessScore"),
    }));
  }

  const modelName = process.env.PROMPT_RESEARCH_MODEL || process.env.PROMPT_LLM_MODEL || DEFAULT_RESEARCH_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `
당신은 한국 패션 에디터입니다.
아래 장르별 검색 신호를 바탕으로 한국어 패션 코디 템플릿 카탈로그를 만드세요.
실제 상품명이나 쇼핑 링크를 만들지 말고, 코디 방향과 아이템 유형만 작성하세요.
반드시 JSON 배열만 반환하세요.

각 배열 항목 스키마:
{
  "genre": "minimal | street | casual | classic | office | date | formal | athleisure",
  "headline": "한국어 짧은 제목",
  "summary": "한국어 1문장 요약",
  "palette": ["색상 3~5개"],
  "silhouette": "한국어 실루엣 설명",
  "items": [
    {"slot":"outer","name":"...","description":"...","color":"...","fit":"...","material":"...","brandName":null,"productUrl":null},
    {"slot":"top","name":"...","description":"...","color":"...","fit":"...","material":"...","brandName":null,"productUrl":null},
    {"slot":"bottom","name":"...","description":"...","color":"...","fit":"...","material":"...","brandName":null,"productUrl":null},
    {"slot":"shoes","name":"...","description":"...","color":"...","fit":"...","material":"...","brandName":null,"productUrl":null},
    {"slot":"accessory","name":"...","description":"...","color":"...","fit":"...","material":"...","brandName":null,"productUrl":null}
  ],
  "stylingNotes": ["한국어 스타일링 메모 3~5개"],
  "tags": ["영문 또는 한국어 태그"]
}

검색 신호:
${JSON.stringify(summarizeDocumentsForPrompt(documents))}
`.trim();

  const result = await model.generateContent(prompt);
  const parsed = parseJsonResponse<unknown>(result.response.text());
  const rows = normalizeGeneratedRows(parsed, cycleId, nowIso, sourceSummary, trendSignals);

  return rows.length > 0 ? rows : buildSeedFashionCatalogRows(cycleId, nowIso, sourceSummary);
}

async function upsertCatalogRows(
  supabase: SupabaseFashionCatalogClient,
  rows: FashionCatalogRow[],
) {
  const slugs = rows.map((row) => row.slug);
  const existingResponse = await ((supabase
    .from("fashion_catalog")
    .select("slug")
    .in("slug", slugs)) as Promise<{
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

  const payload = rows.map((row) => ({
    slug: row.slug,
    genre: row.genre,
    headline: row.headline,
    summary: row.summary,
    market: row.market,
    palette: row.palette,
    silhouette: row.silhouette,
    items: row.items,
    styling_notes: row.stylingNotes,
    tags: row.tags,
    trend_score: row.trendScore,
    freshness_score: row.freshnessScore,
    status: row.status,
    source_cycle_id: row.sourceCycleId,
    source_summary: row.sourceSummary,
  }));

  const upsertResult = await supabase
    .from("fashion_catalog")
    .upsert(payload, { onConflict: "slug" });

  if (upsertResult.error) {
    throw new Error(upsertResult.error.message);
  }

  return {
    insertedCount: payload.filter((row) => !existingSlugs.has(row.slug)).length,
    updatedCount: payload.filter((row) => existingSlugs.has(row.slug)).length,
  };
}

async function rebuildCatalogWithMode(
  requestedMode: FashionCatalogRebuildMode,
  sourceMode: FashionCatalogSourceMode,
): Promise<FashionCatalogRebuildResult> {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseFashionCatalogClient;
  const cycle = await createFashionCatalogCycleForMode(sourceMode);
  const nowIso = new Date().toISOString();

  try {
    const research =
      sourceMode === "researched-weekly"
        ? await collectKoreanFashionTrendResearch(new Date(nowIso))
        : {
            documents: [] as FashionTrendResearchDocument[],
            trendSignals: new Map<FashionGenre, FashionTrendSignal>(),
            sourceSummary: buildSeedFashionSourceSummary(new Date(nowIso)),
          };

    const rows =
      sourceMode === "researched-weekly"
        ? await generateRowsWithGemini(
            research.documents,
            research.trendSignals,
            cycle.cycleId,
            nowIso,
            research.sourceSummary,
          )
        : buildSeedFashionCatalogRows(cycle.cycleId, nowIso, research.sourceSummary);

    const counts = await upsertCatalogRows(supabase, rows);
    const finishedAt = new Date().toISOString();
    const updateResult = await supabase
      .from("fashion_catalog_cycles")
      .update({
        status: "succeeded",
        finished_at: finishedAt,
        item_count: rows.length,
        error_log: null,
        source_summary: research.sourceSummary,
      })
      .eq("cycle_id", cycle.cycleId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    return {
      cycleId: cycle.cycleId,
      status: "succeeded",
      insertedCount: counts.insertedCount,
      updatedCount: counts.updatedCount,
      itemCount: rows.length,
      sourceSummary: research.sourceSummary,
      requestedMode,
      resolvedMode: sourceMode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected fashion catalog rebuild error";
    await finalizeCatalogCycleFailure(supabase, cycle.cycleId, message);
    throw error;
  }
}

export async function rebuildWeeklyFashionCatalog(
  mode: FashionCatalogRebuildMode = "auto",
): Promise<FashionCatalogRebuildResult> {
  if (mode === "seeded") {
    return rebuildCatalogWithMode(mode, "seeded-weekly");
  }

  if (mode === "researched") {
    return rebuildCatalogWithMode(mode, "researched-weekly");
  }

  try {
    return await rebuildCatalogWithMode(mode, "researched-weekly");
  } catch (error) {
    console.warn("[fashion-catalog] Live research rebuild failed, retrying with seeded fallback.", error);
    return rebuildCatalogWithMode(mode, "seeded-weekly");
  }
}

async function loadCatalogRows(
  supabase: SupabaseFashionCatalogClient,
  cycleId: string,
): Promise<FashionCatalogRow[]> {
  const response = await ((supabase
    .from("fashion_catalog")
    .select(
      "id,slug,genre,headline,summary,market,palette,silhouette,items,styling_notes,tags,trend_score,freshness_score,status,source_cycle_id,source_summary,created_at,updated_at",
    )
    .eq("source_cycle_id", cycleId)) as Promise<{
    data: Array<Record<string, unknown>> | null;
    error: QueryError | null;
  }>);

  if (response.error) {
    throw new Error(response.error.message);
  }

  return (response.data || [])
    .map((row) => normalizeCatalogRow(row))
    .filter((row): row is FashionCatalogRow => row !== null && row.status === "active");
}

export async function getLatestSuccessfulFashionCatalogCycle() {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseFashionCatalogClient;
  const query = supabase
    .from("fashion_catalog_cycles")
    .select("cycle_id,status,market,started_at,finished_at,item_count,source_summary,error_log")
    .eq("status", "succeeded") as {
      order: (column: string, options?: { ascending?: boolean }) => {
        limit: (count: number) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: QueryError | null;
          }>;
        };
      };
    };

  const response = await query
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (response.error) {
    throw new Error(response.error.message);
  }

  if (!response.data) {
    return null;
  }

  return normalizeCatalogCycle(response.data);
}

export async function ensureFashionCatalogAvailable(
  mode: FashionCatalogRebuildMode = "auto",
): Promise<FashionCatalogAvailabilityResult> {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseFashionCatalogClient;
  const latestCycle = await getLatestSuccessfulFashionCatalogCycle();

  if (latestCycle) {
    const rows = await loadCatalogRows(supabase, latestCycle.cycleId);
    if (rows.length > 0) {
      return {
        cycle: latestCycle,
        rows,
      };
    }
  }

  const rebuildResult = await rebuildWeeklyFashionCatalog(mode);
  const rebuiltCycle = await getLatestSuccessfulFashionCatalogCycle();
  if (!rebuiltCycle || rebuiltCycle.cycleId !== rebuildResult.cycleId) {
    throw new Error("Fashion catalog bootstrap did not produce a usable cycle.");
  }

  const rebuiltRows = await loadCatalogRows(supabase, rebuiltCycle.cycleId);
  if (rebuiltRows.length === 0) {
    throw new Error("Fashion catalog bootstrap produced an empty cycle.");
  }

  return {
    cycle: rebuiltCycle,
    rows: rebuiltRows,
  };
}

function tokenize(value: string | null | undefined) {
  return cleanText(value || "")
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/g)
    .filter(Boolean);
}

function scoreCatalogRow(
  row: FashionCatalogRow,
  profile: StyleProfile,
  hairVariant: GeneratedVariant,
  analysis: FaceAnalysisSummary | null,
) {
  let score = row.trendScore * 0.4 + row.freshnessScore * 0.25;
  const targetTags = new Set([
    ...tokenize(profile.bodyShape),
    ...tokenize(profile.fitPreference),
    ...tokenize(profile.exposurePreference),
    ...tokenize(profile.colorPreference),
    ...tokenize(hairVariant.lengthBucket),
    ...tokenize(hairVariant.correctionFocus),
    ...tokenize(analysis?.faceShape),
    ...tokenize(analysis?.balance),
  ]);

  for (const tag of row.tags.flatMap(tokenize)) {
    if (targetTags.has(tag)) {
      score += 3;
    }
  }

  const avoidTokens = new Set(profile.avoidItems.flatMap(tokenize));
  for (const item of row.items) {
    const itemText = `${item.name} ${item.description} ${item.fit} ${item.material}`;
    for (const token of tokenize(itemText)) {
      if (avoidTokens.has(token)) {
        score -= 12;
      }
    }
  }

  return Math.round(score * 100) / 100;
}

export function selectFashionCatalogItem({
  rows,
  genre,
  profile,
  hairVariant,
  analysis,
}: {
  rows: FashionCatalogRow[];
  genre: FashionGenre;
  profile: StyleProfile;
  hairVariant: GeneratedVariant;
  analysis: FaceAnalysisSummary | null;
}) {
  const genreRows = rows.filter((row) => row.genre === genre);
  const candidates = genreRows.length > 0 ? genreRows : rows;
  const scored = candidates
    .map((row) => ({
      row,
      score: scoreCatalogRow(row, profile, hairVariant, analysis),
    }))
    .sort((a, b) => b.score - a.score || a.row.slug.localeCompare(b.row.slug));

  const selected = scored[0]?.row;
  if (selected) {
    return selected;
  }

  const sourceSummary = buildSeedFashionSourceSummary();
  const fallbackRows = buildSeedFashionCatalogRows(`fallback-${Date.now()}`, new Date().toISOString(), sourceSummary);
  return fallbackRows.find((row) => row.genre === genre) || fallbackRows[0];
}

export function getFashionGenreLabelKo(genre: FashionGenre) {
  return getFashionGenreDefinition(genre).labelKo;
}

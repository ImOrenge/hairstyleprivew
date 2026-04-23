import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseAdminClient } from "./supabase";
import { buildCatalogRowsForCycle, buildKoreanWeeklyStyleQueries } from "./hairstyle-catalog-seed";
import { collectKoreanHairstyleTrendResearch } from "./hairstyle-trend-research";
import type {
  CatalogBackedRecommendationCandidate,
  CatalogSelectionContext,
  FaceAnalysisSummary,
  HairstyleCatalogCycle,
  HairstyleCatalogSourceSummary,
  HairstyleCatalogRow,
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
  "balance": "short string",
  "bestLengthStrategy": "short string",
  "volumeFocus": ["short string"],
  "avoidNotes": ["short string"],
  "summary": "one sentence"
}
`;

export const RECOMMENDATION_PROMPT_VERSION = "catalog-backed-grid-v1";

interface SupabaseCatalogClient {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order?: never;
        in?: never;
        limit?: never;
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
      in: (column: string, values: string[]) => {
        order: (column: string, options?: { ascending?: boolean }) => {
          returns?: never;
        };
        then?: never;
      };
      order: (column: string, options?: { ascending?: boolean }) => {
        limit: (count: number) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
          returns?: never;
        };
        then?: never;
      };
    };
    upsert: (
      values: Record<string, unknown>[],
      options: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
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

function composePrompt(row: HairstyleCatalogRow, analysis: FaceAnalysisSummary) {
  return [
    "reference photo hair edit",
    "same person as the reference photo",
    "change only the hairstyle and natural hair color",
    "keep face, skin tone, identity, expression, camera angle, background, and clothing unchanged",
    row.promptTemplate,
    `suited for ${analysis.faceShape}`,
    `head balance: ${analysis.balance}`,
    `best length strategy: ${analysis.bestLengthStrategy}`,
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

export function buildCatalogSelectionContext(analysis: FaceAnalysisSummary): CatalogSelectionContext {
  return {
    analysis,
    faceShapeTags: Array.from(new Set([
      ...tokenize(analysis.faceShape),
      ...tokenize(analysis.headShape),
    ])),
    volumeFocusTags: Array.from(new Set(analysis.volumeFocus.flatMap(tokenize))),
    avoidTags: Array.from(new Set(analysis.avoidNotes.flatMap(tokenize))),
    preferredLengthBuckets: derivePreferredLengthBuckets(analysis),
  };
}

function scoreCatalogRow(row: HairstyleCatalogRow, context: CatalogSelectionContext): number {
  let score = row.trendScore * 0.35 + row.freshnessScore * 0.25;

  const faceMatches = row.faceShapeFitTags.filter((tag) => context.faceShapeTags.includes(tag)).length;
  const volumeMatches = row.volumeFocusTags.filter((tag) => context.volumeFocusTags.includes(tag)).length;
  const avoidMatches = row.avoidTags.filter((tag) => context.avoidTags.includes(tag)).length;

  score += faceMatches * 12;
  score += volumeMatches * 8;
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
    prompt: composePrompt(row, context.analysis),
    negativePrompt: row.negativePrompt,
    tags: [row.lengthBucket, row.silhouette, row.texture, row.bangType, ...row.volumeFocusTags].filter(Boolean),
    lengthBucket: row.lengthBucket,
    correctionFocus: deriveCorrectionFocusFromRow(row),
    catalogItemId: row.id,
    catalogCycleId: cycleId,
    selectionScore: score,
    promptTemplateVersion: row.promptTemplateVersion,
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
  const supabase = getSupabaseAdminClient() as unknown as SupabaseCatalogClient;
  const startedAt = new Date().toISOString();
  const queries = buildKoreanWeeklyStyleQueries(new Date(startedAt));

  const { data, error } = await supabase
    .from("hairstyle_catalog_cycles")
    .insert({
      status: "running",
      market: "kr",
      started_at: startedAt,
      item_count: 0,
      source_summary: {
        mode: "researched-weekly",
        queries,
        notes: "Weekly Korean hairstyle rebuild is collecting live search signals.",
        providers: ["google-news-rss"],
      },
    })
    .select("cycle_id,status,market,started_at,finished_at,item_count,source_summary,error_log")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create hairstyle catalog cycle");
  }

  const cycle = normalizeCatalogCycle(data);
  if (!cycle) {
    throw new Error("Failed to normalize hairstyle catalog cycle");
  }

  return cycle;
}

export async function rebuildWeeklyHairstyleCatalog() {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseCatalogClient;
  const cycle = await createHairstyleCatalogCycle();
  const nowIso = new Date().toISOString();

  try {
    const research = await collectKoreanHairstyleTrendResearch(new Date(nowIso));
    const rows = buildCatalogRowsForCycle(cycle.cycleId, nowIso, research.trendSignals);
    const slugs = rows.map((row) => row.slug);

    const existingResponse = await ((supabase
      .from("hairstyle_catalog")
      .select("slug")
      .in("slug", slugs)) as unknown as Promise<{
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
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
      status: row.status,
      source_cycle_id: row.sourceCycleId,
    }));

    const upsertResult = await supabase
      .from("hairstyle_catalog")
      .upsert(upsertPayload, { onConflict: "slug" });

    if (upsertResult.error) {
      throw new Error(upsertResult.error.message);
    }

    const insertedCount = upsertPayload.filter((row) => !existingSlugs.has(row.slug)).length;
    const updatedCount = upsertPayload.length - insertedCount;

    const finishedAt = new Date().toISOString();
    const updateResult = await supabase
      .from("hairstyle_catalog_cycles")
      .update({
        status: "succeeded",
        finished_at: finishedAt,
        item_count: upsertPayload.length,
        error_log: null,
        source_summary: research.sourceSummary,
      })
      .eq("cycle_id", cycle.cycleId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    return {
      cycleId: cycle.cycleId,
      status: "succeeded" as const,
      insertedCount,
      updatedCount,
      itemCount: upsertPayload.length,
      sourceSummary: research.sourceSummary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected catalog rebuild error";
    await supabase
      .from("hairstyle_catalog_cycles")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_log: message,
      })
      .eq("cycle_id", cycle.cycleId);
    throw error;
  }
}

export async function getLatestSuccessfulCatalogCycle() {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseCatalogClient;
  const query = supabase
    .from("hairstyle_catalog_cycles")
    .select("cycle_id,status,market,started_at,finished_at,item_count,source_summary,error_log")
    .eq("status", "succeeded") as unknown as {
    order: (column: string, options?: { ascending?: boolean }) => {
      limit: (count: number) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  const response = await (query.order("started_at", { ascending: false }).limit(1).maybeSingle() as Promise<{
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }>);

  if (response.error) {
    throw new Error(response.error.message);
  }

  if (!response.data) {
    return null;
  }

  const cycle = normalizeCatalogCycle(response.data);
  if (!cycle) {
    return null;
  }

  return cycle;
}

export async function listCatalogRowsForCycle(cycleId: string) {
  const supabase = getSupabaseAdminClient() as unknown as SupabaseCatalogClient;
  const response = await ((supabase
    .from("hairstyle_catalog")
    .select(
      "id,slug,name_ko,description,market,length_bucket,silhouette,texture,bang_type,volume_focus_tags,face_shape_fit_tags,avoid_tags,trend_score,freshness_score,prompt_template,negative_prompt,prompt_template_version,status,source_cycle_id,created_at,updated_at",
    )
    .eq("source_cycle_id", cycleId)) as unknown as Promise<{
    data: Array<Record<string, unknown>> | null;
    error: { message: string } | null;
  }>);

  if (response.error) {
    throw new Error(response.error.message);
  }

  return (response.data || [])
    .map((row) => normalizeCatalogRow(row))
    .filter((row): row is HairstyleCatalogRow => row !== null && row.status === "active");
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

export async function generateCatalogBackedRecommendationSet(referenceImageDataUrl: string) {
  const latestCycle = await getLatestSuccessfulCatalogCycle();
  if (!latestCycle) {
    throw new Error("No successful hairstyle catalog cycle is available.");
  }

  const rows = await listCatalogRowsForCycle(latestCycle.cycleId);
  if (rows.length === 0) {
    throw new Error("Hairstyle catalog is empty for the latest successful cycle.");
  }

  const analysisRun = await analyzeFaceForCatalog(referenceImageDataUrl);
  const selectionContext = buildCatalogSelectionContext(analysisRun.analysis);
  const recommendations = buildTopNine(rows, selectionContext, latestCycle.cycleId);

  if (recommendations.length === 0) {
    throw new Error("No catalog-backed recommendations could be selected.");
  }

  return {
    analysis: analysisRun.analysis,
    recommendations,
    model: analysisRun.model,
    promptVersion: RECOMMENDATION_PROMPT_VERSION,
    catalogCycleId: latestCycle.cycleId,
    selectionContext,
  };
}

import {
  buildKoreanWeeklyStyleQueryRegistry,
  buildLegacyKoreanWeeklyStyleQueryRegistry,
  getRuntimeHairstyleBlueprints,
  type BlueprintTrendSignal,
  type KoreanWeeklyStyleQuery,
} from "./hairstyle-catalog-seed";
import type { HairstyleCatalogSourceSummary } from "./recommendation-types";

const GOOGLE_NEWS_RSS_BASE_URL = "https://news.google.com/rss/search";
const GOOGLE_NEWS_PROVIDER = "google-news-rss";
const PRIMARY_RESEARCH_LOOKBACK_DAYS = 60;
const FALLBACK_RESEARCH_LOOKBACK_DAYS = 120;
const FRESHNESS_WINDOW_DAYS = 30;
const MAX_ITEMS_PER_QUERY = 10;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_CONCURRENT_RSS_REQUESTS = 4;
const MAX_RSS_RETRIES = 2;

interface TrendResearchDocument {
  query: string;
  queryId: string;
  queryFacet: KoreanWeeklyStyleQuery;
  title: string;
  snippet: string;
  link: string;
  sourceName: string;
  sourceUrl: string | null;
  publishedAt: string | null;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value: string) {
  return cleanText(decodeHtmlEntities(value).replace(/<[^>]+>/g, " "));
}

function extractTag(block: string, tagName: string) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? stripHtml(match[1] || "") : "";
}

function extractSource(block: string) {
  const match = block.match(/<source(?:\s+url="([^"]*)")?>([\s\S]*?)<\/source>/i);

  return {
    sourceName: match ? stripHtml(match[2] || "") : "",
    sourceUrl: match?.[1] || null,
  };
}

function buildGoogleNewsUrl(query: string) {
  const params = new URLSearchParams({
    q: query,
    hl: "ko",
    gl: "KR",
    ceid: "KR:ko",
  });

  return `${GOOGLE_NEWS_RSS_BASE_URL}?${params.toString()}`;
}

function isRecentEnough(publishedAt: string | null, now = new Date(), lookbackDays = PRIMARY_RESEARCH_LOOKBACK_DAYS) {
  if (!publishedAt) {
    return true;
  }

  const publishedTime = Date.parse(publishedAt);
  if (Number.isNaN(publishedTime)) {
    return true;
  }

  const ageMs = now.getTime() - publishedTime;
  return ageMs <= lookbackDays * 24 * 60 * 60 * 1000;
}

function extractItemsFromRss(xml: string, queryFacet: KoreanWeeklyStyleQuery) {
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  return itemBlocks
    .map((block) => {
      const title = extractTag(block, "title");
      const link = extractTag(block, "link");
      const snippet = extractTag(block, "description");
      const pubDate = extractTag(block, "pubDate");
      const { sourceName, sourceUrl } = extractSource(block);

      if (!title || !link || !sourceName) {
        return null;
      }

      return {
        query: queryFacet.query,
        queryId: queryFacet.id,
        queryFacet,
        title,
        snippet,
        link,
        sourceName,
        sourceUrl,
        publishedAt: pubDate || null,
      } satisfies TrendResearchDocument;
    })
    .filter((item): item is TrendResearchDocument => item !== null);
}

async function fetchGoogleNewsDocuments(queryFacet: KoreanWeeklyStyleQuery) {
  for (let attempt = 0; attempt <= MAX_RSS_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(buildGoogleNewsUrl(queryFacet.query), {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "User-Agent": "HairStylePreviewCatalogBot/1.0",
        },
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === MAX_RSS_RETRIES) {
          throw new Error(`Failed to fetch Google News RSS for "${queryFacet.query}" (${response.status})`);
        }
      } else {
        const xml = await response.text();
        return extractItemsFromRss(xml, queryFacet).slice(0, MAX_ITEMS_PER_QUERY);
      }
    } catch (error) {
      const retryable = error instanceof TypeError || (error instanceof Error && error.name === "AbortError");
      if (!retryable || attempt === MAX_RSS_RETRIES) throw error;
    } finally {
      clearTimeout(timeout);
    }

    const backoffMs = 250 * (2 ** attempt) + Math.floor(Math.random() * 150);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  return [];
}

async function mapSettledWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function tokenize(value: string) {
  return cleanText(value)
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter(Boolean);
}

function buildKeywordMatcher(keyword: string) {
  const normalized = cleanText(keyword).toLowerCase();
  if (!normalized) {
    return null;
  }

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9가-힣])${escaped}([^a-z0-9가-힣]|$)`, "i");
}

function textContainsKeyword(text: string, keyword: string) {
  const matcher = buildKeywordMatcher(keyword);
  if (!matcher) {
    return false;
  }

  return matcher.test(text);
}

function recencyWeight(publishedAt: string | null, now = new Date()) {
  if (!publishedAt) {
    return 0.4;
  }

  const publishedTime = Date.parse(publishedAt);
  if (Number.isNaN(publishedTime)) {
    return 0.4;
  }

  const ageDays = Math.max(0, (now.getTime() - publishedTime) / (24 * 60 * 60 * 1000));
  if (ageDays <= 7) {
    return 1;
  }
  if (ageDays <= 30) {
    return 0.8;
  }
  if (ageDays <= 90) {
    return 0.55;
  }
  if (ageDays <= 180) {
    return 0.35;
  }

  return 0.2;
}

function hasFreshDocument(documents: TrendResearchDocument[], now = new Date()) {
  return documents.some((document) => isRecentEnough(document.publishedAt, now, FRESHNESS_WINDOW_DAYS));
}

function buildDocumentKey(document: TrendResearchDocument) {
  return [document.title, document.sourceName, document.publishedAt || ""].join("::");
}

function scoreTrendSignals(documents: TrendResearchDocument[]) {
  const trendSignals = new Map<string, BlueprintTrendSignal>();
  const normalizedDocuments = documents.map((document) => ({
    ...document,
    normalizedText: cleanText(`${document.title} ${document.snippet}`).toLowerCase(),
  }));

  for (const blueprint of getRuntimeHairstyleBlueprints()) {
    const matchingDocuments = normalizedDocuments.filter((document) =>
      blueprint.trendKeywords.some((keyword) => textContainsKeyword(document.normalizedText, keyword)),
    );

    const distinctSources = new Set(matchingDocuments.map((document) => document.sourceName));
    const distinctQueries = new Set(matchingDocuments.map((document) => document.query));
    const recencyBoost = matchingDocuments.reduce(
      (sum, document) => sum + recencyWeight(document.publishedAt),
      0,
    );
    const explicitKeywordHits = matchingDocuments.reduce((sum, document) => {
      const exactHits = blueprint.trendKeywords.filter((keyword) =>
        textContainsKeyword(document.normalizedText, keyword),
      ).length;
      return sum + exactHits;
    }, 0);
    const facetMatches = matchingDocuments.filter((document) => {
      const facet = document.queryFacet;
      return (!facet.styleTarget || blueprint.styleTargets?.includes(facet.styleTarget))
        && (!facet.lengthBucket || facet.lengthBucket === blueprint.lengthBucket)
        && (!facet.textureFacet || facet.textureFacet === blueprint.primaryTexture)
        && (!facet.strandThicknessFacet || facet.strandThicknessFacet === blueprint.primaryStrandThickness)
        && (!facet.conditionFacet || facet.conditionFacet === blueprint.primaryCondition);
    }).length;

    const trendScore =
      blueprint.baselineTrendScore -
      8 +
      matchingDocuments.length * 6 +
      explicitKeywordHits * 1.5 +
      facetMatches * 2.5 +
      distinctQueries.size * 2 +
      distinctSources.size * 1.5;
    const freshnessScore =
      blueprint.baselineFreshnessScore -
      10 +
      recencyBoost * 16 +
      distinctQueries.size * 1.5;

    trendSignals.set(blueprint.slug, {
      slug: blueprint.slug,
      signalCount: matchingDocuments.length,
      trendScore,
      freshnessScore,
    });
  }

  return trendSignals;
}

function filterRelevantDocuments(documents: TrendResearchDocument[]) {
  return documents.filter((document) => {
    const combined = cleanText(`${document.title} ${document.snippet}`).toLowerCase();

    return getRuntimeHairstyleBlueprints().some((blueprint) =>
      blueprint.trendKeywords.some((keyword) => textContainsKeyword(combined, keyword)),
    );
  });
}

function buildSeededFallbackTrendSignals() {
  return new Map(
    getRuntimeHairstyleBlueprints().map((blueprint) => [
      blueprint.slug,
      {
        slug: blueprint.slug,
        signalCount: 0,
        trendScore: blueprint.baselineTrendScore,
        freshnessScore: blueprint.baselineFreshnessScore,
      } satisfies BlueprintTrendSignal,
    ]),
  );
}

function buildTopStyleSignals(trendSignals: Map<string, BlueprintTrendSignal>) {
  return [...trendSignals.values()]
    .sort((a, b) => b.signalCount - a.signalCount || b.trendScore - a.trendScore)
    .slice(0, 6)
    .map((signal) => {
      const blueprint = getRuntimeHairstyleBlueprints().find((item) => item.slug === signal.slug);

      return {
        slug: signal.slug,
        nameKo: blueprint?.nameKo || signal.slug,
        signalCount: signal.signalCount,
      };
    });
}

export async function collectKoreanHairstyleTrendResearch(referenceDate = new Date()) {
  const structuredRssEnabled = process.env.HAIRSTYLE_RSS_FACETS_V2_ENABLED?.trim().toLowerCase() === "true";
  const queryRegistry = structuredRssEnabled
    ? buildKoreanWeeklyStyleQueryRegistry(referenceDate)
    : buildLegacyKoreanWeeklyStyleQueryRegistry(referenceDate);
  const queries = queryRegistry.map((item) => item.query);
  const queryResults = await mapSettledWithConcurrency(
    queryRegistry,
    MAX_CONCURRENT_RSS_REQUESTS,
    fetchGoogleNewsDocuments,
  );
  const querySuccessCount = queryResults.filter((result) => result.status === "fulfilled").length;
  const queryFailureCount = queryResults.length - querySuccessCount;
  const fulfilledQueryIds = new Set(
    queryResults.flatMap((result) => result.status === "fulfilled" ? result.value.map((document) => document.queryId) : []),
  );
  const coverageWarnings = queryRegistry
    .filter((query) => !fulfilledQueryIds.has(query.id))
    .map((query) => query.id);

  const fulfilledDocuments = queryResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const primaryDocuments = fulfilledDocuments.filter((document) =>
    isRecentEnough(document.publishedAt, referenceDate, PRIMARY_RESEARCH_LOOKBACK_DAYS),
  );

  const primaryDedupedDocuments = Array.from(
    new Map(primaryDocuments.map((document) => [buildDocumentKey(document), document])).values(),
  );
  const primaryRelevantDocuments = filterRelevantDocuments(primaryDedupedDocuments);
  const usedFallback = primaryRelevantDocuments.length === 0;
  const fallbackDedupedDocuments = usedFallback
    ? Array.from(
        new Map(
          fulfilledDocuments
            .filter((document) => isRecentEnough(document.publishedAt, referenceDate, FALLBACK_RESEARCH_LOOKBACK_DAYS))
            .map((document) => [buildDocumentKey(document), document]),
        ).values(),
      )
    : [];
  const fallbackRelevantDocuments = usedFallback ? filterRelevantDocuments(fallbackDedupedDocuments) : [];
  const dedupedDocuments = usedFallback ? fallbackDedupedDocuments : primaryDedupedDocuments;
  const relevantDocuments = usedFallback ? fallbackRelevantDocuments : primaryRelevantDocuments;

  if (relevantDocuments.length === 0) {
    const failures = queryResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason))
      .slice(0, 3);
    const trendSignals = buildSeededFallbackTrendSignals();

    const detail = failures.length > 0 ? ` Failures: ${failures.join(" | ")}` : "";
    return {
      documents: [],
      trendSignals,
      sourceSummary: {
        mode: "researched-weekly",
        queries,
        notes: `Google News RSS research was unavailable; rebuilt from curated hairstyle blueprint baselines.${detail}`,
        providers: [GOOGLE_NEWS_PROVIDER, "curated-blueprints"],
        primaryLookbackDays: PRIMARY_RESEARCH_LOOKBACK_DAYS,
        fallbackLookbackDays: FALLBACK_RESEARCH_LOOKBACK_DAYS,
        effectiveLookbackDays: FALLBACK_RESEARCH_LOOKBACK_DAYS,
        freshnessWindowDays: FRESHNESS_WINDOW_DAYS,
        freshnessStatus: "seeded",
        documentsCollected: dedupedDocuments.length,
        documentsUsed: 0,
        queryCount: queryRegistry.length,
        querySuccessCount,
        queryFailureCount,
        coverageWarnings,
        sourceNames: [],
        topStyleSignals: buildTopStyleSignals(trendSignals),
      } satisfies HairstyleCatalogSourceSummary,
    };
  }

  const trendSignals = scoreTrendSignals(relevantDocuments);
  const freshnessStatus = usedFallback
    ? "fallback"
    : hasFreshDocument(relevantDocuments, referenceDate)
      ? "fresh"
      : "lowFreshness";

  const sourceSummary: HairstyleCatalogSourceSummary = {
    mode: "researched-weekly",
    queries,
    notes: "Weekly Korean hairstyle catalog rebuilt from live Google News RSS search results and curated style blueprints.",
    providers: [GOOGLE_NEWS_PROVIDER],
    primaryLookbackDays: PRIMARY_RESEARCH_LOOKBACK_DAYS,
    fallbackLookbackDays: FALLBACK_RESEARCH_LOOKBACK_DAYS,
    effectiveLookbackDays: usedFallback ? FALLBACK_RESEARCH_LOOKBACK_DAYS : PRIMARY_RESEARCH_LOOKBACK_DAYS,
    freshnessWindowDays: FRESHNESS_WINDOW_DAYS,
    freshnessStatus,
    documentsCollected: dedupedDocuments.length,
    documentsUsed: relevantDocuments.length,
    queryCount: queryRegistry.length,
    querySuccessCount,
    queryFailureCount,
    coverageWarnings,
    sourceNames: Array.from(new Set(relevantDocuments.map((document) => document.sourceName))).slice(0, 20),
    topStyleSignals: buildTopStyleSignals(trendSignals),
  };

  return {
    documents: relevantDocuments,
    trendSignals,
    sourceSummary,
  };
}

export function summarizeTrendSignalCoverage(trendSignals: Map<string, BlueprintTrendSignal>) {
  return Array.from(trendSignals.values()).reduce((sum, signal) => sum + signal.signalCount, 0);
}

export function extractTrendKeywordsSnapshot() {
  return Array.from(
    new Set(getRuntimeHairstyleBlueprints().flatMap((blueprint) => blueprint.trendKeywords.flatMap(tokenize))),
  );
}

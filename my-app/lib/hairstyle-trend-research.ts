import {
  buildKoreanWeeklyStyleQueries,
  KOREAN_HAIRSTYLE_BLUEPRINTS,
  type BlueprintTrendSignal,
} from "./hairstyle-catalog-seed";
import type { HairstyleCatalogSourceSummary } from "./recommendation-types";

const GOOGLE_NEWS_RSS_BASE_URL = "https://news.google.com/rss/search";
const GOOGLE_NEWS_PROVIDER = "google-news-rss";
const RESEARCH_LOOKBACK_DAYS = 240;
const MAX_ITEMS_PER_QUERY = 10;
const REQUEST_TIMEOUT_MS = 12000;

interface TrendResearchDocument {
  query: string;
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

function isRecentEnough(publishedAt: string | null, now = new Date()) {
  if (!publishedAt) {
    return true;
  }

  const publishedTime = Date.parse(publishedAt);
  if (Number.isNaN(publishedTime)) {
    return true;
  }

  const ageMs = now.getTime() - publishedTime;
  return ageMs <= RESEARCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
}

function extractItemsFromRss(xml: string, query: string) {
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
        query,
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

async function fetchGoogleNewsDocuments(query: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(buildGoogleNewsUrl(query), {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "HariStylePreviewCatalogBot/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Google News RSS for "${query}" (${response.status})`);
    }

    const xml = await response.text();
    return extractItemsFromRss(xml, query).slice(0, MAX_ITEMS_PER_QUERY);
  } finally {
    clearTimeout(timeout);
  }
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

function buildDocumentKey(document: TrendResearchDocument) {
  return [document.title, document.sourceName, document.publishedAt || ""].join("::");
}

function scoreTrendSignals(documents: TrendResearchDocument[]) {
  const trendSignals = new Map<string, BlueprintTrendSignal>();
  const normalizedDocuments = documents.map((document) => ({
    ...document,
    normalizedText: cleanText(`${document.title} ${document.snippet}`).toLowerCase(),
  }));

  for (const blueprint of KOREAN_HAIRSTYLE_BLUEPRINTS) {
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

    const trendScore =
      blueprint.baselineTrendScore -
      8 +
      matchingDocuments.length * 6 +
      explicitKeywordHits * 1.5 +
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

    return KOREAN_HAIRSTYLE_BLUEPRINTS.some((blueprint) =>
      blueprint.trendKeywords.some((keyword) => textContainsKeyword(combined, keyword)),
    );
  });
}

export async function collectKoreanHairstyleTrendResearch(referenceDate = new Date()) {
  const queries = buildKoreanWeeklyStyleQueries(referenceDate);
  const queryResults = await Promise.allSettled(queries.map((query) => fetchGoogleNewsDocuments(query)));

  const fulfilledDocuments = queryResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const recentDocuments = fulfilledDocuments.filter((document) => isRecentEnough(document.publishedAt, referenceDate));

  const dedupedDocuments = Array.from(
    new Map(recentDocuments.map((document) => [buildDocumentKey(document), document])).values(),
  );
  const relevantDocuments = filterRelevantDocuments(dedupedDocuments);

  if (relevantDocuments.length === 0) {
    const failures = queryResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason))
      .slice(0, 3);

    const detail = failures.length > 0 ? ` Failures: ${failures.join(" | ")}` : "";
    throw new Error(`No usable Korean hairstyle research documents were collected.${detail}`);
  }

  const trendSignals = scoreTrendSignals(relevantDocuments);
  const topStyleSignals = [...trendSignals.values()]
    .sort((a, b) => b.signalCount - a.signalCount || b.trendScore - a.trendScore)
    .slice(0, 6)
    .map((signal) => {
      const blueprint = KOREAN_HAIRSTYLE_BLUEPRINTS.find((item) => item.slug === signal.slug);

      return {
        slug: signal.slug,
        nameKo: blueprint?.nameKo || signal.slug,
        signalCount: signal.signalCount,
      };
    });

  const sourceSummary: HairstyleCatalogSourceSummary = {
    mode: "researched-weekly",
    queries,
    notes: "Weekly Korean hairstyle catalog rebuilt from live Google News RSS search results and curated style blueprints.",
    providers: [GOOGLE_NEWS_PROVIDER],
    documentsCollected: dedupedDocuments.length,
    documentsUsed: relevantDocuments.length,
    sourceNames: Array.from(new Set(relevantDocuments.map((document) => document.sourceName))).slice(0, 20),
    topStyleSignals,
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
    new Set(KOREAN_HAIRSTYLE_BLUEPRINTS.flatMap((blueprint) => blueprint.trendKeywords.flatMap(tokenize))),
  );
}

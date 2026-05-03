import {
  FASHION_GENRE_DEFINITIONS,
  buildKoreanWeeklyFashionQueries,
  getFashionGenreDefinition,
} from "./fashion-genre-seed";
import type { FashionCatalogSourceSummary, FashionGenre } from "./fashion-types";

const GOOGLE_NEWS_RSS_BASE_URL = "https://news.google.com/rss/search";
const GOOGLE_NEWS_PROVIDER = "google-news-rss";
const RESEARCH_LOOKBACK_DAYS = 240;
const MAX_ITEMS_PER_QUERY = 8;
const REQUEST_TIMEOUT_MS = 12000;

export interface FashionTrendResearchDocument {
  genre: FashionGenre;
  query: string;
  title: string;
  snippet: string;
  link: string;
  sourceName: string;
  sourceUrl: string | null;
  publishedAt: string | null;
}

export interface FashionTrendSignal {
  genre: FashionGenre;
  signalCount: number;
  trendScore: number;
  freshnessScore: number;
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

function extractItemsFromRss(xml: string, query: string, genre: FashionGenre) {
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
        genre,
        query,
        title,
        snippet,
        link,
        sourceName,
        sourceUrl,
        publishedAt: pubDate || null,
      } satisfies FashionTrendResearchDocument;
    })
    .filter((item): item is FashionTrendResearchDocument => item !== null);
}

async function fetchGoogleNewsDocuments(query: string, genre: FashionGenre) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(buildGoogleNewsUrl(query), {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "HairStylePreviewFashionCatalogBot/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Google News RSS for "${query}" (${response.status})`);
    }

    const xml = await response.text();
    return extractItemsFromRss(xml, query, genre).slice(0, MAX_ITEMS_PER_QUERY);
  } finally {
    clearTimeout(timeout);
  }
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
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.8;
  if (ageDays <= 90) return 0.55;
  if (ageDays <= 180) return 0.35;
  return 0.2;
}

function buildDocumentKey(document: FashionTrendResearchDocument) {
  return [document.title, document.sourceName, document.publishedAt || ""].join("::");
}

function buildGenreQueryPairs(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  return FASHION_GENRE_DEFINITIONS.flatMap((definition) =>
    definition.queryTerms.map((term) => ({
      genre: definition.genre,
      query: `${year} ${term} 트렌드`,
    })),
  );
}

function scoreTrendSignals(documents: FashionTrendResearchDocument[]) {
  const trendSignals = new Map<FashionGenre, FashionTrendSignal>();

  for (const definition of FASHION_GENRE_DEFINITIONS) {
    const matchingDocuments = documents.filter((document) => document.genre === definition.genre);
    const distinctSources = new Set(matchingDocuments.map((document) => document.sourceName));
    const distinctQueries = new Set(matchingDocuments.map((document) => document.query));
    const recencyBoost = matchingDocuments.reduce(
      (sum, document) => sum + recencyWeight(document.publishedAt),
      0,
    );

    trendSignals.set(definition.genre, {
      genre: definition.genre,
      signalCount: matchingDocuments.length,
      trendScore: 60 + matchingDocuments.length * 4 + distinctSources.size * 2,
      freshnessScore: 50 + recencyBoost * 12 + distinctQueries.size * 1.5,
    });
  }

  return trendSignals;
}

export async function collectKoreanFashionTrendResearch(referenceDate = new Date()) {
  const queryPairs = buildGenreQueryPairs(referenceDate);
  const queryResults = await Promise.allSettled(
    queryPairs.map(({ query, genre }) => fetchGoogleNewsDocuments(query, genre)),
  );

  const fulfilledDocuments = queryResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const recentDocuments = fulfilledDocuments.filter((document) => isRecentEnough(document.publishedAt, referenceDate));
  const dedupedDocuments = Array.from(
    new Map(recentDocuments.map((document) => [buildDocumentKey(document), document])).values(),
  );

  if (dedupedDocuments.length === 0) {
    const failures = queryResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason))
      .slice(0, 3);

    const detail = failures.length > 0 ? ` Failures: ${failures.join(" | ")}` : "";
    throw new Error(`No usable Korean fashion research documents were collected.${detail}`);
  }

  const trendSignals = scoreTrendSignals(dedupedDocuments);
  const topGenreSignals = [...trendSignals.values()]
    .sort((a, b) => b.signalCount - a.signalCount || b.trendScore - a.trendScore)
    .slice(0, 8)
    .map((signal) => {
      const definition = getFashionGenreDefinition(signal.genre);

      return {
        genre: signal.genre,
        labelKo: definition.labelKo,
        signalCount: signal.signalCount,
      };
    });

  const sourceSummary: FashionCatalogSourceSummary = {
    mode: "researched-weekly",
    queries: buildKoreanWeeklyFashionQueries(referenceDate),
    notes: "Google News RSS 검색 결과와 기본 장르 정의를 기반으로 주간 패션 카탈로그를 갱신했습니다.",
    providers: [GOOGLE_NEWS_PROVIDER],
    documentsCollected: dedupedDocuments.length,
    documentsUsed: dedupedDocuments.length,
    sourceNames: Array.from(new Set(dedupedDocuments.map((document) => document.sourceName))).slice(0, 20),
    topGenreSignals,
  };

  return {
    documents: dedupedDocuments,
    trendSignals,
    sourceSummary,
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { getRuntimeHairstyleBlueprints } from "./hairstyle-catalog-seed.ts";
import { collectKoreanHairstyleTrendResearch } from "./hairstyle-trend-research.ts";

const referenceDate = new Date("2026-08-08T00:00:00.000Z");

function rssXml({
  title,
  source = "Hair News",
  publishedAt = "Fri, 07 Aug 2026 00:00:00 GMT",
  duplicate = false,
}: {
  title: string;
  source?: string;
  publishedAt?: string;
  duplicate?: boolean;
}) {
  const item = `<item><title>${title}</title><link>https://example.test/${encodeURIComponent(title)}</link><description>2026 레이어드컷 &amp; 스타일 분석</description><pubDate>${publishedAt}</pubDate><source url="https://example.test">${source}</source></item>`;
  return `<rss><channel>${item}${duplicate ? item : ""}</channel></rss>`;
}

function queryIndex(input: string | URL | Request) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  const query = url.searchParams.get("q") || "";
  return Math.abs(Array.from(query).reduce((sum, character) => sum + character.charCodeAt(0), 0));
}

test("recorded 60-query fixture runs without network and caps one-source concentration", async () => {
  let requestCount = 0;
  const result = await collectKoreanHairstyleTrendResearch(referenceDate, {
    structuredRssEnabled: true,
    retryDelay: async () => undefined,
    fetcher: async (input) => {
      requestCount += 1;
      const index = queryIndex(input);
      return new Response(rssXml({
        title: `레이어드컷 &amp; recorded-${index}`,
        source: "Concentrated News",
        publishedAt: index % 2 === 0 ? "invalid-date" : "Fri, 07 Aug 2026 00:00:00 GMT",
        duplicate: index % 3 === 0,
      }), { status: 200 });
    },
  });

  assert.equal(requestCount, 60);
  assert.equal(result.sourceSummary.queryCount, 60);
  assert.equal(result.sourceSummary.querySuccessCount, 60);
  assert.equal(result.sourceSummary.querySuccessRatio, 1);
  assert.equal(result.sourceSummary.rssFacetEmptyCount, 0);
  assert.equal(result.sourceSummary.qualityGateStatus, "pass");
  assert.equal(result.sourceSummary.distinctSourceCount, 1);
  assert.equal(result.sourceSummary.maxSourceConcentration, 1);
  assert.ok((result.sourceSummary.sourceConcentrationCappedSignalCount || 0) > 0);
  assert.ok(result.documents.some((document) => document.title.includes("& recorded-")));

  const cappedSignal = Array.from(result.trendSignals.values()).find((signal) => signal.sourceConcentrationCapped);
  assert.ok(cappedSignal);
  const blueprint = getRuntimeHairstyleBlueprints().find((item) => item.slug === cappedSignal.slug);
  assert.ok(blueprint);
  assert.ok(cappedSignal.trendScore <= blueprint.baselineTrendScore + 12);
});

test("partial query failures are deterministic warnings rather than network-dependent failures", async () => {
  let requestCount = 0;
  const result = await collectKoreanHairstyleTrendResearch(referenceDate, {
    structuredRssEnabled: true,
    retryDelay: async () => undefined,
    fetcher: async (input) => {
      requestCount += 1;
      if (queryIndex(input) % 11 === 0) throw new TypeError("recorded network failure");
      return new Response(rssXml({ title: `레이어드컷 partial-${queryIndex(input)}` }), { status: 200 });
    },
  });

  assert.ok(requestCount > 60, "retryable failures must be retried");
  assert.ok((result.sourceSummary.queryFailureCount || 0) > 0);
  assert.ok((result.sourceSummary.querySuccessRatio || 1) < 1);
  assert.equal(result.sourceSummary.qualityGateStatus, "warn");
  assert.equal(result.sourceSummary.rssFacetEmptyCount, result.sourceSummary.coverageWarnings?.length);
});

test("all-query failure returns seeded evidence and a blocked activation quality gate", async () => {
  const result = await collectKoreanHairstyleTrendResearch(referenceDate, {
    structuredRssEnabled: true,
    retryDelay: async () => undefined,
    fetcher: async () => {
      throw new TypeError("recorded total outage");
    },
  });

  assert.equal(result.documents.length, 0);
  assert.equal(result.sourceSummary.freshnessStatus, "seeded");
  assert.equal(result.sourceSummary.querySuccessRatio, 0);
  assert.equal(result.sourceSummary.qualityGateStatus, "blocked");
  assert.equal(result.sourceSummary.coverageWarnings?.length, 60);
  assert.ok(Array.from(result.trendSignals.values()).every((signal) => signal.evidenceStatus === "seeded"));
});

test("configured Supabase Edge transport keeps Google RSS URL and credentials server-side", async () => {
  const proxyUrl = "https://dpzdhxlqnogfpubpslbf.supabase.co/functions/v1/hairstyle-rss-proxy";
  const authToken = "recorded-service-role-token";
  let requestCount = 0;
  const result = await collectKoreanHairstyleTrendResearch(referenceDate, {
    structuredRssEnabled: true,
    rssProxyUrl: proxyUrl,
    rssProxyAuthToken: authToken,
    retryDelay: async () => undefined,
    fetcher: async (input, init) => {
      requestCount += 1;
      assert.equal(String(input), proxyUrl);
      assert.equal(init?.method, "POST");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("apikey"), authToken);
      assert.equal(headers.get("authorization"), `Bearer ${authToken}`);
      const payload = JSON.parse(String(init?.body)) as { url: string };
      const googleUrl = new URL(payload.url);
      assert.equal(googleUrl.origin, "https://news.google.com");
      assert.equal(googleUrl.pathname, "/rss/search");
      assert.equal(googleUrl.searchParams.get("hl"), "ko");
      assert.equal(googleUrl.searchParams.get("gl"), "KR");
      assert.equal(googleUrl.searchParams.get("ceid"), "KR:ko");
      return new Response(rssXml({ title: `헤어스타일 proxy-${queryIndex(googleUrl)}` }), { status: 200 });
    },
  });

  assert.equal(requestCount, 60);
  assert.equal(result.sourceSummary.rssTransport, "supabase-edge");
  assert.equal(result.sourceSummary.querySuccessCount, 60);
  assert.ok(result.documents.length > 0);
});

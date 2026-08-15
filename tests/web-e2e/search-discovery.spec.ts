import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const canaryPath = "/discover/ai-hairstyle-simulation";
const discoveryPages = [
  { id: "D-AI-SIM", slug: "ai-hairstyle-simulation", title: "AI 헤어스타일 시뮬레이션, 9가지 후보 비교 | HairFit", h1: "AI 헤어스타일 시뮬레이션, 한 장에서 9가지 후보 비교", cta: "프라이빗 AI 컨설팅 시작", experience: "simulation-decision-lab", sampleLayout: "direction-matrix" },
  { id: "D-FACE", slug: "face-shape-hairstyle", title: "얼굴형에 맞는 헤어스타일, 얼굴선으로 비교하기 | HairFit", h1: "얼굴형 헤어스타일, 이름보다 얼굴선과 길이로 비교", cta: "내 얼굴선 기준 상담 시작", experience: "face-line-field-guide", sampleLayout: "observation-rails" },
  { id: "D-MEN", slug: "men-hairstyle-simulation", title: "남자 헤어스타일 시뮬레이션, 가르마·길이 비교 | HairFit", h1: "남자 헤어스타일 시뮬레이션, 가르마와 길이를 한눈에", cta: "남자 헤어 컨설팅 시작", experience: "men-grooming-planner", sampleLayout: "grooming-schedule" },
  { id: "D-WOMEN", slug: "women-hairstyle-simulation", title: "여자 헤어스타일 시뮬레이션, 단발·미디엄·롱 비교 | HairFit", h1: "여자 헤어스타일 시뮬레이션, 단발부터 롱까지 비교", cta: "여자 헤어 컨설팅 시작", experience: "women-length-planner", sampleLayout: "length-chapters" },
  { id: "D-BANGS", slug: "bangs-preview", title: "앞머리 미리보기, 시스루·오픈·컬 프린지 비교 | HairFit", h1: "앞머리 미리보기, 자르기 전에 이마 노출부터 비교", cta: "앞머리 컨설팅 시작", experience: "bangs-risk-planner", sampleLayout: "fringe-baseline" },
  { id: "D-BOB", slug: "bob-cut-preview", title: "단발 미리보기, 보브컷 길이와 끝선 비교 | HairFit", h1: "단발 미리보기, 턱선과 어깨선 사이를 구체적으로 비교", cta: "단발 컨설팅 시작", experience: "bob-cut-planner", sampleLayout: "cut-ladder" },
  { id: "D-SALON", slug: "salon-consultation-image", title: "미용실 상담 이미지, 후보와 요청사항 정리하기 | HairFit", h1: "미용실 상담 이미지, 예쁜 사진보다 비교 이유까지 준비", cta: "미용실 상담 보드 만들기", experience: "salon-brief-builder", sampleLayout: "salon-shortlist" },
] as const;
const artifactKinds = ["simulation-map", "face-observation", "men-grooming", "women-length", "bangs-risk", "bob-cut-ladder", "salon-brief"] as const;
const viewports = [
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

async function dismissAutomaticNotice(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
}

test("D-AI-SIM renders its static content, metadata and conversion", async ({ page }) => {
  await page.goto(canaryPath, { waitUntil: "load" });
  await dismissAutomaticNotice(page);
  await expect(page).toHaveTitle("AI 헤어스타일 시뮬레이션, 9가지 후보 비교 | HairFit");
  await expect(page.getByRole("heading", { level: 1, name: "AI 헤어스타일 시뮬레이션, 한 장에서 9가지 후보 비교" })).toBeVisible();
  await expect(page.locator("#sample-comparison figure img")).toHaveCount(9);
  await expect(page.getByRole("link", { name: "프라이빗 AI 컨설팅 시작" })).toHaveAttribute("href", "/consulting/new");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/discover\/ai-hairstyle-simulation$/);
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(jsonLd).toContain('"FAQPage"');
  expect(jsonLd).toContain("사진을 올리지 않고도 샘플을 볼 수 있나요?");
  expect(await page.locator("[data-nextjs-dialog]").count()).toBe(0);
});

test("discovery hub links every published search intent", async ({ page }) => {
  await page.goto("/discover", { waitUntil: "load" });
  await dismissAutomaticNotice(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("검색에서 찾은 질문");
  for (const definition of discoveryPages) {
    await expect(page.locator(`a[href="/discover/${definition.slug}"]`)).toBeVisible();
  }
});

for (const [pageIndex, definition] of discoveryPages.entries()) {
  test(`${definition.id} renders unique metadata, static content and conversion`, async ({ page, request }) => {
    const path = `/discover/${definition.slug}`;
    await page.goto(path, { waitUntil: "load" });
    await dismissAutomaticNotice(page);
    await expect(page).toHaveTitle(definition.title);
    await expect(page.getByRole("heading", { level: 1, name: definition.h1 })).toBeVisible();
    await expect(page.locator("#sample-comparison figure img")).toHaveCount(9);
    await expect(page.locator("#sample-comparison figcaption[data-catalog-style]")).toHaveCount(9);
    await expect(page.locator("#sample-comparison figcaption strong")).toHaveCount(9);
    await expect(page.locator("#sample-comparison")).toHaveAttribute("data-sample-layout", definition.sampleLayout);
    await expect(page.locator("[data-intent-experience]")).toHaveAttribute("data-intent-experience", definition.experience);
    await expect(page.locator("[data-discovery-page]")).toHaveAttribute("data-discovery-page", definition.id);
    await expect(page.locator("#discovery-artifact [data-artifact-kind]")).toHaveAttribute("data-artifact-kind", artifactKinds[pageIndex]);
    await expect(page.locator("#discovery-artifact article")).toHaveCount(definition.id === "D-AI-SIM" || definition.id === "D-MEN" || definition.id === "D-WOMEN" ? 3 : 4);
    await expect(page.getByRole("link", { name: definition.cta })).toHaveAttribute("href", "/consulting/new");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/discover/${definition.slug}$`));
    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    expect(jsonLd).toContain('"FAQPage"');
    expect(await page.locator("[data-nextjs-dialog]").count()).toBe(0);

    const response = await request.get(path);
    const html = await response.text();
    expect(response.ok()).toBe(true);
    expect(html).toContain(definition.h1);
    expect(html).toContain('/consulting/new');
    expect(html).toContain('id="sample-comparison"');
    expect(html).toContain('id="discovery-faq"');
  });

  test(`${definition.id} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(`/discover/${definition.slug}`, { waitUntil: "load" });
    await dismissAutomaticNotice(page);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
  });

  for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 900 }] as const) {
    test(`${definition.id} ${viewport.name} layout has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/discover/${definition.slug}`, { waitUntil: "load" });
      await dismissAutomaticNotice(page);
      const overflow = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      await expect(page.getByRole("link", { name: definition.cta })).toBeVisible();
    });
  }
}

test("all seven pages render different source models", async ({ page }) => {
  const personIds = new Set<string>();
  for (const definition of discoveryPages) {
    await page.goto(`/discover/${definition.slug}`, { waitUntil: "load" });
    const personId = await page.locator("figure[data-source-person-id]").getAttribute("data-source-person-id");
    expect(personId).toBeTruthy();
    personIds.add(personId!);
  }
  expect(personIds.size).toBe(discoveryPages.length);
});

test("D-AI-SIM has no serious or critical accessibility violations", async ({ page }) => {
  await page.goto(canaryPath, { waitUntil: "load" });
  await dismissAutomaticNotice(page);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
});

test("skip link focuses the shared main content boundary", async ({ page }) => {
  await page.goto(canaryPath, { waitUntil: "load" });
  await dismissAutomaticNotice(page);
  const skipLink = page.getByRole("link", { name: "본문 바로가기" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

for (const viewport of viewports) {
  test(`${viewport.name}px has no horizontal overflow and keeps the CTA visible`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(canaryPath, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await dismissAutomaticNotice(page);
    const overflow = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    await expect(page.getByRole("link", { name: "프라이빗 AI 컨설팅 시작" })).toBeVisible();
    await expect(page).toHaveScreenshot(`search-discovery-${viewport.name}.png`, {
      animations: "disabled",
      caret: "hide",
      fullPage: false,
      maxDiffPixelRatio: 0.005,
      scale: "css",
    });
  });
}

test("preview layout and alt text survive image request failures", async ({ page }) => {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "image") await route.abort();
    else await route.continue();
  });
  await page.goto(canaryPath, { waitUntil: "domcontentloaded" });
  const firstPreview = page.locator("#sample-comparison figure").first();
  const image = firstPreview.locator("img");
  await expect(image).toHaveAttribute("alt", /HairFit 카탈로그 .* 후보/);
  const box = await firstPreview.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(60);
  expect(box?.height ?? 0).toBeGreaterThan(60);
});

test("unknown discovery slug returns 404", async ({ request }) => {
  const response = await request.get("/discover/not-registered");
  expect(response.status()).toBe(404);
});

test("local performance observation stays within the discovery budget", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { lcp: 0, cls: 0, events: [] as number[] };
    Object.assign(window, { __hairfitPerformance: state });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) state.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.events.push(entry.duration);
      }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    } catch {
      // Event Timing can be unavailable in older browsers; LCP/CLS remain authoritative here.
    }
  });
  await page.goto("/discover/salon-consultation-image", { waitUntil: "networkidle" });
  await dismissAutomaticNotice(page);
  await page.locator("#discovery-faq summary").first().click();
  await page.waitForTimeout(300);
  const metrics = await page.evaluate(() => {
    const state = (window as typeof window & { __hairfitPerformance: { lcp: number; cls: number; events: number[] } }).__hairfitPerformance;
    return { lcp: state.lcp, cls: state.cls, inp: state.events.length ? Math.max(...state.events) : 0 };
  });
  expect(metrics.lcp).toBeGreaterThan(0);
  expect(metrics.lcp).toBeLessThanOrEqual(2500);
  expect(metrics.cls).toBeLessThanOrEqual(0.1);
  expect(metrics.inp).toBeLessThanOrEqual(200);
});

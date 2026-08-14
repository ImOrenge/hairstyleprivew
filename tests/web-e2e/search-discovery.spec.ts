import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const canaryPath = "/discover/ai-hairstyle-simulation";
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
  expect(jsonLd).toContain("사진을 올리지 않고도 이 페이지를 볼 수 있나요?");
  expect(await page.locator("[data-nextjs-dialog]").count()).toBe(0);
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

test("core content is present in the static HTML response", async ({ request }) => {
  const response = await request.get(canaryPath);
  const html = await response.text();

  expect(response.ok()).toBe(true);
  expect(html).toContain("AI 헤어스타일 시뮬레이션, 한 장에서 9가지 후보 비교");
  expect(html).toContain("/consulting/new");
  expect(html).toContain("id=\"sample-comparison\"");
  expect(html).toContain("id=\"discovery-faq\"");
});

test("preview layout and alt text survive image request failures", async ({ page }) => {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "image") await route.abort();
    else await route.continue();
  });
  await page.goto(canaryPath, { waitUntil: "domcontentloaded" });
  const firstPreview = page.locator("#sample-comparison figure").first();
  const image = firstPreview.locator("img");
  await expect(image).toHaveAttribute("alt", /AI 헤어 후보/);
  const box = await firstPreview.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(60);
  expect(box?.height ?? 0).toBeGreaterThan(60);
});

test("unknown discovery slug returns 404", async ({ request }) => {
  const response = await request.get("/discover/not-registered");
  expect(response.status()).toBe(404);
});

test("local performance observation stays within the canary budget", async ({ page }) => {
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
  await page.goto(canaryPath, { waitUntil: "networkidle" });
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

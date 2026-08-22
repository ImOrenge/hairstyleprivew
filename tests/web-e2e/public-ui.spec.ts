import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const publicRoutes = [
  { name: "home", path: "/" },
  { name: "b2b-contact", path: "/b2b/contact" },
  { name: "login", path: "/login" },
  { name: "signup", path: "/signup" },
  { name: "privacy", path: "/privacy-policy" },
  { name: "terms", path: "/terms-of-service" },
] as const;

const viewportMatrix = [
  { name: "320", width: 320, height: 800 },
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 900 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1440", width: 1440, height: 1000 },
] as const;

async function dismissAutomaticNotice(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
}

test.describe("public web accessibility", () => {
  for (const route of publicRoutes) {
    test(`${route.name} has no serious WCAG A/AA axe violations`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "load" });

      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const seriousViolations = result.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          targets: violation.nodes.flatMap((node) => node.target),
        }));

      expect(seriousViolations).toEqual([]);
    });
  }
});

test("public keyboard flow preserves skip-link, tablist, and FAQ behavior", async ({ page }) => {
  await page.goto("/");

  const automaticNotice = page.getByRole("dialog");
  if (await automaticNotice.isVisible()) {
    await expect(automaticNotice.getByRole("button", { name: "공지 닫기" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(automaticNotice).toBeHidden();
  }

  const skipLink = page.getByRole("link", { name: "본문 바로가기" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const hairPreviewTabs = page.getByRole("tablist", { name: "헤어 프리뷰 모델 선택" });
  const maleTab = hairPreviewTabs.getByRole("tab", { name: "남성" });
  const femaleTab = hairPreviewTabs.getByRole("tab", { name: "여성" });
  await maleTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(femaleTab).toBeFocused();
  await expect(femaleTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(femaleTab).toBeFocused();
  await expect(femaleTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(maleTab).toBeFocused();
  await expect(maleTab).toHaveAttribute("aria-selected", "true");

  await page.goto("/discover/personal-color-makeup", { waitUntil: "load" });
  await dismissAutomaticNotice(page);
  const faqSummary = page.locator("#discovery-faq summary").first();
  await expect(faqSummary).toBeVisible();
  await faqSummary.focus();
  await page.keyboard.press("Enter");
  await expect(faqSummary.locator("..")).toHaveAttribute("open", "");
});

test("homepage renders the ordered 00 through 11 journey with makeup and current aftercare", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  await dismissAutomaticNotice(page);

  const sceneIds = [
    "home-hero",
    "analysis-evidence",
    "user-direction",
    "strategic-preview",
    "compare-decision",
    "salon-brief",
    "makeup-direction",
    "fashion-direction",
    "style-dossier",
    "aftercare",
    "trust",
    "services",
  ] as const;
  const tops = await page.locator(sceneIds.map((id) => `#${id}`).join(", ")).evaluateAll((nodes) =>
    nodes.map((node) => ({ id: node.id, top: node.getBoundingClientRect().top + window.scrollY })),
  );
  expect(tops.map(({ id }) => id)).toEqual(sceneIds);
  expect(tops.map(({ top }) => top)).toEqual([...tops.map(({ top }) => top)].sort((a, b) => a - b));

  await expect(page.locator("#home-hero").getByText("00", { exact: true })).toBeVisible();
  for (const [index, id] of sceneIds.slice(1).entries()) {
    await expect(page.locator(`#${id} .f-landing-scene__number`)).toHaveText(String(index + 1).padStart(2, "0"));
  }
  await expect(page.getByRole("heading", { name: "퍼스널 컬러를 메이크업 방향으로 연결합니다" })).toBeVisible();
  await expect(page.locator('#makeup-direction a[href="/discover/personal-color-makeup"]')).toBeVisible();
  for (const schedule of ["D+1", "D+3", "D+7", "D+30", "D+45", "D+90"]) {
    await expect(page.locator("#aftercare").getByText(schedule, { exact: true })).toBeVisible();
  }
  await expect(page.locator('header a[href="/discover"]')).toContainText("스타일 가이드");
});

test("homepage and makeup discovery keep a 320px viewport free of horizontal overflow", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of ["/", "/discover/personal-color-makeup"] as const) {
    await page.goto(path, { waitUntil: "load" });
    await dismissAutomaticNotice(page);
    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(await page.locator("[data-nextjs-dialog]").count()).toBe(0);
  }
  expect(consoleErrors).toEqual([]);
});

test.describe("homepage viewport baselines", () => {
  for (const viewport of viewportMatrix) {
    test(`${viewport.name}px has no horizontal overflow and matches baseline`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/", { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await dismissAutomaticNotice(page);

      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      await expect(page).toHaveScreenshot(`home-${viewport.name}.png`, {
        animations: "disabled",
        caret: "hide",
        fullPage: false,
        maxDiffPixelRatio: 0.005,
        scale: "css",
      });
    });
  }
});

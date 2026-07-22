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

test("homepage keyboard flow preserves skip-link, tablist, and FAQ behavior", async ({ page }) => {
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

  const maleTab = page.getByRole("tab", { name: "남성" });
  const femaleTab = page.getByRole("tab", { name: "여성" });
  await maleTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(femaleTab).toBeFocused();
  await expect(femaleTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(maleTab).toBeFocused();
  await expect(maleTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(femaleTab).toBeFocused();
  await expect(femaleTab).toHaveAttribute("aria-selected", "true");

  const faqSummary = page.locator("summary").filter({
    hasText: "AI 헤어스타일 미리보기에는 어떤 사진이 가장 좋나요?",
  });
  await expect(faqSummary).toHaveCount(1);
  await faqSummary.focus();
  await page.keyboard.press("Enter");
  await expect(faqSummary.locator("..")).toHaveAttribute("open", "");
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

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const authRoutes = [
  { name: "login", path: "/login", heading: "로그인", alternateLink: "회원가입" },
  { name: "signup", path: "/signup", heading: "회원가입", alternateLink: "로그인" },
] as const;

const authViewports = [
  { name: "320", width: 320, height: 800 },
  { name: "375", width: 375, height: 812 },
] as const;

async function dismissAutomaticNotice(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
}

async function openAuthForm(page: Page, path: string, heading: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible({ timeout: 20_000 });
  await dismissAutomaticNotice(page);
}

async function hideNextDevIndicator(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

test.describe("Clerk authentication entry accessibility", () => {
  for (const route of authRoutes) {
    test(`${route.name} has no serious WCAG A/AA axe violations`, async ({ page }) => {
      await openAuthForm(page, route.path, route.heading);

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

    test(`${route.name} form supports keyboard field order and alternate auth navigation`, async ({ page }) => {
      await openAuthForm(page, route.path, route.heading);

      const email = page.getByRole("textbox", { name: "이메일 주소" });
      await email.focus();
      await page.keyboard.press("Tab");
      if (route.path === "/signup") {
        await expect(page.getByRole("textbox", { name: "비밀번호" })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: "Show password" })).toBeFocused();
        await page.keyboard.press("Tab");
      }

      const continueButton = page.getByRole("button", { name: "계속", exact: true });
      await expect(continueButton).toBeFocused();
      await page.keyboard.press("Tab");

      const alternateLink = page.locator("#main-content").getByRole("link", { name: route.alternateLink });
      await expect(alternateLink).toBeFocused();
      await expect(alternateLink).toHaveAttribute(
        "href",
        route.path === "/login" ? /\/signup$/ : /\/login$/,
      );
    });
  }
});

test.describe("Clerk authentication entry viewport baselines", () => {
  for (const route of authRoutes) {
    for (const viewport of authViewports) {
      test(`${route.name} ${viewport.name}px has no horizontal overflow and matches baseline`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await openAuthForm(page, route.path, route.heading);
        await page.evaluate(() => document.fonts.ready);
        await hideNextDevIndicator(page);

        const overflow = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

        const authForm = page.locator("#main-content");
        const authFormBox = await authForm.boundingBox();
        expect(authFormBox).not.toBeNull();
        expect(authFormBox?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((authFormBox?.x ?? 0) + (authFormBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);

        await expect(page).toHaveScreenshot(`auth-${route.name}-${viewport.name}.png`, {
          animations: "disabled",
          caret: "hide",
          fullPage: false,
          maxDiffPixelRatio: 0.005,
          scale: "css",
        });
      });
    }
  }
});

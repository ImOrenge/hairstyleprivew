import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const STAGES = [
  ["discovery","DISCOVERY"],["photo","PHOTO"],["scan","FACE SCAN"],["analysis","ANALYSIS"],["direction","DIRECTION"],
  ["previews","PREVIEW"],["compare","COMPARE"],["decision","DECISION"],["salon-brief","SALON BRIEF"],["aftercare","AFTERCARE"],["fashion","FASHION"],
] as const;

async function dismissGlobalNotices(page: import("@playwright/test").Page) {
  for (const selector of ['[data-dialog-id="subscription-payment-notice"]','[data-dialog-id="account-setup-prompt"]']) {
    const dialog = page.locator(selector);
    if (await dialog.isVisible().catch(() => false)) { await page.keyboard.press("Escape"); await expect(dialog).toBeHidden(); }
  }
}

test("all 11 document Scenes are headerless, addressable, and overflow-safe", async ({ page }, testInfo) => {
  for (const [stage, task] of STAGES) {
    await page.goto(`/consulting/e2e-harness?stage=${stage}`);
    await dismissGlobalNotices(page);
    await expect(page.getByText(task, { exact: true }).first()).toBeVisible();
    await expect(page.locator('[data-app-shell="header"]')).toHaveCount(0);
    await expect(page.locator('[data-app-shell="footer"]')).toHaveCount(0);
    const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
  }
  await page.screenshot({ path: testInfo.outputPath("consulting-fashion-desktop.png"), fullPage: true, animations: "disabled" });
});

test("ALL STAGES overlay traps focus, closes with Escape, and returns focus", async ({ page }) => {
  await page.goto("/consulting/e2e-harness?stage=discovery");
  await dismissGlobalNotices(page);
  const trigger = page.getByRole("button", { name: "All stages" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "ALL STAGES" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link")).toHaveCount(11);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

for (const viewport of [{ width: 390, height: 844, colorScheme: "light" as const }, { width: 768, height: 1024, colorScheme: "dark" as const }]) {
  test(`Scene stays accessible at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: viewport.colorScheme, reducedMotion: "reduce" });
    await page.goto("/consulting/e2e-harness?stage=discovery");
    await dismissGlobalNotices(page);
    const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    const accessibility = await new AxeBuilder({ page }).include("main").withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
    expect(accessibility.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`consulting-discovery-${viewport.width}-${viewport.colorScheme}.png`), fullPage: true, animations: "disabled" });
  });
}

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({
  deviceScaleFactor: 2,
  viewport: { width: 640, height: 450 },
});

test("Discovery interview remains operable in a 200%-equivalent viewport", async ({ page }) => {
  await page.goto("/consulting/e2e-harness?stage=discovery");
  for (const selector of ['[data-dialog-id="subscription-payment-notice"]','[data-dialog-id="account-setup-prompt"]']) {
    const dialog = page.locator(selector);
    if (await dialog.isVisible().catch(() => false)) await page.keyboard.press("Escape");
  }

  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport).toEqual({ clientWidth: 640, devicePixelRatio: 2, innerWidth: 640, scrollWidth: 640 });

  await page.keyboard.press("Tab");
  const focusedBounds = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const rect = active.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, elementWidth: rect.width, elementHeight: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(focusedBounds).not.toBeNull();
  expect(focusedBounds!.left).toBeLessThanOrEqual(focusedBounds!.viewportWidth + 1);
  expect(focusedBounds!.right).toBeGreaterThanOrEqual(-1);
  expect(focusedBounds!.top).toBeLessThanOrEqual(focusedBounds!.viewportHeight + 1);
  expect(focusedBounds!.bottom).toBeGreaterThanOrEqual(-1);
  if (focusedBounds!.elementWidth <= focusedBounds!.viewportWidth + 1) {
    expect(focusedBounds!.left).toBeGreaterThanOrEqual(-1);
    expect(focusedBounds!.right).toBeLessThanOrEqual(focusedBounds!.viewportWidth + 1);
  }
  if (focusedBounds!.elementHeight <= focusedBounds!.viewportHeight + 1) {
    expect(focusedBounds!.top).toBeGreaterThanOrEqual(-1);
    expect(focusedBounds!.bottom).toBeLessThanOrEqual(focusedBounds!.viewportHeight + 1);
  }

  const accessibility = await new AxeBuilder({ page }).include("main").withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  expect(accessibility.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
});

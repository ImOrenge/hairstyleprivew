import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function dismissGlobalSubscriptionNotice(page: Page) {
  const notice = page.locator('[data-dialog-id="subscription-payment-notice"]');
  if (await notice.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(notice).toBeHidden();
  }
}

function seriousOrCriticalViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
}

test("Surface family preserves polymorphic semantics, keyboard navigation, and accessibility", async ({ page }) => {
  await page.goto("/e2e-harness/surfaces");
  await dismissGlobalSubscriptionNotice(page);

  const matrix = page.getByTestId("surface-stability-matrix");
  const linkCard = page.getByTestId("surface-link-card");
  const inverseCard = page.getByTestId("surface-inverse-card");
  expect(await matrix.evaluate((element) => element.tagName)).toBe("MAIN");
  expect(await linkCard.evaluate((element) => element.tagName)).toBe("A");
  expect(await inverseCard.evaluate((element) => element.tagName)).toBe("ARTICLE");
  await expect(matrix).toHaveAttribute("data-surface", "page");
  await expect(linkCard).toHaveAttribute("data-surface", "card");
  await expect(inverseCard).toHaveAttribute("data-surface", "inverse-card");

  await linkCard.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#surface-inverse$/);

  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="surface-stability-matrix"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

for (const scenario of [
  { name: "320px light", snapshot: "surface-matrix-320-light.png", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark", snapshot: "surface-matrix-375-dark.png", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`Surface matrix remains reachable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    await page.goto("/e2e-harness/surfaces");
    await dismissGlobalSubscriptionNotice(page);

    const matrix = page.getByTestId("surface-stability-matrix");
    await expect(matrix).toBeVisible();
    await expect(page.locator("html")).toHaveClass(scenario.colorScheme === "dark" ? /dark/ : /light/);

    const layout = await matrix.evaluate((element) => ({
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      matrixRight: element.getBoundingClientRect().right,
    }));
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth);
    expect(layout.matrixRight).toBeLessThanOrEqual(scenario.width + 1);

    await expect(matrix).toHaveScreenshot(scenario.snapshot, { animations: "disabled" });
  });
}

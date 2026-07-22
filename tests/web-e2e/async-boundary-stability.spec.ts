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

test("AsyncBoundary exposes precedence, live regions, actions, and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e-harness/async-boundary");
  await dismissGlobalSubscriptionNotice(page);

  const error = page.locator('[data-async-state="error"]');
  const pending = page.locator('[data-async-state="pending"]');
  const empty = page.locator('[data-async-state="empty"]');
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toHaveAttribute("aria-live", "assertive");
  await expect(pending).toHaveAttribute("role", "status");
  await expect(pending).toHaveAttribute("aria-busy", "true");
  await expect(pending).toHaveAttribute("aria-atomic", "true");
  await expect(empty).toHaveAttribute("role", "status");
  await expect(empty).toHaveAttribute("aria-live", "polite");
  await expect(page.getByTestId("async-ready-content")).toBeVisible();
  await expect(page.getByText("표시되지 않아야 하는 준비 상태")).toHaveCount(0);

  const spinner = pending.locator(".c-async-boundary__spinner");
  await expect(spinner).toHaveCSS("animation-name", "none");

  const retry = page.getByRole("button", { name: "다시 시도" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("async-action-status")).toHaveText("오류 복구 요청됨");

  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="async-boundary-matrix"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

for (const scenario of [
  { name: "320px light", snapshot: "async-boundary-320-light.png", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark", snapshot: "async-boundary-375-dark.png", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`AsyncBoundary matrix remains readable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme, reducedMotion: "reduce" });
    await page.goto("/e2e-harness/async-boundary");
    await dismissGlobalSubscriptionNotice(page);

    const matrix = page.getByTestId("async-boundary-matrix");
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

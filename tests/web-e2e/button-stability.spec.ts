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

test("Button exposes keyboard, disabled, loading, and accessibility contracts", async ({ page }) => {
  await page.goto("/e2e-harness/buttons");
  await dismissGlobalSubscriptionNotice(page);

  const primary = page.getByTestId("button-primary");
  const status = page.getByRole("status");
  await expect(primary).toHaveAttribute("data-variant", "primary");
  await expect(primary).toHaveAttribute("data-state", "enabled");
  await primary.focus();
  await page.keyboard.press("Space");
  await expect(status).toHaveText("실행 횟수 1");

  const disabled = page.getByRole("button", { name: "사용할 수 없음" });
  const ariaDisabled = page.getByRole("button", { name: "권한으로 비활성" });
  const loading = page.getByRole("button", { name: "저장하는 중…" });
  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveAttribute("data-state", "disabled");
  await expect(ariaDisabled).toBeDisabled();
  await expect(ariaDisabled).toHaveAttribute("data-state", "disabled");
  await expect(loading).toBeDisabled();
  await expect(loading).toHaveAttribute("aria-busy", "true");
  await expect(loading).toHaveAttribute("data-state", "loading");

  await disabled.evaluate((element) => (element as HTMLButtonElement).click());
  await ariaDisabled.evaluate((element) => (element as HTMLButtonElement).click());
  await loading.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(status).toHaveText("실행 횟수 1");

  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="button-stability-matrix"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

for (const scenario of [
  { name: "320px light", snapshot: "button-matrix-320-light.png", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark", snapshot: "button-matrix-375-dark.png", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`Button matrix remains reachable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    await page.goto("/e2e-harness/buttons");
    await dismissGlobalSubscriptionNotice(page);

    const matrix = page.getByTestId("button-stability-matrix");
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

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

function seriousOrCriticalViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
}

async function openHarness(page: Page) {
  await page.goto("/e2e-harness/personal-color-progress");
  for (const dialogId of ["subscription-payment-notice", "account-setup-prompt"]) {
    const dialog = page.locator(`[data-dialog-id="${dialogId}"]`);
    if (await dialog.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
}

async function expectNoOverflowAndNoSeriousAxe(page: Page) {
  const harness = page.locator('[data-e2e-personal-color-progress="true"]');
  const layout = await harness.evaluate((element) => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    mainRight: element.getBoundingClientRect().right,
  }));
  expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth);
  expect(layout.mainRight).toBeLessThanOrEqual(layout.documentClientWidth + 1);

  const accessibility = await new AxeBuilder({ page })
    .include('[data-e2e-personal-color-progress="true"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
}

test("personal color progress announces one truthful status and keeps decorative previews hidden", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await openHarness(page);

  const status = page.getByRole("status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(status).toHaveText("개인컬러 분석을 진행하고 있습니다. 결과가 준비되면 자동으로 표시됩니다.");
  const progress = page.locator(".c-personal-color-progress");
  const visualMessage = page.locator('[data-personal-color-message="true"]');
  await expect(progress).toHaveAttribute("data-motion", "allowed");
  await expect(visualMessage).toHaveText("얼굴 톤 기준점을 잡는 중");
  await expect(visualMessage).toHaveText("웜/쿨 밸런스를 비교하는 중", { timeout: 2_700 });

  await expect(page.locator(".c-personal-color-analysis-preview")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".c-personal-color-face-scan")).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: "스캔 오버레이 숨기기" }).click();
  await expect(page.locator(".c-personal-color-face-scan")).toHaveCount(0);
  await page.getByRole("button", { name: "스캔 오버레이 보기" }).click();
  await expect(page.locator(".c-personal-color-face-scan")).toBeVisible();

  await expectNoOverflowAndNoSeriousAxe(page);
  await expect(page.locator('[data-e2e-personal-color-progress="true"]')).toHaveScreenshot("personal-color-progress-1024-motion-light.png", {
    animations: "disabled",
  });
});

for (const scenario of [
  { width: 320, height: 800, colorScheme: "light" as const },
  { width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`personal color progress respects reduced motion at ${scenario.width}px ${scenario.colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme, reducedMotion: "reduce" });
    await openHarness(page);

    const status = page.getByRole("status");
    const progress = page.locator(".c-personal-color-progress");
    const visualMessage = page.locator('[data-personal-color-message="true"]');
    await expect(progress).toHaveAttribute("data-motion", "reduced");
    await expect(status).toHaveText("개인컬러 분석을 진행하고 있습니다. 결과가 준비되면 자동으로 표시됩니다.");
    await expect(visualMessage).toHaveText("얼굴 톤 기준점을 잡는 중");
    await page.waitForTimeout(1_900);
    await expect(visualMessage).toHaveText("얼굴 톤 기준점을 잡는 중");

    const animationNames = await page
      .locator(".personal-color-scan-line, .personal-color-panel-flow, .personal-color-pulse")
      .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
    expect(animationNames).toEqual(["none", "none", "none"]);
    await expect(page.locator("html")).toHaveClass(scenario.colorScheme === "dark" ? /dark/ : /light/);

    await expectNoOverflowAndNoSeriousAxe(page);
    await expect(page.locator('[data-e2e-personal-color-progress="true"]')).toHaveScreenshot(
      `personal-color-progress-${scenario.width}-reduced-${scenario.colorScheme}.png`,
      { animations: "disabled" },
    );
  });
}

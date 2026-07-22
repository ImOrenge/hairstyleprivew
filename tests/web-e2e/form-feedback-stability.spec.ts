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

test("FormField keeps label, description, error, required, and disabled semantics connected", async ({ page }) => {
  await page.goto("/e2e-harness/form-feedback");
  await dismissGlobalSubscriptionNotice(page);

  const email = page.getByRole("textbox", { name: "이메일" });
  await expect(email).toHaveAttribute("id", "e2e-email");
  await expect(email).toHaveAttribute("required", "");
  await expect(email).toHaveAttribute("aria-describedby", "e2e-email-description");
  await page.locator('label[for="e2e-email"]').click();
  await expect(email).toBeFocused();

  await page.getByRole("button", { name: "오류 표시" }).click();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAttribute("aria-errormessage", "e2e-email-error");
  await expect(email).toHaveAttribute("aria-describedby", "e2e-email-description e2e-email-error");
  const error = page.locator("#e2e-email-error");
  await expect(error).toHaveText("이메일 형식을 확인해 주세요.");
  await expect(error).toHaveAttribute("aria-live", "polite");
  await expect(error).toHaveAttribute("aria-atomic", "true");

  const salon = page.getByRole("textbox", { name: "살롱명" });
  await expect(salon).toBeDisabled();
  await expect(
    salon.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' c-form-field ')]"),
  ).toHaveAttribute("data-state", "disabled");

  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="form-feedback-matrix"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

test("InlineAlert maps tones to atomic live regions and keeps recovery keyboard operable", async ({ page }) => {
  await page.goto("/e2e-harness/form-feedback");
  await dismissGlobalSubscriptionNotice(page);

  for (const tone of ["info", "success", "warning"]) {
    const alert = page.locator(`.c-inline-alert[data-tone="${tone}"]`);
    await expect(alert).toHaveAttribute("role", "status");
    await expect(alert).toHaveAttribute("aria-live", "polite");
    await expect(alert).toHaveAttribute("aria-atomic", "true");
  }

  const danger = page.locator('.c-inline-alert[data-tone="danger"]');
  await expect(danger).toHaveAttribute("role", "alert");
  await expect(danger).toHaveAttribute("aria-live", "assertive");
  await expect(danger).toHaveAttribute("aria-atomic", "true");

  const retry = danger.getByRole("button", { name: "다시 시도" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(danger).toContainText("재시도 1회 요청됨");
});

for (const scenario of [
  { name: "320px light", snapshot: "form-feedback-320-light.png", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark", snapshot: "form-feedback-375-dark.png", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`Form and feedback matrix remains readable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    await page.goto("/e2e-harness/form-feedback");
    await dismissGlobalSubscriptionNotice(page);
    await page.getByRole("button", { name: "오류 표시" }).click();

    const matrix = page.getByTestId("form-feedback-matrix");
    await expect(matrix).toBeVisible();
    await expect(page.locator("html")).toHaveClass(scenario.colorScheme === "dark" ? /dark/ : /light/);

    const layout = await matrix.evaluate((element) => ({
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      matrixRight: element.getBoundingClientRect().right,
    }));
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth);
    expect(layout.matrixRight).toBeLessThanOrEqual(scenario.width + 1);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="form-feedback-matrix"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await expect(matrix).toHaveScreenshot(scenario.snapshot, { animations: "disabled" });
  });
}

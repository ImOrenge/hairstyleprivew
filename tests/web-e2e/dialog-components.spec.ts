import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function dismissAutomaticDialogs(page: Page) {
  const subscription = page.locator('[data-dialog-id="subscription-payment-notice"]');
  await expect(subscription).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(subscription).toBeHidden();

  const account = page.locator('[data-dialog-id="account-setup-prompt"]');
  await expect(account).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(account).toBeHidden();
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

test("automatic notices render one at a time in priority order", async ({ page }) => {
  await page.goto("/e2e-harness/dialogs");

  const subscription = page.locator('[data-dialog-id="subscription-payment-notice"]');
  const account = page.locator('[data-dialog-id="account-setup-prompt"]');
  await expect(subscription).toBeVisible();
  await expect(subscription.getByRole("button", { name: "공지 닫기" })).toBeFocused();
  await expect(account).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(subscription).toBeHidden();
  await expect(account).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("result feedback supports keyboard input, live success, and focus restoration", async ({ page }) => {
  await page.route("**/api/reviews**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ review: null }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ review: { id: "e2e-review" } }) });
  });
  await page.goto("/e2e-harness/dialogs");
  await dismissAutomaticDialogs(page);

  const trigger = page.getByRole("button", { name: "리뷰 작성하기" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.locator('[data-dialog-id="result-feedback"]');
  await expect(dialog).toBeVisible();
  const topClose = dialog.locator(".c-dialog__close");
  await expect(topClose).toHaveCount(1);
  await expect(topClose).toBeFocused();
  await expect(dialog.getByRole("radio", { name: "5점" })).toBeVisible();

  const fiveStarRating = dialog.getByRole("radio", { name: "5점" });
  await fiveStarRating.focus();
  await page.keyboard.press("Space");
  await expect(fiveStarRating).toBeChecked();
  await dialog.getByRole("textbox", { name: "후기" }).fill("상담 방향을 정하는 데 도움이 되었어요.");
  await dialog.getByRole("button", { name: "리뷰 저장" }).click();
  await expect(dialog.getByText("리뷰가 저장되었습니다.")).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .include('[data-dialog-id="result-feedback"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Styler selection works by keyboard, announces state, and restores focus", async ({ page }) => {
  await page.goto("/e2e-harness/dialogs");
  await dismissAutomaticDialogs(page);

  const trigger = page.getByRole("button", { name: "Styler 선택 Dialog 열기" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.locator('[data-dialog-id="styler-hair-selection"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".c-dialog__close")).toBeFocused();

  const option = dialog.getByRole("button", { name: /소프트 크롭/ });
  await option.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByText("소프트 크롭 선택 완료", { exact: true })).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /소프트 크롭/ })).toHaveAttribute("aria-pressed", "true");

  const accessibility = await new AxeBuilder({ page })
    .include('[data-dialog-id="styler-hair-selection"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

test("high-risk confirmation locks execution and blocks dismissal while pending", async ({ page }) => {
  await page.goto("/e2e-harness/dialogs");
  await dismissAutomaticDialogs(page);

  const trigger = page.getByRole("button", { name: "고위험 변경 Dialog 열기" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "고위험 변경 확인" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".c-dialog__close")).toBeFocused();
  await expect(dialog).toContainText("테스트 회원");
  await expect(dialog).toContainText("100 크레딧");
  await expect(dialog).toContainText("80 크레딧");

  const confirmButton = dialog.getByRole("button", { name: "변경 실행" });
  await expect(confirmButton).toBeDisabled();
  await dialog.getByRole("textbox", { name: "변경 확인 입력" }).fill("변경 확인");
  await expect(confirmButton).toBeEnabled();

  const accessibility = await new AxeBuilder({ page })
    .include(".c-dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

  await confirmButton.click();
  const pendingButton = dialog.getByRole("button", { name: "변경 처리 중…" });
  await expect(pendingButton).toBeDisabled();
  await expect(pendingButton).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".c-dialog__close")).toHaveCount(0);

  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("status", { name: "" }).filter({ hasText: "크레딧 변경 완료" })).toBeVisible();
});

for (const scenario of [
  { name: "320px light", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`Styler dialog keeps controls reachable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    await page.goto("/e2e-harness/dialogs");
    await dismissAutomaticDialogs(page);

    if (scenario.colorScheme === "dark") {
      await expect(page.locator("html")).toHaveClass(/dark/);
    }

    await page.getByRole("button", { name: "Styler 선택 Dialog 열기" }).click();
    const backdrop = page.locator('[data-dialog-id="styler-hair-selection"]');
    const panel = backdrop.locator("#styler-hair-selection");
    const closeButton = panel.locator(".c-dialog__close");
    const option = panel.getByRole("button", { name: /소프트 크롭/ });

    await expect(panel).toBeVisible();
    await expect(closeButton).toBeVisible();
    await option.scrollIntoViewIfNeeded();
    await expect(option).toBeVisible();

    const layout = await panel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        overflowX: window.getComputedStyle(element).overflowX,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(scenario.width + 1);
    expect(layout.overflowX).toBe("hidden");
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-dialog-id="styler-hair-selection"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await option.click();
    await expect(backdrop).toBeHidden();
    await expect(page.getByText("소프트 크롭 선택 완료", { exact: true })).toBeVisible();
  });

  test(`high-risk confirmation keeps controls reachable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    await page.goto("/e2e-harness/dialogs");
    await dismissAutomaticDialogs(page);

    if (scenario.colorScheme === "dark") {
      await expect(page.locator("html")).toHaveClass(/dark/);
    }

    await page.getByRole("button", { name: "고위험 변경 Dialog 열기" }).click();
    const dialog = page.getByRole("dialog", { name: "고위험 변경 확인" });
    const confirmationInput = dialog.getByRole("textbox", { name: "변경 확인 입력" });
    const confirmButton = dialog.getByRole("button", { name: "변경 실행" });

    await expect(dialog).toBeVisible();
    await confirmationInput.scrollIntoViewIfNeeded();
    await expect(confirmationInput).toBeVisible();
    await confirmationInput.fill("변경 확인");
    await confirmButton.scrollIntoViewIfNeeded();
    await expect(confirmButton).toBeVisible();
    await expect(confirmButton).toBeEnabled();

    const layout = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(scenario.width + 1);
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth);

    const accessibility = await new AxeBuilder({ page })
      .include(".c-dialog")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await expect(dialog).toHaveScreenshot(
      `confirm-action-dialog-${scenario.width}-${scenario.colorScheme}.png`,
      { animations: "disabled" },
    );
  });
}

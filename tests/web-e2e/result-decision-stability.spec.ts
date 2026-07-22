import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

function seriousOrCriticalViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
}

async function dismissGlobalSubscriptionNotice(page: Page) {
  const notice = page.locator('[data-dialog-id="subscription-payment-notice"]');
  if (await notice.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(notice).toBeHidden();
  }
}

async function openHarness(page: Page) {
  await page.goto("/e2e-harness/result-decision");
  await dismissGlobalSubscriptionNotice(page);
  await expect(page.getByRole("heading", { name: "내 헤어스타일 결과" })).toBeVisible();
}

function variantButton(page: Page, label: string): Locator {
  return page.getByRole("button", { name: new RegExp(label) });
}

test("result selection exposes pressed state, comparison keyboard control, and confirmation lock", async ({ page }) => {
  await openHarness(page);

  const comparison = page.getByRole("slider", { name: "비교 위치" });
  await expect(comparison).toHaveValue("50");
  await comparison.focus();
  await page.keyboard.press("ArrowRight");
  await expect(comparison).toHaveValue("51");
  await expect(comparison).toHaveAttribute("aria-valuetext", "원본 51%, 생성 결과 49%");

  const first = variantButton(page, "댄디 레이어드 컷");
  const second = variantButton(page, "소프트 투블럭");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "false");
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(first).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "현재 선택 확정 상태로 전환" }).click();
  await expect(page.getByRole("heading", { name: "확정한 헤어스타일" })).toBeVisible();
  await expect(second).toBeEnabled();
  await expect(first).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "시술 확정 후에는" })).toHaveAttribute("aria-atomic", "true");

  const toolbar = page.getByRole("region", { name: "결과 주요 작업" });
  await expect(toolbar.getByRole("button", { name: "에프터케어 관리 가이드 열기" })).toBeVisible();
});

test("result utility actions stay behind a keyboard-operable account-only more menu", async ({ page }) => {
  await openHarness(page);

  const toolbar = page.getByRole("region", { name: "결과 주요 작업" });
  const more = toolbar.locator("summary").filter({ hasText: "더보기" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(toolbar.getByText("결과 링크는 로그인한 내 계정에서만 열립니다. 공개 공유 링크가 아닙니다.")).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "내 계정용 링크 복사" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "다른 스타일 다시 생성 · 비용 확인" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="result-decision-harness"]')
    .include('[aria-label="결과 주요 작업"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

for (const scenario of [
  { name: "320px light", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`result decision and fixed actions remain reachable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    await openHarness(page);
    await page.getByRole("button", { name: "현재 선택 확정 상태로 전환" }).click();

    const toolbar = page.getByRole("region", { name: "결과 주요 작업" });
    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect((toolbarBox?.y || 0) + (toolbarBox?.height || 0)).toBeLessThanOrEqual(scenario.height + 1);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastVariant = variantButton(page, "내추럴 가르마");
    const lastVariantBox = await lastVariant.boundingBox();
    const settledToolbarBox = await toolbar.boundingBox();
    expect(lastVariantBox).not.toBeNull();
    expect(settledToolbarBox).not.toBeNull();
    expect((lastVariantBox?.y || 0) + (lastVariantBox?.height || 0)).toBeLessThanOrEqual((settledToolbarBox?.y || 0) + 1);

    const lockedHeading = page.getByRole("heading", { name: "확정한 헤어스타일" });
    await lockedHeading.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -16));
    await expect(toolbar.getByRole("button", { name: "에프터케어 관리 가이드 열기" })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="result-decision-harness"]')
      .include('[aria-label="결과 주요 작업"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await expect(page).toHaveScreenshot(
      `result-decision-${scenario.width}-${scenario.colorScheme}.png`,
      { animations: "disabled", fullPage: false },
    );
  });
}

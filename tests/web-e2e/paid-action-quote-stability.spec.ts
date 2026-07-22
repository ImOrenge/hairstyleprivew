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

async function openQuoteHarness(page: Page) {
  await page.goto("/e2e-harness/paid-action-quote");

  for (const dialogId of ["subscription-payment-notice", "account-setup-prompt"]) {
    const dialog = page.locator(`[data-dialog-id="${dialogId}"]`);
    if (await dialog.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
}

test("paid-action quote exposes every fail-closed state and one refresh action", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openQuoteHarness(page);

  const quote = page.locator(".c-paid-action-quote");
  await expect(quote).toHaveAttribute("data-state", "unavailable");
  await expect(quote).toHaveAttribute("data-allowed", "unknown");
  await expect(quote.getByRole("heading", { name: "작업 전 견적을 확인해 주세요" })).toBeVisible();
  await expect(quote.locator('[role="status"]')).toHaveCount(1);

  const initialRefresh = quote.getByRole("button", { name: "견적 확인" });
  await initialRefresh.focus();
  await page.keyboard.press("Enter");
  await expect(quote).toHaveAttribute("data-state", "loading");
  await expect(quote.getByRole("button", { name: "견적 확인 중" })).toBeDisabled();
  await expect(quote).toHaveAttribute("data-state", "ready");
  await expect(page.getByText("완료된 견적 갱신 1회")).toBeVisible();
  await expect(quote.getByText("현재 잔액")).toBeVisible();
  await expect(quote.getByText("작업 접수 후 예상 잔액")).toBeVisible();

  const expectedStates = [
    { label: "확인 필요", state: "unavailable" },
    { label: "확인 중", state: "loading" },
    { label: "사용 가능", state: "ready" },
    { label: "잔액 부족", state: "insufficient" },
    { label: "만료", state: "expired" },
    { label: "불러오기 실패", state: "error" },
    { label: "무료", state: "free" },
  ];
  for (const scenario of expectedStates) {
    await page.getByRole("button", { name: scenario.label, exact: true }).click();
    await expect(quote).toHaveAttribute("data-state", scenario.state);
  }

  await page.getByRole("button", { name: "잔액 부족", exact: true }).click();
  await expect(quote).toHaveAttribute("data-allowed", "false");
  await expect(quote.getByRole("link", { name: "크레딧 충전" })).toHaveAttribute(
    "href",
    "/billing?returnTo=%2Fe2e-harness%2Fpaid-action-quote",
  );

  await page.getByRole("button", { name: "만료", exact: true }).click();
  await expect(quote.getByRole("button", { name: "최신 견적 확인" })).toHaveCount(1);
  await expect(quote).toHaveAttribute("data-allowed", "false");

  await page.getByRole("button", { name: "사용 가능", exact: true }).click();
  await expect(quote).toHaveScreenshot("paid-action-quote-1024-ready-light.png", {
    animations: "disabled",
  });

  const accessibility = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

for (const scenario of [
  {
    name: "320px light unavailable",
    stateButton: "확인 필요",
    state: "unavailable",
    width: 320,
    height: 800,
    colorScheme: "light" as const,
  },
  {
    name: "375px dark insufficient",
    stateButton: "잔액 부족",
    state: "insufficient",
    width: 375,
    height: 812,
    colorScheme: "dark" as const,
  },
]) {
  test(`paid-action quote remains readable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme, reducedMotion: "reduce" });
    await openQuoteHarness(page);
    await page.getByRole("button", { name: scenario.stateButton, exact: true }).click();

    const quote = page.locator(".c-paid-action-quote");
    await expect(quote).toHaveAttribute("data-state", scenario.state);
    await expect(page.locator("html")).toHaveClass(scenario.colorScheme === "dark" ? /dark/ : /light/);

    const layout = await quote.evaluate((element) => ({
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      quoteRight: element.getBoundingClientRect().right,
    }));
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth);
    expect(layout.quoteRight).toBeLessThanOrEqual(scenario.width + 1);

    for (const action of await quote.getByRole("button").all()) {
      await action.click({ trial: true });
    }
    for (const action of await quote.getByRole("link").all()) {
      await action.click({ trial: true });
    }

    const accessibility = await new AxeBuilder({ page })
      .include(".c-paid-action-quote")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await expect(quote).toHaveScreenshot(
      `paid-action-quote-${scenario.width}-${scenario.state}-${scenario.colorScheme}.png`,
      { animations: "disabled" },
    );
  });
}

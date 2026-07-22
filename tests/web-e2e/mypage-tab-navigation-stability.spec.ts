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
  await page.goto("/e2e-harness/mypage-tabs");
  for (const dialogId of ["subscription-payment-notice", "account-setup-prompt"]) {
    const dialog = page.locator(`[data-dialog-id="${dialogId}"]`);
    if (await dialog.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
}

async function expectNoOverflowAndNoSeriousAxe(page: Page) {
  const harness = page.locator('[data-e2e-mypage-tabs="true"]');
  const layout = await harness.evaluate((element) => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    harnessRight: element.getBoundingClientRect().right,
  }));
  expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth);
  expect(layout.harnessRight).toBeLessThanOrEqual(layout.documentClientWidth + 1);

  const accessibility = await new AxeBuilder({ page })
    .include('[data-e2e-mypage-tabs="true"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
}

test("MyPage tabs preserve query state and support roving keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 820 });
  await openHarness(page);

  const tablist = page.getByRole("tablist", { name: "마이페이지 섹션" });
  const tabs = tablist.getByRole("tab");
  await expect(tabs).toHaveCount(6);
  await expect(tablist).toHaveAttribute("aria-orientation", "horizontal");
  const usage = page.getByRole("tab", { name: /작업 현황/ });
  const plan = page.getByRole("tab", { name: /플랜\/결제/ });
  const account = page.getByRole("tab", { name: /계정/ });

  await expect(usage).toHaveAttribute("aria-selected", "true");
  await expect(usage).toHaveAttribute("aria-current", "page");
  await expect(usage).toHaveAttribute("tabindex", "0");
  await expect(plan).toHaveAttribute("tabindex", "-1");
  await expect(plan).not.toHaveAttribute("aria-controls", /.+/);
  await expect(plan).toHaveAttribute(
    "href",
    "/mypage?tab=plan&payment=success&subscribed=pro&checkout_id=checkout-e2e-tabs",
  );

  await usage.focus();
  await page.keyboard.press("ArrowRight");
  await expect(plan).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(usage).toBeFocused();
  await page.keyboard.press("End");
  await expect(account).toBeFocused();
  await page.keyboard.press("Home");
  await expect(usage).toBeFocused();

  await page.getByRole("button", { name: "플랜/결제 활성화" }).click();
  await expect(plan).toHaveAttribute("aria-selected", "true");
  await expect(plan).toHaveAttribute("aria-controls", "mypage-panel-plan");
  await expect(plan).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName(/플랜\/결제/);

  await expectNoOverflowAndNoSeriousAxe(page);
  await expect(page.locator(".c-mypage-tab-navigation")).toHaveScreenshot(
    "mypage-tabs-1024-plan-light.png",
    { animations: "disabled" },
  );
});

for (const scenario of [
  { width: 320, height: 760, colorScheme: "light" as const },
  { width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`MyPage tabs keep every destination reachable at ${scenario.width}px ${scenario.colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme, reducedMotion: "reduce" });
    await openHarness(page);

    const usage = page.getByRole("tab", { name: /작업 현황/ });
    const account = page.getByRole("tab", { name: /계정/ });
    await usage.focus();
    await page.keyboard.press("End");
    await expect(account).toBeFocused();
    const focusLayout = await account.evaluate((element) => {
      const tablistElement = element.closest('[role="tablist"]');
      const tabRect = element.getBoundingClientRect();
      const listRect = tablistElement?.getBoundingClientRect();
      return {
        clientWidth: tablistElement?.clientWidth ?? 0,
        scrollWidth: tablistElement?.scrollWidth ?? 0,
        listLeft: listRect?.left ?? 0,
        listRight: listRect?.right ?? 0,
        tabLeft: tabRect.left,
        tabRight: tabRect.right,
      };
    });
    expect(focusLayout.scrollWidth).toBeGreaterThan(focusLayout.clientWidth);
    expect(focusLayout.tabLeft).toBeGreaterThanOrEqual(focusLayout.listLeft - 1);
    expect(focusLayout.tabRight).toBeLessThanOrEqual(focusLayout.listRight + 1);

    await expect(page.locator("html")).toHaveClass(scenario.colorScheme === "dark" ? /dark/ : /light/);
    await expectNoOverflowAndNoSeriousAxe(page);
    await expect(page.locator(".c-mypage-tab-navigation")).toHaveScreenshot(
      `mypage-tabs-${scenario.width}-account-focus-${scenario.colorScheme}.png`,
      { animations: "disabled" },
    );
  });
}

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

async function dismissGlobalNotices(page: Page) {
  for (const dialogId of ["subscription-payment-notice", "account-setup-prompt"]) {
    const dialog = page.locator(`[data-dialog-id="${dialogId}"]`);
    if (await dialog.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
}

async function openPolicyHarness(page: Page) {
  await page.goto("/e2e-harness/subscription-policy");
  await dismissGlobalNotices(page);
}

test("subscription policy exposes all shared items and keyboard legal navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openPolicyHarness(page);

  const policy = page.getByRole("region", { name: "정기결제·해지 정책" });
  await expect(policy).toHaveAttribute("data-density", "default");
  await expect(policy).toHaveAttribute("data-policy-count", "4");
  await expect(policy.getByRole("listitem")).toHaveCount(4);
  for (const title of ["월 자동결제", "크레딧 지급", "미사용 크레딧", "구독 해지"]) {
    await expect(policy.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(policy.getByRole("navigation", { name: "결제 정책 관련 링크" })).toBeVisible();
  await expect(policy).toHaveScreenshot("subscription-policy-1024-default-light.png", {
    animations: "disabled",
  });

  const terms = policy.getByRole("link", { name: "이용 약관" });
  await terms.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/terms-of-service$/);

  await openPolicyHarness(page);
  await page.getByRole("button", { name: "간단히 보기" }).click();
  await expect(page.getByRole("region", { name: "정기결제·해지 정책" })).toHaveAttribute(
    "data-density",
    "compact",
  );
  await expect(page.getByRole("link", { name: "개인정보 처리방침" })).toHaveAttribute(
    "href",
    "/privacy-policy",
  );
  await expect(page.getByRole("link", { name: "결제·환불 문의" })).toHaveAttribute("href", "/support");

  const accessibility = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

for (const scenario of [
  {
    name: "320px light compact",
    compact: true,
    density: "compact",
    width: 320,
    height: 800,
    colorScheme: "light" as const,
  },
  {
    name: "375px dark default",
    compact: false,
    density: "default",
    width: 375,
    height: 812,
    colorScheme: "dark" as const,
  },
]) {
  test(`subscription policy remains readable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme, reducedMotion: "reduce" });
    await openPolicyHarness(page);
    if (scenario.compact) {
      await page.getByRole("button", { name: "간단히 보기" }).click();
    }

    const policy = page.getByRole("region", { name: "정기결제·해지 정책" });
    await expect(policy).toHaveAttribute("data-density", scenario.density);
    await expect(page.locator("html")).toHaveClass(scenario.colorScheme === "dark" ? /dark/ : /light/);
    for (const link of await policy.getByRole("link").all()) {
      await link.click({ trial: true });
    }

    const layout = await policy.evaluate((element) => ({
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      policyRight: element.getBoundingClientRect().right,
    }));
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth);
    expect(layout.policyRight).toBeLessThanOrEqual(scenario.width + 1);

    const accessibility = await new AxeBuilder({ page })
      .include(".c-subscription-policy")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await expect(policy).toHaveScreenshot(
      `subscription-policy-${scenario.width}-${scenario.density}-${scenario.colorScheme}.png`,
      { animations: "disabled" },
    );
  });
}

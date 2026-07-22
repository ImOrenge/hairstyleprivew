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

async function openWaitlistHarness(page: Page) {
  await page.goto("/e2e-harness/subscription-waitlist");
  for (const dialogId of ["subscription-payment-notice", "account-setup-prompt"]) {
    const dialog = page.locator(`[data-dialog-id="${dialogId}"]`);
    if (await dialog.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
}

test("subscription waitlist validates, fences, retries, succeeds, and updates duplicates", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const requestBodies: Record<string, unknown>[] = [];
  let requestCount = 0;
  await page.route("**/api/subscription-waitlist", async (route) => {
    requestCount += 1;
    requestBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (requestCount === 1) {
      await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({}) });
      return;
    }
    await route.fulfill({
      status: requestCount === 2 ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify({ duplicate: requestCount > 2 }),
    });
  });
  await openWaitlistHarness(page);

  const form = page.locator(".c-subscription-waitlist");
  const email = page.getByRole("textbox", { name: "이메일" });
  const submit = page.getByRole("button", { name: "오픈 알림 신청" });
  await expect(form).toHaveAttribute("data-state", "idle");
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("이메일을 입력해 주세요.")).toBeVisible();

  await email.fill(" Test.User@Example.com ");
  await page.getByRole("combobox", { name: "희망 플랜" }).selectOption("pro");
  await page.getByRole("textbox", { name: "사용 목적" }).fill("살롱 상담 전 여러 스타일을 비교합니다.");
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(form).toHaveAttribute("data-state", "submitting");
  await expect(page.getByRole("button", { name: "신청 중…" })).toBeDisabled();
  await expect(email).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "희망 플랜" })).toBeDisabled();
  await expect(form).toHaveAttribute("data-state", "error");
  await expect(form.getByRole("alert")).toContainText("신청 요청이 많습니다");

  await page.getByRole("button", { name: "오픈 알림 신청" }).click();
  await expect(form).toHaveAttribute("data-state", "success");
  await expect(page.getByRole("status").filter({ hasText: "신청 완료" })).toContainText(
    "구독 결제가 열리면 이메일로 먼저 안내드리겠습니다.",
  );
  await expect(page.getByText("완료된 신청 1회")).toBeVisible();
  await expect(page.getByRole("button", { name: "신청 완료" })).toBeDisabled();

  await email.fill("updated@example.com");
  await expect(form).toHaveAttribute("data-state", "idle");
  await expect(page.getByRole("button", { name: "오픈 알림 신청" })).toBeEnabled();
  await page.getByRole("button", { name: "오픈 알림 신청" }).click();
  await expect(form).toHaveAttribute("data-state", "success");
  await expect(form).toContainText("이미 신청된 이메일입니다");
  await expect(page.getByText("완료된 신청 2회")).toBeVisible();

  expect(requestBodies[0]).toMatchObject({
    email: "test.user@example.com",
    planKey: "pro",
    sourcePath: "/e2e-harness/subscription-waitlist?from=stability",
    useCase: "살롱 상담 전 여러 스타일을 비교합니다.",
  });
  expect(requestCount).toBe(3);

  await expect(form).toHaveScreenshot("subscription-waitlist-1024-duplicate-light.png", {
    animations: "disabled",
  });
  const accessibility = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

for (const scenario of [
  { name: "320px light invalid", state: "invalid", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark success", state: "success", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`subscription waitlist remains usable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme, reducedMotion: "reduce" });
    if (scenario.state === "success") {
      await page.route("**/api/subscription-waitlist", (route) => route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ duplicate: false }),
      }));
    }
    await openWaitlistHarness(page);

    const form = page.locator(".c-subscription-waitlist");
    if (scenario.state === "invalid") {
      await page.getByRole("button", { name: "오픈 알림 신청" }).click();
    } else {
      await page.getByRole("textbox", { name: "이메일" }).fill("mobile@example.com");
      await page.getByRole("button", { name: "오픈 알림 신청" }).click();
    }
    await expect(form).toHaveAttribute("data-state", scenario.state);
    await expect(page.locator("html")).toHaveClass(scenario.colorScheme === "dark" ? /dark/ : /light/);

    const layout = await form.evaluate((element) => ({
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      formRight: element.getBoundingClientRect().right,
    }));
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth);
    expect(layout.formRight).toBeLessThanOrEqual(scenario.width + 1);

    const accessibility = await new AxeBuilder({ page })
      .include(".c-subscription-waitlist")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await expect(form).toHaveScreenshot(
      `subscription-waitlist-${scenario.width}-${scenario.state}-${scenario.colorScheme}.png`,
      { animations: "disabled" },
    );
  });
}

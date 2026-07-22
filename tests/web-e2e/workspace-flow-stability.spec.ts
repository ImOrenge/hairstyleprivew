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

async function openWorkspaceHarness(page: Page) {
  await page.goto("/e2e-harness/workspace-flow");

  const subscription = page.locator('[data-dialog-id="subscription-payment-notice"]');
  await expect(subscription).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(subscription).toBeHidden();

  const account = page.locator('[data-dialog-id="account-setup-prompt"]');
  if (await account.count()) {
    await expect(account).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(account).toBeHidden();
  }
}

async function openAcceptedStep(page: Page, mobile: boolean) {
  await page.getByRole("button", { name: "사진 검증 완료로 단계 열기" }).click();

  if (mobile) {
    await page.getByRole("button", { name: /생성 단계 메뉴 펼치기, 현재 1단계/ }).click();
  }

  const progressStep = page.getByRole("button", {
    name: "3단계 생성 진행·알림: 서버 작업 상태와 완료 알림을 확인합니다",
  });
  await expect(progressStep).toBeEnabled();
  await progressStep.focus();
  await page.keyboard.press("Enter");
}

test("workspace steps expose locked states, current step, and accepted actions", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openWorkspaceHarness(page);
  const desktopNavigation = page.locator('.c-workspace-step-navigation[data-layout="desktop"]');
  const uploadStep = desktopNavigation.getByRole("button", { name: /1단계 사진 업로드/ });
  const progressStep = desktopNavigation.getByRole("button", { name: /3단계 생성 진행·알림/ });

  await expect(uploadStep).toHaveAttribute("aria-current", "step");
  await expect(progressStep).toBeDisabled();
  await openAcceptedStep(page, false);
  await expect(progressStep).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("heading", { name: "백그라운드 생성이 시작되었습니다" })).toBeVisible();
  await expect(page.getByText("10크레딧 예약도 함께 완료되었습니다.")).toBeVisible();

  await page.getByRole("button", { name: "작업 현황 보기" }).click();
  await expect(page.getByText("작업 현황을 열었습니다.", { exact: true })).toBeVisible();

  await expect(desktopNavigation).toHaveScreenshot("workspace-step-navigation-1024-light.png", {
    animations: "disabled",
  });
  await expect(page.locator(".c-workspace-accepted-status")).toHaveScreenshot(
    "workspace-accepted-status-1024-light.png",
    { animations: "disabled" },
  );

  const accessibility = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

for (const viewport of [
  { name: "320px light", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`workspace accepted step remains clear and reachable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ colorScheme: viewport.colorScheme, reducedMotion: "reduce" });
    await openWorkspaceHarness(page);
    await openAcceptedStep(page, true);

    const mobileNavigation = page.locator('.c-workspace-step-navigation[data-layout="mobile"]');
    await expect(mobileNavigation).toHaveAttribute("data-open", "false");
    await expect(
      mobileNavigation.getByRole("button", { name: /현재 3단계 생성 진행·알림/ }),
    ).toBeVisible();
    const acceptedStatus = page.locator(".c-workspace-accepted-status");
    await expect(acceptedStatus).toHaveAttribute("data-reserved-credits", "confirmed");
    await expect(acceptedStatus.getByRole("button", { name: "작업 현황 보기" })).toBeVisible();
    for (const action of ["작업 현황 보기", "홈으로 이동", "새 사진으로 생성"]) {
      await acceptedStatus.getByRole("button", { name: action }).click({ trial: true });
    }

    const overflow = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

    await expect(mobileNavigation.locator(".c-workspace-step-navigation__mobile-panel")).toHaveScreenshot(
      `workspace-step-navigation-${viewport.width}-${viewport.colorScheme}.png`,
      { animations: "disabled" },
    );
    await mobileNavigation.evaluate((element) => element.setAttribute("hidden", ""));
    await expect(acceptedStatus).toHaveScreenshot(
      `workspace-accepted-status-${viewport.width}-${viewport.colorScheme}.png`,
      { animations: "disabled" },
    );
  });
}

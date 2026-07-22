import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const states = [
  ["queued", "예약 완료 · 서버 실행 대기"],
  ["preparing", "사진 분석과 추천 보드 준비 중"],
  ["retry", "서버 실행 재시도 대기"],
  ["ready", "헤어스타일 후보 생성 중 · 3개 준비됨"],
  ["failed", "생성 작업 확인 필요"],
] as const;

function seriousOrCriticalViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
}

async function openProgressHarness(page: Page) {
  await page.goto("/e2e-harness/progress");

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

test("generation progress cycles through the shared server state matrix and refresh CTA", async ({ page }) => {
  await openProgressHarness(page);

  for (const [state, label] of states) {
    await page.getByRole("button", { name: state, exact: true }).click();
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }

  const refresh = page.getByRole("button", { name: "진행 상태 새로고침" });
  await refresh.click();
  await expect(page.getByRole("button", { name: "확인 중..." })).toBeDisabled();
  await expect(page.getByText("새로고침 요청 1회", { exact: true })).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

test("pipeline status follows the server state with Korean stage feedback", async ({ page }) => {
  await openProgressHarness(page);
  const pipeline = page.locator(".c-pipeline-status");

  await expect(pipeline).toHaveAttribute("data-stage", "idle");
  await expect(pipeline).toHaveAttribute("data-state", "idle");

  await page.getByRole("button", { name: "preparing", exact: true }).click();
  await expect(pipeline).toHaveAttribute("data-stage", "analyzing_face");
  await expect(pipeline).toContainText("현재 단계: 얼굴 분석");
  await expect(pipeline.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "얼굴 분석 · 35%");

  await page.getByRole("button", { name: "ready", exact: true }).click();
  await expect(pipeline).toHaveAttribute("data-stage", "generating_image");
  await expect(pipeline).toHaveAttribute("data-state", "running");
  await expect(pipeline.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "후보 생성 · 62%");

  await page.getByRole("button", { name: "failed", exact: true }).click();
  await expect(pipeline).toHaveAttribute("data-state", "failed");
  await expect(pipeline.getByRole("alert")).toHaveText("사진을 다시 확인한 뒤 재시도해 주세요.");
  await expect(pipeline.getByRole("progressbar")).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page })
    .include(".c-pipeline-status")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

for (const viewport of [
  { name: "320px light", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`generation progress keeps status and refresh reachable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ colorScheme: viewport.colorScheme, reducedMotion: "reduce" });
    await openProgressHarness(page);
    await page.getByRole("button", { name: "ready", exact: true }).click();

    await expect(page.getByRole("heading", { name: /헤어스타일 후보 생성 중/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "진행 상태 새로고침" })).toBeVisible();
    const generationCard = page.locator(".c-generation-job-progress");
    const pipeline = page.locator(".c-pipeline-status");
    await expect(generationCard).toHaveAttribute("data-tone", "accent");
    await expect(pipeline).toHaveAttribute("data-stage", "generating_image");
    const overflow = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    await expect(generationCard).toHaveScreenshot(`generation-job-progress-${viewport.width}-${viewport.colorScheme}.png`, {
      animations: "disabled",
    });
    await expect(pipeline).toHaveScreenshot(`pipeline-status-${viewport.width}-${viewport.colorScheme}.png`, {
      animations: "disabled",
    });
  });
}

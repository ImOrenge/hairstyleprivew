import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function seriousOrCriticalViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e-harness/upload");
});

test("unsupported image type is announced instead of being silently rejected", async ({ page }) => {
  await page.locator('input[type="file"]:not([capture])').setInputFiles({
    name: "portrait.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("not-an-image"),
  });

  const alert = page.locator('section[role="alert"]');
  await expect(alert).toContainText("JPEG, PNG, WebP 형식의 사진만 선택할 수 있습니다");
  await expect(alert).toContainText("파일 형식: 실패");
  await expect(page.getByText("검증 파일: portrait.heic")).toBeVisible();
});

test("an image larger than 8MB is rejected before decoding", async ({ page }) => {
  await page.locator('input[type="file"]:not([capture])').setInputFiles({
    name: "oversized.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
  });

  const alert = page.locator('section[role="alert"]');
  await expect(alert).toContainText("8MB 이하");
  await expect(alert).toContainText("파일 크기(8MB 이하): 실패");
});

test("an image smaller than 512px is rejected with its measured dimensions", async ({ page }) => {
  await page.locator('input[type="file"]:not([capture])').setInputFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });

  const alert = page.locator('section[role="alert"]');
  await expect(alert).toContainText("가로와 세로는 각각 512px 이상");
  await expect(alert).toContainText("해상도: 1 x 1");
});

test("a valid production asset reaches success with no serious accessibility violations", async ({ page }) => {
  await page.locator('input[type="file"]:not([capture])').setInputFiles(
    path.resolve("my-app/public/logo.png"),
  );

  const status = page.getByRole("status");
  await expect(status).toContainText("업로드 가능한 사진입니다");
  await expect(status).toContainText("해상도: 1024 x 1024");

  const accessibility = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);
});

for (const scenario of [
  { name: "320px light", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`upload controls and validation remain reachable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    await page.reload();

    if (scenario.colorScheme === "dark") {
      await expect(page.locator("html")).toHaveClass(/dark/);
    }

    const subscriptionNotice = page.locator('[data-dialog-id="subscription-payment-notice"]');
    if (await subscriptionNotice.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(subscriptionNotice).toBeHidden();
    }

    const uploadArea = page.locator(".c-upload-area");
    await expect(uploadArea).toHaveAttribute("data-drag-state", "idle");
    await expect(uploadArea).toHaveAttribute("data-disabled", "false");

    const actions = uploadArea.locator("button");
    await expect(actions).toHaveCount(2);
    for (const action of await actions.all()) {
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeVisible();
    }

    await page.locator('input[type="file"]:not([capture])').setInputFiles(
      path.resolve("my-app/public/logo.png"),
    );

    const validation = page.locator(".c-upload-validation");
    await expect(validation).toHaveAttribute("data-status", "success");
    await expect(validation).toHaveAttribute("aria-atomic", "true");
    await expect(validation).toContainText("해상도: 1024 x 1024");
    await expect(uploadArea.getByText("선택한 파일: logo.png")).toBeVisible();

    const harness = page.locator("main").last();
    const layout = await harness.evaluate((element) => {
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
      .include("main")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await expect(harness).toHaveScreenshot(
      `upload-validation-${scenario.width}-${scenario.colorScheme}.png`,
      { animations: "disabled" },
    );
  });
}

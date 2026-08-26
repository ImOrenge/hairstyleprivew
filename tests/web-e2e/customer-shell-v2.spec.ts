import { expect, test } from "@playwright/test";

test("customer shell keeps consultation prominent across desktop and mobile", async ({ page }, testInfo) => {
  await page.goto("/e2e-harness/customer-shell");
  await expect(page.locator('[data-e2e-customer-shell="true"]')).toBeVisible();
  await expect(page.locator('[data-app-shell="header"]')).toHaveCount(0);
  await expect(page.locator('[data-app-shell="footer"]')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("크레딧");
  await expect(page.getByText("프로 멤버십 관리", { exact: true })).toBeVisible();

  const rail = page.locator(".customer-app__rail");
  const bottomNavigation = page.locator(".customer-app__bottom-nav");
  const hero = page.locator(".customer-home-hero");
  const priorityCard = page.locator(".customer-home-priority__card").first();
  await expect(page.locator(".customer-app")).toHaveCSS("color-scheme", "light");
  await expect(rail).toHaveCSS("background-color", "rgb(21, 20, 18)");
  await expect(hero).toHaveCSS("background-color", "rgb(21, 20, 18)");
  await expect(priorityCard).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(rail).toBeVisible();
  await expect(bottomNavigation).toBeHidden();
  await expect(rail.getByRole("link", { name: "홈", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "새 컨설팅 시작" })).toHaveAttribute("href", "/consulting/new");
  await page.screenshot({ path: testInfo.outputPath("customer-shell-desktop.png"), fullPage: true, animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rail).toBeHidden();
  await expect(bottomNavigation).toBeVisible();
  await expect(bottomNavigation.getByRole("link", { name: "새 컨설팅" })).toHaveAttribute("href", "/consulting/new");
  await page.screenshot({ path: testInfo.outputPath("customer-shell-mobile.png"), fullPage: true, animations: "disabled" });
});

test("stylebook separates final hair and fashion records without leaving the final report", async ({ page }, testInfo) => {
  await page.goto("/e2e-harness/customer-stylebook");
  await expect(page.locator('[data-e2e-customer-stylebook="true"]')).toBeVisible();
  await expect(page.getByRole("navigation", { name: "스타일북 분류" })).toBeVisible();
  await expect(page.getByRole("link", { name: /헤어 스타일/ })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('.customer-stylebook-card[data-kind="hair"]')).toHaveCount(2);
  await expect(page.locator('.customer-stylebook-card[data-kind="hair"]').first()).toHaveAttribute(
    "href",
    "/consulting/consultation-hair-1/result",
  );

  await page.getByRole("link", { name: /패션 룩/ }).click();
  await expect(page).toHaveURL(/\/e2e-harness\/customer-stylebook\?view=fashion$/);
  await expect(page.getByRole("link", { name: /패션 룩/ })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('.customer-stylebook-card[data-kind="fashion"]')).toHaveCount(3);
  await expect(page.getByText("최종 확정")).toHaveCount(3);
  await expect(page.locator('.customer-stylebook-card[data-kind="fashion"]').first()).toHaveAttribute(
    "href",
    "/consulting/consultation-fashion-1/result?tab=fashion",
  );
  await page.screenshot({ path: testInfo.outputPath("customer-stylebook-fashion-desktop.png"), fullPage: true, animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(horizontalOverflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("customer-stylebook-fashion-mobile.png"), fullPage: true, animations: "disabled" });

  await page.goto("/e2e-harness/customer-stylebook?view=fashion&empty=1");
  await expect(page.locator('[data-stylebook-empty="fashion"]')).toContainText("아직 확정한 패션 룩이 없어요");
  await expect(page.locator('[data-stylebook-empty="fashion"]')).toContainText("컨설팅 마지막 단계");
});

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

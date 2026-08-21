import { expect, test } from "@playwright/test";

const reportPath = "/consulting/e2e-harness?stage=result";

test("Result V2 exposes five query-backed keyboard tabs and customer-only content", async ({ page }) => {
  await page.goto(reportPath);
  const receipt = page.locator('[data-report-view-model="v2"]');
  await expect(receipt).toBeVisible();

  const tabs = receipt.getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await expect(tabs).toHaveText([/헤어/, /염색/, /메이크업/, /패션/, /최종/]);
  await expect(receipt.getByRole("tab", { name: /최종/ })).toHaveAttribute("aria-selected", "true");
  await expect(receipt.getByText("초기 케어", { exact: true })).toBeVisible();
  await expect(receipt.getByText(/고객 요청/)).toHaveCount(0);

  const hairTab = receipt.getByRole("tab", { name: /헤어/ });
  await hairTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(receipt.getByRole("tab", { name: /염색/ })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/tab=color/);
  await expect(receipt.getByRole("tabpanel", { name: /염색/ })).toBeVisible();

  await receipt.getByRole("tab", { name: /패션/ }).click();
  const fashionPanel = receipt.getByRole("tabpanel", { name: /패션/ });
  await expect(fashionPanel.locator("figure img")).toHaveCount(3);
  await expect(fashionPanel.getByAltText("딥 웜 미니멀 워크 룩 패션 최종 룩")).toBeVisible();

  await page.getByRole("button", { name: "ALL STAGES" }).click();
  const stageMap = page.getByRole("dialog", { name: "ALL STAGES" });
  await expect(stageMap.getByRole("link", { name: /MAKEUP DIRECTION/ })).toBeVisible();
});

test("Result V2 remains contained at 320px and print expands every tab panel", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(reportPath);
  const receipt = page.locator('[data-report-view-model="v2"]');
  await expect(receipt).toBeVisible();
  const overflow = await receipt.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  await page.emulateMedia({ media: "print" });
  const panels = receipt.locator("[data-report-tab-panel]");
  await expect(panels).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await expect(panels.nth(index)).toBeVisible();
  }
});

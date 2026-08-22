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
  const finalPanel = receipt.getByRole("tabpanel", { name: /최종/ });
  await expect(finalPanel.getByRole("heading", { name: "당신의 결과를 하나의 스타일로 정리했어요" })).toBeVisible();
  await expect(finalPanel.getByText("이 결과가 잘 맞는 이유", { exact: true }).first()).toBeVisible();
  await expect(receipt.getByText("초기 케어", { exact: true })).toBeVisible();
  await expect(receipt.getByText(/고객 요청/)).toHaveCount(0);
  await expect(receipt).not.toContainText(/revision|snapshot|terminal|projection|fingerprint|Integrity|RESULT GROUP/i);

  const hairTab = receipt.getByRole("tab", { name: /헤어/ });
  await hairTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(receipt.getByRole("tab", { name: /염색/ })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/tab=color/);
  await expect(receipt.getByRole("tabpanel", { name: /염색/ })).toBeVisible();

  await receipt.getByRole("tab", { name: /패션/ }).click();
  const fashionPanel = receipt.getByRole("tabpanel", { name: /패션/ });
  await expect(fashionPanel.locator("figure img")).toHaveCount(9);
  await expect(fashionPanel.getByAltText("딥 웜 미니멀 워크 룩 패션 생성 결과").first()).toBeVisible();

  await page.getByRole("button", { name: "챕터" }).click();
  const stageMap = page.getByRole("dialog", { name: "4개 상담 챕터" });
  await expect(stageMap.getByRole("link", { name: /최종 리포트/ })).toBeVisible();
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

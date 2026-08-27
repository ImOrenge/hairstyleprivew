import { expect, test } from "@playwright/test";

test("customer shell keeps consultation prominent across desktop and mobile", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/e2e-harness/customer-shell");
  await expect(page.locator('[data-e2e-customer-shell="true"]')).toBeVisible();
  const header = page.locator('[data-app-shell="header"]');
  await expect(header).toHaveCount(1);
  await expect(header).toHaveAttribute("data-customer-shell", "true");
  await expect(header).toHaveCSS("margin-left", "248px");
  const footer = page.locator('[data-app-shell="footer"]');
  await expect(footer).toHaveCount(1);
  await expect(footer).toHaveAttribute("data-customer-shell", "true");
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
  const brandIcon = rail.locator(".customer-app__brand-mark img");
  await expect(brandIcon).toBeVisible();
  await expect(brandIcon).toHaveAttribute("src", /logo\.png/);
  await expect(rail.locator(".customer-app__nav-icon svg")).toHaveCount(5);
  await expect(rail.getByRole("link", { name: "홈", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-customer-home-confirmed-look="true"] img')).toHaveCount(1);
  const resultAction = page.locator('[data-action-id="result"]');
  const careAction = page.locator('[data-action-id="care"]');
  await expect(resultAction).toHaveAttribute("aria-pressed", "true");
  await careAction.click();
  await expect(careAction).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "내추럴 레이어드 컷 홈 케어" })).toBeVisible();
  await careAction.press("ArrowLeft");
  await expect(resultAction).toHaveAttribute("aria-pressed", "true");
  await expect(resultAction).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("customer-shell-desktop.png"), fullPage: true, animations: "disabled" });
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();
  await expect(footer).toContainText("사업자정보");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(header).toHaveCSS("margin-left", "0px");
  await expect(rail).toBeHidden();
  await expect(bottomNavigation).toBeVisible();
  await expect(bottomNavigation.locator("svg")).toHaveCount(5);
  await expect(bottomNavigation.getByRole("link", { name: "새 컨설팅" })).toHaveAttribute("href", "/consulting/new");
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(horizontalOverflow).toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(resultAction).toHaveCSS("transition-duration", "0s");
  await page.screenshot({ path: testInfo.outputPath("customer-shell-mobile.png"), fullPage: true, animations: "disabled" });
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("customer home hides the image region and recommends consultation without a confirmed look", async ({ page }) => {
  await page.goto("/e2e-harness/customer-shell?look=none");

  const hero = page.locator(".customer-home-hero");
  await expect(hero).toHaveAttribute("data-has-confirmed-look", "false");
  await expect(hero.locator(".customer-home-hero__visual")).toHaveCount(0);
  await expect(page.locator('[data-customer-home-confirmed-look="true"]')).toHaveCount(0);
  await expect(page.locator('[data-customer-home-recommendation="true"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "새 컨설팅 시작" })).toHaveAttribute("href", "/consulting/new");
  await expect(page.locator('[data-app-shell="footer"]')).toHaveCount(1);
});

test("stylebook separates final hair and fashion records without leaving the final report", async ({ page }, testInfo) => {
  await page.goto("/e2e-harness/customer-stylebook");
  await expect(page.locator('[data-e2e-customer-stylebook="true"]')).toBeVisible();
  await expect(page.getByRole("navigation", { name: "스타일북 분류" })).toBeVisible();
  await expect(page.getByRole("link", { name: /헤어 스타일/ })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('.customer-stylebook-card[data-kind="hair"]')).toHaveCount(2);
  await expect(page.locator('.customer-stylebook-card[data-kind="hair"]').first().getByRole("link", { name: "결과 보기" })).toHaveAttribute(
    "href",
    "/consulting/consultation-fashion-1/result",
  );

  await page.getByPlaceholder("스타일명, 메모, 태그 검색").fill("레이어드");
  await expect(page.locator('.customer-stylebook-card[data-kind="hair"]')).toHaveCount(1);
  await page.getByPlaceholder("스타일명, 메모, 태그 검색").fill("");
  await page.getByRole("button", { name: "비교", exact: true }).click();
  await page.getByRole("button", { name: /소프트 레이어드 보브 비교 선택/ }).click();
  await page.getByRole("button", { name: /내추럴 미디엄 웨이브 비교 선택/ }).click();
  await page.getByRole("button", { name: "선택 결과 비교" }).click();
  await expect(page.getByRole("heading", { name: "헤어 결과 비교" })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();

  await page.getByRole("link", { name: /패션 룩/ }).click();
  await expect(page).toHaveURL(/\/e2e-harness\/customer-stylebook\?view=fashion$/);
  await expect(page.getByRole("link", { name: /패션 룩/ })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('.customer-stylebook-card[data-kind="fashion"]')).toHaveCount(3);
  await expect(page.getByText("최종 확정")).toHaveCount(3);
  await expect(page.locator('.customer-stylebook-card[data-kind="fashion"]').first().getByRole("link", { name: "결과 보기" })).toHaveAttribute(
    "href",
    "/consulting/consultation-fashion-1/result?tab=fashion",
  );
  await page.screenshot({ path: testInfo.outputPath("customer-stylebook-fashion-desktop.png"), fullPage: true, animations: "disabled" });

  await page.setViewportSize({ width: 390, height: 844 });
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(horizontalOverflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("customer-stylebook-fashion-mobile.png"), fullPage: true, animations: "disabled" });

  await page.getByRole("link", { name: /토털 세트/ }).click();
  await expect(page).toHaveURL(/\/e2e-harness\/customer-stylebook\?view=sets$/);
  await expect(page.getByRole("heading", { name: /소프트 레이어드 보브 · 아이보리 모던 데일리/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /통합 결과 보기/ })).toHaveAttribute("href", "/consulting/consultation-fashion-1/result?tab=fashion");

  await page.goto("/e2e-harness/customer-stylebook?view=fashion&empty=1");
  await expect(page.locator('[data-stylebook-empty="fashion"]')).toContainText("아직 확정한 패션 룩이 없어요");
  await expect(page.locator('[data-stylebook-empty="fashion"]')).toContainText("컨설팅 마지막 단계");
});

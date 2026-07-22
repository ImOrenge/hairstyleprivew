import { expect, type Page, test } from "@playwright/test";

test.use({
  deviceScaleFactor: 2,
  viewport: { width: 640, height: 450 },
});

async function expectFocusedElementInsideViewport(page: Page) {
  const bounds = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;

    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: rect.width,
    };
  });

  expect(bounds).not.toBeNull();
  expect(bounds!.left).toBeLessThanOrEqual(bounds!.viewportWidth + 1);
  expect(bounds!.right).toBeGreaterThanOrEqual(-1);
  expect(bounds!.top).toBeLessThanOrEqual(bounds!.viewportHeight + 1);
  expect(bounds!.bottom).toBeGreaterThanOrEqual(-1);

  if (bounds!.width <= bounds!.viewportWidth + 1) {
    expect(bounds!.left).toBeGreaterThanOrEqual(-1);
    expect(bounds!.right).toBeLessThanOrEqual(bounds!.viewportWidth + 1);
  }
  if (bounds!.height <= bounds!.viewportHeight + 1) {
    expect(bounds!.top).toBeGreaterThanOrEqual(-1);
    expect(bounds!.bottom).toBeLessThanOrEqual(bounds!.viewportHeight + 1);
  }
}

test("homepage stays usable in a 200%-equivalent viewport with keyboard only", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const viewportContract = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportContract).toEqual({
    clientWidth: 640,
    devicePixelRatio: 2,
    innerWidth: 640,
    scrollWidth: 640,
  });

  const automaticNotice = page.getByRole("dialog");
  if (await automaticNotice.isVisible()) {
    await expect(automaticNotice.getByRole("button", { name: "공지 닫기" })).toBeFocused();
    await expectFocusedElementInsideViewport(page);
    await page.keyboard.press("Escape");
    await expect(automaticNotice).toBeHidden();
  }

  const skipLink = page.getByRole("link", { name: "본문 바로가기" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expectFocusedElementInsideViewport(page);
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expectFocusedElementInsideViewport(page);

  const maleTab = page.getByRole("tab", { name: "남성" });
  const femaleTab = page.getByRole("tab", { name: "여성" });
  await maleTab.focus();
  await expectFocusedElementInsideViewport(page);
  await page.keyboard.press("End");
  await expect(femaleTab).toBeFocused();
  await expect(femaleTab).toHaveAttribute("aria-selected", "true");
  await expectFocusedElementInsideViewport(page);

  const faqSummary = page.locator("summary").filter({
    hasText: "AI 헤어스타일 미리보기에는 어떤 사진이 가장 좋나요?",
  });
  await expect(faqSummary).toHaveCount(1);
  await faqSummary.focus();
  await expectFocusedElementInsideViewport(page);
  await page.keyboard.press("Enter");
  await expect(faqSummary.locator("..")).toHaveAttribute("open", "");

  const finalOverflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(finalOverflow.scrollWidth).toBeLessThanOrEqual(finalOverflow.clientWidth);
});

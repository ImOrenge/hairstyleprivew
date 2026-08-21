import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`Makeup workspace remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/consulting/e2e-harness?stage=makeup");
    const fixture = page.getByTestId("makeup-direction-fixture");
    await expect(fixture).toBeVisible();
    await expect(fixture.getByText("Self makeup", { exact: true })).toBeVisible();
    await expect(fixture.getByRole("checkbox")).not.toBeChecked();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const calloutBoxes = await fixture.locator("[data-makeup-color-callout]").evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }));
    for (let left = 0; left < calloutBoxes.length; left += 1) {
      for (let right = left + 1; right < calloutBoxes.length; right += 1) {
        const a = calloutBoxes[left]; const b = calloutBoxes[right];
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      }
    }
    await expect(fixture.locator("[data-makeup-color-info], table")).toHaveCount(0);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    const violations = (await new AxeBuilder({ page }).include("[data-testid='makeup-direction-fixture']").analyze()).violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""));
    expect(violations).toEqual([]);
    const map = fixture.locator(".makeup-direction-map");
    expect(page.viewportSize()?.width).toBe(width);
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox!.width).toBeLessThanOrEqual(width);
    if (width === 390) await map.screenshot({ path: "docs/hairfit-v2/evidence/p09-makeup-mobile-accessibility.png" });
    if (width === 768) await map.screenshot({ path: "docs/hairfit-v2/evidence/p08-makeup-tablet-accessibility.png" });
    if (width === 1440) await map.screenshot({ path: "docs/hairfit-v2/evidence/p06-makeup-zone-direction-desktop.png" });
  });
}

test("Makeup color chips expose a keyboard path and preserve original raster pixels", async ({ page }) => {
  await page.goto("/consulting/e2e-harness?stage=makeup");
  const fixture = page.getByTestId("makeup-direction-fixture");
  const firstCallout = fixture.getByRole("button", { name: "눈썹 색상 정보", exact: true });
  await firstCallout.focus();
  await page.keyboard.press("Enter");
  await expect(firstCallout).toHaveAttribute("aria-pressed", "true");
  const eyeshadowCallout = fixture.getByRole("button", { name: "아이섀도 색상 정보", exact: true });
  const responseMs = await eyeshadowCallout.evaluate(async (button) => {
    const startedAt = performance.now();
    button.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return performance.now() - startedAt;
  });
  expect(responseMs).toBeLessThan(100);
  await expect(eyeshadowCallout).toHaveAttribute("aria-pressed", "true");
  await expect(fixture.locator("[data-makeup-source-pixels='unaltered']")).toBeVisible();
  await expect(fixture.locator("svg image")).not.toHaveAttribute("filter");
  await expect(fixture.locator("svg")).toHaveAttribute("viewBox", "0 0 1000 1250");
});

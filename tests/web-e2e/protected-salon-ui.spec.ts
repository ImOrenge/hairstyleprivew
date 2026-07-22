import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectNoSeriousAxeViolations,
} from "./protected-assertions";

const salonRoutes = [
  { path: "/salon/customers", heading: "고객관리" },
  { path: "/salon/connections", heading: "살롱 연결 관리" },
] as const;

for (const route of salonRoutes) {
  test(`salon owner can read ${route.path} without triggering a mutation`, async ({ page }) => {
    const writeRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === "http://localhost:3102" && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        writeRequests.push(`${request.method()} ${url.pathname}`);
      }
    });

    await page.goto(route.path, { waitUntil: "networkidle" });

    await expect(page).toHaveURL(new RegExp(`${route.path.replaceAll("/", "\\/")}(?:\\?|$)`));
    await expect(page.getByRole("heading", { name: route.heading, level: 1 })).toBeVisible({ timeout: 30_000 });
    await expectNoSeriousAxeViolations(page);
    await expectNoHorizontalOverflow(page);
    expect(writeRequests).toEqual([]);
  });
}

test("salon owner cannot enter the admin role surface", async ({ page }) => {
  await page.goto("/admin/stats", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/salon\/customers(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "고객관리", level: 1 })).toBeVisible();
});

import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectNoSeriousAxeViolations,
} from "./protected-assertions";

const adminRoutes = [
  { path: "/admin/stats", heading: "통계" },
  { path: "/admin/members", heading: "회원관리" },
] as const;

for (const route of adminRoutes) {
  test(`admin can read ${route.path} without triggering a mutation`, async ({ page }) => {
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

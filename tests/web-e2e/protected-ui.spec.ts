import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectNoSeriousAxeViolations,
} from "./protected-assertions";

function requireForeignGenerationFixture() {
  const generationId = process.env.E2E_FOREIGN_GENERATION_ID?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generationId)) {
    throw new Error("E2E_FOREIGN_GENERATION_ID must contain the preflight-verified foreign test generation UUID.");
  }
  return generationId;
}

function requireOwnedGenerationFixture() {
  const generationId = process.env.E2E_OWNED_GENERATION_ID?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generationId)) {
    throw new Error("E2E_OWNED_GENERATION_ID must contain the preflight-verified owned test generation UUID.");
  }
  return generationId;
}

const protectedRoutes = [
  {
    name: "customer home",
    path: "/home",
    heading: /.+님의 스타일 홈/,
  },
  {
    name: "my page",
    path: "/mypage",
    heading: "계정 대시보드",
  },
] as const;

for (const route of protectedRoutes) {
  test(`${route.name} keeps the Clerk session and exposes no serious axe violations`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(new RegExp(`${route.path.replace("/", "\\/")}(?:\\?|$)`));
    await expect(page.getByRole("heading", { name: route.heading, level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    await expectNoSeriousAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  });
}

test("owned completed generation renders its recommendation board without mutation", async ({ page }) => {
  const generationId = requireOwnedGenerationFixture();
  const detailResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === `/api/generations/${generationId}`;
  });

  await page.goto(`/generate/${generationId}`, { waitUntil: "domcontentloaded" });

  const response = await detailResponse;
  const payload = await response.json();
  expect(response.status()).toBe(200);
  expect(payload.id).toBe(generationId);
  expect(payload.status).toBe("completed");
  expect(payload.recommendationSet?.variants?.length).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "나에게 맞춘 헤어스타일 결과", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "결과 열기" }).first()).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expectNoSeriousAxeViolations(page);
  await expectNoHorizontalOverflow(page);
});

test("foreign generation returns 403 without leaking result data and offers safe recovery", async ({ page }) => {
  const generationId = requireForeignGenerationFixture();
  const detailResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === `/api/generations/${generationId}`;
  });

  await page.goto(`/generate/${generationId}`, { waitUntil: "domcontentloaded" });

  const response = await detailResponse;
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ error: "Forbidden" });
  await expect(page.getByRole("heading", { name: "이 계정의 생성 결과가 아닙니다", level: 1 })).toBeVisible();
  await expect(page.getByText("완료 안내를 받은 계정으로 다시 로그인해 주세요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "다른 계정으로 로그인" })).toBeVisible();
  await expect(page.getByRole("button", { name: "홈으로 이동" })).toBeVisible();
  await expect(page.locator("main img")).toHaveCount(0);
  await expectNoSeriousAxeViolations(page);
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "홈으로 이동" }).click();
  await expect(page).toHaveURL(/\/home(?:\?|$)/);
  await expect(page.getByRole("heading", { name: /.+님의 스타일 홈/, level: 1 })).toBeVisible();
});

test("customer fixture cannot enter the admin role surface", async ({ page }) => {
  await page.goto("/admin/stats", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/home(?:\?|$)/);
  await expect(page.getByRole("heading", { name: /.+님의 스타일 홈/, level: 1 })).toBeVisible();
});

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const totalCustomers = 125;
const pageSize = 20;

function customer(index: number, name = `고객 ${String(index).padStart(3, "0")}`) {
  const timestamp = new Date(Date.UTC(2026, 6, 18, 12, index % 60)).toISOString();
  return {
    id: `customer-${String(index).padStart(3, "0")}`,
    linkedUserId: index % 2 === 0 ? `member-${index}` : null,
    source: index % 2 === 0 ? "linked_member" : "manual",
    name,
    phone: `010-0000-${String(index).padStart(4, "0")}`,
    email: `customer${index}@example.com`,
    memo: "",
    consentSms: false,
    consentKakao: false,
    styleTarget: null,
    photoGenerationConsentAt: null,
    lastVisitAt: timestamp,
    nextFollowUpAt: timestamp,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    isLinkedMember: index % 2 === 0,
  };
}

function seriousOrCriticalViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
}

async function mockOperationalApis(page: Page) {
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accountType: "salon_owner" }) });
  });
  await page.route("**/api/salon/matching/invite", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ invite: null }) });
  });
  await page.route("**/api/salon/matches**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candidates: [], limit: 20, nextCursor: null }),
    });
  });
  await page.route("**/api/salon/customers**", async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q");
    const cursor = url.searchParams.get("cursor");

    if (query === "이전 검색") {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          customers: [customer(900, "폐기되어야 할 이전 결과")],
          pendingAftercare: [],
          summary: { totalCustomers: 1, linkedMembers: 0, pendingAftercare: 0, dueToday: 0 },
          total: 1,
          nextCursor: null,
        }),
      }).catch(() => undefined);
      return;
    }

    if (query === "최신 검색") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          customers: [customer(901, "최신 검색 결과")],
          pendingAftercare: [],
          summary: { totalCustomers: 1, linkedMembers: 1, pendingAftercare: 0, dueToday: 0 },
          total: 1,
          nextCursor: null,
        }),
      });
      return;
    }

    const pageIndex = cursor ? Number(cursor.replace("page-", "")) - 1 : 0;
    const start = pageIndex * pageSize;
    const end = Math.min(start + pageSize, totalCustomers);
    const nextCursor = end < totalCustomers ? `page-${pageIndex + 2}` : null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        customers: Array.from({ length: end - start }, (_, offset) => customer(start + offset + 1)),
        pendingAftercare: [],
        summary: { totalCustomers, linkedMembers: 62, pendingAftercare: 0, dueToday: 0 },
        total: totalCustomers,
        nextCursor,
      }),
    });
  });
}

async function openHarness(page: Page) {
  await mockOperationalApis(page);
  await page.goto("/e2e-harness/operational-list");
  const subscription = page.locator('[data-dialog-id="subscription-payment-notice"]');
  if (await subscription.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(subscription).toBeHidden();
  }
  await expect(page.getByRole("heading", { name: "고객관리" })).toBeVisible();
}

test("operational customer list reaches all 125 rows without duplicates", async ({ page }) => {
  await openHarness(page);

  await expect(page.getByText("현재 20 / 총 125명")).toBeVisible();
  for (const expected of [40, 60, 80, 100, 120]) {
    await page.getByRole("button", { name: "고객 더 보기" }).click();
    await expect(page.getByText(`현재 ${expected} / 총 125명`)).toBeVisible();
  }
  await page.getByRole("button", { name: "고객 더 보기" }).click();
  await expect(page.getByRole("link", { name: "열기" })).toHaveCount(125);
  await expect(page.locator('[href="/salon/customers/customer-125"]')).toBeVisible();
});

test("a late operational search cannot replace the latest query", async ({ page }) => {
  await openHarness(page);
  const search = page.getByRole("textbox", { name: "고객 이름, 전화번호 또는 이메일 검색" });

  await search.fill("이전 검색");
  await page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "이전 검색");
  await search.fill("최신 검색");

  await expect(page.getByText("최신 검색 결과")).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText("폐기되어야 할 이전 결과")).toHaveCount(0);
  await expect(search).toHaveValue("최신 검색");
});

for (const scenario of [
  { name: "320px light", width: 320, height: 800, colorScheme: "light" as const },
  { name: "375px dark", width: 375, height: 812, colorScheme: "dark" as const },
]) {
  test(`operational list controls remain reachable at ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    await openHarness(page);

    await expect(page.getByRole("combobox", { name: "고객 유입 경로 필터" })).toBeVisible();
    await expect(page.getByRole("button", { name: "고객 더 보기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "회원 매칭 초대 새로고침" })).toBeVisible();
    await expect(page.getByRole("group", { name: "고객 등록" })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="operational-list-harness"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(seriousOrCriticalViolations(accessibility.violations)).toEqual([]);

    await expect(page).toHaveScreenshot(
      `operational-list-${scenario.width}-${scenario.colorScheme}.png`,
      { animations: "disabled", fullPage: false },
    );
  });
}

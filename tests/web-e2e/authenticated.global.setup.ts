import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const authStatePath = path.join(process.cwd(), "playwright", ".clerk", "customer.json");
const adminAuthStatePath = path.join(process.cwd(), "playwright", ".clerk", "admin.json");
const salonAuthStatePath = path.join(process.cwd(), "playwright", ".clerk", "salon.json");

setup.describe.configure({ mode: "serial" });

function requireDevelopmentClerkFixture() {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const secretKey = process.env.CLERK_SECRET_KEY?.trim() ?? "";
  const emailAddress = process.env.E2E_CLERK_USER_EMAIL?.trim() ?? "";
  const adminEmailAddress = process.env.E2E_CLERK_ADMIN_EMAIL?.trim() ?? "";
  const salonEmailAddress = process.env.E2E_CLERK_SALON_EMAIL?.trim() ?? "";

  const missing = [
    ["CLERK_PUBLISHABLE_KEY", publishableKey],
    ["CLERK_SECRET_KEY", secretKey],
    ["E2E_CLERK_USER_EMAIL", emailAddress],
    ["E2E_CLERK_ADMIN_EMAIL", adminEmailAddress],
    ["E2E_CLERK_SALON_EMAIL", salonEmailAddress],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Protected-page E2E requires ${missing.join(", ")} in my-app/.env.local. ` +
        "No authentication bypass or test-user creation is performed.",
    );
  }

  if (!publishableKey.startsWith("pk_test_") || !secretKey.startsWith("sk_test_")) {
    throw new Error("Protected-page E2E only accepts a Clerk development instance (pk_test_/sk_test_).");
  }

  if (!emailAddress.includes("+clerk_test")) {
    throw new Error(
      "E2E_CLERK_USER_EMAIL must identify an existing +clerk_test user so Clerk sends no verification or new-device email.",
    );
  }

  if (!adminEmailAddress.includes("+clerk_test") || !salonEmailAddress.includes("+clerk_test")) {
    throw new Error("Admin and salon protected E2E must use existing +clerk_test accounts.");
  }

  if (new Set([emailAddress, adminEmailAddress, salonEmailAddress].map((value) => value.toLowerCase())).size !== 3) {
    throw new Error("Customer, admin, and salon protected E2E fixtures must be different accounts.");
  }

  return { emailAddress, adminEmailAddress, salonEmailAddress };
}

setup("configure Clerk testing token with a fail-closed development fixture", async () => {
  requireDevelopmentClerkFixture();
  await clerkSetup();
});

setup("authenticate existing customer and persist protected-page state", async ({ page }) => {
  const { emailAddress } = requireDevelopmentClerkFixture();
  await fs.mkdir(path.dirname(authStatePath), { recursive: true });

  await page.goto("/");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/mypage");

  await expect(page).toHaveURL(/\/mypage(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "계정 대시보드", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await page.context().storageState({ path: authStatePath });
});

setup("authenticate existing admin and persist protected-page state", async ({ page }) => {
  const { adminEmailAddress } = requireDevelopmentClerkFixture();
  await fs.mkdir(path.dirname(adminAuthStatePath), { recursive: true });

  await page.goto("/");
  await clerk.signIn({ page, emailAddress: adminEmailAddress });
  await page.goto("/admin/stats");

  await expect(page).toHaveURL(/\/admin\/stats(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "통계", level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: adminAuthStatePath });
});

setup("authenticate existing salon owner and persist protected-page state", async ({ page }) => {
  const { salonEmailAddress } = requireDevelopmentClerkFixture();
  await fs.mkdir(path.dirname(salonAuthStatePath), { recursive: true });

  await page.goto("/");
  await clerk.signIn({ page, emailAddress: salonEmailAddress });
  await page.goto("/salon/customers");

  await expect(page).toHaveURL(/\/salon\/customers(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "고객관리", level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: salonAuthStatePath });
});

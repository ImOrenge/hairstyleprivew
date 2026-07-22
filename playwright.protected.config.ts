import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

const workspaceRoot = process.cwd();
loadEnvConfig(path.join(workspaceRoot, "my-app"));

// Clerk's Playwright helper reads CLERK_PUBLISHABLE_KEY, while the Next app
// intentionally exposes the same development key under NEXT_PUBLIC_*.
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const port = 3102;
const baseURL = `http://localhost:${port}`;
const authStatePath = path.join(workspaceRoot, "playwright", ".clerk", "customer.json");
const adminAuthStatePath = path.join(workspaceRoot, "playwright", ".clerk", "admin.json");
const salonAuthStatePath = path.join(workspaceRoot, "playwright", ".clerk", "salon.json");

export default defineConfig({
  testDir: "./tests/web-e2e",
  outputDir: "./.artifacts/playwright-protected/test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: ".artifacts/playwright-protected/html", open: "never" }],
  ],
  use: {
    baseURL,
    colorScheme: "light",
    locale: "ko-KR",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "cross-env NEXT_DIST_DIR=.next-protected-e2e npm --prefix my-app run dev -- -p 3102",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "clerk-protected-setup",
      testMatch: "authenticated.global.setup.ts",
    },
    {
      name: "chromium-protected",
      testMatch: "protected-ui.spec.ts",
      dependencies: ["clerk-protected-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: authStatePath,
      },
    },
    {
      name: "chromium-admin-protected",
      testMatch: "protected-admin-ui.spec.ts",
      dependencies: ["clerk-protected-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: adminAuthStatePath,
      },
    },
    {
      name: "chromium-salon-protected",
      testMatch: "protected-salon-ui.spec.ts",
      dependencies: ["clerk-protected-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: salonAuthStatePath,
      },
    },
  ],
});

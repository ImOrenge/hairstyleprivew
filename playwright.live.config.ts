import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

const workspaceRoot = process.cwd();
loadEnvConfig(path.join(workspaceRoot, "my-app"));

process.env.CLERK_PUBLISHABLE_KEY ??= process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const port = 3103;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/web-live-e2e",
  outputDir: "./.artifacts/playwright-live/test-results",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: ".artifacts/playwright-live/html", open: "never" }],
  ],
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "light",
    locale: "ko-KR",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "cross-env NEXT_DIST_DIR=.next-live-e2e npm --prefix my-app run dev -- -p 3103",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-live",
      use: { viewport: { width: 1024, height: 900 } },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

const port = 3101;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/web-e2e",
  testMatch: "auth-*.spec.ts",
  outputDir: "./.artifacts/playwright-auth/test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: ".artifacts/playwright-auth/html", open: "never" }],
  ],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
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
    command: "cross-env NEXT_DIST_DIR=.next-auth-e2e npm --prefix my-app run dev -- -p 3101",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-auth",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});

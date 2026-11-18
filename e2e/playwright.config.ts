import { defineConfig, devices } from "@playwright/test";

const ROOT = new URL("..", import.meta.url).pathname;
// Minimal typing for the Node global (no @types/node dependency).
declare const process: { env: Record<string, string | undefined> };
const CI = !!process.env.CI;

// iPhone 13 settings on Chromium (only chromium is installed; the device
// default would be webkit).
const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/prod-smoke.spec.ts",
  outputDir: "test-results",
  reporter: "list",
  workers: 1,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:5173",
    reducedMotion: "reduce",
    locale: "en-US",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run dev -w apps/server",
      cwd: ROOT,
      url: "http://localhost:8787/health",
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev -w apps/client",
      cwd: ROOT,
      env: { VITE_SERVER_URL: "http://localhost:8787" },
      url: "http://localhost:5173",
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-chromium",
      use: {
        ...iphone,
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
      // Game specs run on desktop only; smoke and mobile specs run here.
      testMatch: ["**/smoke.spec.ts", "**/mobile.spec.ts"],
    },
  ],
});

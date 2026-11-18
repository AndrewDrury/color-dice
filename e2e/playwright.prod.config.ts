import { defineConfig, devices } from "@playwright/test";

// Declared locally: no @types/node dependency.
declare const process: { env: Record<string, string | undefined> };

// Production smoke config: no webServer, hits the live Pages site. Run EXACTLY once per
// check (production rate limits creates to 5 per 10 min per IP).
const raw = process.env.PROD_URL || "https://andrewdrury.github.io/color-dice/";
const baseURL = raw.endsWith("/") ? raw : `${raw}/`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/prod-smoke.spec.ts",
  outputDir: "test-results/prod",
  reporter: "list",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    reducedMotion: "reduce",
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "prod-desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

const ROOT = new URL("..", import.meta.url).pathname;
// Minimal typing for the Node global (no @types/node dependency).
declare const process: { env: Record<string, string | undefined> };
const CI = !!process.env.CI;
const SERVER_PORT = process.env.E2E_SERVER_PORT ?? "8787";
const CLIENT_PORT = process.env.E2E_CLIENT_PORT ?? "5173";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
const W = process.env.E2E_WORKERS;
const WORKERS: number | string = W ? (/^\d+$/.test(W) ? Number(W) : W) : CI ? 4 : "75%";
// Opt-in: reuse servers you already started (otherwise a stale server could mask results).
const REUSE = process.env.E2E_REUSE === "1";

// iPhone 13 settings on Chromium (only chromium is installed; the device
// default would be webkit).
const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];

const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } };
const SLOW = ["**/rematch.spec.ts", "**/five-player.spec.ts", "**/resilience.spec.ts"];

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/prod-smoke.spec.ts",
  outputDir: "test-results",
  reporter: process.env.E2E_JSON
    ? [["list"], ["json", { outputFile: process.env.E2E_JSON }]]
    : "list",
  fullyParallel: true,
  workers: WORKERS,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: CLIENT_URL,
    reducedMotion: "reduce",
    locale: "en-US",
    trace: "on-first-retry",
  },
  webServer: [
    {
      // Fresh local DO state per run; ports and the allowed origin come from the env.
      command:
        `rm -rf .wrangler/e2e-${SERVER_PORT} && npx wrangler dev --port ${SERVER_PORT} ` +
        `--inspector-port ${Number(SERVER_PORT) + 2000} --persist-to .wrangler/e2e-${SERVER_PORT} ` +
        `--var ALLOWED_ORIGINS:${CLIENT_URL} --var ALLOW_TEST_HOOKS:1 --var PBKDF2_ITERATIONS:1000`,
      cwd: `${ROOT}apps/server`,
      url: `${SERVER_URL}/health`,
      reuseExistingServer: REUSE,
      timeout: 120_000,
    },
    {
      // Build once, serve the static bundle (no per-page dev transforms).
      command:
        `npx vite build --outDir node_modules/.e2e-dist-${CLIENT_PORT} --emptyOutDir && ` +
        `npx vite preview --outDir node_modules/.e2e-dist-${CLIENT_PORT} --port ${CLIENT_PORT} --strictPort`,
      cwd: `${ROOT}apps/client`,
      env: { VITE_SERVER_URL: SERVER_URL },
      url: CLIENT_URL,
      reuseExistingServer: REUSE,
      timeout: 120_000,
    },
  ],
  projects: [
    // The longest specs (full games) first, so they start at t=0 instead of at the tail of the
    // alphabet: wall time is then bounded by the longest spec, not by "when it got a worker".
    {
      name: "desktop-slow",
      use: desktop,
      testMatch: SLOW,
    },
    {
      name: "desktop-chromium",
      use: desktop,
      testIgnore: [...SLOW, "**/prod-smoke.spec.ts"],
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

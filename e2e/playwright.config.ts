import { defineConfig } from "@playwright/test";

// Placeholder. Real projects, webServer and fixtures are added in a later task.
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  reporter: "list",
});

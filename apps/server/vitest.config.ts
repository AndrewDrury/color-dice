import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Storage isolation: @cloudflare/vitest-plugin 1.x isolates storage per test file
// by default (the old `isolatedStorage` option no longer exists).
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    include: ["test/**/*.test.ts"],
  },
});

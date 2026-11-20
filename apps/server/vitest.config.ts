import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Storage isolation: @cloudflare/vitest-plugin 1.x isolates storage per test file
// by default (the old `isolatedStorage` option no longer exists).
// Local-only vars are injected here (not from .dev.vars) so tests pass on a fresh clone.
// ALLOW_TEST_HOOKS is deliberately NOT set: tests opt in per test.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ALLOWED_ORIGINS:
            "https://andrewdrury.github.io,http://localhost:5173,http://localhost:4173",
          PBKDF2_ITERATIONS: "1000",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    // Cold workers start slowly when `npm run check` runs every suite at once.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

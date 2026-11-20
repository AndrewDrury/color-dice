import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Heavy suites (fuzz shards, determinism) share the CPU with the other workspaces
    // during `npm run check`; the 5 s default flakes under that contention.
    testTimeout: 60_000,
  },
});

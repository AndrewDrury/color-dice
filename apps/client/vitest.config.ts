import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.{ts,tsx}"],
    // Process CSS so `tokens.css?raw` returns the real text for the contrast test.
    css: true,
  },
});

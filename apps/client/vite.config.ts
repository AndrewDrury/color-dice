import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// Minimal typing for the Node global used here (avoids depending on @types/node).
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [preact()],
  build: { outDir: "dist" },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});

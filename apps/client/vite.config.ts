import preact from "@preact/preset-vite";
import { defineConfig, type Plugin } from "vite";

// Minimal typing for the Node global used here (avoids depending on @types/node).
declare const process: { env: Record<string, string | undefined> };

/** Commit sha on CI, else a timestamp: any value that differs from deploy to deploy. */
const BUILD_ID = (process.env.GITHUB_SHA ?? "").slice(0, 12) || Date.now().toString(36);

/** Serves/emits `version.json` ({ build }) so open tabs can tell a newer deploy exists (T-UX-18). */
function versionFile(): Plugin {
  const body = JSON.stringify({ build: BUILD_ID });
  return {
    name: "cd-version-json",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: body });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split("?")[0]?.endsWith("/version.json")) return next();
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        res.end(body);
      });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [preact(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { outDir: "dist" },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});

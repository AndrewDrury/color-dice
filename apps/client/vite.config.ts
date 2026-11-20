import preact from "@preact/preset-vite";
import { defineConfig, type Plugin } from "vite";

// Minimal typing for the Node global used here (avoids depending on @types/node).
declare const process: { env: Record<string, string | undefined> };

/** Commit sha on CI, else a timestamp: any value that differs from deploy to deploy. */
const BUILD_ID = (process.env.GITHUB_SHA ?? "").slice(0, 12) || Date.now().toString(36);
const DEPLOY_VERSION = process.env.VITE_DEPLOY_VERSION || `local-${BUILD_ID}`;

/** Serves/emits `version.json` ({ build }) so open tabs can tell a newer deploy exists (T-UX-18). */
function versionFile(): Plugin {
  const body = JSON.stringify({ build: BUILD_ID });
  return {
    name: "cd-version-json",
    transformIndexHtml() {
      return [
        {
          tag: "div",
          attrs: {
            class: "deploy-version",
            "aria-label": `Deploy version ${DEPLOY_VERSION}`,
          },
          children: `v${DEPLOY_VERSION}`,
          injectTo: "body",
        },
      ];
    },
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
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __DEPLOY_VERSION__: JSON.stringify(DEPLOY_VERSION),
  },
  build: { outDir: "dist" },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});

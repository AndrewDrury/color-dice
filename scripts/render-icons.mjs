// Renders apps/client/public/icon.svg to the PNG icons with Playwright's Chromium.
// One-off (the PNGs are committed): node scripts/render-icons.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const dir = fileURLToPath(new URL("../apps/client/public/", import.meta.url));
const svg = await readFile(`${dir}icon.svg`, "utf8");

/** Maskable icons need the artwork inside the central 80 % safe zone on a full-bleed background. */
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#efe9df"/>
  <g transform="translate(51.2 51.2) scale(0.8)">${svg.replace(/<\/?svg[^>]*>/g, "").replace(/<rect width="512"[^>]*\/>/, "")}</g>
</svg>`;

const jobs = [
  ["apple-touch-icon.png", 180, svg],
  ["icon-192.png", 192, svg],
  ["icon-512.png", 512, svg],
  ["icon-maskable-512.png", 512, maskable],
];

const browser = await chromium.launch();
try {
  for (const [name, size, markup] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:#efe9df}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
    );
    await writeFile(`${dir}${name}`, await page.screenshot({ type: "png" }));
    await page.close();
    console.log("wrote", name);
  }
} finally {
  await browser.close();
}

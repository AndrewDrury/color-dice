// Budget check (H14): the initial JS must stay <= 90 KB gzip. Only scripts that index.html
// loads (script / modulepreload tags) count; lazy chunks (confetti, dice lab) are listed only.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const BUDGET = 90 * 1024;
const dist = fileURLToPath(new URL("../apps/client/dist/", import.meta.url));
const html = readFileSync(`${dist}index.html`, "utf8");
const initial = new Set(
  [...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+\.js)"/g)].map((m) => m[1]),
);
const all = readdirSync(`${dist}assets`).filter((f) => f.endsWith(".js"));
let total = 0;
for (const f of all) {
  const size = gzipSync(readFileSync(`${dist}assets/${f}`)).length;
  const isInitial = initial.has(`assets/${f}`);
  console.log(`${isInitial ? "initial" : "lazy   "} ${(size / 1024).toFixed(1)} KB gzip  ${f}`);
  if (isInitial) total += size;
}
console.log(`initial JS: ${(total / 1024).toFixed(1)} KB gzip (budget ${BUDGET / 1024} KB)`);
if (initial.size === 0) {
  console.error("size-check: found no initial scripts in dist/index.html");
  process.exit(1);
}
if (total > BUDGET) {
  console.error("size-check: over budget");
  process.exit(1);
}

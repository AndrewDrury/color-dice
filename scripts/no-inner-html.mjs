// Fails (exit 1) if raw-HTML sinks appear in the client source. Security rule: render text only.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const TARGET = join(ROOT, "apps/client/src");
const FORBIDDEN = /\b(innerHTML|outerHTML|dangerouslySetInnerHTML|insertAdjacentHTML)\b/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const hits = [];
for (const file of walk(TARGET)) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (const [i, line] of lines.entries()) {
    if (FORBIDDEN.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
  }
}

if (hits.length > 0) {
  console.error(`Forbidden raw-HTML sink(s) found in apps/client/src:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("no-inner-html: OK");

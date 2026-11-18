// Guard: apps/server/wrangler.jsonc must not ship test-only or local-only vars.
//   node scripts/check-wrangler.mjs
// Fails if `vars` (top level or any `env.*` section) contains ALLOW_TEST_HOOKS or
// PBKDF2_ITERATIONS, or if ALLOWED_ORIGINS lists a localhost origin. Those belong in the
// git-ignored apps/server/.dev.vars (see .dev.vars.example).
import { readFileSync } from "node:fs";

const FILE = new URL("../apps/server/wrangler.jsonc", import.meta.url);
const FORBIDDEN = ["ALLOW_TEST_HOOKS", "PBKDF2_ITERATIONS"];

/** Strips line and block comments and trailing commas, leaving string contents untouched. */
export function parseJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
      if (i === 0) throw new Error("unterminated block comment");
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export function problems(cfg) {
  const found = [];
  const sections = [
    ["vars", cfg.vars],
    ...Object.entries(cfg.env ?? {}).map(([n, e]) => [`env.${n}.vars`, e?.vars]),
  ];
  for (const [where, vars] of sections) {
    for (const k of FORBIDDEN)
      if (vars && Object.hasOwn(vars, k))
        found.push(`${where}.${k} must not be set in wrangler.jsonc`);
    const origins = vars?.ALLOWED_ORIGINS;
    if (typeof origins === "string" && /(^|,)\s*https?:\/\/(localhost|127\.0\.0\.1)/.test(origins))
      found.push(`${where}.ALLOWED_ORIGINS must not contain localhost origins`);
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = problems(parseJsonc(readFileSync(FILE, "utf8")));
  if (found.length > 0) {
    console.error(`check-wrangler: ${found.length} problem(s)\n${found.join("\n")}`);
    process.exit(1);
  }
  console.log("check-wrangler: OK");
}

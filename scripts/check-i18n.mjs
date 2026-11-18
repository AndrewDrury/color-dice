// i18n guard (T-UX-4). Fails when
//  1. a catalog (en/fr/es under apps/client/src/i18n/<lang>/) has a key the others lack,
//  2. {placeholders} differ between languages for a key, or a message is empty, or
//  3. user-visible English is hard-coded in apps/client/src: JSX text nodes, or string literals in
//     aria-label / title / placeholder / alt / label / hint / body / confirmLabel attributes,
//     or showToast("literal"). Excluded: i18n/, lab/. "Color Dice" (the product name) is allowed;
//     a line (or the line before it) containing `i18n-ok` is skipped.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "apps/client/src");
const I18N = join(SRC, "i18n");
const LANGS = ["en", "fr", "es"];
const problems = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// ---- 1 + 2: catalogs ----
const ENTRY = /"([\w.]+)":\s*("(?:[^"\\]|\\.)*")/g;
function load(lang) {
  const out = new Map();
  for (const file of walk(join(I18N, lang))) {
    if (!file.endsWith(".ts") || file.endsWith("index.ts")) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(ENTRY)) {
      if (out.has(m[1])) problems.push(`${lang}: duplicate key ${m[1]}`);
      out.set(m[1], JSON.parse(m[2]));
    }
  }
  return out;
}
const placeholders = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
const cats = Object.fromEntries(LANGS.map((l) => [l, load(l)]));
const en = cats.en;
if (en.size === 0) problems.push("en catalog is empty (parse failure?)");
for (const lang of LANGS) {
  for (const [key, text] of cats[lang]) {
    if (text.trim() === "") problems.push(`${lang}: empty message ${key}`);
    if (lang !== "en" && !en.has(key)) problems.push(`${lang}: extra key ${key}`);
  }
}
for (const lang of LANGS.slice(1)) {
  for (const [key, text] of en) {
    const other = cats[lang].get(key);
    if (other === undefined) {
      problems.push(`${lang}: missing key ${key}`);
      continue;
    }
    if (placeholders(text).join() !== placeholders(other).join()) {
      problems.push(
        `${lang}: placeholders differ for ${key}: {${placeholders(text)}} vs {${placeholders(other)}}`,
      );
    }
  }
}

// ---- 3: hard-coded UI text ----
const LETTERS = /\p{L}{2}/u;
const ATTRS = "aria-label|title|placeholder|alt|label|hint|body|confirmLabel";
const STOP = /^(return|else|case|default|yield|typeof|void|await|as|in|of)\b/;
const CODE =
  /\b(const|let|function|type|interface|import|export|Promise|Record|Array|Pick|useState)\b/;

function strip(src) {
  // Blank out comments but keep newlines so line numbers stay right.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
}
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

function balanced(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return "";
}

const raw = {};
function report(file, line, what) {
  const lines = raw[file].split("\n");
  if (/i18n-ok/.test(lines[line - 1] ?? "") || /i18n-ok/.test(lines[line - 2] ?? "")) return;
  problems.push(`${relative(ROOT, file)}:${line}: hard-coded text ${what}`);
}

for (const file of walk(SRC)) {
  if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
  if (file.startsWith(`${I18N}/`) || file.startsWith(`${join(SRC, "lab")}/`)) continue;
  raw[file] = readFileSync(file, "utf8");
  const src = strip(raw[file]);

  if (file.endsWith(".tsx")) {
    // JSX text: after a tag's ">" up to the next "<" or "{" (or after "}" up to "<").
    for (const m of src.matchAll(/([>}])([^<>{}]+)(?=([<{]))/g)) {
      const [, start, seg, end] = m;
      if (start === "}" && end !== "<") continue;
      const text = seg.trim();
      if (!LETTERS.test(text) || text === "Color Dice") continue;
      if (!/^[\p{L}\p{N}\s.,'’:!·–—…/%+×✕−-]+$/u.test(text) || STOP.test(text) || CODE.test(text))
        continue;
      report(file, lineOf(src, m.index + 1 + seg.search(/\S/)), `in JSX: "${text}"`);
    }
    // Attribute string literals (not the argument of t()/tn()).
    for (const m of src.matchAll(new RegExp(`\\b(${ATTRS})=(?:"([^"]*)"|\\{)`, "g"))) {
      let value = m[2];
      if (value === undefined) {
        const open = m.index + m[0].length - 1;
        value = balanced(src, open)
          .replace(/\btn?\(\s*(?:"[^"]*"|'[^']*'|`[^`]*`)/g, "t(")
          .replace(/\$\{[^}]*\}/g, "")
          .replace(/[=!]==\s*(?:"[^"]*"|'[^']*')/g, "")
          .replace(/\[\s*"[^"]*"\s*\]/g, "");
        value = [...value.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)]
          .map((x) => x[1] ?? x[2] ?? x[3])
          .join(" ");
      }
      if (LETTERS.test(value) && value.trim() !== "Color Dice") {
        report(file, lineOf(src, m.index), `in ${m[1]}: "${value.trim()}"`);
      }
    }
  }
  for (const m of src.matchAll(/\bshowToast\(\s*(["'`])([^"'`]*)\1/g)) {
    if (LETTERS.test(m[2])) report(file, lineOf(src, m.index), `in showToast: "${m[2]}"`);
  }
}

if (problems.length > 0) {
  console.error(`check-i18n: ${problems.length} problem(s)\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`check-i18n: OK (${en.size} keys x ${LANGS.length} languages)`);

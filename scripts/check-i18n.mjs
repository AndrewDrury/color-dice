// i18n guard (T-UX-4). Fails when
//  1. a catalog (en/fr/es under apps/client/src/i18n/<lang>/) has a key the others lack,
//  2. {placeholders} differ between languages for a key, or a message is empty, or
//  3. user-visible English is hard-coded in apps/client/src: JSX text nodes, or string literals in
//     aria-label / title / placeholder / alt / label / hint / body / confirmLabel attributes,
//     or showToast("literal"). Excluded: i18n/, lab/. "Color Dice" (the product name) is allowed;
//     a line (or the line before it) containing `i18n-ok` is skipped.
//     JSX text is flagged whenever it has a letter (only punctuation/digits/symbols pass); the
//     attributes also include aria-description / aria-roledescription / aria-valuetext and the
//     props text|message|heading|description|caption|summary|tooltip.
//  4. sentence-like string literals in non-test .ts files (a space + a letter, or a capital then
//     lowercase) that are not an argument of t()/tn() and not covered by TS_ALLOW below.
//  The rules are exercised by scripts/check-i18n.test.mjs, which this script runs last.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "apps/client/src");
const I18N = join(SRC, "i18n");
const LANGS = ["en", "fr", "es"];
const problems = [];
const MAIN = process.argv[1] === fileURLToPath(import.meta.url);

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
const cats = MAIN ? Object.fromEntries(LANGS.map((l) => [l, load(l)])) : {};
const en = cats.en ?? new Map();
if (MAIN && en.size === 0) problems.push("en catalog is empty (parse failure?)");
for (const lang of MAIN ? LANGS : []) {
  for (const [key, text] of cats[lang]) {
    if (text.trim() === "") problems.push(`${lang}: empty message ${key}`);
    if (lang !== "en" && !en.has(key)) problems.push(`${lang}: extra key ${key}`);
  }
}
for (const lang of MAIN ? LANGS.slice(1) : []) {
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

// ---- 3 + 4: hard-coded UI text (pure: returns [{line, what}]) ----
const LETTERS = /\p{L}{2}/u;
const ANY_LETTER = /\p{L}/u;
const ATTRS =
  "aria-label|aria-description|aria-roledescription|aria-valuetext|title|placeholder|alt|label|hint|body|confirmLabel|text|message|heading|description|caption|summary|tooltip";
const STOP = /^(return|else|case|default|yield|typeof|void|await|as|in|of)\b/;
// A text run that is really JS between JSX (after a closing tag inside {cond ? (...) : null}).
const CODEISH = /;|=>|^[,)\]:?}]|[(=,]\s*$|\bnull\b|\bundefined\b|\.map\(|\bif\s*\(/;
const CODE =
  /\b(const|let|function|type|interface|import|export|Promise|Record|Array|Pick|useState)\b/;

// Sentence-like literals that are legitimately not UI text. Key: "<path relative to repo>:<literal>".
// Every entry needs a reason.
export const TS_ALLOW = new Map([
  // Developer-facing / protocol / CSS / key names (never shown to players):
  ...[
    ["apps/client/src/api.ts", "${code} (${status})", "Error.message for logs"],
    ["apps/client/src/api.ts", "ApiError", "error class name"],
    ["apps/client/src/api.ts", "Retry-After", "HTTP header name"],
    ["apps/client/src/api.ts", "Content-Type", "HTTP header name"],
    ["apps/client/src/api.ts", "Bearer ${opts.token}", "HTTP auth header value"],
    [
      "apps/client/src/fx/dice-math.ts",
      "rotateZ(${a.z}deg) rotateX(${a.x}deg) rotateY(${a.y}deg)",
      "CSS transform",
    ],
    ["apps/client/src/fx/keyboard.ts", ".g-sheet .g-row", "CSS selector"],
    ["apps/client/src/fx/keyboard.ts", "Escape", "KeyboardEvent.key value"],
    ["apps/client/src/fx/keyboard.ts", "Spacebar", "KeyboardEvent.key value (legacy)"],
    ["apps/client/src/fx/motion.ts", "(prefers-reduced-motion: reduce)", "media query"],
    ["apps/client/src/fx/tabAttention.ts", "<svg …", "inline SVG favicon markup"],
    [
      "apps/client/src/game/status.ts",
      "${colorName(c)} ${g.roll?.colored[c]}",
      "localized colour name + number; the name comes from t()",
    ],
    [
      "apps/client/src/game/useStaging.ts",
      '${v.game?.phase}:${v.game?.turn?.number ?? ""}',
      "internal change-detection key",
    ],
    ["apps/client/src/game/useStaging.ts", "Escape", "KeyboardEvent.key value"],
    ["apps/client/src/game/useStaging.ts", "Enter", "KeyboardEvent.key value"],
    ["apps/client/src/game/useStaging.ts", ".g-sheet, .g-actionbar", "CSS selector"],
    [
      "apps/client/src/styles/contrast.ts",
      "not a #RRGGBB colour: ${hex}",
      "developer-only assertion in the contrast tool",
    ],
  ].map(([file, text, reason]) => [`${file}:${text}`, reason]),
]);

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

function balancedEnd(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  return src.length;
}

const SENTENCE = /^(?=.*\p{L})(?:.*\s.*|\p{Lu}\p{Ll}.*)$/u;

/** Find hard-coded user-visible text in one source file. `ext` is ".tsx" or ".ts". */
export function findLeaks(raw, ext, allowKey = "") {
  const found = [];
  const lines = raw.split("\n");
  const add = (line, what) => {
    if (/i18n-ok/.test(lines[line - 1] ?? "") || /i18n-ok/.test(lines[line - 2] ?? "")) return;
    found.push({ line, what });
  };
  const src = strip(raw);

  if (ext === ".tsx") {
    // JSX text: children of real JSX tags only (a tag opener not glued to an identifier, so TS
    // generics like `useState<string>` are ignored). Any letter is a leak; only punctuation,
    // digits and symbols pass.
    for (const m of src.matchAll(/(?<![\w$)\]])<\/?(?:[A-Za-z][\w.:-]*)?(?=[\s>/])/g)) {
      let i = m.index + m[0].length;
      // Scan to the end of the tag, skipping {...} and quoted values.
      for (; i < src.length && src[i] !== ">"; i++) {
        if (src[i] === "{") i = balancedEnd(src, i);
        else if (src[i] === '"' || src[i] === "'") i = src.indexOf(src[i], i + 1);
        if (i < 0) break;
      }
      if (i < 0 || i >= src.length || src[i - 1] === "=") continue;
      if (/\sextends\s/.test(src.slice(m.index, i))) continue; // generic arrow `<V extends X>(`
      if (src[i - 1] === "/") continue; // self-closing: no children
      // Children: text runs separated by {expr} containers, ending at the next "<".
      for (let p = i + 1; p < src.length; ) {
        let q = p;
        while (q < src.length && src[q] !== "<" && src[q] !== "{") q++;
        const seg = src.slice(p, q);
        const text = seg.trim();
        if (
          ANY_LETTER.test(text) &&
          text !== "Color Dice" &&
          !STOP.test(text) &&
          !CODE.test(text) &&
          !CODEISH.test(text)
        ) {
          add(lineOf(src, p + seg.search(/\S/)), `in JSX: "${text}"`);
        }
        if (src[q] !== "{") break;
        p = balancedEnd(src, q) + 1;
      }
    }
    // Attribute / prop string literals (not the argument of t()/tn()).
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
        add(lineOf(src, m.index), `in ${m[1]}: "${value.trim()}"`);
      }
    }
  }
  for (const m of src.matchAll(/\bshowToast\(\s*(["'`])([^"'`]*)\1/g)) {
    if (LETTERS.test(m[2])) add(lineOf(src, m.index), `in showToast: "${m[2]}"`);
  }

  if (ext === ".ts") {
    for (const m of src.matchAll(
      /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g,
    )) {
      const text = m[1] ?? m[2] ?? m[3];
      if (!SENTENCE.test(text) || text === "Color Dice") continue;
      // Skip the literal argument of t()/tn() and import/export specifiers.
      const before = src.slice(Math.max(0, m.index - 12), m.index);
      if (/\btn?\(\s*$/.test(before) || /(?:from|import)\s*$/.test(before)) continue;
      if (
        [...TS_ALLOW.keys()].some((k) => {
          const want = k.slice(allowKey.length + 1);
          return (
            k.startsWith(`${allowKey}:`) &&
            (want === text || (want.endsWith("…") && text.startsWith(want.slice(0, -1))))
          );
        })
      ) {
        continue;
      }
      add(lineOf(src, m.index), `string literal: "${text}"`);
    }
  }
  return found;
}

if (MAIN) {
  for (const file of walk(SRC)) {
    const ext = file.endsWith(".tsx") ? ".tsx" : file.endsWith(".ts") ? ".ts" : "";
    if (!ext) continue;
    if (file.startsWith(`${I18N}/`) || file.startsWith(`${join(SRC, "lab")}/`)) continue;
    if (ext === ".ts" && /\.(test|spec)\.ts$/.test(file)) continue;
    const rel = relative(ROOT, file);
    for (const { line, what } of findLeaks(readFileSync(file, "utf8"), ext, rel)) {
      problems.push(`${rel}:${line}: hard-coded text ${what}`);
    }
  }

  if (problems.length > 0) {
    console.error(`check-i18n: ${problems.length} problem(s)\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`check-i18n: OK (${en.size} keys x ${LANGS.length} languages)`);
  // Self-test: prove the rules above still catch violations.
  execFileSync(process.execPath, ["--test", join(ROOT, "scripts/check-i18n.test.mjs")], {
    stdio: "inherit",
  });
}

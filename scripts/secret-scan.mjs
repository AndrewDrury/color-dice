// Public-repo hygiene scan. Fails (exit 1) on secrets, private info, forbidden files, AI attribution.
//   node scripts/secret-scan.mjs             scan tracked (and untracked, non-ignored) files
//   node scripts/secret-scan.mjs --history   also scan every blob of every commit + commit metadata
//   node scripts/secret-scan.mjs --dist     also scan the built client (apps/client/dist) if it exists;
//                                            run after `npm run build` (not part of `npm run check`)
// Matches are always masked (first 4 chars only); a secret is never printed in full.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const HISTORY = process.argv.includes("--history");
const DIST = process.argv.includes("--dist");
const SELF = /^scripts\/secret-scan(\.test)?\.mjs$/;

const git = (args, opts = {}) =>
  execFileSync("git", args, { cwd: ROOT, maxBuffer: 1 << 30, ...opts });

const mask = (s) => `${s.slice(0, 4)}${"*".repeat(Math.min(Math.max(s.length - 4, 0), 8))}`;

// ---- content rules (patterns built from parts so this file does not match itself) ----
const KEY = ["-----BEGIN", "[A-Z ]*", "PRIVATE KEY-----"].join(" ?");
const TEST_PATH =
  /(^|\/)(tests?|__tests__|fixtures?|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|\.example$/;
const RULES = [
  { id: "private-key", re: new RegExp(KEY) },
  {
    id: "github-token",
    re: /\b(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/,
  },
  {
    id: "cloudflare-credential",
    re: /\b(CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CF_API_TOKEN|CF_API_KEY)\s*[:=]\s*["']?[A-Za-z0-9_-]{8,}/,
  },
  { id: "cloudflare-account-id", re: /\baccount_id["']?\s*[:=]\s*["'][0-9a-f]{32}["']/i },
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "slack-token", re: /\bxox[abpr]-[A-Za-z0-9-]{10,}/ },
  { id: "llm-api-key", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  {
    id: "generic-secret",
    re: /(secret|token|password|api[_-]?key)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i,
    skipPath: TEST_PATH,
  },
  {
    id: "home-path",
    re: /(\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\/|[A-Z]:\\\\?Users\\\\?[A-Za-z0-9._-]+)/,
  },
];

// ---- forbidden tracked paths ----
const FORBIDDEN_PATHS = [
  { id: "forbidden-file", re: /(^|\/)\.dev\.vars(?!\.example$)[^/]*$/ },
  { id: "forbidden-file", re: /(^|\/)\.env(?!\.example$)[^/]*$/ },
  { id: "forbidden-file", re: /\.(pem|key)$/ },
  { id: "forbidden-file", re: /^\.plan(\/|$)/ },
  { id: "forbidden-file", re: /(^|\/)CLAUDE\.md$/ },
  { id: "forbidden-file", re: /(^|\/)\.npm-cache(\/|$)/ },
];

// ---- emails ----
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const EMAIL_OK = [
  /@users\.noreply\.github\.com$/i,
  /^noreply@github\.com$/i,
  /@example\.(com|org|net)$/i,
  /@(localhost|test|invalid)$/i,
];
// Allow-listed emails by sha256 (so the address itself is not in the repo). Reason in each entry.
const EMAIL_SHA_ALLOW_METADATA_ONLY = new Map([
  [
    "d21c003d475e85fdc3a5ea24d2589acd35614930540a41a47f23f0a1955f4ea2",
    "legacy personal address on pre-noreply commits; human decided 2026-11-18 not to rewrite history. " +
      "Allowed in commit metadata only, for commits at or before the first noreply-authored commit.",
  ],
]);
const sha = (s) => createHash("sha256").update(s.toLowerCase()).digest("hex");

// Path+rule allow-list for false positives (each with a reason).
const ALLOW = [{ path: SELF, rule: /.*/, reason: "scanner defines the patterns it searches for" }];
const allowed = (path, rule) => ALLOW.some((a) => a.path.test(path) && a.rule.test(rule));

const AI_ATTRIB = [/Co-Authored-By:.*(Claude|anthropic)/i, /Generated with \[?Claude/i];

const findings = [];
const report = (where, rule, extra = "") =>
  findings.push(`${where}: ${rule}${extra ? ` (${extra})` : ""}`);

function scanText(label, path, text, { emailOk } = {}) {
  const lines = text.split("\n");
  for (const [i, line] of lines.entries()) {
    for (const rule of RULES) {
      if (rule.skipPath?.test(path)) continue;
      const m = rule.re.exec(line);
      if (m && !allowed(path, rule.id)) report(`${label}:${i + 1}`, rule.id, mask(m[0]));
    }
    if (allowed(path, "email")) continue;
    for (const email of line.match(EMAIL_RE) ?? []) {
      if (EMAIL_OK.some((r) => r.test(email))) continue;
      if (emailOk?.(email)) continue;
      report(`${label}:${i + 1}`, "email", mask(email));
    }
  }
}

function scanPath(label, path) {
  for (const f of FORBIDDEN_PATHS) if (f.re.test(path)) report(label, f.id);
}

const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

// ---- working tree ----
const files = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
  .toString()
  .split("\0")
  .filter(Boolean);
for (const path of new Set(files)) {
  scanPath(path, path);
  let buf;
  try {
    buf = readFileSync(`${ROOT}${path}`);
  } catch {
    continue; // deleted in working tree
  }
  if (!isBinary(buf) && !/(^|\/)package-lock\.json$/.test(path))
    scanText(path, path, buf.toString("utf8"));
}

// ---- built client (--dist) ----
if (DIST) {
  const dist = `${ROOT}apps/client/dist`;
  if (!existsSync(dist))
    console.log("secret-scan: apps/client/dist not found; skipping --dist (run npm run build)");
  else {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    for (const abs of walk(dist)) {
      const rel = abs.slice(ROOT.length);
      scanPath(rel, rel);
      const buf = readFileSync(abs);
      if (!isBinary(buf)) scanText(rel, rel, buf.toString("utf8"));
    }
  }
}

// ---- history ----
let historyNote = "";
if (HISTORY) {
  const out = (args) => git(args).toString();
  const commits = out(["rev-list", "--all", "--reverse"]).split("\n").filter(Boolean);

  // Boundary: first (oldest) commit authored with a noreply address.
  const meta = out([
    "log",
    "--all",
    "--reverse",
    "--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x01",
  ])
    .split("\x01")
    .map((r) => r.replace(/^\n/, ""))
    .filter(Boolean)
    .map((r) => {
      const [h, an, ae, cn, ce, body] = r.split("\0");
      return { h, an, ae, cn, ce, body: body ?? "" };
    });
  const boundary = meta.find((c) => /@users\.noreply\.github\.com$/i.test(c.ae));
  const legacy = new Set(
    boundary ? out(["rev-list", boundary.h]).split("\n").filter(Boolean) : commits,
  );
  historyNote = boundary
    ? `legacy-address allowance ends at ${boundary.h.slice(0, 7)} (first noreply commit)`
    : "no noreply commit yet: legacy-address allowance covers all existing commits";

  for (const c of meta) {
    const short = `commit ${c.h.slice(0, 7)}`;
    const emailOk = (e) => legacy.has(c.h) && EMAIL_SHA_ALLOW_METADATA_ONLY.has(sha(e));
    scanText(`${short} metadata`, "", `${c.an}\n${c.ae}\n${c.cn}\n${c.ce}\n${c.body}`, { emailOk });
    for (const r of AI_ATTRIB) if (r.test(c.body)) report(`${short} message`, "ai-attribution");
  }

  // Every distinct blob reachable from any commit (file content never gets the legacy allowance).
  const objs = out(["rev-list", "--all", "--objects"]).split("\n").filter(Boolean);
  const pathOf = new Map();
  for (const l of objs) {
    const sp = l.indexOf(" ");
    if (sp > 0 && !pathOf.has(l.slice(0, sp))) pathOf.set(l.slice(0, sp), l.slice(sp + 1));
  }
  const types = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
    input: `${[...pathOf.keys()].join("\n")}\n`,
  })
    .toString()
    .split("\n");
  for (const l of types) {
    const [oid, type] = l.split(" ");
    if (type !== "blob") continue;
    const path = pathOf.get(oid);
    const label = `${path}@${oid.slice(0, 7)}`;
    scanPath(label, path);
    const buf = git(["cat-file", "blob", oid]);
    if (!isBinary(buf) && !/(^|\/)package-lock\.json$/.test(path))
      scanText(label, path, buf.toString("utf8"));
  }
}

if (findings.length > 0) {
  console.error(
    `secret-scan: ${findings.length} finding(s)${historyNote ? ` [${historyNote}]` : ""}`,
  );
  console.error([...new Set(findings)].join("\n"));
  process.exit(1);
}
console.log(`secret-scan: OK${HISTORY ? ` (history; ${historyNote})` : ""}`);

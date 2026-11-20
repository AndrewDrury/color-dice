#!/usr/bin/env node
// Run several shell commands concurrently, print each one's output (prefixed) as it
// finishes, and exit non-zero if any failed.
// Usage: node scripts/run-parallel.mjs "name=command" "name2=command2" ...
import { spawn } from "node:child_process";

const specs = process.argv.slice(2).map((a) => {
  const i = a.indexOf("=");
  if (i < 1) throw new Error(`bad spec "${a}" (expected name=command)`);
  return { name: a.slice(0, i), cmd: a.slice(i + 1) };
});
if (specs.length === 0) {
  console.error("usage: run-parallel.mjs name=command ...");
  process.exit(2);
}

const t0 = Date.now();
const secs = (since) => `${((Date.now() - since) / 1000).toFixed(1)}s`;

function run({ name, cmd }) {
  return new Promise((resolve) => {
    const start = Date.now();
    const chunks = [];
    const child = spawn(cmd, { shell: true, env: { ...process.env, FORCE_COLOR: "0" } });
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => chunks.push(d));
    child.on("error", (e) => chunks.push(Buffer.from(String(e))));
    child.on("close", (code) => {
      const text = Buffer.concat(chunks).toString("utf8").trimEnd();
      const tag = code === 0 ? "ok  " : "FAIL";
      const prefix = `[${name}] `;
      // Passing tasks: short tail only. Failing tasks: everything.
      const lines = text.split("\n");
      const shown = code === 0 ? lines.slice(-6) : lines;
      console.log(`\n=== ${tag} ${name} (${secs(start)}) ===`);
      for (const l of shown) console.log(prefix + l);
      resolve({ name, code: code ?? 1, ms: Date.now() - start });
    });
  });
}

const results = await Promise.all(specs.map(run));
const failed = results.filter((r) => r.code !== 0);
console.log(
  `\n${results.map((r) => `${r.name} ${(r.ms / 1000).toFixed(1)}s${r.code ? " FAIL" : ""}`).join(" | ")}`,
);
console.log(
  failed.length ? `FAILED: ${failed.map((r) => r.name).join(", ")}` : `all ok in ${secs(t0)}`,
);
process.exit(failed.length ? 1 : 0);

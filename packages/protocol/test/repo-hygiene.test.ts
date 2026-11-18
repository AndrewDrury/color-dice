import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lines = readFileSync(new URL("../../../.gitignore", import.meta.url), "utf8")
  .split("\n")
  .map((l) => l.trim());

describe("public repo hygiene", () => {
  it(".gitignore covers env files, dev vars, keys, .plan/ and CLAUDE.md (examples stay tracked)", () => {
    for (const p of [".env", ".env.*", ".dev.vars*", "*.pem", "*.key", ".plan/", "CLAUDE.md"]) {
      expect(lines, p).toContain(p);
    }
    expect(lines).toContain("!.env.example");
    expect(lines).toContain("!.dev.vars.example");
  });
});

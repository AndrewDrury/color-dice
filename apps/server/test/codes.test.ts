import { describe, expect, it } from "vitest";
import { isValidCode, newGameCode } from "../src/codes";
import { CODE_ALPHABET } from "../src/router";

describe("game codes", () => {
  it("alphabet matches defaults.md", () => {
    expect(CODE_ALPHABET).toBe("ABCDEFGHJKMNPQRSTUVWXYZ23456789");
  });

  it("generates length-5 codes from the alphabet only", () => {
    for (let i = 0; i < 2000; i++) {
      const c = newGameCode();
      expect(c).toHaveLength(5);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
      expect(isValidCode(c)).toBe(true);
    }
  });

  it("uses every alphabet character (rough distribution check)", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      for (const ch of newGameCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect(counts.size).toBe(CODE_ALPHABET.length);
    // 20,000 chars / 31 ≈ 645 each; allow wide slack.
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(450);
      expect(n).toBeLessThan(850);
    }
  });

  it("isValidCode rejects ambiguous chars, lowercase and wrong lengths", () => {
    expect(isValidCode("ABCDE")).toBe(true);
    for (const bad of ["O", "0", "I", "1", "l", "L"]) {
      expect(isValidCode(`ABCD${bad}`)).toBe(false);
    }
    expect(isValidCode("abcde")).toBe(false);
    expect(isValidCode("ABCD")).toBe(false);
    expect(isValidCode("ABCDEF")).toBe(false);
    expect(isValidCode("")).toBe(false);
    expect(isValidCode("AB DE")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { CryptoDice, ScriptedDice } from "../src/dice";

describe("dice", () => {
  it("ScriptedDice throws when exhausted and rejects bad faces", () => {
    const d = new ScriptedDice([3]);
    expect(d.rollDie()).toBe(3);
    expect(() => d.rollDie()).toThrow("ScriptedDice exhausted");
    expect(() => new ScriptedDice([7])).toThrow(RangeError);
  });

  it("CryptoDice yields every face 1..6 and nothing else", () => {
    const d = new CryptoDice();
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) {
      const f = d.rollDie();
      expect(Number.isInteger(f) && f >= 1 && f <= 6).toBe(true);
      counts[f - 1] = (counts[f - 1] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeGreaterThan(800);
  });
});

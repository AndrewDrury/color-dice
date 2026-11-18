import { describe, expect, it } from "vitest";
import { COLORS, indexOf, LOCK_INDEX, numberAt } from "../src/constants";
import { crossCount, isSkipped, markCount, rightmost } from "../src/derived";
import { fromJSON, toJSON } from "../src/serialize";
import { makeRow, makeSheet, makeState } from "./helpers/builders";

describe("numberAt / indexOf (§15.1 #1)", () => {
  it.each(COLORS)("%s round-trips for 2..12", (color) => {
    for (let n = 2; n <= 12; n++) {
      const i = indexOf(color, n);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThanOrEqual(LOCK_INDEX);
      expect(numberAt(color, i)).toBe(n);
    }
    for (let i = 0; i <= LOCK_INDEX; i++) expect(indexOf(color, numberAt(color, i))).toBe(i);
  });

  it("lock numbers sit at LOCK_INDEX", () => {
    expect(numberAt("RED", LOCK_INDEX)).toBe(12);
    expect(numberAt("YELLOW", LOCK_INDEX)).toBe(12);
    expect(numberAt("GREEN", LOCK_INDEX)).toBe(2);
    expect(numberAt("BLUE", LOCK_INDEX)).toBe(2);
  });

  it("indexOf rejects out-of-range and non-integer numbers", () => {
    for (const n of [0, 1, 13, 2.5, Number.NaN]) expect(indexOf("RED", n)).toBe(-1);
  });
});

describe("derived row values (§3.2)", () => {
  it("empty row", () => {
    const row = makeRow("RED");
    expect(rightmost(row)).toBe(-1);
    expect(markCount(row)).toBe(0);
    expect(crossCount(row)).toBe(0);
    expect(isSkipped(row, 0)).toBe(false);
  });

  it("computes rightmost, counts and skipped boxes", () => {
    const row = makeRow("GREEN", [12, 9, 7]); // indices 0, 3, 5
    expect(rightmost(row)).toBe(5);
    expect(markCount(row)).toBe(3);
    expect(crossCount(row)).toBe(3);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => isSkipped(row, i))).toEqual([
      false,
      true,
      true,
      false,
      true,
      false,
      false,
    ]);
  });

  it("lock box counts as a cross but not a mark", () => {
    const row = makeRow("BLUE", [12, 11, 10, 9, 8, 2]);
    expect(markCount(row)).toBe(6);
    expect(crossCount(row)).toBe(7);
  });
});

describe("serialize", () => {
  it("round-trips byte-identically with stable key order", () => {
    const state = makeState({
      players: ["a", { id: "b", sheet: makeSheet({ RED: [2, 5], BLUE: [12] }, 1) }],
      lockedColors: ["GREEN"],
      phase: "ACTION_1",
      turn: {
        turnNumber: 3,
        activeSeat: 1,
        roll: { white: [3, 4], colored: { RED: 2, YELLOW: 6, BLUE: 1 } },
        action1Decisions: { b: { kind: "MARK", color: "RED" }, a: { kind: "PASS" } },
      },
    });
    state.log.push({ type: "TURN_STARTED", turnNumber: 3, activeSeat: 1 });
    const text = toJSON(state);
    const back = fromJSON(text);
    expect(back).toEqual(state);
    expect(toJSON(back)).toBe(text);
  });

  it("is independent of insertion order", () => {
    const a = makeState();
    const b = JSON.parse(JSON.stringify(a)) as typeof a;
    const reordered = { log: b.log, turn: b.turn, endReason: null, phase: b.phase } as Record<
      string,
      unknown
    >;
    reordered.lockedColors = b.lockedColors;
    reordered.players = b.players;
    expect(toJSON(reordered as unknown as typeof a)).toBe(toJSON(a));
  });

  it("keeps a __proto__ player id as plain data", () => {
    const state = makeState({
      turn: { action1Decisions: JSON.parse('{"__proto__":{"kind":"PASS"}}') },
    });
    const back = fromJSON(toJSON(state));
    expect(Object.keys(back.turn?.action1Decisions ?? {})).toEqual(["__proto__"]);
  });

  it("rejects malformed input", () => {
    expect(() => fromJSON("null")).toThrow(TypeError);
    expect(() => fromJSON('{"players":1}')).toThrow(TypeError);
    expect(() => fromJSON("{")).toThrow();
  });
});

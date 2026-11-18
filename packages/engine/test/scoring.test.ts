import { describe, expect, it } from "vitest";
import { rowScore, score, scoreSheet, triangular, winners } from "../src/scoring";
import { makeRow, makeRowWithCount, makeSheet, makeState } from "./helpers/builders";

describe("triangular (§15.2 #8)", () => {
  it("matches the scoring table for k = 0..12", () => {
    const table = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78];
    table.forEach((points, k) => {
      expect(triangular(k)).toBe(points);
    });
  });
});

describe("score", () => {
  it("rulebook example totals 70 (§15.2 #9)", () => {
    const state = makeState({
      players: [
        {
          id: "a",
          sheet: {
            rows: {
              RED: makeRowWithCount("RED", 4),
              YELLOW: makeRowWithCount("YELLOW", 3),
              GREEN: makeRowWithCount("GREEN", 8),
              BLUE: makeRowWithCount("BLUE", 7),
            },
            penalties: 2,
          },
        },
        "b",
      ],
    });
    expect(score(state, "a")).toEqual({
      rows: { RED: 10, YELLOW: 6, GREEN: 36, BLUE: 28 },
      penalties: -10,
      total: 70,
    });
  });

  it("locked row: 5 marks + lock number + lock box = 28 (§15.2 #10)", () => {
    const row = makeRow("RED", [2, 4, 6, 8, 10, 12]);
    expect(row.lockCrossed).toBe(true);
    expect(rowScore(row)).toBe(28);
  });

  it("4 penalties and no marks = -20 (§15.2 #11)", () => {
    expect(scoreSheet(makeSheet({}, 4))).toEqual({
      rows: { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 },
      penalties: -20,
      total: -20,
    });
  });

  it("no penalties gives +0, not -0", () => {
    expect(Object.is(scoreSheet(makeSheet()).penalties, 0)).toBe(true);
  });

  it("crosses in a row locked by someone else still score", () => {
    expect(scoreSheet(makeSheet({ GREEN: [12, 11, 10] })).total).toBe(6);
  });

  it("throws for an unknown player", () => {
    expect(() => score(makeState(), "nobody")).toThrow(RangeError);
  });
});

describe("winners (§15.2 #12)", () => {
  it("returns every player tied for the top total, in seat order", () => {
    const state = makeState({
      players: [
        { id: "a", sheet: makeSheet({ RED: [2, 3] }) },
        { id: "b", sheet: makeSheet({ BLUE: [5] }) },
        { id: "c", sheet: makeSheet({ GREEN: [12, 11] }) },
      ],
    });
    expect(winners(state)).toEqual(["a", "c"]);
  });

  it("returns a single winner when there is no tie", () => {
    const state = makeState({
      players: [{ id: "a", sheet: makeSheet({ RED: [2] }) }, "b"],
    });
    expect(winners(state)).toEqual(["a"]);
  });

  it("all players tie at zero", () => {
    expect(winners(makeState({ players: ["a", "b", "c"] }))).toEqual(["a", "b", "c"]);
  });
});

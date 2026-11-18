import { describe, expect, it } from "vitest";
import { COLORS, LOCK_INDEX, numberAt, ROW_LENGTH } from "../src/constants";
import { ILLEGAL_REASONS } from "../src/errors";
import { applyMark, canMark } from "../src/rules";
import { type BoxStatus, boxStatus } from "../src/status";
import type { Color, RowState } from "../src/types";
import { makeRow, makeRowWithCount } from "./helpers/builders";

/** Row with exactly the given indices marked. */
function rowAt(color: Color, indices: number[]): RowState {
  return makeRow(
    color,
    indices.map((i) => numberAt(color, i)),
  );
}

function deepFreeze(row: RowState): RowState {
  Object.freeze(row.marked);
  return Object.freeze(row);
}

const lockNumber = (c: Color) => numberAt(c, LOCK_INDEX);

describe.each(COLORS)("canMark / applyMark — %s (§15.1)", (color) => {
  it("#2 empty row: everything but the lock number is markable", () => {
    const row = makeRow(color);
    for (let i = 0; i < LOCK_INDEX; i++)
      expect(canMark(row, numberAt(color, i), [])).toEqual({ ok: true });
    expect(canMark(row, lockNumber(color), [])).toEqual({
      ok: false,
      reason: "LOCK_REQUIRES_FIVE",
    });
  });

  it("#3 after marking index k: <= k illegal, > k legal except a gated lock", () => {
    for (let k = 0; k < LOCK_INDEX; k++) {
      const row = rowAt(color, [k]);
      for (let i = 0; i <= k; i++) {
        const reason = i === k ? "ALREADY_MARKED" : "LEFT_OF_RIGHTMOST";
        expect(canMark(row, numberAt(color, i), [])).toEqual({ ok: false, reason });
      }
      for (let i = k + 1; i < LOCK_INDEX; i++)
        expect(canMark(row, numberAt(color, i), []).ok).toBe(true);
      expect(canMark(row, lockNumber(color), [])).toEqual({
        ok: false,
        reason: "LOCK_REQUIRES_FIVE",
      });
    }
  });

  it("EC-1 first mark mid-row skips the boxes to its left", () => {
    const row = applyMark(makeRow(color), numberAt(color, 5)).row;
    expect(canMark(row, numberAt(color, 2), [])).toEqual({
      ok: false,
      reason: "LEFT_OF_RIGHTMOST",
    });
    expect(canMark(row, numberAt(color, 6), []).ok).toBe(true);
  });

  it("#4 / EC-2 lock gate: 4 marks illegal, 5 marks legal", () => {
    expect(canMark(makeRowWithCount(color, 4), lockNumber(color), [])).toEqual({
      ok: false,
      reason: "LOCK_REQUIRES_FIVE",
    });
    expect(canMark(makeRowWithCount(color, 5), lockNumber(color), [])).toEqual({ ok: true });
    // Gate counts marks, not position: 5 sparse marks ending at index 9.
    expect(canMark(rowAt(color, [1, 3, 5, 7, 9]), lockNumber(color), []).ok).toBe(true);
  });

  it("#5 / EC-3 applyMark on the lock number crosses the lock box and locks", () => {
    const { row, lockedNow } = applyMark(makeRowWithCount(color, 5), lockNumber(color));
    expect(lockedNow).toBe(true);
    expect(row.lockCrossed).toBe(true);
    expect(row.marked[LOCK_INDEX]).toBe(true);
    const plain = applyMark(makeRow(color), numberAt(color, 0));
    expect(plain.lockedNow).toBe(false);
    expect(plain.row.lockCrossed).toBe(false);
  });

  it("#6 / EC-19 a globally locked color rejects every number, even for the locker", () => {
    const locker = applyMark(makeRowWithCount(color, 5), lockNumber(color)).row;
    for (const row of [makeRow(color), locker]) {
      for (let n = 2; n <= 12; n++)
        expect(canMark(row, n, [color])).toEqual({ ok: false, reason: "ROW_LOCKED" });
    }
    const other = COLORS.find((c) => c !== color) as Color;
    expect(canMark(makeRow(color), numberAt(color, 0), [other]).ok).toBe(true);
  });

  it("#7 out-of-range numbers are rejected first", () => {
    for (const n of [1, 13, 0, 2.5, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(canMark(makeRow(color), n, [color])).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
    }
    expect(() => applyMark(makeRow(color), 13)).toThrow(RangeError);
  });

  it("applyMark does not mutate its (frozen) input", () => {
    const input = deepFreeze(makeRowWithCount(color, 5));
    const before = JSON.stringify(input);
    const out = applyMark(input, lockNumber(color));
    expect(JSON.stringify(input)).toBe(before);
    expect(out.row).not.toBe(input);
    expect(out.row.marked).not.toBe(input.marked);
    expect(out.row.marked).toHaveLength(ROW_LENGTH);
  });
});

describe("reason order (§8)", () => {
  it("ILLEGAL_REASONS lists OUT_OF_RANGE then the §8 order", () => {
    expect(ILLEGAL_REASONS).toEqual([
      "OUT_OF_RANGE",
      "ROW_LOCKED",
      "ALREADY_MARKED",
      "LEFT_OF_RIGHTMOST",
      "LOCK_REQUIRES_FIVE",
    ]);
  });

  it("ROW_LOCKED beats ALREADY_MARKED; ALREADY_MARKED beats LEFT_OF_RIGHTMOST", () => {
    const row = rowAt("RED", [2, 6]);
    expect(canMark(row, numberAt("RED", 2), ["RED"])).toEqual({ ok: false, reason: "ROW_LOCKED" });
    expect(canMark(row, numberAt("RED", 2), [])).toEqual({ ok: false, reason: "ALREADY_MARKED" });
  });

  it("ALREADY_MARKED beats LOCK_REQUIRES_FIVE for an (invalid) marked lock with few marks", () => {
    const row = rowAt("GREEN", [LOCK_INDEX]);
    expect(canMark(row, 2, [])).toEqual({ ok: false, reason: "ALREADY_MARKED" });
  });
});

describe("boxStatus (§3.3)", () => {
  type Case = [
    label: string,
    indices: number[],
    locked: boolean,
    index: number,
    expected: BoxStatus,
  ];
  const cases: Case[] = [
    ["marked box", [3], false, 3, "MARKED"],
    ["marked box in a locked row", [3], true, 3, "MARKED"],
    ["box left of rightmost", [3], false, 1, "SKIPPED"],
    ["skipped box in a locked row", [3], true, 1, "SKIPPED"],
    ["open box in a locked row", [3], true, 5, "CLOSED"],
    ["lock box in a locked row", [], true, LOCK_INDEX, "CLOSED"],
    ["lock box with 4 marks", [0, 1, 2, 3], false, LOCK_INDEX, "OPEN_LOCK_GATED"],
    ["lock box with 5 marks", [0, 1, 2, 3, 4], false, LOCK_INDEX, "OPEN"],
    ["empty row first box", [], false, 0, "OPEN"],
    ["box right of rightmost", [3], false, 4, "OPEN"],
    ["crossed lock box", [0, 1, 2, 3, 4, LOCK_INDEX], true, LOCK_INDEX, "MARKED"],
  ];

  for (const color of ["RED", "GREEN"] as const) {
    it.each(cases)(`${color}: %s`, (_label, indices, locked, index, expected) => {
      expect(boxStatus(rowAt(color, indices), index, locked ? [color] : [])).toBe(expected);
    });
  }

  it("rejects a bad index", () => {
    expect(() => boxStatus(makeRow("RED"), 11, [])).toThrow(RangeError);
    expect(() => boxStatus(makeRow("RED"), -1, [])).toThrow(RangeError);
  });
});

import { indexOf, LOCK_INDEX, LOCK_MIN_MARKS } from "./constants";
import { markCount, rightmost } from "./derived";
import type { IllegalReason } from "./errors";
import type { Color, RowState } from "./types";

export type MarkCheck = { ok: true } | { ok: false; reason: IllegalReason };

/**
 * May a player cross number `n` in `row` right now? (spec §4.1)
 * Reasons are checked in order: OUT_OF_RANGE, then the §8 order.
 */
export function canMark(row: RowState, n: number, lockedColors: readonly Color[]): MarkCheck {
  const i = indexOf(row.color, n);
  if (i < 0) return { ok: false, reason: "OUT_OF_RANGE" };
  if (lockedColors.includes(row.color)) return { ok: false, reason: "ROW_LOCKED" };
  if (row.marked[i]) return { ok: false, reason: "ALREADY_MARKED" };
  if (i < rightmost(row)) return { ok: false, reason: "LEFT_OF_RIGHTMOST" };
  if (i === LOCK_INDEX && markCount(row) < LOCK_MIN_MARKS) {
    return { ok: false, reason: "LOCK_REQUIRES_FIVE" };
  }
  return { ok: true };
}

/**
 * Cross number `n` (spec §4.2). Pure: returns a new row; the input is untouched.
 * Precondition: `canMark` was ok. Throws RangeError if `n` is not in 2..12.
 */
export function applyMark(row: RowState, n: number): { row: RowState; lockedNow: boolean } {
  const i = indexOf(row.color, n);
  if (i < 0) throw new RangeError(`number out of range: ${n}`);
  const marked = row.marked.slice();
  marked[i] = true;
  const lockedNow = i === LOCK_INDEX;
  return {
    row: { color: row.color, marked, lockCrossed: row.lockCrossed || lockedNow },
    lockedNow,
  };
}

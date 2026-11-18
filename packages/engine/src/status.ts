import { LOCK_INDEX, LOCK_MIN_MARKS } from "./constants";
import { isSkipped, markCount } from "./derived";
import type { Color, RowState } from "./types";

export type BoxStatus = "MARKED" | "SKIPPED" | "CLOSED" | "OPEN_LOCK_GATED" | "OPEN";

/** Display status of box `index` (0..10) of a row (spec §3.3, first match wins). */
export function boxStatus(row: RowState, index: number, lockedColors: readonly Color[]): BoxStatus {
  if (!Number.isInteger(index) || index < 0 || index > LOCK_INDEX) {
    throw new RangeError(`box index out of range: ${index}`);
  }
  if (row.marked[index]) return "MARKED";
  if (isSkipped(row, index)) return "SKIPPED";
  if (lockedColors.includes(row.color)) return "CLOSED";
  if (index === LOCK_INDEX && markCount(row) < LOCK_MIN_MARKS) return "OPEN_LOCK_GATED";
  return "OPEN";
}

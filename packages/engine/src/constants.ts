import type { Color } from "./types";

/** Canonical color order (spec §3.1). */
export const COLORS: readonly Color[] = ["RED", "YELLOW", "GREEN", "BLUE"];
/** Rows numbered 2 → 12 (spec §2.2). */
export const ASCENDING: readonly Color[] = ["RED", "YELLOW"];
/** Rows numbered 12 → 2 (spec §2.2). */
export const DESCENDING: readonly Color[] = ["GREEN", "BLUE"];

/** Number of number boxes in a row. */
export const ROW_LENGTH = 11;
/** The lock number is always at index 10. */
export const LOCK_INDEX = 10;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const PENALTY_BOXES = 4;
export const PENALTY_VALUE = -5;
export const LOCK_MIN_MARKS = 5;
export const LOCKS_TO_END = 2;
export const MAX_CROSSES_PER_ROW = 12;

export function isAscending(color: Color): boolean {
  return color === "RED" || color === "YELLOW";
}

/** Number printed at index `i` (0..10) of a row of `color`. */
export function numberAt(color: Color, i: number): number {
  return isAscending(color) ? i + 2 : 12 - i;
}

/** Index of number `n` in a row of `color`, or -1 if `n` is not an integer in 2..12. */
export function indexOf(color: Color, n: number): number {
  if (!Number.isInteger(n) || n < 2 || n > 12) return -1;
  return isAscending(color) ? n - 2 : 12 - n;
}

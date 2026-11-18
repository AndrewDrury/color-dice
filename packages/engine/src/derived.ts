import type { RowState } from "./types";

/** Index of the rightmost crossed box, or -1 if none (spec §3.2). */
export function rightmost(row: RowState): number {
  return row.marked.lastIndexOf(true);
}

/** Number of crossed number boxes, excluding the lock box. */
export function markCount(row: RowState): number {
  let n = 0;
  for (const m of row.marked) if (m) n++;
  return n;
}

/** Crosses that count for scoring, including the lock box. */
export function crossCount(row: RowState): number {
  return markCount(row) + (row.lockCrossed ? 1 : 0);
}

/** A box left of the rightmost cross that was never crossed. */
export function isSkipped(row: RowState, i: number): boolean {
  return !row.marked[i] && i < rightmost(row);
}

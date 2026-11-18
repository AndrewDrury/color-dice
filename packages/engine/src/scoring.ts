import { COLORS, PENALTY_VALUE } from "./constants";
import { crossCount } from "./derived";
import type { Color, GameState, PlayerId, RowState, ScoreSheet } from "./types";

export interface ScoreBreakdown {
  rows: Record<Color, number>;
  penalties: number;
  total: number;
}

/** Triangular number T(k) = k(k+1)/2 (spec §2.4). */
export function triangular(k: number): number {
  return (k * (k + 1)) / 2;
}

export function rowScore(row: RowState): number {
  return triangular(crossCount(row));
}

export function scoreSheet(sheet: ScoreSheet): ScoreBreakdown {
  const rows = {} as Record<Color, number>;
  let total = 0;
  for (const c of COLORS) {
    rows[c] = rowScore(sheet.rows[c]);
    total += rows[c];
  }
  // Avoid -0 when there are no penalties.
  const penalties = sheet.penalties === 0 ? 0 : sheet.penalties * PENALTY_VALUE;
  return { rows, penalties, total: total + penalties };
}

/** Score of one player (spec §12.1). Throws RangeError for an unknown id. */
export function score(state: GameState, playerId: PlayerId): ScoreBreakdown {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new RangeError(`unknown player: ${playerId}`);
  return scoreSheet(player.sheet);
}

/** Every player tied for the highest total, in seat order (spec §12.2, I-7). */
export function winners(state: GameState): PlayerId[] {
  const totals = state.players.map((p) => ({ id: p.id, total: scoreSheet(p.sheet).total }));
  if (totals.length === 0) return [];
  const best = Math.max(...totals.map((t) => t.total));
  return totals.filter((t) => t.total === best).map((t) => t.id);
}

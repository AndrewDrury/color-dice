/** Pure read-only queries for UIs, bots and hosts (spec §7.4 option list, §16). */
import { COLORS } from "./constants";
import { canMark } from "./rules";
import { activePlayer, findPlayer, getDecision } from "./transitions";
import type { Color, GameState, PlayerId } from "./types";

export type Action1Option = { kind: "PASS" } | { kind: "MARK"; color: Color; number: number };
export type Action2Option =
  | { kind: "PASS" }
  | { kind: "MARK"; whiteDie: 0 | 1; color: Color; number: number };

/**
 * PASS plus every color where the white sum is markable. Empty when the player
 * cannot act (wrong phase, unknown, or already decided).
 */
export function legalAction1Options(state: GameState, playerId: PlayerId): Action1Option[] {
  const turn = state.turn;
  const player = findPlayer(state, playerId);
  if (state.phase !== "ACTION_1" || !turn?.roll || !player) return [];
  if (getDecision(turn, player.id)) return [];
  const n = turn.roll.white[0] + turn.roll.white[1];
  const out: Action1Option[] = [{ kind: "PASS" }];
  for (const color of COLORS) {
    if (canMark(player.sheet.rows[color], n, state.lockedColors).ok) {
      out.push({ kind: "MARK", color, number: n });
    }
  }
  return out;
}

/**
 * PASS plus every legal (whiteDie, color), deduplicated by (color, number) and
 * keeping the lowest whiteDie. Empty unless `playerId` is active in ACTION_2.
 */
export function legalAction2Options(state: GameState, playerId: PlayerId): Action2Option[] {
  const turn = state.turn;
  const active = activePlayer(state);
  if (state.phase !== "ACTION_2" || !turn?.roll || !active || active.id !== playerId) return [];
  const { white, colored } = turn.roll;
  const out: Action2Option[] = [{ kind: "PASS" }];
  for (const color of COLORS) {
    const face = colored[color];
    if (face === undefined || state.lockedColors.includes(color)) continue;
    const seen = new Set<number>();
    for (const whiteDie of [0, 1] as const) {
      const number = white[whiteDie] + face;
      if (seen.has(number)) continue;
      seen.add(number);
      if (canMark(active.sheet.rows[color], number, state.lockedColors).ok) {
        out.push({ kind: "MARK", whiteDie, color, number });
      }
    }
  }
  return out;
}

export function isGameOver(state: GameState): boolean {
  return state.phase === "GAME_OVER";
}

/** Id of the active player, or null before setup completes. */
export function activePlayerId(state: GameState): PlayerId | null {
  return activePlayer(state)?.id ?? null;
}

/** Pure read-only queries for UIs, bots and hosts (spec §7.4 option list, §16). */
import { rowsAfterAction1 } from "./action2";
import { COLORS } from "./constants";
import { canMark } from "./rules";
import { activePlayer, findPlayer, getDecision } from "./transitions";
import type { Color, DiceRoll, GameState, PlayerId, RowState } from "./types";

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
 * PASS plus every legal (whiteDie, color) for `rows` under `roll` and
 * `lockedColors`, deduplicated by (color, number) keeping the lowest whiteDie.
 */
export function action2OptionsFor(
  rows: Record<Color, RowState>,
  roll: DiceRoll,
  lockedColors: readonly Color[],
): Action2Option[] {
  const { white, colored } = roll;
  const out: Action2Option[] = [{ kind: "PASS" }];
  for (const color of COLORS) {
    const face = colored[color];
    if (face === undefined || lockedColors.includes(color)) continue;
    const seen = new Set<number>();
    for (const whiteDie of [0, 1] as const) {
      const number = white[whiteDie] + face;
      if (seen.has(number)) continue;
      seen.add(number);
      if (canMark(rows[color], number, lockedColors).ok) {
        out.push({ kind: "MARK", whiteDie, color, number });
      }
    }
  }
  return out;
}

/** Legal Action 2 options. Empty unless `playerId` is active in ACTION_2. */
export function legalAction2Options(state: GameState, playerId: PlayerId): Action2Option[] {
  const turn = state.turn;
  const active = activePlayer(state);
  if (state.phase !== "ACTION_2" || !turn?.roll || !active || active.id !== playerId) return [];
  return action2OptionsFor(active.sheet.rows, turn.roll, state.lockedColors);
}

/**
 * Options an early Action 2 would pass the pre-check with (spec §17 A-2): the
 * active player's sheet with their own Action 1 applied, current locks. Empty
 * unless `playerId` is active in ACTION_1, has decided Action 1 and has no
 * pending Action 2. Options may still be voided by another player's lock.
 */
export function legalEarlyAction2Options(state: GameState, playerId: PlayerId): Action2Option[] {
  const turn = state.turn;
  const active = activePlayer(state);
  if (state.phase !== "ACTION_1" || !turn?.roll || !active || active.id !== playerId) return [];
  const own = getDecision(turn, active.id);
  if (!own || turn.pendingAction2) return [];
  const whiteSum = turn.roll.white[0] + turn.roll.white[1];
  const rows = rowsAfterAction1(active.sheet.rows, own, whiteSum);
  return action2OptionsFor(rows, turn.roll, state.lockedColors);
}

export function isGameOver(state: GameState): boolean {
  return state.phase === "GAME_OVER";
}

/** Id of the active player, or null before setup completes. */
export function activePlayerId(state: GameState): PlayerId | null {
  return activePlayer(state)?.id ?? null;
}

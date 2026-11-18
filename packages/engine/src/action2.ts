/**
 * Action 2 validation shared by `submitAction2`, early Action 2 (spec §17 A-2)
 * and its re-check at Action 1 resolution. Pure: reads only its arguments.
 */
import { COLORS } from "./constants";
import { applyMark, canMark } from "./rules";
import type {
  Action1Decision,
  Action2Decision,
  Color,
  DiceRoll,
  EngineError,
  RowState,
} from "./types";

export function isColor(v: unknown): v is Color {
  return typeof v === "string" && (COLORS as readonly string[]).includes(v);
}

/**
 * Validate an untrusted Action 2 payload (spec §7.4 Pre) against `rows` (the
 * active player's sheet rows) and `lockedColors`. Returns a normalized decision
 * or the error `submitAction2` would reject with.
 */
export function checkAction2(
  rows: Record<Color, RowState>,
  lockedColors: readonly Color[],
  roll: DiceRoll | null,
  decision: unknown,
): EngineError | Action2Decision {
  if (decision === null || typeof decision !== "object") return { code: "E_INVALID_COMMAND" };
  const { kind, color, whiteDie } = decision as {
    kind?: unknown;
    color?: unknown;
    whiteDie?: unknown;
  };
  if (kind === "PASS") return { kind: "PASS" };
  if (kind !== "MARK") return { code: "E_INVALID_COMMAND" };
  if (!isColor(color)) return { code: "E_BAD_DIE" };
  const face = roll?.colored[color];
  if (lockedColors.includes(color) || face === undefined || !roll) {
    return { code: "E_DIE_NOT_IN_PLAY" };
  }
  if (whiteDie !== 0 && whiteDie !== 1) return { code: "E_BAD_DIE" };
  const check = canMark(rows[color], roll.white[whiteDie] + face, lockedColors);
  if (!check.ok) return { code: "E_ILLEGAL_MARK", reason: check.reason };
  return { kind: "MARK", color, whiteDie };
}

/**
 * `rows` with the player's own Action 1 decision applied (no lock bookkeeping).
 * Used to pre-check an early Action 2. Precondition: the Action 1 MARK was legal.
 */
export function rowsAfterAction1(
  rows: Record<Color, RowState>,
  action1: Action1Decision,
  whiteSum: number,
): Record<Color, RowState> {
  if (action1.kind !== "MARK") return rows;
  return { ...rows, [action1.color]: applyMark(rows[action1.color], whiteSum).row };
}

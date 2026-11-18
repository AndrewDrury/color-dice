import { COLORS, indexOf, LOCK_INDEX, ROW_LENGTH } from "../../src/constants";
import type {
  Color,
  GameState,
  Penalties,
  Phase,
  Player,
  RowState,
  ScoreSheet,
  TurnState,
} from "../../src/types";

/**
 * Build a row with the given numbers marked. The lock box is crossed when the
 * lock number is marked (INV-2), unless `lockCrossed` is given explicitly.
 */
export function makeRow(color: Color, numbers: number[] = [], lockCrossed?: boolean): RowState {
  const marked = new Array<boolean>(ROW_LENGTH).fill(false);
  for (const n of numbers) {
    const i = indexOf(color, n);
    if (i < 0) throw new RangeError(`bad number ${n}`);
    marked[i] = true;
  }
  return { color, marked, lockCrossed: lockCrossed ?? marked[LOCK_INDEX] === true };
}

/** Build a row with `count` crosses: the first `count` boxes from the left. */
export function makeRowWithCount(color: Color, count: number): RowState {
  const marked = new Array<boolean>(ROW_LENGTH).fill(false).map((_, i) => i < count);
  return { color, marked, lockCrossed: marked[LOCK_INDEX] === true };
}

export function makeSheet(
  marks: Partial<Record<Color, number[]>> = {},
  penalties: Penalties = 0,
): ScoreSheet {
  const rows = {} as Record<Color, RowState>;
  for (const c of COLORS) rows[c] = makeRow(c, marks[c] ?? []);
  return { rows, penalties };
}

export interface PlayerSpec {
  id: string;
  displayName?: string;
  sheet?: ScoreSheet;
}

export function makePlayers(specs: (string | PlayerSpec)[]): Player[] {
  return specs.map((s, seat) => {
    const spec = typeof s === "string" ? { id: s } : s;
    return {
      id: spec.id,
      displayName: spec.displayName ?? spec.id,
      seat,
      sheet: spec.sheet ?? makeSheet(),
    };
  });
}

export interface StateSpec {
  players?: (string | PlayerSpec)[];
  lockedColors?: Color[];
  phase?: Phase;
  turn?: Partial<TurnState> | null;
}

export function makeTurn(partial: Partial<TurnState> = {}): TurnState {
  return {
    turnNumber: 1,
    activeSeat: 0,
    roll: null,
    action1Decisions: {},
    activeMarkedThisTurn: false,
    ...partial,
    pendingAction2: partial.pendingAction2 ?? null,
  };
}

export function makeState(spec: StateSpec = {}): GameState {
  const locked = spec.lockedColors ?? [];
  return {
    players: makePlayers(spec.players ?? ["p1", "p2"]),
    lockedColors: COLORS.filter((c) => locked.includes(c)),
    phase: spec.phase ?? "AWAIT_ROLL",
    turn: spec.turn === null ? null : makeTurn(spec.turn ?? {}),
    endReason: null,
    log: [],
  };
}

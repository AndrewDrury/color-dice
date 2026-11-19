import { COLORS, MAX_PLAYERS, MIN_PLAYERS, ROW_LENGTH } from "./constants";
import { isFace } from "./dice";
import { type Draft, emit } from "./transitions";
import type {
  Color,
  DiceSource,
  EngineError,
  Face,
  GameState,
  PlayerId,
  Result,
  RowState,
} from "./types";

export interface PlayerInput {
  id: PlayerId;
  displayName: string;
}

export interface CreateGameOptions {
  dice: DiceSource;
  firstPlayer?: PlayerId;
}

/** Safety cap so a broken dice source cannot hang the roll-off (spec §17 A-1). */
export const MAX_ROLL_OFF_ROUNDS = 1_000;

const fail = (error: EngineError): Result => ({ ok: false, error });

/**
 * Ids that would collide with object internals when used as keys
 * (e.g. `__proto__`, `constructor`, `toString`, `prototype`).
 */
export function isReservedId(id: string): boolean {
  return id in Object.prototype || id === "prototype";
}

export function rollFace(dice: DiceSource): Face {
  const f: unknown = dice.rollDie();
  if (!isFace(f)) throw new RangeError(`dice source returned an invalid face: ${String(f)}`);
  return f;
}

function emptyRow(color: Color): RowState {
  return { color, marked: new Array<boolean>(ROW_LENGTH).fill(false), lockCrossed: false };
}

/** Validate the player list (spec §5.1). Returns an error or null. */
function validatePlayers(players: unknown): EngineError | null {
  if (!Array.isArray(players)) return { code: "E_INVALID_COMMAND" };
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    return { code: "E_PLAYER_COUNT" };
  }
  const seen = new Set<string>();
  for (const p of players as unknown[]) {
    if (p === null || typeof p !== "object") return { code: "E_INVALID_COMMAND" };
    const { id, displayName } = p as { id?: unknown; displayName?: unknown };
    if (typeof id !== "string" || typeof displayName !== "string") {
      return { code: "E_INVALID_COMMAND" };
    }
    if (id === "" || seen.has(id)) return { code: "E_DUPLICATE_PLAYER" };
    if (isReservedId(id)) return { code: "E_INVALID_COMMAND" };
    seen.add(id);
  }
  return null;
}

/**
 * Simultaneous roll-off (spec §17 A-1): every seat rolls one die per round, drawn
 * in seat order 0..N-1. The round with exactly one 6 decides; its seat starts.
 * Returns every round rolled; the last one holds the unique 6.
 */
export function rollOff(dice: DiceSource, seats: number): Face[][] {
  const rounds: Face[][] = [];
  for (;;) {
    if (rounds.length >= MAX_ROLL_OFF_ROUNDS) throw new Error("roll-off did not produce a winner");
    const round = Array.from({ length: seats }, () => rollFace(dice));
    rounds.push(round);
    if (round.filter((f) => f === 6).length === 1) return rounds;
  }
}

/** Create a game (spec §5): seats in input order, first player configured or rolled off. */
export function createGame(players: readonly PlayerInput[], options: CreateGameOptions): Result {
  const invalid = validatePlayers(players);
  if (invalid) return fail(invalid);
  const input = players.map((p) => ({ id: p.id, displayName: p.displayName }));
  if (options.firstPlayer !== undefined && !input.some((p) => p.id === options.firstPlayer)) {
    return fail({ code: "E_UNKNOWN_PLAYER" });
  }

  const state: GameState = {
    players: input.map((p, seat) => {
      const rows = {} as Record<Color, RowState>;
      for (const c of COLORS) rows[c] = emptyRow(c);
      return { id: p.id, displayName: p.displayName, seat, sheet: { rows, penalties: 0 } };
    }),
    lockedColors: [],
    phase: "SETUP",
    turn: null,
    endReason: null,
    log: [],
  };
  const d: Draft = { state, events: [] };
  emit(d, {
    type: "GAME_CREATED",
    players: state.players.map((p) => ({ id: p.id, displayName: p.displayName, seat: p.seat })),
  });

  let activeSeat: number;
  if (options.firstPlayer !== undefined) {
    activeSeat = input.findIndex((p) => p.id === options.firstPlayer);
    emit(d, { type: "FIRST_PLAYER_CHOSEN", seat: activeSeat, method: "CONFIGURED", rounds: [] });
  } else {
    const rounds = rollOff(options.dice, input.length);
    activeSeat = (rounds[rounds.length - 1] as Face[]).indexOf(6);
    emit(d, { type: "FIRST_PLAYER_CHOSEN", seat: activeSeat, method: "ROLL_OFF", rounds });
  }

  state.phase = "AWAIT_ROLL";
  state.turn = {
    turnNumber: 1,
    activeSeat,
    roll: null,
    action1Decisions: {},
    pendingAction2: null,
    activeMarkedThisTurn: false,
    appliedMarks: [],
  };
  return { ok: true, state, events: d.events };
}

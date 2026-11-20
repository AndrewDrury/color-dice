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
  RolledFace,
  RowState,
} from "./types";

export interface PlayerInput {
  id: PlayerId;
  displayName: string;
}

export interface CreateGameOptions {
  dice: DiceSource;
  firstPlayer?: PlayerId;
  /**
   * Opening roll-off already played by the players (T-NEW-2, A-2): see `isValidRollOff`.
   * Wins over `firstPlayer`/`dice`.
   */
  rollOffRounds?: readonly (readonly RolledFace[])[];
}

/** Seats that rolled the highest face of a round (0 = did not roll). */
export function rollOffLeaders(round: readonly number[]): number[] {
  const max = Math.max(...round);
  return round.flatMap((f, seat) => (f === max ? [seat] : []));
}

/**
 * True when `rounds` is a finished roll-off for `seats` players (spec §17 A-2).
 * `rounds[r][seat]` is the face that seat rolled, or 0 when it was out of round r.
 * Round 0 has every seat rolling; later rounds only the previous round's tied leaders;
 * every round but the last ends in a tie for the highest face, the last in a unique one.
 */
export function isValidRollOff(rounds: readonly (readonly unknown[])[], seats: number): boolean {
  if (rounds.length === 0 || rounds.length > MAX_ROLL_OFF_ROUNDS) return false;
  let eligible = Array.from({ length: seats }, (_, i) => i);
  return rounds.every((r, i) => {
    if (r.length !== seats) return false;
    const rolling = new Set(eligible);
    if (!r.every((f, seat) => (rolling.has(seat) ? isFace(f) : f === 0))) return false;
    eligible = rollOffLeaders(r as number[]);
    return i === rounds.length - 1 ? eligible.length === 1 : eligible.length > 1;
  });
}

/** Safety cap so a broken dice source cannot hang the roll-off (spec §17 A-2). */
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
 * Simultaneous roll-off (spec §17 A-2): every eligible seat rolls one die per round, drawn
 * in ascending seat order. The unique highest face wins; a tie for highest sends only the
 * tied seats into the next round. Returns every round rolled (0 = seat out of that round).
 */
export function rollOff(dice: DiceSource, seats: number): RolledFace[][] {
  const rounds: RolledFace[][] = [];
  let eligible = Array.from({ length: seats }, (_, i) => i);
  for (;;) {
    if (rounds.length >= MAX_ROLL_OFF_ROUNDS) throw new Error("roll-off did not produce a winner");
    const round: RolledFace[] = new Array<RolledFace>(seats).fill(0);
    for (const seat of eligible) round[seat] = rollFace(dice);
    rounds.push(round);
    eligible = rollOffLeaders(round);
    if (eligible.length === 1) return rounds;
  }
}

/** Create a game (spec §5): seats in input order, first player configured or rolled off. */
export function createGame(players: readonly PlayerInput[], options: CreateGameOptions): Result {
  const invalid = validatePlayers(players);
  if (invalid) return fail(invalid);
  const input = players.map((p) => ({ id: p.id, displayName: p.displayName }));
  if (options.rollOffRounds && !isValidRollOff(options.rollOffRounds, input.length)) {
    return fail({ code: "E_INVALID_COMMAND" });
  }
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
  if (options.rollOffRounds) {
    const rounds = options.rollOffRounds.map((r) => [...r]);
    activeSeat = rollOffLeaders(rounds[rounds.length - 1] as RolledFace[])[0] as number;
    emit(d, { type: "FIRST_PLAYER_CHOSEN", seat: activeSeat, method: "ROLL_OFF", rounds });
  } else if (options.firstPlayer !== undefined) {
    activeSeat = input.findIndex((p) => p.id === options.firstPlayer);
    emit(d, { type: "FIRST_PLAYER_CHOSEN", seat: activeSeat, method: "CONFIGURED", rounds: [] });
  } else {
    const rounds = rollOff(options.dice, input.length);
    activeSeat = rollOffLeaders(rounds[rounds.length - 1] as RolledFace[])[0] as number;
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

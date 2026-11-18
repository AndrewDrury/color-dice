/**
 * Per-player projection of the engine state (C7 `game` + `you`, spec §7.2 I-3).
 *
 * Every field is copied explicitly from an allow-list; engine objects are never
 * spread, so new internal fields can never leak. Other seats' Action 1
 * decisions are never read from `turn.action1Decisions`; they only become
 * visible through the `ACTION1_REVEALED` event once everyone has submitted.
 */
import { COLORS } from "./constants";
import { legalAction1Options, legalAction2Options } from "./queries";
import { scoreSheet, winners } from "./scoring";
import { getDecision } from "./transitions";
import type {
  Action1Decision,
  Color,
  EndReason,
  Face,
  GameEvent,
  GameState,
  Phase,
  Player,
  PlayerId,
} from "./types";

/** Number of most recent log events included in a view (C7). */
export const VIEW_EVENT_COUNT = 30;

export interface EngineViewRow {
  marked: boolean[];
  lockCrossed: boolean;
}

export interface EngineViewPlayer {
  seat: number;
  sheet: { rows: Record<Color, EngineViewRow>; penalties: number };
  score: { rows: Record<Color, number>; penalties: number; total: number };
  /** Boolean only, never the choice. */
  action1Submitted: boolean;
}

export interface EngineViewGame {
  phase: Phase;
  turn: { number: number; activeSeat: number } | null;
  roll: {
    white: [Face, Face];
    colored: Partial<Record<Color, Face>>;
    whiteSum: number;
  } | null;
  lockedColors: Color[];
  players: EngineViewPlayer[];
  events: GameEvent[];
  endReason: EndReason | null;
  winners: PlayerId[] | null;
}

export type EngineLegalAction2 =
  | { kind: "PASS" }
  | { kind: "MARK"; whiteDie: 0 | 1; color: Color; number: number };

export interface EngineViewYou {
  seat: number;
  /** Your own pending decision (ACTION_1 only); never another seat's. */
  action1Decision: Action1Decision | null;
  legalAction1: Action1Decision[];
  legalAction2: EngineLegalAction2[];
  canRoll: boolean;
}

export interface EngineView {
  game: EngineViewGame;
  you: EngineViewYou;
}

function copyDecision(d: Action1Decision): Action1Decision {
  return d.kind === "PASS" ? { kind: "PASS" } : { kind: "MARK", color: d.color };
}

function copyColored(c: Partial<Record<Color, Face>>): Partial<Record<Color, Face>> {
  const out: Partial<Record<Color, Face>> = {};
  for (const color of COLORS) {
    const face = c[color];
    if (face !== undefined) out[color] = face;
  }
  return out;
}

function copyEndReason(r: EndReason): EndReason {
  return r.kind === "PENALTIES"
    ? { kind: "PENALTIES", playerIds: [...r.playerIds] }
    : { kind: "TWO_ROWS_LOCKED", lockedColors: [...r.lockedColors] };
}

/** Explicit field-by-field copy of a log event (allow-list per type). */
export function copyEvent(e: GameEvent): GameEvent {
  switch (e.type) {
    case "GAME_CREATED":
      return {
        type: e.type,
        players: e.players.map((p) => ({ id: p.id, displayName: p.displayName, seat: p.seat })),
      };
    case "FIRST_PLAYER_CHOSEN":
      return {
        type: e.type,
        seat: e.seat,
        method: e.method,
        rolls: e.rolls.map((r) => ({ seat: r.seat, face: r.face })),
      };
    case "TURN_STARTED":
      return { type: e.type, turnNumber: e.turnNumber, activeSeat: e.activeSeat };
    case "DICE_ROLLED":
      return {
        type: e.type,
        white: [e.white[0], e.white[1]],
        colored: copyColored(e.colored),
        whiteSum: e.whiteSum,
      };
    case "ACTION1_SUBMITTED":
      return { type: e.type, playerId: e.playerId };
    case "ACTION1_REVEALED":
      return {
        type: e.type,
        decisions: e.decisions.map((d) => ({
          playerId: d.playerId,
          decision: copyDecision(d.decision),
        })),
      };
    case "MARKED": {
      const out: GameEvent = {
        type: e.type,
        playerId: e.playerId,
        action: e.action,
        color: e.color,
        number: e.number,
        index: e.index,
        lockedNow: e.lockedNow,
      };
      if (e.whiteDie !== undefined) out.whiteDie = e.whiteDie;
      return out;
    }
    case "ROW_LOCKED":
      return { type: e.type, color: e.color, lockedBy: [...e.lockedBy], action: e.action };
    case "DIE_REMOVED":
      return { type: e.type, color: e.color };
    case "ACTION2_PASSED":
      return { type: e.type, playerId: e.playerId };
    case "PENALTY":
      return { type: e.type, playerId: e.playerId, total: e.total };
    case "GAME_ENDED":
      return {
        type: e.type,
        reason: copyEndReason(e.reason),
        scores: e.scores.map((s) => ({ playerId: s.playerId, total: s.total })),
        winners: [...e.winners],
      };
  }
}

function viewPlayer(state: GameState, p: Player): EngineViewPlayer {
  const rows = {} as Record<Color, EngineViewRow>;
  for (const color of COLORS) {
    const row = p.sheet.rows[color];
    rows[color] = { marked: [...row.marked], lockCrossed: row.lockCrossed };
  }
  const s = scoreSheet(p.sheet);
  const scoreRows = {} as Record<Color, number>;
  for (const color of COLORS) scoreRows[color] = s.rows[color];
  const turn = state.turn;
  const submitted = state.phase === "ACTION_1" && turn !== null && !!getDecision(turn, p.id);
  return {
    seat: p.seat,
    sheet: { rows, penalties: p.sheet.penalties },
    score: { rows: scoreRows, penalties: s.penalties, total: s.total },
    action1Submitted: submitted,
  };
}

/**
 * What seat `seatIndex` may see. Throws RangeError for an unknown seat.
 * Players are looked up by their `seat` field, not by id.
 */
export function viewFor(state: GameState, seatIndex: number): EngineView {
  const me = state.players.find((p) => p.seat === seatIndex);
  if (!me) throw new RangeError(`unknown seat: ${seatIndex}`);
  const turn = state.turn;
  const roll = turn?.roll ?? null;
  const over = state.phase === "GAME_OVER";
  const isActive = turn !== null && turn.activeSeat === me.seat;

  const game: EngineViewGame = {
    phase: state.phase,
    turn: turn ? { number: turn.turnNumber, activeSeat: turn.activeSeat } : null,
    roll: roll
      ? {
          white: [roll.white[0], roll.white[1]],
          colored: copyColored(roll.colored),
          whiteSum: roll.white[0] + roll.white[1],
        }
      : null,
    lockedColors: [...state.lockedColors],
    players: [...state.players].sort((a, b) => a.seat - b.seat).map((p) => viewPlayer(state, p)),
    events: state.log.slice(-VIEW_EVENT_COUNT).map(copyEvent),
    endReason: over && state.endReason ? copyEndReason(state.endReason) : null,
    winners: over ? winners(state) : null,
  };

  // Only ever read the viewer's own entry from the hidden decisions.
  const own = state.phase === "ACTION_1" && turn ? getDecision(turn, me.id) : undefined;

  const you: EngineViewYou = {
    seat: me.seat,
    action1Decision: own ? copyDecision(own) : null,
    // legalAction1Options is already empty unless ACTION_1 and undecided.
    legalAction1: legalAction1Options(state, me.id).map((o) =>
      o.kind === "PASS" ? { kind: "PASS" } : { kind: "MARK", color: o.color },
    ),
    legalAction2: legalAction2Options(state, me.id).map((o) =>
      o.kind === "PASS"
        ? { kind: "PASS" }
        : { kind: "MARK", whiteDie: o.whiteDie, color: o.color, number: o.number },
    ),
    canRoll: state.phase === "AWAIT_ROLL" && isActive,
  };

  return { game, you };
}

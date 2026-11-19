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
  Action2Decision,
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
  /** `null` for other seats until GAME_OVER (hidden information, J1). */
  sheet: { rows: Record<Color, EngineViewRow>; penalties: number } | null;
  /** `rows` is `null` for other seats until GAME_OVER; penalties and total stay public. */
  score: { rows: Record<Color, number> | null; penalties: number; total: number };
  /** Boolean only, never the choice. */
  action1Submitted: boolean;
  /**
   * Boolean only: this seat has an Action 1 decision for the current turn (ACTION_1 and
   * ACTION_2). While the turn is ongoing it can still be taken back via UNDO.
   */
  decided: boolean;
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
  /** Your own early Action 2 (active player, ACTION_1 only, spec §17 A-2); never another seat's. */
  pendingAction2: Action2Decision | null;
  legalAction1: Action1Decision[];
  legalAction2: EngineLegalAction2[];
  canRoll: boolean;
  canUndo: boolean;
}

export interface EngineView {
  game: EngineViewGame;
  you: EngineViewYou;
}

function copyDecision(d: Action1Decision): Action1Decision {
  return d.kind === "PASS" ? { kind: "PASS" } : { kind: "MARK", color: d.color };
}

function copyAction2(d: Action2Decision): Action2Decision {
  return d.kind === "PASS"
    ? { kind: "PASS" }
    : { kind: "MARK", whiteDie: d.whiteDie, color: d.color };
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
        rounds: e.rounds.map((round) => [...round]),
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
    case "ACTION2_VOIDED":
      return { type: e.type, playerId: e.playerId, reason: e.reason };
    case "PENALTY":
      return { type: e.type, playerId: e.playerId, total: e.total };
    case "UNDO": {
      const out: GameEvent = { type: e.type, playerId: e.playerId, kind: e.kind };
      if (e.color !== undefined) out.color = e.color;
      if (e.index !== undefined) out.index = e.index;
      return out;
    }
    case "GAME_ENDED":
      return {
        type: e.type,
        reason: copyEndReason(e.reason),
        scores: e.scores.map((s) => ({ playerId: s.playerId, total: s.total })),
        winners: [...e.winners],
      };
  }
}

function viewPlayer(state: GameState, p: Player, reveal: boolean): EngineViewPlayer {
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
    sheet: reveal ? { rows, penalties: p.sheet.penalties } : null,
    score: { rows: reveal ? scoreRows : null, penalties: s.penalties, total: s.total },
    action1Submitted: submitted,
    decided:
      (state.phase === "ACTION_1" || state.phase === "ACTION_2") &&
      turn !== null &&
      !!getDecision(turn, p.id),
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
    players: [...state.players]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => viewPlayer(state, p, over || p.seat === me.seat)),
    events: state.log.slice(-VIEW_EVENT_COUNT).map(copyEvent),
    endReason: over && state.endReason ? copyEndReason(state.endReason) : null,
    winners: over ? winners(state) : null,
  };

  // Only ever read the viewer's own entry from the hidden decisions.
  const own = state.phase === "ACTION_1" && turn ? getDecision(turn, me.id) : undefined;
  // The early Action 2 belongs to the active player alone.
  const pending =
    state.phase === "ACTION_1" && isActive && turn ? (turn.pendingAction2 ?? null) : null;
  const canUndo =
    state.phase === "ACTION_1" && turn
      ? Object.hasOwn(turn.action1Decisions, me.id) || (isActive && turn.pendingAction2 !== null)
      : state.phase === "ACTION_2" && turn
        ? isActive && turn.appliedMarks.some((mark) => mark.playerId === me.id)
        : false;

  const you: EngineViewYou = {
    seat: me.seat,
    action1Decision: own ? copyDecision(own) : null,
    pendingAction2: pending ? copyAction2(pending) : null,
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
    canUndo,
  };

  return { game, you };
}

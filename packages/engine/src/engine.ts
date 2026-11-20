/**
 * Public command functions (spec §7, §16). Each one deep-copies its input and
 * never mutates it; a rejected command returns an error and no state.
 */
import { checkAction2, isColor, rowsAfterAction1 } from "./action2";
import { COLORS } from "./constants";
import { canMark } from "./rules";
import { rollFace } from "./setup";
import {
  applyAction2,
  type Draft,
  emit,
  findPlayer,
  finishAction2,
  getDecision,
  resolveAction1,
  setDecision,
} from "./transitions";
import type {
  Action1Decision,
  Action2Decision,
  Color,
  Command,
  DiceSource,
  EngineError,
  GameState,
  Phase,
  Player,
  PlayerId,
  Result,
  TurnState,
} from "./types";

export {
  type CreateGameOptions,
  createGame,
  isValidRollOff,
  MAX_ROLL_OFF_ROUNDS,
  type PlayerInput,
  rollFace,
  rollOffLeaders,
} from "./setup";

const fail = (error: EngineError): Result => ({ ok: false, error });

/** Common preconditions: game not over, right phase, known player. */
function precheck(
  state: GameState,
  phase: Phase,
  playerId: unknown,
): EngineError | { player: Player; turn: TurnState } {
  if (state.phase === "GAME_OVER") return { code: "E_GAME_OVER" };
  if (state.phase !== phase || !state.turn) return { code: "E_WRONG_PHASE" };
  const player = findPlayer(state, playerId);
  if (!player) return { code: "E_UNKNOWN_PLAYER" };
  return { player, turn: state.turn };
}

function draft(state: GameState): Draft {
  return { state: structuredClone(state), events: [] };
}

const done = (d: Draft): Result => ({ ok: true, state: d.state, events: d.events });

/** Roll the dice for the active player (spec §7.1). */
export function roll(state: GameState, actorId: PlayerId, dice: DiceSource): Result {
  const pre = precheck(state, "AWAIT_ROLL", actorId);
  if ("code" in pre) return fail(pre);
  if (pre.player.seat !== pre.turn.activeSeat) return fail({ code: "E_NOT_ACTIVE_PLAYER" });

  const d = draft(state);
  const s = d.state;
  const turn = s.turn as TurnState;
  const white: [ReturnType<typeof rollFace>, ReturnType<typeof rollFace>] = [
    rollFace(dice),
    rollFace(dice),
  ];
  const colored: Partial<Record<Color, ReturnType<typeof rollFace>>> = {};
  for (const c of COLORS) if (!s.lockedColors.includes(c)) colored[c] = rollFace(dice);
  turn.roll = { white, colored };
  turn.action1Decisions = {};
  turn.pendingAction2 = null;
  turn.activeMarkedThisTurn = false;
  turn.appliedMarks = [];
  s.phase = "ACTION_1";
  emit(d, {
    type: "DICE_ROLLED",
    white: [...white],
    colored: { ...colored },
    whiteSum: white[0] + white[1],
  });
  return done(d);
}

/** Normalize an untrusted Action 1 payload, or null if malformed. */
function parseAction1(decision: unknown): Action1Decision | null {
  if (decision === null || typeof decision !== "object") return null;
  const { kind, color } = decision as { kind?: unknown; color?: unknown };
  if (kind === "PASS") return { kind: "PASS" };
  if (kind === "MARK" && isColor(color)) return { kind: "MARK", color };
  return null;
}

/** Action 1 preconditions (spec §7.2 Pre). */
function checkAction1(
  state: GameState,
  playerId: PlayerId,
  decision: unknown,
): EngineError | { player: Player; turn: TurnState; dec: Action1Decision } {
  const pre = precheck(state, "ACTION_1", playerId);
  if ("code" in pre) return pre;
  const { player, turn } = pre;
  if (getDecision(turn, player.id)) return { code: "E_ALREADY_DECIDED" };
  const dec = parseAction1(decision);
  if (!dec) return { code: "E_INVALID_COMMAND" };
  const r = turn.roll;
  if (!r) return { code: "E_WRONG_PHASE" };
  if (dec.kind === "MARK") {
    const check = canMark(
      player.sheet.rows[dec.color],
      r.white[0] + r.white[1],
      state.lockedColors,
    );
    if (!check.ok) return { code: "E_ILLEGAL_MARK", reason: check.reason };
  }
  return { player, turn, dec };
}

/** Record a validated Action 1 (and optional early Action 2); resolve when all decided. */
function commitAction1(
  state: GameState,
  player: Player,
  dec: Action1Decision,
  pending: Action2Decision | null,
): Result {
  const d = draft(state);
  const t = d.state.turn as TurnState;
  setDecision(t, player.id, dec);
  if (pending) t.pendingAction2 = pending;
  emit(d, { type: "ACTION1_SUBMITTED", playerId: player.id });
  const decided = d.state.players.filter((p) => getDecision(t, p.id)).length;
  if (decided === d.state.players.length) resolveAction1(d);
  return done(d);
}

/** Submit one player's hidden Action 1 decision (spec §7.2). */
export function submitAction1(
  state: GameState,
  playerId: PlayerId,
  decision: Action1Decision,
): Result {
  const c = checkAction1(state, playerId, decision);
  if ("code" in c) return fail(c);
  return commitAction1(state, c.player, c.dec, null);
}

/**
 * The active player's Action 1 and early Action 2 in one atomic command
 * (spec §17 A-2, "both in one confirm"). Same checks as `submitAction1` followed
 * by an early `submitAction2`; if either is rejected nothing changes.
 */
export function submitTurn(
  state: GameState,
  playerId: PlayerId,
  action1: Action1Decision,
  action2: Action2Decision,
): Result {
  const c = checkAction1(state, playerId, action1);
  if ("code" in c) return fail(c);
  const { player, turn, dec } = c;
  if (player.seat !== turn.activeSeat) return fail({ code: "E_NOT_ACTIVE_PLAYER" });
  const roll = turn.roll as NonNullable<TurnState["roll"]>;
  const rows = rowsAfterAction1(player.sheet.rows, dec, roll.white[0] + roll.white[1]);
  const dec2 = checkAction2(rows, state.lockedColors, roll, action2);
  if ("code" in dec2) return fail(dec2);
  return commitAction1(state, player, dec, dec2);
}

/**
 * The active player's white + colored decision (spec §7.4). In ACTION_1 this is
 * an early Action 2 (spec §17 A-2): allowed once the active player has made their
 * own Action 1 decision; stored hidden and applied when Action 1 resolves.
 */
export function submitAction2(
  state: GameState,
  playerId: PlayerId,
  decision: Action2Decision,
): Result {
  if (state.phase === "ACTION_1") return submitEarlyAction2(state, playerId, decision);
  const pre = precheck(state, "ACTION_2", playerId);
  if ("code" in pre) return fail(pre);
  const { player, turn } = pre;
  if (player.seat !== turn.activeSeat) return fail({ code: "E_NOT_ACTIVE_PLAYER" });
  const dec = checkAction2(player.sheet.rows, state.lockedColors, turn.roll, decision);
  if ("code" in dec) return fail(dec);

  const d = draft(state);
  applyAction2(d, dec);
  finishAction2(d);
  return done(d);
}

/** Undo the player's most recent reversible effect from the current turn only. */
export function undo(state: GameState, playerId: PlayerId): Result {
  if (state.phase === "GAME_OVER") return fail({ code: "E_GAME_OVER" });
  const player = findPlayer(state, playerId);
  if (!player) return fail({ code: "E_UNKNOWN_PLAYER" });
  const turn = state.turn;
  if (!turn) return fail({ code: "E_WRONG_PHASE" });

  const d = draft(state);
  const t = d.state.turn as TurnState;

  if (d.state.phase === "ACTION_1") {
    if (player.seat === turn.activeSeat && t.pendingAction2) {
      t.pendingAction2 = null;
      emit(d, { type: "UNDO", playerId, kind: "ACTION2" });
      return done(d);
    }
    if (Object.hasOwn(t.action1Decisions, playerId)) {
      delete t.action1Decisions[playerId];
      emit(d, { type: "UNDO", playerId, kind: "ACTION1" });
      return done(d);
    }
    return fail({ code: "E_NOTHING_TO_UNDO" });
  }

  if (d.state.phase === "ACTION_2") {
    // Action 1 is revealed and never reopened. Only the active player may take back
    // their own applied mark(s), one at a time, until the turn ends.
    if (player.seat !== turn.activeSeat) return fail({ code: "E_NOTHING_TO_UNDO" });
    let i = t.appliedMarks.length - 1;
    while (i >= 0 && t.appliedMarks[i]!.playerId !== playerId) i--;
    if (i < 0) return fail({ code: "E_NOTHING_TO_UNDO" });
    const mark = t.appliedMarks[i]!;
    t.appliedMarks.splice(i, 1);
    const row = d.state.players.find((p) => p.id === playerId)?.sheet.rows[mark.color];
    if (row) {
      row.marked[mark.index] = false;
      if (mark.index === 10) row.lockCrossed = false;
    }
    d.state.lockedColors = d.state.lockedColors.filter((color) =>
      d.state.players.some((p) => p.sheet.rows[color].lockCrossed),
    );
    t.activeMarkedThisTurn = t.appliedMarks.some((m) => m.playerId === playerId);
    emit(d, {
      type: "UNDO",
      playerId,
      kind: "MARK",
      color: mark.color,
      index: mark.index,
    });
    return done(d);
  }

  return fail({ code: "E_WRONG_PHASE" });
}

/** Early Action 2 during ACTION_1 (spec §17 A-2). */
function submitEarlyAction2(state: GameState, playerId: PlayerId, decision: unknown): Result {
  const pre = precheck(state, "ACTION_1", playerId);
  if ("code" in pre) return fail(pre);
  const { player, turn } = pre;
  if (player.seat !== turn.activeSeat) return fail({ code: "E_NOT_ACTIVE_PLAYER" });
  const own = getDecision(turn, player.id);
  // Before the player's own Action 1 decision it is not yet their Action 2 window.
  if (!own || !turn.roll) return fail({ code: "E_WRONG_PHASE" });
  if (turn.pendingAction2) return fail({ code: "E_ALREADY_DECIDED" });
  const whiteSum = turn.roll.white[0] + turn.roll.white[1];
  const rows = rowsAfterAction1(player.sheet.rows, own, whiteSum);
  const dec = checkAction2(rows, state.lockedColors, turn.roll, decision);
  if ("code" in dec) return fail(dec);

  const d = draft(state);
  // No event: the commit itself stays hidden from other players.
  (d.state.turn as TurnState).pendingAction2 = dec;
  return done(d);
}

/** Single entry point for hosts: route a command to its transition. */
export function dispatch(state: GameState, cmd: Command, dice: DiceSource): Result {
  if (cmd === null || typeof cmd !== "object") return fail({ code: "E_INVALID_COMMAND" });
  switch (cmd.type) {
    case "ROLL":
      return roll(state, cmd.playerId, dice);
    case "ACTION1":
      return submitAction1(state, cmd.playerId, cmd.decision);
    case "ACTION2":
      return submitAction2(state, cmd.playerId, cmd.decision);
    case "TURN":
      return submitTurn(state, cmd.playerId, cmd.action1, cmd.action2);
    case "UNDO":
      return undo(state, cmd.playerId);
    default:
      if (state.phase === "GAME_OVER") return fail({ code: "E_GAME_OVER" });
      return fail({ code: "E_INVALID_COMMAND" });
  }
}

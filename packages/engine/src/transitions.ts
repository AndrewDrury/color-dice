/**
 * Internal transitions (spec §7.3, §7.5, §7.6, §9). These mutate a draft state
 * that the public command functions have already deep-copied.
 */
import { checkAction2 } from "./action2";
import { COLORS, indexOf, LOCKS_TO_END, PENALTY_BOXES } from "./constants";
import { applyMark } from "./rules";
import { scoreSheet, winners } from "./scoring";
import type {
  Action1Decision,
  Action2Decision,
  Color,
  EndReason,
  GameEvent,
  GameState,
  Penalties,
  Player,
  PlayerId,
  TurnState,
} from "./types";

/** A draft being transformed, plus the events produced so far. */
export interface Draft {
  state: GameState;
  events: GameEvent[];
}

export function emit(d: Draft, event: GameEvent): void {
  d.events.push(event);
  d.state.log.push(event);
}

export function findPlayer(state: GameState, id: unknown): Player | undefined {
  return typeof id === "string" ? state.players.find((p) => p.id === id) : undefined;
}

export function activePlayer(state: GameState): Player | undefined {
  const turn = state.turn;
  return turn ? state.players.find((p) => p.seat === turn.activeSeat) : undefined;
}

/** Own-property lookup, safe against prototype keys. */
export function getDecision(turn: TurnState, id: PlayerId): Action1Decision | undefined {
  return Object.hasOwn(turn.action1Decisions, id) ? turn.action1Decisions[id] : undefined;
}

/** Own-property write that never touches a prototype setter. */
export function setDecision(turn: TurnState, id: PlayerId, decision: Action1Decision): void {
  Object.defineProperty(turn.action1Decisions, id, {
    value: decision,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** Add `color` to `lockedColors`, keeping canonical order and no duplicates. */
export function addLock(state: GameState, color: Color): void {
  if (state.lockedColors.includes(color)) return;
  state.lockedColors = COLORS.filter((c) => c === color || state.lockedColors.includes(c));
}

export function endGame(d: Draft, reason: EndReason): void {
  const s = d.state;
  s.phase = "GAME_OVER";
  s.endReason = reason;
  emit(d, {
    type: "GAME_ENDED",
    reason,
    scores: s.players.map((p) => ({ playerId: p.id, total: scoreSheet(p.sheet).total })),
    winners: winners(s),
  });
}

function endIfTwoLocks(d: Draft): boolean {
  if (d.state.lockedColors.length < LOCKS_TO_END) return false;
  endGame(d, { kind: "TWO_ROWS_LOCKED", lockedColors: d.state.lockedColors.slice() });
  return true;
}

/** Reveal and apply every Action 1 decision at once (spec §7.3). */
export function resolveAction1(d: Draft): void {
  const s = d.state;
  const turn = s.turn as TurnState;
  const roll = turn.roll;
  if (!roll) throw new Error("resolveAction1 without a roll");
  const whiteSum = roll.white[0] + roll.white[1];
  const decisions = s.players.map((p) => ({
    playerId: p.id,
    decision: getDecision(turn, p.id) ?? { kind: "PASS" as const },
  }));
  emit(d, { type: "ACTION1_REVEALED", decisions });

  const lockers = new Map<Color, PlayerId[]>();
  for (const p of s.players) {
    const dec = getDecision(turn, p.id);
    if (dec?.kind !== "MARK") continue;
    const { row, lockedNow } = applyMark(p.sheet.rows[dec.color], whiteSum);
    p.sheet.rows[dec.color] = row;
    turn.appliedMarks.push({
      playerId: p.id,
      action: 1,
      color: dec.color,
      index: indexOf(dec.color, whiteSum),
    });
    if (p.seat === turn.activeSeat) turn.activeMarkedThisTurn = true;
    emit(d, {
      type: "MARKED",
      playerId: p.id,
      action: 1,
      color: dec.color,
      number: whiteSum,
      index: indexOf(dec.color, whiteSum),
      lockedNow,
    });
    if (lockedNow) lockers.set(dec.color, [...(lockers.get(dec.color) ?? []), p.id]);
  }
  for (const c of COLORS) {
    const by = lockers.get(c);
    if (!by) continue;
    addLock(s, c);
    emit(d, { type: "ROW_LOCKED", color: c, lockedBy: by, action: 1 });
    emit(d, { type: "DIE_REMOVED", color: c });
  }
  // A game-ending lock drops any early Action 2 (spec §17 A-2, I-6).
  const pending = turn.pendingAction2;
  turn.pendingAction2 = null;
  if (endIfTwoLocks(d)) return;
  s.phase = "ACTION_2";
  if (!pending) return;
  const active = activePlayer(s) as Player;
  const recheck = checkAction2(active.sheet.rows, s.lockedColors, roll, pending);
  if ("code" in recheck) {
    // Another player's Action 1 lock removed the die: void it, choose again in ACTION_2.
    const reason =
      recheck.code === "E_ILLEGAL_MARK" && recheck.reason ? recheck.reason : "ROW_LOCKED";
    emit(d, { type: "ACTION2_VOIDED", playerId: active.id, reason });
    return;
  }
  applyAction2(d, recheck);
  finishAction2(d);
}

/** Apply a validated Action 2 decision for the active player (spec §7.4 Effect). */
export function applyAction2(d: Draft, dec: Action2Decision): void {
  const s = d.state;
  const t = s.turn as TurnState;
  const active = activePlayer(s) as Player;
  if (dec.kind === "PASS") {
    emit(d, { type: "ACTION2_PASSED", playerId: active.id });
    return;
  }
  const r = t.roll as NonNullable<TurnState["roll"]>;
  const n = r.white[dec.whiteDie] + (r.colored[dec.color] as number);
  const { row, lockedNow } = applyMark(active.sheet.rows[dec.color], n);
  active.sheet.rows[dec.color] = row;
  t.activeMarkedThisTurn = true;
  t.appliedMarks.push({
    playerId: active.id,
    action: 2,
    color: dec.color,
    index: indexOf(dec.color, n),
  });
  emit(d, {
    type: "MARKED",
    playerId: active.id,
    action: 2,
    color: dec.color,
    number: n,
    index: indexOf(dec.color, n),
    whiteDie: dec.whiteDie,
    lockedNow,
  });
  if (lockedNow) {
    addLock(s, dec.color);
    emit(d, { type: "ROW_LOCKED", color: dec.color, lockedBy: [active.id], action: 2 });
    emit(d, { type: "DIE_REMOVED", color: dec.color });
  }
}

/** After Action 2: lock end check, then penalty, then next turn (spec §7.4 post, §7.5). */
export function finishAction2(d: Draft): void {
  if (endIfTwoLocks(d)) return;
  penaltyCheck(d);
}

function penaltyCheck(d: Draft): void {
  const s = d.state;
  const turn = s.turn as TurnState;
  if (!turn.activeMarkedThisTurn) {
    const active = activePlayer(s) as Player;
    active.sheet.penalties = (active.sheet.penalties + 1) as Penalties;
    emit(d, { type: "PENALTY", playerId: active.id, total: active.sheet.penalties });
    if (active.sheet.penalties >= PENALTY_BOXES) {
      endGame(d, { kind: "PENALTIES", playerIds: [active.id] });
      return;
    }
  }
  advanceTurn(d);
}

function advanceTurn(d: Draft): void {
  const s = d.state;
  const prev = s.turn as TurnState;
  s.turn = {
    turnNumber: prev.turnNumber + 1,
    activeSeat: (prev.activeSeat + 1) % s.players.length,
    roll: null,
    action1Decisions: {},
    pendingAction2: null,
    activeMarkedThisTurn: false,
    appliedMarks: [],
  };
  s.phase = "AWAIT_ROLL";
  emit(d, { type: "TURN_STARTED", turnNumber: s.turn.turnNumber, activeSeat: s.turn.activeSeat });
}

import { expect } from "vitest";
import { ScriptedDice } from "../../src/dice";
import { createGame, roll, submitAction1, submitAction2 } from "../../src/engine";
import type {
  Action1Decision,
  Action2Decision,
  Color,
  ErrorCode,
  GameEvent,
  GameState,
  IllegalReason,
  Result,
} from "../../src/index";
import { toJSON } from "../../src/serialize";

export const PASS = { kind: "PASS" } as const;
export const mark1 = (color: Color): Action1Decision => ({ kind: "MARK", color });
export const mark2 = (whiteDie: 0 | 1, color: Color): Action2Decision => ({
  kind: "MARK",
  whiteDie,
  color,
});

/** Unwrap an ok result, failing the test otherwise. */
export function ok(r: Result): { state: GameState; events: GameEvent[] } {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r;
}

/** Assert `run` is rejected with `code` (and `reason`) and the input state is untouched. */
export function expectRejected(
  state: GameState,
  run: (s: GameState) => Result,
  code: ErrorCode,
  reason?: IllegalReason,
): void {
  const before = toJSON(state);
  const r = run(state);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error.code).toBe(code);
    if (reason) expect(r.error.reason).toBe(reason);
  }
  expect(toJSON(state)).toBe(before);
}

/** New game with seat 0 configured as first player. */
export function newGame(ids: string[] = ["p1", "p2"], firstPlayer = ids[0]): GameState {
  const players = ids.map((id) => ({ id, displayName: id }));
  return ok(createGame(players, { dice: new ScriptedDice([]), firstPlayer })).state;
}

export const types = (events: GameEvent[]) => events.map((e) => e.type);

/** Roll with exactly the given faces (white1, white2, then colors in play). */
export function rollWith(state: GameState, faces: number[], actor?: string): Result {
  const id = actor ?? activeId(state);
  return roll(state, id, new ScriptedDice(faces));
}

export function activeId(state: GameState): string {
  const seat = state.turn?.activeSeat;
  const p = state.players.find((x) => x.seat === seat);
  if (!p) throw new Error("no active player");
  return p.id;
}

/**
 * Submit Action 1 decisions for every player (PASS by default), in the given
 * order (seat order by default). Returns the result of the last submission.
 */
export function allAction1(
  state: GameState,
  decisions: Record<string, Action1Decision> = {},
  order: string[] = state.players.map((p) => p.id),
): { state: GameState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  for (const id of order) {
    const r = ok(submitAction1(s, id, decisions[id] ?? PASS));
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/** Play a full turn: roll, Action 1 for all, then Action 2 if the game continues. */
export function playTurn(
  state: GameState,
  faces: number[],
  a1: Record<string, Action1Decision> = {},
  a2: Action2Decision = PASS,
): { state: GameState; events: GameEvent[] } {
  const rolled = ok(rollWith(state, faces));
  const r1 = allAction1(rolled.state, a1);
  const events = [...rolled.events, ...r1.events];
  if (r1.state.phase !== "ACTION_2") return { state: r1.state, events };
  const r2 = ok(submitAction2(r1.state, activeId(r1.state), a2));
  return { state: r2.state, events: [...events, ...r2.events] };
}

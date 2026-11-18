/** Computes scripted dice for the full-game scenarios (nothing here is hand-tuned per face). */
import {
  createGame,
  dispatch,
  type Face,
  type GameState,
  type PlayerId,
  ScriptedDice,
} from "@cd/engine";
import type { Decision, TurnScript } from "./client";

export const pid = (seat: number): PlayerId => `seat-${seat}`;

/** Two white dice summing to `sum` (2..12). */
export function whitePair(sum: number): [Face, Face] {
  const a = Math.min(6, sum - 1);
  return [(sum - a) as Face, a as Face];
}

/** Faces for one roll: two white plus a die for each color still in play. */
export function rollFaces(sum: number, coloredDice: number): Face[] {
  return [...whitePair(sum), ...(Array(coloredDice).fill(1) as Face[])];
}

export interface PlannedTurn extends TurnScript {
  sum: number;
  coloredDice: number;
}

/**
 * 5 players. Seat 2 builds GREEN (12..8) and locks it at sum 2 (turn 11). Seats 0 and 1
 * build RED and YELLOW (2..6) in turns 6-10. In turn 12 the sum is 12: seat 0 locks RED and
 * seat 1 locks YELLOW in the same Action 1 (EC-14), with GREEN already locked.
 */
export function doubleLockPlan(): PlannedTurn[] {
  const turn = (sum: number, dice: number, marks: Record<number, Decision>): PlannedTurn => {
    const a1: Decision[] = [0, 1, 2, 3, 4].map((s) => marks[s] ?? "PASS");
    return { sum, coloredDice: dice, a1, a2: "PASS" };
  };
  const plan: PlannedTurn[] = [];
  for (const sum of [12, 11, 10, 9, 8]) plan.push(turn(sum, 4, { 2: "GREEN" }));
  for (const sum of [2, 3, 4, 5, 6]) plan.push(turn(sum, 4, { 0: "RED", 1: "YELLOW" }));
  plan.push(turn(2, 4, { 2: "GREEN" }));
  plan.push(turn(12, 3, { 0: "RED", 1: "YELLOW" }));
  return plan;
}

export const planFaces = (plan: PlannedTurn[]): Face[] =>
  plan.flatMap((t) => rollFaces(t.sum, t.coloredDice));

/** Replays `plan` straight through the engine (roll-off gives seat 0 the first turn). */
export function simulate(n: number, plan: PlannedTurn[]): GameState {
  const players = Array.from({ length: n }, (_, i) => ({ id: pid(i), displayName: `P${i}` }));
  const dice = new ScriptedDice([6, ...planFaces(plan)]);
  const created = createGame(players, { dice });
  if (!created.ok) throw new Error(created.error.code);
  let state = created.state;
  const step = (r: ReturnType<typeof dispatch>) => {
    if (!r.ok) {
      const at = `T${state.turn?.turnNumber} ${state.phase}`;
      throw new Error(`${r.error.code} ${r.error.reason} ${at}`);
    }
    state = r.state;
  };
  for (const t of plan) {
    const active = pid(state.turn?.activeSeat ?? 0);
    step(dispatch(state, { type: "ROLL", playerId: active }, dice));
    t.a1.forEach((d, i) => {
      const decision =
        d === "PASS" ? { kind: "PASS" as const } : { kind: "MARK" as const, color: d };
      step(dispatch(state, { type: "ACTION1", playerId: pid(i), decision }, dice));
    });
    if (state.phase === "ACTION_2") {
      step(
        dispatch(state, { type: "ACTION2", playerId: active, decision: { kind: "PASS" } }, dice),
      );
    }
  }
  return state;
}

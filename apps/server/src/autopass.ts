/**
 * Host policy for away seats (D3, spec I-8/I-9). Pure: no storage or I/O.
 * Away seats pass Action 1, roll when active, and pass Action 2 when active
 * (which takes the normal rule penalty if they marked nothing).
 *
 * Early Action 2 (K1.2): an away active seat in ACTION_1 commits PASS as its
 * pending Action 2 (with Action 1 PASS if still undecided), so the turn resolves
 * as soon as the last present player decides. A pending decision the player made
 * before going away is final and is left alone. Outcomes match the old flow.
 */
import {
  type DiceSource,
  type GameState,
  roll,
  submitAction1,
  submitAction2,
  submitTurn,
} from "@cd/engine";
import { AUTOPASS_LOOP_GUARD } from "@cd/protocol";
import { playerId } from "./room-lobby-ops";

/** One automatic step for an away seat, or null when no away seat can act. */
function step(state: GameState, away: ReadonlySet<number>, dice: DiceSource): GameState | null {
  const turn = state.turn;
  if (!turn) return null;
  const activeAway = away.has(turn.activeSeat);
  const active = playerId(turn.activeSeat);
  switch (state.phase) {
    case "ACTION_1": {
      if (activeAway) {
        const r = activeEarlyPass(state, active);
        if (r) return r;
      }
      const p = state.players.find(
        (x) => away.has(x.seat) && !Object.hasOwn(turn.action1Decisions, x.id),
      );
      if (!p) return null;
      const r = submitAction1(state, p.id, { kind: "PASS" });
      return r.ok ? r.state : null;
    }
    case "AWAIT_ROLL": {
      if (!activeAway) return null;
      const r = roll(state, active, dice);
      return r.ok ? r.state : null;
    }
    case "ACTION_2": {
      if (!activeAway) return null;
      const r = submitAction2(state, active, { kind: "PASS" });
      return r.ok ? r.state : null;
    }
    default:
      return null;
  }
}

/** Away active seat in ACTION_1: PASS/PASS, or early Action 2 PASS after its own Action 1. */
function activeEarlyPass(state: GameState, active: string): GameState | null {
  const turn = state.turn;
  if (!turn || turn.pendingAction2) return null;
  const pass = { kind: "PASS" } as const;
  const r = Object.hasOwn(turn.action1Decisions, active)
    ? submitAction2(state, active, pass)
    : submitTurn(state, active, pass, pass);
  return r.ok ? r.state : null;
}

/** Applies automatic steps until nothing changes (at most AUTOPASS_LOOP_GUARD). */
export function autopass(state: GameState, away: ReadonlySet<number>, dice: DiceSource): GameState {
  if (away.size === 0) return state;
  let s = state;
  for (let i = 0; i < AUTOPASS_LOOP_GUARD; i++) {
    const next = step(s, away, dice);
    if (!next) return s;
    s = next;
  }
  console.warn("autopass loop guard reached");
  return s;
}

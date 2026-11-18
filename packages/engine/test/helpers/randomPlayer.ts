import type { Command, DiceSource, Face, GameState, PlayerId } from "../../src/index";
import { legalAction1Options, legalAction2Options } from "../../src/queries";

/** Small seeded PRNG; returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)] as T;

/** Uniform dice driven by a seeded PRNG. */
export class SeededDice implements DiceSource {
  private readonly rng: Rng;
  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }
  rollDie(): Face {
    return (Math.floor(this.rng() * 6) + 1) as Face;
  }
}

/** Seat-ordered id of the active player. */
function activeId(state: GameState): PlayerId {
  const p = state.players.find((x) => x.seat === state.turn?.activeSeat);
  if (!p) throw new Error("no active player");
  return p.id;
}

/** A random legal command for whoever must act next. Null at GAME_OVER. */
export function randomLegalCommand(state: GameState, rng: Rng): Command | null {
  switch (state.phase) {
    case "AWAIT_ROLL":
      return { type: "ROLL", playerId: activeId(state) };
    case "ACTION_1": {
      const undecided = state.players.filter((p) => legalAction1Options(state, p.id).length > 0);
      const p = pick(rng, undecided);
      const o = pick(rng, legalAction1Options(state, p.id));
      const decision = o.kind === "PASS" ? o : { kind: "MARK" as const, color: o.color };
      return { type: "ACTION1", playerId: p.id, decision };
    }
    case "ACTION_2": {
      const id = activeId(state);
      const o = pick(rng, legalAction2Options(state, id));
      const decision =
        o.kind === "PASS" ? o : { kind: "MARK" as const, whiteDie: o.whiteDie, color: o.color };
      return { type: "ACTION2", playerId: id, decision };
    }
    default:
      return null;
  }
}

/** A command that must be rejected in the current state (never legal). */
export function randomIllegalCommand(state: GameState, rng: Rng): Command {
  const ids = state.players.map((p) => p.id);
  const anyId = pick(rng, ids);
  const garbage: unknown[] = [{ kind: "MARK", color: "PURPLE" }, { kind: "NOPE" }, null];
  const bad = pick(rng, garbage) as never;
  const bad2 = pick(rng, [...garbage, { kind: "MARK", whiteDie: 2, color: "RED" }]) as never;
  const cands: Command[] = [];
  const phase = state.phase;
  if (phase !== "AWAIT_ROLL") cands.push({ type: "ROLL", playerId: anyId });
  if (phase !== "ACTION_1")
    cands.push({ type: "ACTION1", playerId: anyId, decision: { kind: "PASS" } });
  if (phase !== "ACTION_2")
    cands.push({ type: "ACTION2", playerId: anyId, decision: { kind: "PASS" } });
  cands.push({ type: "ROLL", playerId: "nobody" });
  cands.push({ type: "ACTION1", playerId: "nobody", decision: { kind: "PASS" } });
  cands.push({ type: "ACTION2", playerId: "nobody", decision: { kind: "PASS" } });
  cands.push({ type: "BOGUS" } as never);
  if (phase === "AWAIT_ROLL") {
    const other = state.players.find((p) => p.seat !== state.turn?.activeSeat);
    if (other) cands.push({ type: "ROLL", playerId: other.id });
  }
  if (phase === "ACTION_1") {
    cands.push({ type: "ACTION1", playerId: anyId, decision: bad });
    const done = state.players.find((p) => legalAction1Options(state, p.id).length === 0);
    if (done) cands.push({ type: "ACTION1", playerId: done.id, decision: { kind: "PASS" } });
    const p = pick(rng, state.players);
    const legal = legalAction1Options(state, p.id);
    const illegal = (["RED", "YELLOW", "GREEN", "BLUE"] as const).filter(
      (c) => legal.length > 0 && !legal.some((o) => o.kind === "MARK" && o.color === c),
    );
    if (illegal.length) {
      cands.push({
        type: "ACTION1",
        playerId: p.id,
        decision: { kind: "MARK", color: pick(rng, illegal) },
      });
    }
  }
  if (phase === "ACTION_2") {
    const other = state.players.find((p) => p.seat !== state.turn?.activeSeat);
    if (other) cands.push({ type: "ACTION2", playerId: other.id, decision: { kind: "PASS" } });
    cands.push({ type: "ACTION2", playerId: activeId(state), decision: bad2 });
  }
  return pick(rng, cands);
}

import {
  createGame,
  type GameState,
  roll,
  ScriptedDice,
  submitAction1,
  submitAction2,
} from "@cd/engine";
import { describe, expect, it } from "vitest";
import { autopass } from "../src/autopass";

const ok = (r: { ok: true; state: GameState } | { ok: false; error: unknown }): GameState => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.state;
};

/** 3 players, seat 0 first; turn 1 rolled (white 3+4, every coloured die 1). */
function rolled(): { state: GameState; dice: ScriptedDice } {
  const dice = new ScriptedDice([3, 4, 1, 1, 1, 1, ...Array(30).fill(1)]);
  const players = [0, 1, 2].map((i) => ({ id: `seat-${i}`, displayName: `P${i}` }));
  const state = ok(createGame(players, { dice, firstPlayer: "seat-0" }));
  return { state: ok(roll(state, "seat-0", dice)), dice };
}

describe("autopass with early Action 2 (K1.2)", () => {
  it("away active seat in ACTION_1 commits PASS/PASS; the turn resolves on the last present decision", () => {
    const { state, dice } = rolled();
    const s1 = autopass(state, new Set([0]), dice);
    expect(s1.phase).toBe("ACTION_1");
    expect(s1.turn?.action1Decisions["seat-0"]).toEqual({ kind: "PASS" });
    expect(s1.turn?.pendingAction2).toEqual({ kind: "PASS" });
    const s2 = ok(submitAction1(s1, "seat-1", { kind: "PASS" }));
    const s3 = autopass(ok(submitAction1(s2, "seat-2", { kind: "PASS" })), new Set([0]), dice);
    // Same outcome as the old flow: passed both actions → one penalty, next turn.
    expect(s3.turn?.turnNumber).toBe(2);
    expect(s3.players[0]?.sheet.penalties).toBe(1);
  });

  it("away active seat that already marked Action 1 gets an early Action 2 PASS (no penalty)", () => {
    const { state, dice } = rolled();
    const s1 = ok(submitAction1(state, "seat-0", { kind: "MARK", color: "RED" }));
    const s2 = autopass(s1, new Set([0]), dice);
    expect(s2.turn?.pendingAction2).toEqual({ kind: "PASS" });
    const s3 = ok(submitAction1(s2, "seat-1", { kind: "PASS" }));
    const s4 = ok(submitAction1(s3, "seat-2", { kind: "PASS" }));
    expect(s4.turn?.turnNumber).toBe(2);
    expect(s4.players[0]?.sheet.penalties).toBe(0);
  });

  it("a pending Action 2 made before going away is final and is applied", () => {
    const { state, dice } = rolled();
    const s1 = ok(submitAction1(state, "seat-0", { kind: "PASS" }));
    const mark = { kind: "MARK", whiteDie: 1, color: "GREEN" } as const;
    const s2 = autopass(ok(submitAction2(s1, "seat-0", mark)), new Set([0]), dice);
    expect(s2.turn?.pendingAction2).toEqual(mark);
    const s3 = ok(
      submitAction1(ok(submitAction1(s2, "seat-1", { kind: "PASS" })), "seat-2", {
        kind: "PASS",
      }),
    );
    expect(s3.turn?.turnNumber).toBe(2);
    // GREEN 5 (white 4 + green 1) marked, no penalty.
    expect(s3.players[0]?.sheet.rows.GREEN.marked.filter(Boolean)).toHaveLength(1);
    expect(s3.players[0]?.sheet.penalties).toBe(0);
  });

  it("does nothing for a present active seat", () => {
    const { state, dice } = rolled();
    expect(autopass(state, new Set([1]), dice).turn?.pendingAction2).toBeNull();
  });
});

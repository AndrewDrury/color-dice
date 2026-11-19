import { describe, expect, it } from "vitest";
import { ScriptedDice } from "../src/dice";
import { createGame, dispatch } from "../src/engine";
import { toJSON } from "../src/serialize";
import { viewFor } from "../src/view";
import { activeId, expectRejected, newGame, ok, PASS, playTurn } from "./helpers/game";

const noDice = () => new ScriptedDice([]);
const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, displayName: `P${i + 1}` }));

describe("dispatch", () => {
  it("undoes a submitted Action 1 decision before reveal", () => {
    let s = newGame();
    s = ok(
      dispatch(s, { type: "ROLL", playerId: "p1" }, new ScriptedDice([3, 5, 1, 1, 1, 1])),
    ).state;
    s = ok(
      dispatch(
        s,
        { type: "ACTION1", playerId: "p1", decision: { kind: "MARK", color: "RED" } },
        noDice(),
      ),
    ).state;
    expect(s.turn?.action1Decisions.p1).toBeDefined();
    s = ok(dispatch(s, { type: "UNDO", playerId: "p1" }, noDice())).state;
    expect(s.turn?.action1Decisions.p1).toBeUndefined();
  });

  const start = () => {
    let s = newGame();
    s = ok(
      dispatch(s, { type: "ROLL", playerId: "p1" }, new ScriptedDice([3, 5, 1, 1, 1, 1])),
    ).state;
    return s;
  };
  const a1 = (s: ReturnType<typeof start>, playerId: string, decision: unknown) =>
    ok(dispatch(s, { type: "ACTION1", playerId, decision } as never, noDice())).state;
  const RED = { kind: "MARK", color: "RED" } as const;

  it("ACTION_1: active undoes a white-sum mark after an opponent decided, and re-chooses", () => {
    // 3 players so ACTION_1 stays open after two decisions.
    let s = newGame(["p1", "p2", "p3"]);
    s = ok(
      dispatch(s, { type: "ROLL", playerId: "p1" }, new ScriptedDice([3, 5, 1, 1, 1, 1])),
    ).state;
    const act = activeId(s);
    const other = s.players.find((p) => p.id !== act)?.id as string;
    s = a1(s, other, PASS);
    s = a1(s, act, RED);
    expect(s.phase).toBe("ACTION_1");
    s = ok(dispatch(s, { type: "UNDO", playerId: act }, noDice())).state;
    expect(s.turn?.action1Decisions[act]).toBeUndefined();
    expect(s.turn?.action1Decisions[other]).toEqual(PASS);
    s = a1(s, act, PASS);
    expect(s.turn?.action1Decisions[act]).toEqual(PASS);
  });

  it("ACTION_1: passive undoes a pass; opponent content hidden in views", () => {
    let s = a1(start(), "p2", PASS);
    s = ok(dispatch(s, { type: "UNDO", playerId: "p2" }, noDice())).state;
    expect(s.turn?.action1Decisions.p2).toBeUndefined();
    s = a1(s, "p2", RED);
    const mid = ok(dispatch(s, { type: "UNDO", playerId: "p2" }, noDice())).state;
    const t = a1(mid, "p2", RED);
    expect(t.phase).toBe("ACTION_1");
    const v = viewFor(t, 0);
    expect(v.game.players.map((p) => p.decided)).toEqual([false, true]);
    expect(v.you.action1Decision).toBeNull();
    expect(v.game.events.some((e) => e.type === "ACTION1_REVEALED")).toBe(false);
  });

  it("after resolution Action 1 cannot be reopened; passive cannot undo", () => {
    const s = a1(a1(start(), "p1", PASS), "p2", RED);
    expect(s.phase).toBe("ACTION_2");
    expectRejected(
      s,
      (x) => dispatch(x, { type: "UNDO", playerId: "p2" }, noDice()),
      "E_NOTHING_TO_UNDO",
    );
    expectRejected(
      s,
      (x) => dispatch(x, { type: "UNDO", playerId: "p1" }, noDice()),
      "E_NOTHING_TO_UNDO",
    );
    expectRejected(
      s,
      (x) => dispatch(x, { type: "ACTION1", playerId: "p1", decision: RED }, noDice()),
      "E_WRONG_PHASE",
    );
    expect(viewFor(s, 1).you.canUndo).toBe(false);
    expect(viewFor(s, 0).you.canUndo).toBe(false);
  });

  it("undoes one applied active-player mark and never advances the turn", () => {
    const s0 = a1(a1(start(), "p2", PASS), "p1", RED);
    expect(s0.phase).toBe("ACTION_2");
    expect(s0.players[0]?.sheet.rows.RED.marked[6]).toBe(true);
    expect(viewFor(s0, 0).you.canUndo).toBe(true);
    const s = ok(dispatch(s0, { type: "UNDO", playerId: "p1" }, noDice())).state;
    expect(s.players[0]?.sheet.rows.RED.marked[6]).toBe(false);
    expect(s.phase).toBe("ACTION_2");
  });

  it("view exposes decided booleans without content", () => {
    const mid = a1(start(), "p2", RED);
    expect(viewFor(mid, 0).game.players.map((p) => p.decided)).toEqual([false, true]);
    expect(viewFor(mid, 0).you.canUndo).toBe(false);
    expect(JSON.stringify(viewFor(mid, 0).game)).not.toContain("action1Decisions");
  });

  it("rejects undo after TURN_STARTED advances", () => {
    let s = newGame();
    s = ok(
      dispatch(s, { type: "ROLL", playerId: "p1" }, new ScriptedDice([3, 5, 1, 1, 1, 1])),
    ).state;
    s = ok(dispatch(s, { type: "ACTION1", playerId: "p1", decision: PASS }, noDice())).state;
    s = ok(dispatch(s, { type: "ACTION1", playerId: "p2", decision: PASS }, noDice())).state;
    s = ok(dispatch(s, { type: "ACTION2", playerId: "p1", decision: PASS }, noDice())).state;
    expect(s.turn?.turnNumber).toBe(2);
    expectRejected(
      s,
      (x) => dispatch(x, { type: "UNDO", playerId: "p1" }, noDice()),
      "E_WRONG_PHASE",
    );
  });

  it("routes ROLL / ACTION1 / ACTION2 and rejects unknown commands", () => {
    let s = newGame();
    s = ok(
      dispatch(s, { type: "ROLL", playerId: "p1" }, new ScriptedDice([1, 1, 1, 1, 1, 1])),
    ).state;
    s = ok(dispatch(s, { type: "ACTION1", playerId: "p1", decision: PASS }, noDice())).state;
    s = ok(dispatch(s, { type: "ACTION1", playerId: "p2", decision: PASS }, noDice())).state;
    s = ok(dispatch(s, { type: "ACTION2", playerId: "p1", decision: PASS }, noDice())).state;
    expect(s.players[0]?.sheet.penalties).toBe(1);
    expectRejected(s, (x) => dispatch(x, { type: "WAT" } as never, noDice()), "E_INVALID_COMMAND");
    expectRejected(s, (x) => dispatch(x, null as never, noDice()), "E_INVALID_COMMAND");
  });

  it("is deterministic: same dice and commands → byte-equal logs", () => {
    const run = () => {
      let s = ok(createGame(players(3), { dice: new ScriptedDice([2, 6, 1]) })).state;
      for (let i = 0; i < 6; i++)
        s = playTurn(s, [3, 4, 1, 2, 3, 4], { [activeId(s)]: PASS }).state;
      return toJSON(s);
    };
    expect(run()).toBe(run());
  });
});

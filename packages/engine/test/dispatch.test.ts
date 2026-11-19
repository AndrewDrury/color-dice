import { describe, expect, it } from "vitest";
import { ScriptedDice } from "../src/dice";
import { createGame, dispatch } from "../src/engine";
import { toJSON } from "../src/serialize";
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

  it("undoes one applied current-turn mark and never advances the turn", () => {
    let s = newGame();
    s = ok(
      dispatch(s, { type: "ROLL", playerId: "p1" }, new ScriptedDice([3, 5, 1, 1, 1, 1])),
    ).state;
    s = ok(dispatch(s, { type: "ACTION1", playerId: "p1", decision: PASS }, noDice())).state;
    s = ok(
      dispatch(
        s,
        { type: "ACTION1", playerId: "p2", decision: { kind: "MARK", color: "RED" } },
        noDice(),
      ),
    ).state;
    expect(s.phase).toBe("ACTION_2");
    expect(s.players[1]?.sheet.rows.RED.marked[6]).toBe(true);
    s = ok(dispatch(s, { type: "UNDO", playerId: "p2" }, noDice())).state;
    expect(s.players[1]?.sheet.rows.RED.marked[6]).toBe(false);
    expect(s.phase).toBe("ACTION_2");
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

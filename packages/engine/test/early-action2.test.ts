/** Early Action 2 during ACTION_1 (spec §17 A-2, K1.2). */
import { describe, expect, it } from "vitest";
import { ScriptedDice } from "../src/dice";
import { dispatch, roll, submitAction1, submitAction2, submitTurn } from "../src/engine";
import type { GameState } from "../src/index";
import { legalEarlyAction2Options } from "../src/queries";
import { fromJSON, toJSON } from "../src/serialize";
import { viewFor } from "../src/view";
import { makeSheet, makeState } from "./helpers/builders";
import { expectRejected, mark1, mark2, newGame, ok, PASS, types } from "./helpers/game";

/** p1 (active, seat 0), p2, p3 in AWAIT_ROLL with optional sheets/locks, then rolled. */
function rolled(
  faces: number[],
  opts: { p1?: Parameters<typeof makeSheet>[0]; p2?: Parameters<typeof makeSheet>[0] } = {},
  lockedColors: GameState["lockedColors"] = [],
): GameState {
  const s = makeState({
    players: [
      { id: "p1", sheet: makeSheet(opts.p1) },
      { id: "p2", sheet: makeSheet(opts.p2) },
      "p3",
    ],
    lockedColors,
  });
  return ok(roll(s, "p1", new ScriptedDice(faces))).state;
}

describe("early Action 2 (A-2)", () => {
  // white 3+4 = 7; colored R2 Y2 G2 B2.
  const FACES = [3, 4, 2, 2, 2, 2];

  it("A1 then A2 as two commands while passives are undecided stays in ACTION_1", () => {
    let s = rolled(FACES);
    s = ok(submitAction1(s, "p1", mark1("RED"))).state;
    const r = ok(submitAction2(s, "p1", mark2(0, "GREEN")));
    expect(r.events).toEqual([]); // the commit itself is hidden
    s = r.state;
    expect(s.phase).toBe("ACTION_1");
    expect(s.turn?.turnNumber).toBe(1);
    expect(s.turn?.pendingAction2).toEqual(mark2(0, "GREEN"));
    s = ok(submitAction1(s, "p2", mark1("YELLOW"))).state;
    expect(s.phase).toBe("ACTION_1");
    expect(s.turn?.turnNumber).toBe(1);
  });

  it("last passive deciding applies A1, the pending A2 and starts the next turn in one transition", () => {
    let s = rolled(FACES);
    s = ok(submitAction1(s, "p1", mark1("RED"))).state;
    s = ok(submitAction2(s, "p1", mark2(0, "GREEN"))).state;
    s = ok(submitAction1(s, "p2", mark1("YELLOW"))).state;
    const r = ok(submitAction1(s, "p3", PASS));
    expect(types(r.events)).toEqual([
      "ACTION1_SUBMITTED",
      "ACTION1_REVEALED",
      "MARKED",
      "MARKED",
      "MARKED",
      "TURN_STARTED",
    ]);
    expect(r.events[4]).toMatchObject({ playerId: "p1", action: 2, color: "GREEN", number: 5 });
    expect(r.state.phase).toBe("AWAIT_ROLL");
    expect(r.state.turn).toMatchObject({ turnNumber: 2, activeSeat: 1, pendingAction2: null });
    expect(r.state.players[0]?.sheet.penalties).toBe(0);
  });

  it("active submits first, passives later all PASS: pending A2 applied, no penalty", () => {
    let s = rolled(FACES);
    s = ok(submitAction1(s, "p1", PASS)).state;
    s = ok(submitAction2(s, "p1", mark2(1, "BLUE"))).state; // 4+2 = 6 in blue
    s = ok(submitAction1(s, "p2", PASS)).state;
    const r = ok(submitAction1(s, "p3", PASS));
    expect(types(r.events)).toEqual([
      "ACTION1_SUBMITTED",
      "ACTION1_REVEALED",
      "MARKED",
      "TURN_STARTED",
    ]);
    expect(r.state.players[0]?.sheet.penalties).toBe(0);
  });

  it("pass + early pass = one penalty, then next turn", () => {
    let s = rolled(FACES);
    s = ok(submitAction1(s, "p1", PASS)).state;
    s = ok(submitAction2(s, "p1", PASS)).state;
    s = ok(submitAction1(s, "p2", PASS)).state;
    const r = ok(submitAction1(s, "p3", PASS));
    expect(types(r.events).slice(-3)).toEqual(["ACTION2_PASSED", "PENALTY", "TURN_STARTED"]);
    expect(r.state.players[0]?.sheet.penalties).toBe(1);
  });

  it("pre-check uses the sheet with the player's own Action 1 applied", () => {
    // p1 has 4 reds; A1 red 11 makes 5, so the early red 12 (6+6) is legal and locks.
    let s = rolled([5, 6, 6, 1, 1, 1], { p1: { RED: [2, 3, 4, 5] } });
    expectRejected(s, (x) => submitAction2(x, "p1", mark2(1, "RED")), "E_WRONG_PHASE");
    s = ok(submitAction1(s, "p1", mark1("RED"))).state;
    expect(legalEarlyAction2Options(s, "p1")).toContainEqual({
      kind: "MARK",
      whiteDie: 1,
      color: "RED",
      number: 12,
    });
    s = ok(submitAction2(s, "p1", mark2(1, "RED"))).state;
    s = ok(submitAction1(s, "p2", PASS)).state;
    const r = ok(submitAction1(s, "p3", PASS));
    expect(r.events).toContainEqual({
      type: "ROW_LOCKED",
      color: "RED",
      lockedBy: ["p1"],
      action: 2,
    });
    expect(r.state.lockedColors).toEqual(["RED"]);
    expect(r.state.phase).toBe("AWAIT_ROLL");
  });

  it("illegal pre-check is rejected and changes nothing", () => {
    let s = rolled(FACES);
    s = ok(submitAction1(s, "p1", mark1("RED"))).state; // red 7
    // 3+2 = 5 is left of red 7 once Action 1 is applied.
    expectRejected(
      s,
      (x) => submitAction2(x, "p1", mark2(0, "RED")),
      "E_ILLEGAL_MARK",
      "LEFT_OF_RIGHTMOST",
    );
    expectRejected(
      s,
      (x) => submitAction2(x, "p1", { kind: "NOPE" } as never),
      "E_INVALID_COMMAND",
    );
    expectRejected(s, (x) => submitAction2(x, "p1", mark2(2 as never, "RED")), "E_BAD_DIE");
    expectRejected(s, (x) => submitAction2(x, "p2", PASS), "E_NOT_ACTIVE_PLAYER");
    expectRejected(s, (x) => submitAction2(x, "zz", PASS), "E_UNKNOWN_PLAYER");
  });

  it("a second early Action 2 is E_ALREADY_DECIDED (final, like I-4)", () => {
    let s = rolled(FACES);
    s = ok(submitAction1(s, "p1", PASS)).state;
    s = ok(submitAction2(s, "p1", PASS)).state;
    expect(legalEarlyAction2Options(s, "p1")).toEqual([]);
    expectRejected(s, (x) => submitAction2(x, "p1", mark2(0, "GREEN")), "E_ALREADY_DECIDED");
    expectRejected(s, (x) => submitTurn(x, "p1", PASS, PASS), "E_ALREADY_DECIDED");
  });

  it("voided when another player's Action 1 locks that colour; no penalty, choose again", () => {
    // white 6+6 = 12; p2 has 5 reds and locks red in Action 1.
    let s = rolled([6, 6, 1, 1, 1, 1], { p2: { RED: [2, 3, 4, 5, 6] } });
    s = ok(submitAction1(s, "p1", PASS)).state;
    s = ok(submitAction2(s, "p1", mark2(0, "RED"))).state; // red 7, legal now
    s = ok(submitAction1(s, "p2", mark1("RED"))).state;
    const r = ok(submitAction1(s, "p3", PASS));
    expect(r.events.at(-1)).toEqual({
      type: "ACTION2_VOIDED",
      playerId: "p1",
      reason: "ROW_LOCKED",
    });
    expect(r.state.phase).toBe("ACTION_2");
    expect(r.state.turn?.pendingAction2).toBeNull();
    expect(r.state.players[0]?.sheet.penalties).toBe(0);
    expectRejected(r.state, (x) => submitAction2(x, "p1", mark2(0, "RED")), "E_DIE_NOT_IN_PLAY");
    const r2 = ok(submitAction2(r.state, "p1", mark2(0, "GREEN"))); // green 7
    expect(r2.state.phase).toBe("AWAIT_ROLL");
    expect(r2.state.players[0]?.sheet.penalties).toBe(0);
  });

  it("dropped when Action 1 ends the game (I-6): no Action 2, no penalty", () => {
    let s = rolled(
      [6, 6, 1, 1, 1],
      { p1: { BLUE: [12, 11, 10, 9, 8, 2] }, p2: { RED: [2, 3, 4, 5, 6] } },
      ["BLUE"],
    );
    s = ok(submitAction1(s, "p1", PASS)).state;
    s = ok(submitAction2(s, "p1", PASS)).state;
    s = ok(submitAction1(s, "p2", mark1("RED"))).state;
    const r = ok(submitAction1(s, "p3", PASS));
    expect(r.state.phase).toBe("GAME_OVER");
    expect(types(r.events)).not.toContain("ACTION2_PASSED");
    expect(types(r.events)).not.toContain("PENALTY");
    expect(r.state.turn?.pendingAction2).toBeNull();
  });

  it("ACTION_2 still accepts submitAction2 when the player waited", () => {
    let s = rolled(FACES);
    for (const id of ["p1", "p2", "p3"]) s = ok(submitAction1(s, id, PASS)).state;
    expect(s.phase).toBe("ACTION_2");
    expect(ok(submitAction2(s, "p1", mark2(0, "GREEN"))).state.phase).toBe("AWAIT_ROLL");
  });
});

describe("submitTurn / TURN command (A1 + early A2 in one confirm)", () => {
  const FACES = [3, 4, 2, 2, 2, 2];

  it("stores both while passives are undecided; the last passive resolves everything", () => {
    let s = rolled(FACES);
    const r = ok(
      dispatch(
        s,
        { type: "TURN", playerId: "p1", action1: mark1("RED"), action2: mark2(0, "GREEN") },
        new ScriptedDice([]),
      ),
    );
    expect(types(r.events)).toEqual(["ACTION1_SUBMITTED"]);
    s = r.state;
    expect(s.phase).toBe("ACTION_1");
    s = ok(submitAction1(s, "p2", PASS)).state;
    const last = ok(submitAction1(s, "p3", PASS));
    expect(last.state.turn?.turnNumber).toBe(2);
    expect(last.state.players[0]?.sheet.rows.GREEN.marked.filter(Boolean)).toHaveLength(1);
  });

  it("resolves at once when the active player decides last", () => {
    let s = rolled(FACES);
    s = ok(submitAction1(s, "p2", PASS)).state;
    s = ok(submitAction1(s, "p3", PASS)).state;
    const r = ok(submitTurn(s, "p1", PASS, PASS));
    expect(types(r.events).slice(-3)).toEqual(["ACTION2_PASSED", "PENALTY", "TURN_STARTED"]);
  });

  it("is atomic: a bad half rejects the whole command", () => {
    const s = rolled(FACES);
    expectRejected(
      s,
      (x) => submitTurn(x, "p1", mark1("RED"), mark2(0, "RED")),
      "E_ILLEGAL_MARK",
      "LEFT_OF_RIGHTMOST",
    );
    expectRejected(s, (x) => submitTurn(x, "p2", PASS, PASS), "E_NOT_ACTIVE_PLAYER");
    expectRejected(
      s,
      (x) => submitTurn(x, "p1", { kind: "X" } as never, PASS),
      "E_INVALID_COMMAND",
    );
  });
});

describe("early Action 2 hidden info and serialization", () => {
  it("only the active player sees pendingAction2", () => {
    let s = rolled([3, 4, 2, 2, 2, 2]);
    s = ok(submitTurn(s, "p1", PASS, mark2(1, "YELLOW"))).state;
    expect(viewFor(s, 0).you.pendingAction2).toEqual(mark2(1, "YELLOW"));
    for (const seat of [1, 2]) {
      const v = viewFor(s, seat);
      expect(v.you.pendingAction2).toBeNull();
      const text = JSON.stringify(v);
      expect(text).not.toContain("whiteDie");
    }
    // Once resolved nobody has a pending decision.
    s = ok(submitAction1(s, "p2", PASS)).state;
    s = ok(submitAction1(s, "p3", PASS)).state;
    expect(viewFor(s, 0).you.pendingAction2).toBeNull();
  });

  it("round-trips pendingAction2 and migrates older saves", () => {
    let s = rolled([3, 4, 2, 2, 2, 2]);
    s = ok(submitTurn(s, "p1", PASS, mark2(0, "GREEN"))).state;
    expect(toJSON(fromJSON(toJSON(s)))).toBe(toJSON(s));

    const legacy = JSON.parse(toJSON(s));
    delete legacy.turn.pendingAction2;
    expect(fromJSON(JSON.stringify(legacy)).turn?.pendingAction2).toBeNull();

    const wrongPhase = JSON.parse(toJSON(s));
    wrongPhase.phase = "ACTION_2";
    expect(() => fromJSON(JSON.stringify(wrongPhase))).toThrow(/pendingAction2/);
    const bad = JSON.parse(toJSON(s));
    bad.turn.pendingAction2 = { kind: "MARK", whiteDie: 3, color: "RED" };
    expect(() => fromJSON(JSON.stringify(bad))).toThrow(/pendingAction2/);
  });

  it("validates FIRST_PLAYER_CHOSEN.rounds and migrates the old rolls field", () => {
    const s = newGame();
    const old = JSON.parse(toJSON(s));
    old.log[1] = { type: "FIRST_PLAYER_CHOSEN", seat: 0, method: "ROLL_OFF", rolls: [] };
    expect(fromJSON(JSON.stringify(old)).log[1]).toEqual({
      type: "FIRST_PLAYER_CHOSEN",
      seat: 0,
      method: "ROLL_OFF",
      rounds: [],
    });
    old.log[1] = { type: "FIRST_PLAYER_CHOSEN", seat: 0, method: "ROLL_OFF", rounds: [[7]] };
    expect(() => fromJSON(JSON.stringify(old))).toThrow(/rounds/);
  });
});

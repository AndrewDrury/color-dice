/** Spec §13: one test per edge case. Also covers §15.3 #18, #21, #22, #23. */
import { describe, expect, it } from "vitest";
import { submitAction1, submitAction2 } from "../src/engine";
import { legalAction1Options, legalAction2Options } from "../src/queries";
import { rowScore, score } from "../src/scoring";
import { boxStatus } from "../src/status";
import type { GameState } from "../src/types";
import { makeSheet, makeState } from "./helpers/builders";
import {
  allAction1,
  expectRejected,
  mark1,
  mark2,
  ok,
  PASS,
  playTurn,
  rollWith,
  types,
} from "./helpers/game";

const five = {
  RED: [2, 3, 4, 5, 6],
  YELLOW: [2, 3, 4, 5, 6],
  GREEN: [12, 11, 10, 9, 8],
  BLUE: [12, 11, 10, 9, 8],
};
const p = (s: GameState, id: string) => {
  const x = s.players.find((q) => q.id === id);
  if (!x) throw new Error(id);
  return x;
};

describe("§13 edge cases", () => {
  it("EC-1 first mark at a middle index is legal; boxes to its left become skipped", () => {
    const r = playTurn(makeState(), [3, 4, 1, 1, 1, 1], { p1: mark1("RED") });
    const row = p(r.state, "p1").sheet.rows.RED;
    expect(row.marked[5]).toBe(true);
    for (let i = 0; i < 5; i++) expect(boxStatus(row, i, [])).toBe("SKIPPED");
  });

  it("EC-2 4 marks + lock number → LOCK_REQUIRES_FIVE; may mark elsewhere or pass", () => {
    const s = makeState({ players: [{ id: "p1", sheet: makeSheet({ RED: [2, 3, 4, 5] }) }, "p2"] });
    const r = ok(rollWith(s, [6, 6, 1, 1, 1, 1])).state;
    expectRejected(
      r,
      (x) => submitAction1(x, "p1", mark1("RED")),
      "E_ILLEGAL_MARK",
      "LOCK_REQUIRES_FIVE",
    );
    expect(legalAction1Options(r, "p1")).toEqual([
      PASS,
      { kind: "MARK", color: "GREEN", number: 12 },
      { kind: "MARK", color: "BLUE", number: 12 },
    ]);
    ok(submitAction1(r, "p1", mark1("GREEN")));
  });

  it("EC-3 5 marks + red 12 locks red: 7 crosses = 28, die removed", () => {
    const s = makeState({ players: [{ id: "p1", sheet: makeSheet({ RED: five.RED }) }, "p2"] });
    const r = playTurn(s, [6, 6, 1, 1, 1, 1], { p1: mark1("RED") });
    const red = p(r.state, "p1").sheet.rows.RED;
    expect(red.marked[10]).toBe(true);
    expect(red.lockCrossed).toBe(true);
    expect(rowScore(red)).toBe(28);
    expect(r.state.lockedColors).toEqual(["RED"]);
    expect(types(r.events)).toContain("DIE_REMOVED");
    expect(r.events.find((e) => e.type === "MARKED")).toMatchObject({
      number: 12,
      index: 10,
      lockedNow: true,
    });
  });

  it("EC-4 two players lock yellow in the same Action 1: both get the lock box, one locked row", () => {
    const s = makeState({
      players: [
        { id: "p1", sheet: makeSheet({ YELLOW: five.YELLOW }) },
        { id: "p2", sheet: makeSheet({ YELLOW: five.YELLOW }) },
      ],
    });
    const r = playTurn(s, [6, 6, 1, 1, 1, 1], { p1: mark1("YELLOW"), p2: mark1("YELLOW") });
    expect(r.state.lockedColors).toEqual(["YELLOW"]);
    expect(p(r.state, "p1").sheet.rows.YELLOW.lockCrossed).toBe(true);
    expect(p(r.state, "p2").sheet.rows.YELLOW.lockCrossed).toBe(true);
    expect(r.events.filter((e) => e.type === "ROW_LOCKED")).toEqual([
      { type: "ROW_LOCKED", color: "YELLOW", lockedBy: ["p1", "p2"], action: 1 },
    ]);
    expect(r.events.filter((e) => e.type === "DIE_REMOVED")).toHaveLength(1);
    expect(r.state.phase).toBe("AWAIT_ROLL");
  });

  it("EC-5 a mark in a row another player locks in the same Action 1 still counts", () => {
    // Every Action 1 mark uses the white sum, so B's mark in the locking row is the
    // lock number too; it is checked against the pre-lock snapshot and counts.
    const s = makeState({
      players: [
        { id: "A", sheet: makeSheet({ GREEN: five.GREEN }) },
        { id: "B", sheet: makeSheet({ GREEN: [12, 10, 7, 6, 5] }) },
      ],
    });
    const r = playTurn(s, [1, 1, 1, 1, 1, 1], { A: mark1("GREEN"), B: mark1("GREEN") });
    const b = p(r.state, "B").sheet.rows.GREEN;
    expect(b.marked[10]).toBe(true);
    expect(rowScore(b)).toBe(28);
    expect(r.state.lockedColors).toEqual(["GREEN"]);
  });

  it("EC-6 green locked in Action 1 → green die not usable in Action 2", () => {
    const s = makeState({ players: ["p1", { id: "p2", sheet: makeSheet({ GREEN: five.GREEN }) }] });
    const a2 = allAction1(ok(rollWith(s, [1, 1, 3, 4, 5, 6])).state, { p2: mark1("GREEN") }).state;
    expect(a2.phase).toBe("ACTION_2");
    expectRejected(a2, (x) => submitAction2(x, "p1", mark2(0, "GREEN")), "E_DIE_NOT_IN_PLAY");
    expect(
      legalAction2Options(a2, "p1").some((o) => o.kind === "MARK" && o.color === "GREEN"),
    ).toBe(false);
  });

  it("EC-7 blue 9 in Action 1 then blue 6 in Action 2 is legal", () => {
    const r = playTurn(makeState(), [4, 5, 1, 1, 1, 2], { p1: mark1("BLUE") }, mark2(0, "BLUE"));
    const blue = p(r.state, "p1").sheet.rows.BLUE;
    expect(blue.marked[3]).toBe(true); // 9
    expect(blue.marked[6]).toBe(true); // 6
    expect(r.events.some((e) => e.type === "PENALTY")).toBe(false);
  });

  it("EC-8 blue 6 in Action 1 then blue 9 in Action 2 → LEFT_OF_RIGHTMOST", () => {
    const a2 = allAction1(ok(rollWith(makeState(), [3, 3, 1, 1, 1, 6])).state, {
      p1: mark1("BLUE"),
    }).state;
    expectRejected(
      a2,
      (x) => submitAction2(x, "p1", mark2(0, "BLUE")),
      "E_ILLEGAL_MARK",
      "LEFT_OF_RIGHTMOST",
    );
  });

  it("EC-9 active marks in Action 1 only → no penalty", () => {
    const r = playTurn(makeState(), [3, 4, 1, 1, 1, 1], { p1: mark1("RED") }, PASS);
    expect(types(r.events)).not.toContain("PENALTY");
    expect(p(r.state, "p1").sheet.penalties).toBe(0);
  });

  it("EC-10 active passes both actions → 1 penalty", () => {
    const r = playTurn(makeState(), [3, 4, 1, 1, 1, 1]);
    expect(r.events.filter((e) => e.type === "PENALTY")).toEqual([
      { type: "PENALTY", playerId: "p1", total: 1 },
    ]);
    expect(types(r.events).slice(-3)).toEqual(["ACTION2_PASSED", "PENALTY", "TURN_STARTED"]);
  });

  it("EC-11 active has no legal mark in either action → must pass; 1 penalty", () => {
    const sheet = makeSheet({ RED: [11], YELLOW: [11], GREEN: [3], BLUE: [3] });
    const s = makeState({ players: [{ id: "p1", sheet }, "p2"] });
    const r1 = ok(rollWith(s, [6, 6, 6, 6, 1, 1])).state;
    expect(legalAction1Options(r1, "p1")).toEqual([PASS]);
    const a2 = allAction1(r1).state;
    expect(legalAction2Options(a2, "p1")).toEqual([PASS]);
    const r = ok(submitAction2(a2, "p1", PASS));
    expect(p(r.state, "p1").sheet.penalties).toBe(1);
  });

  it("EC-12 passive player passes → no penalty", () => {
    const r = playTurn(makeState(), [3, 4, 1, 1, 1, 1], { p1: mark1("RED"), p2: PASS });
    expect(p(r.state, "p2").sheet.penalties).toBe(0);
    expect(types(r.events)).not.toContain("PENALTY");
  });

  it("EC-13 active player's 4th penalty ends the game at once", () => {
    const s = makeState({ players: [{ id: "p1", sheet: makeSheet({}, 3) }, "p2"] });
    const r = playTurn(s, [3, 4, 1, 1, 1, 1]);
    expect(r.state.phase).toBe("GAME_OVER");
    expect(r.state.endReason).toEqual({ kind: "PENALTIES", playerIds: ["p1"] });
    expect(types(r.events).slice(-2)).toEqual(["PENALTY", "GAME_ENDED"]);
    expect(r.events.at(-1)).toEqual({
      type: "GAME_ENDED",
      reason: { kind: "PENALTIES", playerIds: ["p1"] },
      scores: [
        { playerId: "p1", total: -20 },
        { playerId: "p2", total: 0 },
      ],
      winners: ["p2"],
    });
  });

  it("EC-14 one row locked; red and yellow lock in Action 1 → game over with 3 rows, no Action 2, no penalty", () => {
    const s = makeState({
      lockedColors: ["GREEN"],
      players: [
        { id: "p1", sheet: makeSheet({ RED: five.RED }) },
        { id: "p2", sheet: makeSheet({ YELLOW: five.YELLOW }) },
        { id: "p3", sheet: makeSheet({ GREEN: [...five.GREEN, 2] }) },
      ],
      turn: { activeSeat: 2 },
    });
    const r = playTurn(s, [6, 6, 1, 1, 1], { p1: mark1("RED"), p2: mark1("YELLOW") });
    expect(r.state.phase).toBe("GAME_OVER");
    expect(r.state.lockedColors).toEqual(["RED", "YELLOW", "GREEN"]);
    expect(r.state.endReason).toEqual({
      kind: "TWO_ROWS_LOCKED",
      lockedColors: ["RED", "YELLOW", "GREEN"],
    });
    expect(types(r.events)).not.toContain("PENALTY");
    expect(types(r.events)).not.toContain("ACTION2_PASSED");
    expectRejected(r.state, (x) => submitAction2(x, "p3", PASS), "E_GAME_OVER");
  });

  it("EC-15 second lock in Action 1 while the active player passed → game over, no penalty", () => {
    const s = makeState({
      lockedColors: ["BLUE"],
      players: [
        { id: "p1", sheet: makeSheet({ BLUE: [...five.BLUE, 2] }) },
        { id: "p2", sheet: makeSheet({ RED: five.RED }) },
      ],
    });
    const r = playTurn(s, [6, 6, 1, 1, 1], { p1: PASS, p2: mark1("RED") });
    expect(r.state.phase).toBe("GAME_OVER");
    expect(p(r.state, "p1").sheet.penalties).toBe(0);
    expect(types(r.events)).not.toContain("PENALTY");
    expect(types(r.events).at(-1)).toBe("GAME_ENDED");
  });

  it("EC-16 second lock in Action 2 → game over, no penalty", () => {
    const s = makeState({
      lockedColors: ["GREEN"],
      players: [
        { id: "p1", sheet: makeSheet({ RED: five.RED }) },
        { id: "p2", sheet: makeSheet({ GREEN: [...five.GREEN, 2] }) },
      ],
    });
    const r = playTurn(s, [5, 6, 6, 1, 1], {}, mark2(1, "RED"));
    expect(r.state.phase).toBe("GAME_OVER");
    expect(r.state.lockedColors).toEqual(["RED", "GREEN"]);
    expect(types(r.events).slice(-4)).toEqual([
      "MARKED",
      "ROW_LOCKED",
      "DIE_REMOVED",
      "GAME_ENDED",
    ]);
    expect(r.events.find((e) => e.type === "ROW_LOCKED")).toEqual({
      type: "ROW_LOCKED",
      color: "RED",
      lockedBy: ["p1"],
      action: 2,
    });
    expect(types(r.events)).not.toContain("PENALTY");
  });

  it("EC-17 equal white dice: both indices give the same option, both accepted", () => {
    const a2 = allAction1(ok(rollWith(makeState(), [3, 3, 2, 2, 2, 2])).state).state;
    const opts = legalAction2Options(a2, "p1");
    expect(opts).toEqual([
      PASS,
      { kind: "MARK", whiteDie: 0, color: "RED", number: 5 },
      { kind: "MARK", whiteDie: 0, color: "YELLOW", number: 5 },
      { kind: "MARK", whiteDie: 0, color: "GREEN", number: 5 },
      { kind: "MARK", whiteDie: 0, color: "BLUE", number: 5 },
    ]);
    const r = ok(submitAction2(a2, "p1", mark2(1, "RED")));
    expect(r.events[0]).toMatchObject({ type: "MARKED", whiteDie: 1, number: 5 });
  });

  it("EC-18 the same sum may be marked once in each of the 4 rows", () => {
    let s = makeState();
    for (const color of ["RED", "YELLOW", "GREEN", "BLUE"] as const) {
      s = playTurn(s, [3, 4, 1, 1, 1, 1], { p1: mark1(color) }).state;
    }
    for (const row of Object.values(p(s, "p1").sheet.rows)) expect(row.marked[5]).toBe(true);
  });

  it("EC-19 a locked row is closed for the player who locked it too", () => {
    const s = makeState({
      players: [{ id: "p1", sheet: makeSheet({ RED: five.RED }) }, { id: "p2" }],
    });
    const locked = playTurn(s, [6, 6, 1, 1, 1, 1], { p1: mark1("RED") }).state;
    expect(locked.lockedColors).toEqual(["RED"]);
    const r = ok(rollWith(locked, [3, 4, 1, 1, 1])).state;
    expectRejected(r, (x) => submitAction1(x, "p1", mark1("RED")), "E_ILLEGAL_MARK", "ROW_LOCKED");
    expectRejected(r, (x) => submitAction1(x, "p2", mark1("RED")), "E_ILLEGAL_MARK", "ROW_LOCKED");
    expect(boxStatus(p(r, "p2").sheet.rows.RED, 5, r.lockedColors)).toBe("CLOSED");
  });

  it("EC-20 an Action 1 decision cannot be changed → E_ALREADY_DECIDED", () => {
    const r = ok(rollWith(makeState(), [3, 4, 1, 1, 1, 1])).state;
    const a = ok(submitAction1(r, "p2", PASS)).state;
    expectRejected(a, (x) => submitAction1(x, "p2", mark1("RED")), "E_ALREADY_DECIDED");
    expectRejected(a, (x) => submitAction1(x, "p2", PASS), "E_ALREADY_DECIDED");
  });

  it("EC-21 only reachable numbers are gated lock numbers → must pass; penalty applies", () => {
    const sheet = makeSheet({ RED: [11], YELLOW: [11], BLUE: [3] });
    const s = makeState({
      lockedColors: ["GREEN"],
      players: [
        { id: "p1", sheet },
        { id: "p2", sheet: makeSheet({ GREEN: [...five.GREEN, 2] }) },
      ],
    });
    const r1 = ok(rollWith(s, [6, 6, 6, 6, 1])).state;
    expect(legalAction1Options(r1, "p1")).toEqual([PASS]);
    const a2 = allAction1(r1).state;
    expect(legalAction2Options(a2, "p1")).toEqual([PASS]);
    expectRejected(
      a2,
      (x) => submitAction2(x, "p1", mark2(0, "RED")),
      "E_ILLEGAL_MARK",
      "LOCK_REQUIRES_FIVE",
    );
    const r = ok(submitAction2(a2, "p1", PASS));
    expect(p(r.state, "p1").sheet.penalties).toBe(1);
  });

  it("EC-22 the lock box cannot be targeted directly; extra payload fields are ignored", () => {
    const r = ok(rollWith(makeState(), [3, 4, 1, 1, 1, 1])).state;
    expectRejected(
      r,
      (x) => submitAction1(x, "p1", { kind: "LOCK", color: "RED" } as never),
      "E_INVALID_COMMAND",
    );
    const sneaky = {
      kind: "MARK",
      color: "RED",
      number: 12,
      index: 10,
      lockCrossed: true,
    } as never;
    const a = ok(submitAction1(r, "p1", sneaky));
    expect(a.state.turn?.action1Decisions.p1).toEqual(mark1("RED"));
    const done = allAction1(a.state, {}, ["p2"]).state;
    const red = p(done, "p1").sheet.rows.RED;
    expect(red.marked[5]).toBe(true);
    expect(red.marked[10]).toBe(false);
    expect(red.lockCrossed).toBe(false);
    expectRejected(
      done,
      (x) => submitAction2(x, "p1", { kind: "LOCK", color: "RED" } as never),
      "E_INVALID_COMMAND",
    );
    expect(score(done, "p1").total).toBe(1);
  });
});

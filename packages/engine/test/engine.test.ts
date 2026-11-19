import { describe, expect, it } from "vitest";
import { ScriptedDice } from "../src/dice";
import { createGame, dispatch, roll, submitAction1, submitAction2 } from "../src/engine";
import { activePlayerId, isGameOver } from "../src/queries";
import { toJSON } from "../src/serialize";
import type { GameState } from "../src/types";
import { makeSheet, makeState } from "./helpers/builders";
import {
  activeId,
  allAction1,
  expectRejected,
  mark1,
  mark2,
  newGame,
  ok,
  PASS,
  playTurn,
  rollWith,
  types,
} from "./helpers/game";

const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, displayName: `P${i + 1}` }));
const noDice = () => new ScriptedDice([]);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

describe("#13 createGame (§5)", () => {
  it("rejects 1 and 6 players, accepts 2..5", () => {
    for (const n of [0, 1, 6]) {
      const r = createGame(players(n), { dice: noDice(), firstPlayer: "p1" });
      expect(r).toEqual({ ok: false, error: { code: "E_PLAYER_COUNT" } });
    }
    for (const n of [2, 3, 4, 5]) {
      const { state, events } = ok(createGame(players(n), { dice: noDice(), firstPlayer: "p1" }));
      expect(state.players.map((p) => p.seat)).toEqual([...Array(n).keys()]);
      expect(state.phase).toBe("AWAIT_ROLL");
      expect(state.turn).toMatchObject({ turnNumber: 1, activeSeat: 0, roll: null });
      expect(state.lockedColors).toEqual([]);
      expect(types(events)).toEqual(["GAME_CREATED", "FIRST_PLAYER_CHOSEN"]);
      expect(state.log).toEqual(events);
    }
  });

  it("rejects duplicate and empty ids", () => {
    const dup = [
      { id: "a", displayName: "A" },
      { id: "a", displayName: "B" },
    ];
    const empty = [
      { id: "", displayName: "A" },
      { id: "b", displayName: "B" },
    ];
    for (const ps of [dup, empty]) {
      expect(createGame(ps, { dice: noDice() })).toEqual({
        ok: false,
        error: { code: "E_DUPLICATE_PLAYER" },
      });
    }
  });

  it("rejects reserved / prototype ids and malformed players", () => {
    for (const id of ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty"]) {
      const r = createGame(
        [
          { id, displayName: "x" },
          { id: "b", displayName: "B" },
        ],
        { dice: noDice() },
      );
      expect(r).toEqual({ ok: false, error: { code: "E_INVALID_COMMAND" } });
    }
    const bad = [
      { id: 1, displayName: "x" },
      { id: "b", displayName: "B" },
    ] as never;
    expect(createGame(bad, { dice: noDice() })).toEqual({
      ok: false,
      error: { code: "E_INVALID_COMMAND" },
    });
    expect(createGame(null as never, { dice: noDice() })).toEqual({
      ok: false,
      error: { code: "E_INVALID_COMMAND" },
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("configured first player", () => {
    const { state, events } = ok(createGame(players(3), { dice: noDice(), firstPlayer: "p3" }));
    expect(state.turn?.activeSeat).toBe(2);
    expect(events[1]).toEqual({
      type: "FIRST_PLAYER_CHOSEN",
      seat: 2,
      method: "CONFIGURED",
      rounds: [],
    });
    expect(createGame(players(3), { dice: noDice(), firstPlayer: "zz" })).toEqual({
      ok: false,
      error: { code: "E_UNKNOWN_PLAYER" },
    });
  });

  it("accepts a played roll-off and rejects malformed ones (T-NEW-2)", () => {
    const dice = new ScriptedDice([]);
    const rounds = [
      [1, 6, 6],
      [2, 3, 6],
    ] as const;
    const { state, events } = ok(createGame(players(3), { dice, rollOffRounds: rounds }));
    expect(state.turn?.activeSeat).toBe(2);
    expect(events[1]).toMatchObject({ method: "ROLL_OFF", seat: 2, rounds });
    for (const bad of [
      [],
      [[1, 2, 3]],
      [
        [6, 1, 2],
        [2, 3, 6],
      ],
      [[1, 6, 6, 2]],
      [[1, 6, 6]],
      [[1, 2, 7]],
    ]) {
      const r = createGame(players(3), { dice, rollOffRounds: bad as never });
      expect(r.ok).toBe(false);
    }
  });

  it("simultaneous roll-off: rounds until exactly one 6, seat order inside a round (A-1)", () => {
    // Round 1: no 6. Round 2: two 6s. Round 3: only seat 2 rolls a 6.
    const dice = new ScriptedDice([1, 2, 3, 6, 6, 4, 5, 1, 6, 6]);
    const { state, events } = ok(createGame(players(3), { dice }));
    expect(state.turn?.activeSeat).toBe(2);
    expect(events[1]).toEqual({
      type: "FIRST_PLAYER_CHOSEN",
      seat: 2,
      method: "ROLL_OFF",
      rounds: [
        [1, 2, 3],
        [6, 6, 4],
        [5, 1, 6],
      ],
    });
    expect(dice.remaining).toBe(1);
  });

  it("roll-off gives up after 1,000 rounds", () => {
    const sixes = { rollDie: () => 6 as const };
    expect(() => createGame(players(2), { dice: sixes })).toThrow(/roll-off/);
  });

  it("copies player input (no aliasing)", () => {
    const input = players(2);
    const { state } = ok(createGame(input, { dice: noDice(), firstPlayer: "p1" }));
    input[0] = { id: "zz", displayName: "zz" };
    expect(state.players[0]?.id).toBe("p1");
  });
});

describe("#14 roll (§7.1)", () => {
  it("rolls white, white, then colors in canonical order", () => {
    const { state, events } = ok(rollWith(newGame(), [1, 2, 3, 4, 5, 6]));
    expect(state.phase).toBe("ACTION_1");
    expect(state.turn?.roll).toEqual({
      white: [1, 2],
      colored: { RED: 3, YELLOW: 4, GREEN: 5, BLUE: 6 },
    });
    expect(events).toEqual([
      {
        type: "DICE_ROLLED",
        white: [1, 2],
        colored: { RED: 3, YELLOW: 4, GREEN: 5, BLUE: 6 },
        whiteSum: 3,
      },
    ]);
  });

  it("rejects wrong phase, passive player, unknown player; state unchanged", () => {
    const s = newGame();
    expectRejected(s, (x) => roll(x, "p2", noDice()), "E_NOT_ACTIVE_PLAYER");
    expectRejected(s, (x) => roll(x, "nobody", noDice()), "E_UNKNOWN_PLAYER");
    const rolled = ok(rollWith(s, [1, 1, 1, 1, 1, 1])).state;
    expectRejected(rolled, (x) => roll(x, "p1", noDice()), "E_WRONG_PHASE");
    expectRejected(rolled, (x) => submitAction2(x, "p1", PASS), "E_WRONG_PHASE");
  });

  it("does not mutate a frozen input state", () => {
    const s = deepFreeze(newGame());
    const before = toJSON(s);
    const r = ok(rollWith(s, [1, 1, 1, 1, 1, 1]));
    expect(toJSON(s)).toBe(before);
    expect(r.state).not.toBe(s);
  });
});

describe("#15 removed dice", () => {
  it("after a lock, DICE_ROLLED has no die of that color", () => {
    const s = makeState({
      players: [{ id: "p1", sheet: makeSheet({ RED: [2, 3, 4, 5, 6] }) }, "p2"],
    });
    const t1 = playTurn(s, [6, 6, 1, 1, 1, 1], { p1: mark1("RED") });
    expect(t1.state.lockedColors).toEqual(["RED"]);
    expect(t1.state.phase).toBe("AWAIT_ROLL");
    const r = ok(rollWith(t1.state, [1, 2, 3, 4, 5]));
    expect(r.events[0]).toMatchObject({ colored: { YELLOW: 3, GREEN: 4, BLUE: 5 } });
    expect(r.state.turn?.roll?.colored).not.toHaveProperty("RED");
  });
});

describe("#16 Action 1 (§7.2)", () => {
  it("every mark uses the white sum; one decision per player; decisions hidden until reveal", () => {
    const s = ok(rollWith(newGame(["p1", "p2", "p3"]), [3, 4, 6, 6, 6, 6])).state;
    const a = ok(submitAction1(s, "p2", mark1("BLUE")));
    expect(a.events).toEqual([{ type: "ACTION1_SUBMITTED", playerId: "p2" }]);
    expect(a.state.players[1]?.sheet).toEqual(makeSheet());
    expectRejected(a.state, (x) => submitAction1(x, "p2", mark1("RED")), "E_ALREADY_DECIDED");
    const done = allAction1(a.state, { p1: mark1("RED") }, ["p1", "p3"]);
    const marks = done.events.filter((e) => e.type === "MARKED");
    expect(marks).toEqual([
      {
        type: "MARKED",
        playerId: "p1",
        action: 1,
        color: "RED",
        number: 7,
        index: 5,
        lockedNow: false,
      },
      {
        type: "MARKED",
        playerId: "p2",
        action: 1,
        color: "BLUE",
        number: 7,
        index: 5,
        lockedNow: false,
      },
    ]);
    expect(done.state.phase).toBe("ACTION_2");
    expect(done.state.turn?.activeMarkedThisTurn).toBe(true);
  });

  it("rejects unknown players, malformed payloads and illegal marks; state unchanged", () => {
    const s = makeState({ players: [{ id: "p1", sheet: makeSheet({ RED: [8] }) }, "p2"] });
    const r = ok(rollWith(s, [3, 4, 1, 1, 1, 1])).state;
    expectRejected(r, (x) => submitAction1(x, "zz", PASS), "E_UNKNOWN_PLAYER");
    expectRejected(r, (x) => submitAction1(x, "__proto__", PASS), "E_UNKNOWN_PLAYER");
    expectRejected(
      r,
      (x) => submitAction1(x, "p1", { kind: "MARK", color: "PINK" } as never),
      "E_INVALID_COMMAND",
    );
    expectRejected(r, (x) => submitAction1(x, "p1", null as never), "E_INVALID_COMMAND");
    expectRejected(
      r,
      (x) => submitAction1(x, "p1", mark1("RED")),
      "E_ILLEGAL_MARK",
      "LEFT_OF_RIGHTMOST",
    );
  });
});

describe("#17 Action 1 resolution is order-independent", () => {
  function permutations<T>(xs: T[]): T[][] {
    if (xs.length <= 1) return [xs];
    return xs.flatMap((x, i) =>
      permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
    );
  }

  it("all 24 submission orders give identical state and post-reveal events", () => {
    const five = [2, 3, 4, 5, 6];
    const s = makeState({
      players: [
        { id: "p1", sheet: makeSheet({ RED: five }) },
        { id: "p2", sheet: makeSheet({ YELLOW: five }) },
        { id: "p3", sheet: makeSheet({ RED: five }) },
        { id: "p4", sheet: makeSheet({ GREEN: [4] }) },
      ],
    });
    const rolled = ok(rollWith(s, [6, 6, 1, 1, 1, 1])).state;
    const dec = { p1: mark1("RED"), p2: mark1("YELLOW"), p3: mark1("RED"), p4: mark1("BLUE") };
    const results = permutations(["p1", "p2", "p3", "p4"]).map((order) => {
      const { state, events } = allAction1(rolled, dec, order);
      const tail = events.slice(events.findIndex((e) => e.type === "ACTION1_REVEALED"));
      return JSON.stringify({
        players: state.players,
        locked: state.lockedColors,
        phase: state.phase,
        tail,
      });
    });
    expect(new Set(results).size).toBe(1);
  });

  it("event order inside resolveAction1 matches §11", () => {
    const five = [2, 3, 4, 5, 6];
    const s = makeState({
      players: [
        { id: "p1", sheet: makeSheet({ RED: five }) },
        { id: "p2", sheet: makeSheet({ YELLOW: five }) },
        { id: "p3", sheet: makeSheet({ RED: five }) },
      ],
    });
    const rolled = ok(rollWith(s, [6, 6, 1, 1, 1, 1])).state;
    const { events } = allAction1(
      rolled,
      { p1: mark1("RED"), p2: mark1("YELLOW"), p3: mark1("RED") },
      ["p3", "p2", "p1"],
    );
    const last = ok(
      submitAction1(
        allAction1(rolled, { p1: mark1("RED"), p2: mark1("YELLOW") }, ["p1", "p2"]).state,
        "p3",
        mark1("RED"),
      ),
    );
    expect(types(last.events)).toEqual([
      "ACTION1_SUBMITTED",
      "ACTION1_REVEALED",
      "MARKED",
      "MARKED",
      "MARKED",
      "ROW_LOCKED",
      "DIE_REMOVED",
      "ROW_LOCKED",
      "DIE_REMOVED",
      "GAME_ENDED",
    ]);
    const revealed = events.find((e) => e.type === "ACTION1_REVEALED");
    expect(revealed).toEqual({
      type: "ACTION1_REVEALED",
      decisions: [
        { playerId: "p1", decision: mark1("RED") },
        { playerId: "p2", decision: mark1("YELLOW") },
        { playerId: "p3", decision: mark1("RED") },
      ],
    });
    expect(last.events.filter((e) => e.type === "MARKED").map((e) => e.playerId)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
    expect(last.events.filter((e) => e.type === "ROW_LOCKED")).toEqual([
      { type: "ROW_LOCKED", color: "RED", lockedBy: ["p1", "p3"], action: 1 },
      { type: "ROW_LOCKED", color: "YELLOW", lockedBy: ["p2"], action: 1 },
    ]);
    const end = last.events.at(-1);
    expect(end).toMatchObject({
      type: "GAME_ENDED",
      reason: { kind: "TWO_ROWS_LOCKED", lockedColors: ["RED", "YELLOW"] },
    });
    expect(last.state.endReason).toEqual({
      kind: "TWO_ROWS_LOCKED",
      lockedColors: ["RED", "YELLOW"],
    });
  });
});

describe("#19 / #20 Action 2 (§7.4)", () => {
  function inAction2(): GameState {
    return allAction1(ok(rollWith(newGame(), [1, 2, 3, 4, 5, 6])).state).state;
  }

  it("passive player → E_NOT_ACTIVE_PLAYER", () => {
    expectRejected(inAction2(), (x) => submitAction2(x, "p2", PASS), "E_NOT_ACTIVE_PLAYER");
  });

  it("removed die → E_DIE_NOT_IN_PLAY; bad die / malformed → E_BAD_DIE / E_INVALID_COMMAND", () => {
    const s = makeState({
      players: [{ id: "p1" }, { id: "p2", sheet: makeSheet({ BLUE: [12, 11, 10, 9, 8] }) }],
    });
    const a2 = allAction1(ok(rollWith(s, [1, 1, 3, 4, 5, 6])).state, { p2: mark1("BLUE") }).state;
    expect(a2.lockedColors).toEqual(["BLUE"]);
    expectRejected(a2, (x) => submitAction2(x, "p1", mark2(0, "BLUE")), "E_DIE_NOT_IN_PLAY");
    expectRejected(
      a2,
      (x) => submitAction2(x, "p1", { kind: "MARK", whiteDie: 2, color: "RED" } as never),
      "E_BAD_DIE",
    );
    expectRejected(
      a2,
      (x) => submitAction2(x, "p1", { kind: "MARK", whiteDie: 0, color: "X" } as never),
      "E_BAD_DIE",
    );
    expectRejected(
      a2,
      (x) => submitAction2(x, "p1", { kind: "NOPE" } as never),
      "E_INVALID_COMMAND",
    );
  });

  it("legal mark is applied and logged with whiteDie", () => {
    const r = ok(submitAction2(inAction2(), "p1", mark2(1, "RED")));
    expect(r.events[0]).toEqual({
      type: "MARKED",
      playerId: "p1",
      action: 2,
      color: "RED",
      number: 5,
      index: 3,
      whiteDie: 1,
      lockedNow: false,
    });
    expect(types(r.events)).toEqual(["MARKED", "TURN_STARTED"]);
  });
});

describe("#24 commands after GAME_OVER", () => {
  it("every command → E_GAME_OVER, state unchanged", () => {
    const s = makeState({ players: [{ id: "p1", sheet: makeSheet({}, 3) }, "p2"] });
    const over = playTurn(s, [1, 1, 1, 1, 1, 1]).state;
    expect(isGameOver(over)).toBe(true);
    expectRejected(over, (x) => roll(x, "p1", noDice()), "E_GAME_OVER");
    expectRejected(over, (x) => submitAction1(x, "p2", PASS), "E_GAME_OVER");
    expectRejected(over, (x) => submitAction2(x, "p1", PASS), "E_GAME_OVER");
    expectRejected(
      over,
      (x) => dispatch(x, { type: "ROLL", playerId: "p1" }, noDice()),
      "E_GAME_OVER",
    );
    expectRejected(over, (x) => dispatch(x, { type: "WAT" } as never, noDice()), "E_GAME_OVER");
  });
});

describe("#25 turn order", () => {
  it("wraps from seat N-1 to 0", () => {
    let s = newGame(["a", "b", "c"]);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(activeId(s));
      const t = playTurn(s, [1, 1, 1, 1, 1, 1]);
      expect(t.events.at(-1)).toEqual({
        type: "TURN_STARTED",
        turnNumber: i + 2,
        activeSeat: (i + 1) % 3,
      });
      s = t.state;
    }
    expect(seen).toEqual(["a", "b", "c", "a"]);
    expect(activePlayerId(s)).toBe("b");
  });
});

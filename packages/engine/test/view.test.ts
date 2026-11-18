import { describe, expect, it } from "vitest";
import { submitAction1 } from "../src/engine";
import type { Action1Decision, Color, GameState } from "../src/types";
import { type EngineViewPlayer, VIEW_EVENT_COUNT, viewFor } from "../src/view";
import { makeState } from "./helpers/builders";
import { allAction1, mark1, newGame, ok, PASS, playTurn, rollWith } from "./helpers/game";

const IDS = ["seat-0", "seat-1", "seat-2", "seat-3", "seat-4"];
// Seats 1..4 choose different colors; seat 0 has not submitted yet.
const CHOICES: Record<string, Color> = {
  "seat-1": "RED",
  "seat-2": "YELLOW",
  "seat-3": "GREEN",
  "seat-4": "BLUE",
};

/** Non-null access for indexed lookups (noUncheckedIndexedAccess). */
function must<T>(x: T | undefined): T {
  if (x === undefined) throw new Error("missing");
  return x;
}

function sheetOf(p: {
  sheet: NonNullable<unknown> | null;
}): NonNullable<EngineViewPlayer["sheet"]> {
  if (p.sheet === null) throw new Error("sheet hidden");
  return p.sheet as NonNullable<EngineViewPlayer["sheet"]>;
}

const decisionText = (color: Color) => `"kind":"MARK","color":"${color}"`;

/** 5 players in ACTION_1, white sum 7 (markable everywhere), seats 1-4 decided. */
function hiddenState(choices: Record<string, Action1Decision> = markChoices()): GameState {
  let s = ok(rollWith(newGame(IDS), [3, 4, 1, 2, 3, 4])).state;
  for (const [id, decision] of Object.entries(choices)) {
    s = ok(submitAction1(s, id, decision)).state;
  }
  expect(s.phase).toBe("ACTION_1");
  return s;
}

function markChoices(): Record<string, Action1Decision> {
  return Object.fromEntries(Object.entries(CHOICES).map(([id, c]) => [id, mark1(c)]));
}

/**
 * Serialized view minus `you.legalAction1`: an undecided viewer's own options
 * legitimately list every markable color, which says nothing about others.
 */
function viewJsonWithoutOwnOptions(s: GameState, v: number): string {
  const view = viewFor(s, v);
  return JSON.stringify({ ...view, you: { ...view.you, legalAction1: undefined } });
}

describe("viewFor privacy (I-3)", () => {
  it("never leaks another seat's pending Action 1 decision", () => {
    const s = hiddenState();
    for (let v = 0; v < 5; v++) {
      const full = JSON.stringify(viewFor(s, v));
      expect(full).not.toContain("action1Decisions");
      expect(full).not.toContain("ACTION1_REVEALED");
      const json = viewJsonWithoutOwnOptions(s, v);
      for (const [id, color] of Object.entries(CHOICES)) {
        if (id === `seat-${v}`) continue;
        expect(json, `viewer ${v} sees ${id}`).not.toContain(decisionText(color));
      }
    }
  });

  it("is identical for a viewer whatever the other seats chose", () => {
    const a = hiddenState();
    // Same seats submitted, different hidden choices (rotated colors, one PASS).
    const b = hiddenState({
      "seat-1": mark1("BLUE"),
      "seat-2": PASS,
      "seat-3": mark1("YELLOW"),
      "seat-4": mark1("RED"),
    });
    // Seat 0 is the only viewer whose own decision is the same in both states.
    expect(JSON.stringify(viewFor(a, 0))).toBe(JSON.stringify(viewFor(b, 0)));
    for (let v = 1; v < 5; v++) {
      const va = viewFor(a, v);
      const vb = viewFor(b, v);
      // Everything except the viewer's own decision is identical.
      expect({ ...va, you: { ...va.you, action1Decision: null } }).toEqual({
        ...vb,
        you: { ...vb.you, action1Decision: null },
      });
    }
  });

  it("shows only your own decision and booleans for others", () => {
    const s = hiddenState();
    const v3 = viewFor(s, 3);
    expect(v3.you.action1Decision).toEqual({ kind: "MARK", color: "GREEN" });
    expect(v3.you.legalAction1).toEqual([]);
    expect(v3.game.players.map((p) => p.action1Submitted)).toEqual([false, true, true, true, true]);
    const v0 = viewFor(s, 0);
    expect(v0.you.action1Decision).toBeNull();
    expect(v0.you.legalAction1).toEqual([
      PASS,
      ...(["RED", "YELLOW", "GREEN", "BLUE"] as const).map((c) => ({ kind: "MARK", color: c })),
    ]);
  });

  it("reveals every decision to everyone after ACTION1_REVEALED", () => {
    const s = ok(submitAction1(hiddenState(), "seat-0", PASS)).state;
    expect(s.phase).toBe("ACTION_2");
    for (let v = 0; v < 5; v++) {
      const view = viewFor(s, v);
      const json = JSON.stringify(view);
      for (const color of Object.values(CHOICES)) expect(json).toContain(decisionText(color));
      expect(json).not.toContain("action1Decisions");
      expect(view.you.action1Decision).toBeNull();
      expect(view.game.players.every((p) => !p.action1Submitted)).toBe(true);
      // Opponent sheets are hidden (J1); only the viewer's own card shows the mark.
      if (v >= 1) {
        expect(
          sheetOf(must(view.game.players[v])).rows[must(CHOICES[`seat-${v}`])]?.marked,
        ).toContain(true);
      }
    }
  });
});

describe("viewFor gating", () => {
  it("AWAIT_ROLL: only the active seat can roll", () => {
    const s = newGame(["seat-0", "seat-1"]);
    expect(s.phase).toBe("AWAIT_ROLL");
    const a = viewFor(s, 0).you;
    const b = viewFor(s, 1).you;
    expect(a.canRoll).toBe(true);
    expect(b.canRoll).toBe(false);
    for (const y of [a, b]) {
      expect(y.legalAction1).toEqual([]);
      expect(y.legalAction2).toEqual([]);
    }
    expect(viewFor(s, 0).game.roll).toBeNull();
  });

  it("ACTION_1: legalAction1 for undecided seats only, nobody rolls or acts 2", () => {
    const rolled = ok(rollWith(newGame(["seat-0", "seat-1"]), [3, 4, 1, 2, 3, 4])).state;
    const s = ok(submitAction1(rolled, "seat-1", PASS)).state;
    const a = viewFor(s, 0);
    expect(a.you.legalAction1.length).toBeGreaterThan(0);
    expect(viewFor(s, 1).you.legalAction1).toEqual([]);
    expect(viewFor(s, 1).you.action1Decision).toEqual(PASS);
    for (const v of [0, 1]) {
      expect(viewFor(s, v).you.canRoll).toBe(false);
      expect(viewFor(s, v).you.legalAction2).toEqual([]);
    }
    expect(a.game.roll).toEqual({
      white: [3, 4],
      colored: { RED: 1, YELLOW: 2, GREEN: 3, BLUE: 4 },
      whiteSum: 7,
    });
  });

  it("ACTION_2: legalAction2 for the active seat only", () => {
    const rolled = ok(rollWith(newGame(["seat-0", "seat-1"]), [3, 4, 1, 2, 3, 4])).state;
    const s = allAction1(rolled).state;
    expect(s.phase).toBe("ACTION_2");
    const a = viewFor(s, 0).you;
    expect(a.legalAction2[0]).toEqual(PASS);
    expect(a.legalAction2).toContainEqual({ kind: "MARK", whiteDie: 0, color: "RED", number: 4 });
    expect(viewFor(s, 1).you.legalAction2).toEqual([]);
    for (const v of [0, 1]) {
      expect(viewFor(s, v).you.canRoll).toBe(false);
      expect(viewFor(s, v).you.legalAction1).toEqual([]);
    }
  });

  it("winners/endReason only at GAME_OVER", () => {
    let s = newGame(["seat-0", "seat-1"]);
    expect(viewFor(s, 0).game.winners).toBeNull();
    expect(viewFor(s, 0).game.endReason).toBeNull();
    // Active player passes Action 2 with no Action 1 mark: penalty each turn.
    let guard = 0;
    while (s.phase !== "GAME_OVER" && guard++ < 50) {
      s = playTurn(s, [6, 6, 6, 6, 6, 6]).state;
    }
    expect(s.phase).toBe("GAME_OVER");
    const g = viewFor(s, 1).game;
    expect(g.endReason?.kind).toBe("PENALTIES");
    expect(g.winners).not.toBeNull();
    expect(viewFor(s, 1).you.canRoll).toBe(false);
  });

  it("throws for an unknown seat", () => {
    expect(() => viewFor(newGame(["seat-0", "seat-1"]), 2)).toThrow(RangeError);
  });
});

describe("viewFor shape", () => {
  it("contains only allow-listed keys and no internal state", () => {
    const s = hiddenState();
    // Inject internal fields the view must never copy.
    const tainted = s as GameState & Record<string, unknown>;
    tainted.dice = { secret: "DICE_SOURCE" };
    (tainted.turn as unknown as Record<string, unknown>).internal = "TURN_SECRET";
    (tainted.players[0] as unknown as Record<string, unknown>).token = "PLAYER_SECRET";
    const view = viewFor(tainted, 0);
    expect(Object.keys(view).sort()).toEqual(["game", "you"]);
    expect(Object.keys(view.game).sort()).toEqual(
      ["endReason", "events", "lockedColors", "phase", "players", "roll", "turn", "winners"].sort(),
    );
    expect(Object.keys(view.you).sort()).toEqual(
      ["action1Decision", "canRoll", "legalAction1", "legalAction2", "seat"].sort(),
    );
    expect(Object.keys(must(view.game.players[0])).sort()).toEqual(
      ["action1Submitted", "score", "seat", "sheet"].sort(),
    );
    expect(Object.keys(sheetOf(must(view.game.players[0])).rows.RED).sort()).toEqual([
      "lockCrossed",
      "marked",
    ]);
    expect(Object.keys(view.game.turn ?? {}).sort()).toEqual(["activeSeat", "number"]);
    const json = JSON.stringify(view);
    for (const secret of ["DICE_SOURCE", "TURN_SECRET", "PLAYER_SECRET", 'displayName":"x']) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toContain("activeMarkedThisTurn");
    expect(json).not.toContain("rollDie");
  });

  it("copies events explicitly and keeps only the last 30", () => {
    let s = newGame(["seat-0", "seat-1"]);
    for (let i = 0; i < 6; i++) s = playTurn(s, [1, 1, 1, 1, 1, 1], {}, PASS).state;
    expect(s.log.length).toBeGreaterThan(VIEW_EVENT_COUNT);
    // Taint a log event with an extra field.
    const last = s.log[s.log.length - 1] as unknown as Record<string, unknown>;
    last.hidden = "EVENT_SECRET";
    const events = viewFor(s, 0).game.events;
    expect(events).toHaveLength(VIEW_EVENT_COUNT);
    expect(events.map((e) => e.type)).toEqual(s.log.slice(-VIEW_EVENT_COUNT).map((e) => e.type));
    expect(JSON.stringify(events)).not.toContain("EVENT_SECRET");
  });

  it("computes scores and is a detached copy", () => {
    const s = makeState({ players: ["seat-0", "seat-1"] });
    must(s.players[0]).sheet.rows.RED.marked[0] = true;
    must(s.players[0]).sheet.rows.RED.marked[1] = true;
    must(s.players[0]).sheet.penalties = 1;
    const view = viewFor(s, 0); // own card (opponents' are redacted)
    expect(must(view.game.players[0]).score).toEqual({
      rows: { RED: 3, YELLOW: 0, GREEN: 0, BLUE: 0 },
      penalties: -5,
      total: -2,
    });
    sheetOf(must(view.game.players[0])).rows.RED.marked[5] = true;
    expect(must(s.players[0]).sheet.rows.RED.marked[5]).toBe(false);
  });

  it("stays private for an undecided viewer as decisions arrive", () => {
    const decisions: Action1Decision[] = [mark1("BLUE"), PASS, mark1("RED")];
    const base = ok(rollWith(newGame(IDS.slice(0, 3)), [3, 4, 1, 2, 3, 4])).state;
    let s = base;
    for (const seat of [2, 0]) {
      s = ok(submitAction1(s, `seat-${seat}`, must(decisions[seat]))).state;
      const json1 = viewJsonWithoutOwnOptions(s, 1);
      expect(json1).not.toContain("action1Decisions");
      expect(json1).not.toContain(decisionText("BLUE"));
      expect(json1).not.toContain(decisionText("RED"));
    }
  });
});

describe("viewFor hidden opponent sheets (J1)", () => {
  function over(): GameState {
    let s = newGame(["seat-0", "seat-1"]);
    for (let i = 0; i < 40 && s.phase !== "GAME_OVER"; i++)
      s = playTurn(s, [1, 1, 1, 1, 1, 1]).state;
    return s;
  }

  it("redacts other seats' sheet and score rows in every non-GAME_OVER phase", () => {
    const states = [
      newGame(IDS),
      hiddenState(),
      ok(submitAction1(hiddenState(), "seat-0", PASS)).state,
    ];
    expect(states.map((s) => s.phase)).toEqual(["AWAIT_ROLL", "ACTION_1", "ACTION_2"]);
    for (const s of states) {
      for (let v = 0; v < 5; v++) {
        for (const p of viewFor(s, v).game.players) {
          if (p.seat === v) {
            expect(p.sheet).not.toBeNull();
            expect(p.score.rows).not.toBeNull();
          } else {
            expect(p.sheet).toBeNull();
            expect(p.score.rows).toBeNull();
            expect(typeof p.score.total).toBe("number");
            expect(typeof p.score.penalties).toBe("number");
          }
        }
      }
    }
  });

  it("keeps public total and penalties for opponents", () => {
    const s = playTurn(newGame(["seat-0", "seat-1"]), [1, 1, 1, 1, 1, 1]).state;
    const opp = must(viewFor(s, 1).game.players[0]);
    expect(opp.sheet).toBeNull();
    expect(opp.score.penalties).toBe(-5);
    expect(opp.score.total).toBe(-5);
  });

  it("reveals every card to everyone at GAME_OVER", () => {
    const s = over();
    expect(s.phase).toBe("GAME_OVER");
    for (let v = 0; v < 2; v++) {
      for (const p of viewFor(s, v).game.players) {
        expect(p.sheet).not.toBeNull();
        expect(p.score.rows).not.toBeNull();
      }
    }
  });

  it("hides opponents again in a fresh game (rematch reset)", () => {
    expect(over().phase).toBe("GAME_OVER");
    const fresh = newGame(["seat-0", "seat-1"]);
    expect(must(viewFor(fresh, 0).game.players[1]).sheet).toBeNull();
  });
});

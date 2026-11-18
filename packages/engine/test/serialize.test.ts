import { describe, expect, it } from "vitest";
import { fromJSON, toJSON } from "../src/serialize";
import { makeState } from "./helpers/builders";

// biome-ignore lint/suspicious/noExplicitAny: test mutates arbitrary JSON
type Obj = any;

const base = () => JSON.parse(toJSON(makeState())) as Obj;
const bad = (mutate: (s: Obj) => void) => {
  const s = base();
  mutate(s);
  return () => fromJSON(JSON.stringify(s));
};

describe("fromJSON structural validation", () => {
  it("round-trips byte-equal", () => {
    const t = toJSON(makeState());
    expect(toJSON(fromJSON(t))).toBe(t);
  });

  it.each([
    [
      "no players",
      (s) => {
        s.players = [];
      },
    ],
    [
      "player seat != index",
      (s) => {
        s.players[0].seat = 3;
      },
    ],
    [
      "player without name",
      (s) => {
        delete s.players[0].displayName;
      },
    ],
    [
      "row missing",
      (s) => {
        delete s.players[0].sheet.rows.RED;
      },
    ],
    [
      "row color mismatch",
      (s) => {
        s.players[0].sheet.rows.RED.color = "BLUE";
      },
    ],
    [
      "marked too short",
      (s) => {
        s.players[0].sheet.rows.RED.marked.pop();
      },
    ],
    [
      "marked non-boolean",
      (s) => {
        s.players[0].sheet.rows.RED.marked[0] = 1;
      },
    ],
    [
      "lockCrossed missing",
      (s) => {
        delete s.players[0].sheet.rows.GREEN.lockCrossed;
      },
    ],
    [
      "penalties out of range",
      (s) => {
        s.players[0].sheet.penalties = 5;
      },
    ],
    [
      "lockedColors unknown color",
      (s) => {
        s.lockedColors = ["PURPLE"];
      },
    ],
    [
      "lockedColors duplicate",
      (s) => {
        s.lockedColors = ["RED", "RED"];
      },
    ],
    [
      "phase invalid",
      (s) => {
        s.phase = "NOPE";
      },
    ],
    [
      "activeSeat out of range",
      (s) => {
        s.turn = { activeSeat: 99 };
      },
    ],
    [
      "activeSeat negative",
      (s) => {
        s.turn = { activeSeat: -1 };
      },
    ],
  ] as [string, (s: Obj) => void][])("rejects %s with a clear error", (_n, m) => {
    expect(bad(m)).toThrow(/invalid GameState JSON: /);
  });
});

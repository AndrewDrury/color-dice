import { describe, expect, it } from "vitest";
import { createGame, dispatch, rollOffLeaders } from "../src/engine";
import type { Command, GameEvent, GameState } from "../src/index";
import { toJSON } from "../src/serialize";
import { mulberry32, randomLegalCommand, SeededDice } from "./helpers/randomPlayer";

function play(n: number, seed: number, script?: Command[]) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, displayName: `P${i}` }));
  const dice = new SeededDice(seed);
  const created = createGame(players, { dice });
  if (!created.ok) throw new Error("createGame failed");
  let state: GameState = created.state;
  const events: GameEvent[] = [...state.log];
  const cmds: Command[] = [];
  const rng = mulberry32(seed ^ 0x1234567);
  for (let i = 0; ; i++) {
    const cmd = script ? script[i] : randomLegalCommand(state, rng);
    if (!cmd) break;
    cmds.push(cmd);
    const r = dispatch(state, cmd, dice);
    if (!r.ok) throw new Error(`rejected: ${r.error.code}`);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events, cmds };
}

describe("determinism", () => {
  for (const n of [2, 3, 4, 5]) {
    it(`same seed + same command log gives byte-equal results (${n} players)`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const a = play(n, seed);
        const b = play(n, seed, a.cmds);
        expect(a.state.phase).toBe("GAME_OVER");
        expect(toJSON(b.state)).toBe(toJSON(a.state));
        expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
        expect(JSON.stringify(b.state.log)).toBe(JSON.stringify(a.state.log));
      }
    });
  }

  it("roll-off: same seed gives same rounds; winner is the unique highest of the last round (A-2)", () => {
    for (const n of [2, 3, 4, 5]) {
      for (let seed = 1; seed <= 200; seed++) {
        const players = Array.from({ length: n }, (_, i) => ({
          id: `p${i}`,
          displayName: `P${i}`,
        }));
        const a = createGame(players, { dice: new SeededDice(seed) });
        const b = createGame(players, { dice: new SeededDice(seed) });
        if (!a.ok || !b.ok) throw new Error("createGame failed");
        const ev = a.events[1];
        if (ev?.type !== "FIRST_PLAYER_CHOSEN") throw new Error("missing FIRST_PLAYER_CHOSEN");
        expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
        expect(ev.method).toBe("ROLL_OFF");
        for (const r of ev.rounds) expect(r).toHaveLength(n);
        let eligible = Array.from({ length: n }, (_, i) => i);
        ev.rounds.forEach((r, i) => {
          expect(r.map((f, seat) => (f === 0 ? -1 : seat)).filter((x) => x >= 0)).toEqual(eligible);
          eligible = rollOffLeaders(r);
          expect(eligible.length > 1).toBe(i < ev.rounds.length - 1);
        });
        expect(eligible).toEqual([ev.seat]);
        expect(a.state.turn?.activeSeat).toBe(ev.seat);
      }
    }
  });

  it("different seeds give different games", () => {
    expect(toJSON(play(3, 1).state)).not.toBe(toJSON(play(3, 2).state));
  });
});

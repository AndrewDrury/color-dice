import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createGame, dispatch } from "../src/engine";
import type { GameState } from "../src/index";
import { toJSON } from "../src/serialize";
import { assertInvariants } from "./helpers/invariants";
import {
  mulberry32,
  randomIllegalCommand,
  randomLegalCommand,
  SeededDice,
} from "./helpers/randomPlayer";

/** Total games per push (split across SHARDS files so vitest runs them in parallel). */
export const SHARDS = 8;
const TOTAL = Number(process.env.FUZZ_GAMES ?? 2000);
// Optional: shift every shard's fast-check seed (nightly variety).
const SEED_BASE = 0x5eed0000 + Number(process.env.FUZZ_SEED ?? 0) * 1000;

function start(n: number, seed: number): GameState {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, displayName: `P${i}` }));
  const r = createGame(players, { dice: new SeededDice(seed) });
  if (!r.ok) throw new Error(`createGame failed: ${r.error.code}`);
  return r.state;
}

const seeds = fc.tuple(fc.integer({ min: 2, max: 5 }), fc.integer({ min: 0, max: 0xffffffff }));

/**
 * One shard of the fuzz suite: `ceil(TOTAL / SHARDS)` legal games and a quarter as many
 * illegal-command games, with a fixed, shard-distinct fast-check seed (reproducible).
 */
export function fuzzShard(shard: number): void {
  const legalRuns = Math.ceil(TOTAL / SHARDS);
  const illegalRuns = Math.max(1, Math.ceil(TOTAL / 4 / SHARDS));
  const seed = SEED_BASE + shard;

  describe(`fuzz shard ${shard}`, () => {
    it("random legal games keep all invariants and terminate", () => {
      fc.assert(
        fc.property(seeds, ([n, s]) => {
          const dice = new SeededDice(s);
          const rng = mulberry32(s ^ 0x9e3779b9);
          let state = start(n, s + 1);
          assertInvariants(null, state);
          let rolls = 0;
          const bound = n * 48;
          for (;;) {
            const cmd = randomLegalCommand(state, rng);
            if (!cmd) break;
            if (cmd.type === "ROLL" && ++rolls > bound) throw new Error(`exceeded ${bound} turns`);
            const r = dispatch(state, cmd, dice);
            if (!r.ok)
              throw new Error(`legal command rejected: ${JSON.stringify(cmd)} ${r.error.code}`);
            assertInvariants(state, r.state);
            state = r.state;
          }
          expect(state.phase).toBe("GAME_OVER");
          expect(state.lockedColors.length).toBeLessThanOrEqual(3);
          expect(state.endReason).not.toBeNull();
        }),
        { numRuns: legalRuns, seed },
      );
    }, 3_600_000);

    it("illegal commands are rejected and leave the state untouched", () => {
      fc.assert(
        fc.property(seeds, ([n, s]) => {
          const dice = new SeededDice(s);
          const noDice = {
            rollDie: () => {
              throw new Error("dice consumed by rejected command");
            },
          };
          const rng = mulberry32(s ^ 0x85ebca6b);
          let state = start(n, s + 1);
          for (;;) {
            const before = toJSON(state);
            for (let k = 0; k < 2; k++) {
              const bad = randomIllegalCommand(state, rng);
              const r = dispatch(state, bad, noDice);
              if (r.ok) throw new Error(`illegal command accepted: ${JSON.stringify(bad)}`);
              if (toJSON(state) !== before) throw new Error("rejected command mutated state");
            }
            const cmd = randomLegalCommand(state, rng);
            if (!cmd) {
              // GAME_OVER: everything is rejected.
              const r = dispatch(state, { type: "ROLL", playerId: "p0" }, noDice);
              expect(r.ok).toBe(false);
              if (toJSON(state) !== before) throw new Error("rejected command mutated state");
              break;
            }
            const r = dispatch(state, cmd, dice);
            if (!r.ok) throw new Error(`legal command rejected: ${r.error.code}`);
            state = r.state;
          }
        }),
        { numRuns: illegalRuns, seed: seed + 500 },
      );
    }, 3_600_000);
  });
}

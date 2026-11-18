/// <reference types="@cloudflare/vitest-plugin/types" />
import { score, scoreSheet } from "@cd/engine";
import type { ViewMessage } from "@cd/protocol";
import { describe, expect, it } from "vitest";
import {
  type Conn,
  connectAll,
  createRoom,
  playTurn,
  queueDice,
  startGame,
  type TestRoom,
} from "./helpers/client";
import { doubleLockPlan, type PlannedTurn, pid, planFaces, simulate } from "./helpers/plan";

/** Seat 0 rolls a 6 in the first-player roll-off (which stops at the first 6), so seat 0 takes turn 1. */
async function begin(n: number, extra: number[]): Promise<{ room: TestRoom; conns: Conn[] }> {
  const room = await createRoom(n);
  await queueDice(room.code, [6, ...extra]);
  await startGame(room);
  return { room, conns: await connectAll(room) };
}

/** Wait until every socket has received the newest broadcast, then compare versions. */
async function settled(conns: Conn[]): Promise<ViewMessage[]> {
  const top = Math.max(...conns.map((c) => c.view().version));
  for (const c of conns) await c.until(() => c.view().version === top);
  return conns.map((c) => c.view());
}

function expectScoresMatch(views: ViewMessage[]): void {
  for (const v of views) {
    for (const p of v.game?.players ?? []) {
      if (!p.sheet) throw new Error("expectScoresMatch needs revealed cards (GAME_OVER)");
      const sheet = {
        penalties: p.sheet.penalties,
        rows: Object.fromEntries(
          Object.entries(p.sheet.rows).map(([color, r]) => [color, { color, ...r }]),
        ),
      };
      // biome-ignore lint/suspicious/noExplicitAny: view rows are structurally a ScoreSheet
      expect(p.score.total).toBe(scoreSheet(sheet as any).total);
    }
  }
}

describe("full games over sockets", () => {
  it("5 players: two rows locked in one Action 1 ends the game (EC-14)", async () => {
    const plan: PlannedTurn[] = doubleLockPlan();
    // The engine is the oracle: the scripted plan must itself end the game this way.
    const expected = simulate(5, plan);
    expect(expected.phase).toBe("GAME_OVER");
    expect(expected.lockedColors).toEqual(["RED", "YELLOW", "GREEN"]);

    const { room, conns } = await begin(5, planFaces(plan));
    for (const t of plan) await playTurn(conns, t);

    const views = await settled(conns);
    const g = views[0]?.game;
    expect(g?.phase).toBe("GAME_OVER");
    expect(g?.lockedColors).toEqual(["RED", "YELLOW", "GREEN"]);
    expect(g?.endReason).toEqual({
      kind: "TWO_ROWS_LOCKED",
      lockedColors: ["RED", "YELLOW", "GREEN"],
    });
    expect(g?.winners?.length).toBeGreaterThan(0);
    expect(g?.winners).toEqual(
      expected.log.flatMap((e) => (e.type === "GAME_ENDED" ? e.winners : [])),
    );

    // Turn 12 ended in Action 1: no ACTION_2 pass and no penalty event after the last roll.
    const events = g?.events ?? [];
    const lastRoll = events.map((e) => e.type).lastIndexOf("DICE_ROLLED");
    const tail = events.slice(lastRoll).map((e) => e.type);
    expect(tail).not.toContain("PENALTY");
    expect(tail).not.toContain("ACTION2_PASSED");
    expect(tail.filter((t) => t === "ROW_LOCKED")).toHaveLength(2);
    expect(tail.at(-1)).toBe("GAME_ENDED");

    // Every socket agrees, and scores match the engine's.
    expect(new Set(views.map((v) => v.version)).size).toBe(1);
    expectScoresMatch(views);
    for (const v of views) {
      for (const p of v.game?.players ?? []) {
        expect(p.score.total).toBe(score(expected, pid(p.seat)).total);
      }
    }
    expect(room.players).toHaveLength(5);
  });

  it("5 players: opponent cards are never sent before GAME_OVER, all are after, null again after rematch", async () => {
    const plan: PlannedTurn[] = doubleLockPlan();
    const { room, conns } = await begin(5, planFaces(plan));
    for (const t of plan) await playTurn(conns, t);
    await settled(conns);

    const hiddenOk = (v: ViewMessage, seat: number | null) => {
      for (const p of v.game?.players ?? []) {
        if (p.seat === seat) {
          expect(p.sheet).not.toBeNull();
          expect(p.score.rows).not.toBeNull();
        } else {
          expect(p.sheet).toBeNull();
          expect(p.score.rows).toBeNull();
        }
      }
    };
    let preFrames = 0;
    let overFrames = 0;
    for (const c of conns) {
      const seat = c.view().you.seat;
      for (const f of c.frames) {
        if (f.type !== "view") continue;
        const v = f as unknown as ViewMessage;
        if (!v.game) continue;
        if (v.game.phase === "GAME_OVER") {
          overFrames++;
          for (const p of v.game.players) {
            expect(p.sheet).not.toBeNull();
            expect(p.score.rows).not.toBeNull();
          }
        } else {
          preFrames++;
          hiddenOk(v, seat);
        }
      }
    }
    expect(preFrames).toBeGreaterThan(50);
    expect(overFrames).toBeGreaterThanOrEqual(5);

    // Rematch: null again for every seat.
    const c0 = conns[0] as Conn;
    const mark = c0.frames.length;
    c0.send({ type: "rematch" });
    await c0.until(() => c0.view().game?.phase === "AWAIT_ROLL");
    const after = await settled(conns);
    const fresh = c0.frames.slice(mark).filter((f) => f.type === "view");
    expect(fresh.length).toBeGreaterThan(0);
    for (const f of fresh) {
      const v = f as unknown as ViewMessage;
      if (v.game && v.game.phase !== "GAME_OVER") hiddenOk(v, v.you.seat);
    }
    for (const v of after) hiddenOk(v, v.you.seat);
    expect(room.players).toHaveLength(5);
  });

  it("2 players: the 4th penalty ends the game (EC-13), then rematch keeps seats", async () => {
    // Turns alternate seat 0 / seat 1; seat 0 takes its 4th penalty on turn 7.
    const { room, conns } = await begin(2, Array(7 * 6).fill(1));
    const [c0, c1] = conns as [Conn, Conn];
    for (let t = 1; t <= 7; t++) {
      await playTurn(conns, { a1: ["PASS", "PASS"], a2: "PASS" });
      if (t < 7) await c0.until(() => c0.view().game?.turn?.number === t + 1);
    }
    const views = await settled(conns);
    const g = views[0]?.game;
    expect(g?.phase).toBe("GAME_OVER");
    expect(g?.endReason).toEqual({ kind: "PENALTIES", playerIds: [pid(0)] });
    const sheet0 = g?.players.find((p) => p.seat === 0)?.sheet;
    expect(sheet0?.penalties).toBe(4); // revealed at GAME_OVER
    expect(g?.winners).toEqual([pid(1)]);
    expect(new Set(views.map((v) => v.version)).size).toBe(1);
    expectScoresMatch(views);
    expect(g?.players.map((p) => p.score.total)).toEqual([-20, -15]);

    // Rematch: same seats, version keeps increasing, turn 1 starts.
    const before = c0.view();
    c1.send({ type: "rematch" });
    expect((await c1.next("error")).code).toBe("E_NOT_HOST");
    c0.send({ type: "rematch" });
    await c0.until(() => c0.view().game?.phase === "AWAIT_ROLL");
    const after = (await settled(conns))[0] as ViewMessage;
    expect(after.version).toBeGreaterThan(before.version);
    expect(after.seats.map((s) => s.seatId)).toEqual(before.seats.map((s) => s.seatId));
    expect(after.room.status).toBe("playing");
    expect(after.game?.turn?.number).toBe(1);
    expect(after.game?.players.every((p) => p.score.penalties === 0)).toBe(true);
    // Hidden again after the rematch: only your own card is sent.
    expect(after.game?.players.map((p) => p.sheet === null)).toEqual([false, true]);
    expect(room.players).toHaveLength(2);
  });
});

/** T-NEW-2: the interactive opening roll-off (server-authoritative, simultaneous reveal). */
import { describe, expect, it } from "vitest";
import { type Conn, connectAll, createRoom, queueDice, startGame } from "./helpers/client";

const errorOf = (c: Conn) => c.frames.filter((f) => f.type === "error").at(-1);

describe("interactive roll-off", () => {
  it("rerolls until exactly one 6; hides faces until the round is complete", async () => {
    const room = await createRoom(3);
    await startGame(room); // nothing scripted: the players roll off themselves
    const conns = await connectAll(room);
    const [c0, c1, c2] = conns as [Conn, Conn, Conn];
    expect(c0.view().game).toBeNull();
    expect(c0.view().rollOff).toEqual({ round: 1, rolled: [false, false, false], completed: [] });
    expect(c1.view().you.seat).toBe(1);

    // Normal play is blocked until the roll-off resolves.
    c0.send({ type: "roll", turn: 1 });
    await c0.until(() => errorOf(c0)?.code === "E_WRONG_PHASE");

    // Round 1 faces by submission order: seat 2, 0, 1 -> 6, 6, 1 (two sixes: reroll).
    await queueDice(room.code, [6, 6, 1, 3, 6, 2]);
    c2.send({ type: "rollOff", round: 1 });
    await c0.until(() => c0.view().rollOff?.rolled[2] === true);
    // Only "has rolled" is visible, never a face, and nothing is completed yet.
    expect(JSON.stringify(c0.view().rollOff)).not.toContain("6");
    expect(c0.view().rollOff?.completed).toEqual([]);

    // Duplicate and stale submissions are rejected.
    c2.send({ type: "rollOff", round: 1 });
    await c2.until(() => errorOf(c2)?.code === "E_INVALID_COMMAND");
    c1.send({ type: "rollOff", round: 7 });
    await c1.until(() => errorOf(c1)?.code === "E_STALE_TURN");

    c0.send({ type: "rollOff", round: 1 });
    c1.send({ type: "rollOff", round: 1 });
    await c0.until(() => c0.view().rollOff?.round === 2);
    expect(c0.view().rollOff?.completed).toEqual([[6, 1, 6]]);
    expect(c0.view().rollOff?.rolled).toEqual([false, false, false]);

    // Round 2: seat 1 -> 3, seat 0 -> 6, seat 2 -> 2: seat 0 is the unique 6.
    c1.send({ type: "rollOff", round: 2 });
    c0.send({ type: "rollOff", round: 2 });
    c2.send({ type: "rollOff", round: 2 });
    const v = await c0.until(() => (c0.view().game ? c0.view() : undefined));
    expect(v.rollOff ?? null).toBeNull();
    expect(v.game?.turn?.activeSeat).toBe(0);
    expect(v.game?.phase).toBe("AWAIT_ROLL");
    const first = v.game?.events.find((e) => e.type === "FIRST_PLAYER_CHOSEN");
    expect(first).toMatchObject({
      method: "ROLL_OFF",
      seat: 0,
      rounds: [
        [6, 1, 6],
        [6, 3, 2],
      ],
    });
  });
});

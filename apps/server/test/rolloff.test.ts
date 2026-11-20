/** T-NEW-2: the interactive opening roll-off (server-authoritative; D-L1 per-seat reveal). */
import { describe, expect, it } from "vitest";
import { type Conn, connectAll, createRoom, queueDice, startGame } from "./helpers/client";

const errorOf = (c: Conn) => c.frames.filter((f) => f.type === "error").at(-1);

describe("interactive roll-off", () => {
  it("rerolls until exactly one 6; shows each face to everyone as soon as it is rolled", async () => {
    const room = await createRoom(3);
    await startGame(room); // nothing scripted: the players roll off themselves
    const conns = await connectAll(room);
    const [c0, c1, c2] = conns as [Conn, Conn, Conn];
    expect(c0.view().game).toBeNull();
    expect(c0.view().rollOff).toEqual({
      round: 1,
      rolled: [false, false, false],
      faces: [null, null, null],
      completed: [],
    });
    expect(c1.view().you.seat).toBe(1);

    // Normal play is blocked until the roll-off resolves.
    c0.send({ type: "roll", turn: 1 });
    await c0.until(() => errorOf(c0)?.code === "E_WRONG_PHASE");

    // Round 1 faces by submission order: seat 2, 0, 1 -> 6, 6, 1 (two sixes: reroll).
    await queueDice(room.code, [6, 6, 1, 3, 6, 2]);
    c2.send({ type: "rollOff", round: 1 });
    await c0.until(() => c0.view().rollOff?.rolled[2] === true);
    // D-L1: the face is public to every seat right away; seats that haven't rolled stay null.
    for (const c of conns) {
      await c.until(() => c.view().rollOff?.faces[2] === 6);
      expect(c.view().rollOff?.faces).toEqual([null, null, 6]);
    }
    expect(c0.view().rollOff?.completed).toEqual([]);

    // Duplicate and stale submissions are rejected.
    c2.send({ type: "rollOff", round: 1 });
    await c2.until(() => errorOf(c2)?.code === "E_INVALID_COMMAND");
    c1.send({ type: "rollOff", round: 7 });
    await c1.until(() => errorOf(c1)?.code === "E_STALE_TURN");
    // A rejected re-roll never changes the face already shown.
    expect(c0.view().rollOff?.faces).toEqual([null, null, 6]);

    c0.send({ type: "rollOff", round: 1 });
    await c2.until(() => c2.view().rollOff?.faces[0] === 6);
    expect(c2.view().rollOff?.faces).toEqual([6, null, 6]);
    c1.send({ type: "rollOff", round: 1 });
    await c0.until(() => c0.view().rollOff?.round === 2);
    expect(c0.view().rollOff?.completed).toEqual([[6, 1, 6]]);
    expect(c0.view().rollOff?.rolled).toEqual([false, false, false]);
    expect(c0.view().rollOff?.faces).toEqual([null, null, null]);
    // Round 1 is over: a late submission for it is stale.
    const errs = (c: Conn) => c.frames.filter((f) => f.type === "error").length;
    const before = errs(c1);
    c1.send({ type: "rollOff", round: 1 });
    await c1.until(() => errs(c1) > before && errorOf(c1)?.code === "E_STALE_TURN");

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

/// <reference types="@cloudflare/vitest-plugin/types" />
/** Early Action 2 over the game socket (K1.2): combined and step-by-step, voided, hidden info. */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { fromJSON, type GameEvent, toJSON } from "@cd/engine";
import type { ViewMessage } from "@cd/protocol";
import { describe, expect, it } from "vitest";
import type { GameRoom } from "../src/game-room";
import { type Conn, connectAll, createRoom, queueDice, startGame } from "./helpers/client";
import { seat0RollOff } from "./helpers/plan";

/** n seats, seat 0 first; turn 1 dice are queued as `roll` (white, white, R, Y, G, B). */
async function begin(n: number, roll: number[]): Promise<{ code: string; conns: Conn[] }> {
  const room = await createRoom(n);
  await queueDice(room.code, [...seat0RollOff(n), ...roll]);
  await startGame(room);
  return { code: room.code, conns: await connectAll(room) };
}

async function rollTurn1(conns: Conn[]): Promise<void> {
  const c0 = conns[0] as Conn;
  c0.send({ type: "roll", turn: 1 });
  for (const c of conns) await c.until(() => c.view().game?.phase === "ACTION_1");
}

const errorsOf = (c: Conn) => c.frames.filter((f) => f.type === "error");
async function nextError(c: Conn, before: number) {
  return c.until(() => errorsOf(c)[before]);
}

const eventsOf = (v: ViewMessage): GameEvent[] => v.game?.events ?? [];
const viewFrames = (c: Conn) =>
  c.frames.filter((f) => f.type === "view") as unknown as ViewMessage[];

/** No frame a non-active seat got ever carried a pending Action 2. */
function expectNoPendingLeak(others: Conn[]): void {
  for (const c of others) {
    expect(JSON.stringify(c.frames)).not.toMatch(/"pendingAction2":\{/);
    for (const v of viewFrames(c)) expect(v.you.pendingAction2 ?? null).toBeNull();
  }
}

describe("early Action 2 over WebSocket", () => {
  it("2 players: one `turn` confirm, then the passive's Action 1 resolves the whole turn", async () => {
    // White 3+4 = 7; every coloured die 1.
    const { conns } = await begin(2, [3, 4, 1, 1, 1, 1]);
    const [c0, c1] = conns as [Conn, Conn];
    await rollTurn1(conns);
    c0.send({
      type: "turn",
      turn: 1,
      action1: { kind: "MARK", color: "RED" },
      action2: { kind: "MARK", whiteDie: 1, color: "YELLOW" },
    });
    await c0.until(() => c0.view().you.pendingAction2);
    const mine = c0.view();
    expect(mine.game?.phase).toBe("ACTION_1");
    expect(mine.you.action1Decision).toEqual({ kind: "MARK", color: "RED" });
    expect(mine.you.pendingAction2).toEqual({ kind: "MARK", whiteDie: 1, color: "YELLOW" });
    expect(mine.you.legalAction2).toEqual([]);
    await c1.until(() => c1.view().game?.players[0]?.action1Submitted);
    expectNoPendingLeak([c1]);

    c1.send({ type: "action1", turn: 1, kind: "PASS" });
    for (const c of conns) await c.until(() => c.view().game?.turn?.number === 2);
    const v = c0.view();
    expect(v.game?.phase).toBe("AWAIT_ROLL");
    expect(v.game?.turn?.activeSeat).toBe(1);
    expect(v.you.pendingAction2).toBeNull();
    const rows = v.game?.players[0]?.sheet?.rows;
    expect(rows?.RED.marked[5]).toBe(true); // RED 7
    expect(rows?.YELLOW.marked[3]).toBe(true); // YELLOW 4 + 1 = 5
    const ev = eventsOf(v);
    expect(ev).toContainEqual(
      expect.objectContaining({ type: "MARKED", playerId: "seat-0", action: 2, color: "YELLOW" }),
    );
    expect(ev.map((e) => e.type)).not.toContain("PENALTY");
    expectNoPendingLeak([c1]);
  });

  it("3 players: step 1 then step 2 without waiting; errors; hidden from others", async () => {
    const { conns } = await begin(3, [3, 4, 1, 1, 1, 1]);
    const [c0, c1, c2] = conns as [Conn, Conn, Conn];
    await rollTurn1(conns);
    const a2 = { type: "action2", turn: 1, kind: "MARK", whiteDie: 0, color: "GREEN" };

    // Before its own Action 1 the early Action 2 window is closed.
    c0.send(a2);
    expect((await nextError(c0, 0)).code).toBe("E_WRONG_PHASE");
    // Passive seats can never send Action 2.
    c1.send({ type: "action2", turn: 1, kind: "PASS" });
    expect((await nextError(c1, 0)).code).toBe("E_NOT_ACTIVE_PLAYER");

    c0.send({ type: "action1", turn: 1, kind: "PASS" });
    // Step 2 is offered at once (early options for the active seat only).
    await c0.until(() => c0.view().you.action1Decision);
    expect(c0.view().you.legalAction2).toContainEqual({
      kind: "MARK",
      whiteDie: 0,
      color: "GREEN",
      number: 4,
    });
    expect(c1.view().you.legalAction2).toEqual([]);
    c0.send(a2);
    await c0.until(() => c0.view().you.pendingAction2);
    // Final: a second Action 2 is rejected.
    c0.send({ type: "action2", turn: 1, kind: "PASS" });
    expect((await nextError(c0, 1)).code).toBe("E_ALREADY_DECIDED");

    c1.send({ type: "action1", turn: 1, kind: "PASS" });
    for (const c of conns)
      await c.until(() => c.view().game?.players.filter((p) => p.action1Submitted).length === 2);
    for (const c of conns) expect(c.view().game?.phase).toBe("ACTION_1");
    expectNoPendingLeak([c1, c2]);

    c2.send({ type: "action1", turn: 1, kind: "PASS" });
    for (const c of conns) await c.until(() => c.view().game?.turn?.number === 2);
    const v = c0.view();
    expect(v.game?.players[0]?.sheet?.rows.GREEN.marked[8]).toBe(true); // GREEN 4 (12..2)
    expect(v.game?.players[0]?.sheet?.penalties).toBe(0);
    expectNoPendingLeak([c1, c2]);
  });

  it("voided: another seat's Action 1 locks the colour, the active seat chooses again", async () => {
    // White 6+6 = 12; RED 1, YELLOW 1, GREEN 1, BLUE 1.
    const { code, conns } = await begin(2, [6, 6, 1, 1, 1, 1]);
    const [c0, c1] = conns as [Conn, Conn];
    // Seat 1 already has RED 2..6, so marking RED 12 locks RED.
    await runInDurableObject(
      env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code)),
      async (room: GameRoom) => {
        const storage = (room as unknown as { ctx: DurableObjectState }).ctx.storage;
        const s = fromJSON((await storage.get("state")) as string);
        const red = s.players[1]?.sheet.rows.RED;
        if (!red) throw new Error("no seat 1");
        for (let i = 0; i < 5; i++) red.marked[i] = true;
        await storage.put("state", toJSON(s));
      },
    );
    await rollTurn1(conns);
    c0.send({
      type: "turn",
      turn: 1,
      action1: { kind: "PASS" },
      action2: { kind: "MARK", whiteDie: 0, color: "RED" },
    });
    await c0.until(() => c0.view().you.pendingAction2);
    c1.send({ type: "action1", turn: 1, kind: "MARK", color: "RED" });
    for (const c of conns) await c.until(() => c.view().game?.phase === "ACTION_2");
    const v = c0.view();
    expect(v.game?.lockedColors).toContain("RED");
    expect(eventsOf(v)).toContainEqual({
      type: "ACTION2_VOIDED",
      playerId: "seat-0",
      reason: "ROW_LOCKED",
    });
    expect(eventsOf(v).map((e) => e.type)).not.toContain("PENALTY");
    expect(v.you.pendingAction2).toBeNull();
    expect(v.you.legalAction2.some((o) => o.kind === "MARK" && o.color === "RED")).toBe(false);

    c0.send({ type: "action2", turn: 1, kind: "MARK", whiteDie: 0, color: "YELLOW" });
    for (const c of conns) await c.until(() => c.view().game?.turn?.number === 2);
    expect(c0.view().game?.players[0]?.sheet?.rows.YELLOW.marked[5]).toBe(true); // 6 + 1
    expect(c0.view().game?.players[0]?.sheet?.penalties).toBe(0);
    expectNoPendingLeak([c1]);
  });

  it("rejects a malformed `turn` frame as E_INVALID_COMMAND", async () => {
    const { conns } = await begin(2, [3, 4, 1, 1, 1, 1]);
    const c0 = conns[0] as Conn;
    await rollTurn1(conns);
    c0.send({ type: "turn", turn: 1, action1: { kind: "PASS" } });
    expect((await nextError(c0, 0)).code).toBe("E_INVALID_COMMAND");
    // An illegal combined confirm changes nothing (atomic).
    const before = c0.view().version;
    c0.send({
      type: "turn",
      turn: 1,
      action1: { kind: "MARK", color: "RED" },
      action2: { kind: "MARK", whiteDie: 0, color: "RED" }, // RED 4 left of RED 7
    });
    expect((await nextError(c0, 1)).code).toBe("E_ILLEGAL_MARK");
    expect(c0.view().version).toBe(before);
    expect(c0.view().you.action1Decision).toBeNull();
  });
});

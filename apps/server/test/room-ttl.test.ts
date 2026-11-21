/// <reference types="@cloudflare/vitest-plugin/types" />
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { GameRoom } from "../src/game-room";
import type { RoomMeta } from "../src/room-store";
import {
  type Conn,
  connectAll,
  createRoom,
  playTurn,
  queueDice,
  startGame,
} from "./helpers/client";

const HOUR = 60 * 60_000;
const stub = (code: string) => env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));

const metaOf = (code: string) =>
  runInDurableObject(stub(code), (r: GameRoom) =>
    (r as unknown as { store: { getMeta(): Promise<RoomMeta | undefined> } }).store.getMeta(),
  );

/** Overrides the room's clock (the same seam the other room tests use). */
const setNow = (code: string, ms: number) =>
  runInDurableObject(stub(code), (r: GameRoom) => {
    (r as unknown as { now: () => number }).now = () => ms;
  });

/** 2 players: seat 0's 4th penalty on turn 7 ends the game. */
async function finishedRoom(): Promise<{ code: string; conns: Conn[] }> {
  const room = await createRoom(2);
  await queueDice(room.code, [6, ...Array(7 * 6).fill(1)]);
  await startGame(room);
  const conns = await connectAll(room);
  const c0 = conns[0] as Conn;
  for (let t = 1; t <= 7; t++) {
    await playTurn(conns, { a1: ["PASS", "PASS"], a2: "PASS" });
    if (t < 7) await c0.until(() => c0.view().game?.turn?.number === t + 1);
  }
  await c0.until(() => c0.view().game?.phase === "GAME_OVER");
  return { code: room.code, conns };
}

describe("finished-room TTL", () => {
  it("a pending rematch offer expires automatically and broadcasts expired", async () => {
    const { code, conns } = await finishedRoom();
    const c0 = conns[0] as Conn;
    const start = c0.frames.length;
    c0.send({ type: "rematchRequest" });
    await c0.until(() =>
      c0.frames.slice(start).find((f) => f.type === "rematchOffer" && f.offer !== null),
    );

    const offer = await runInDurableObject(stub(code), (r: GameRoom) =>
      (
        r as unknown as {
          store: { getRematch(): Promise<{ sentAt: number; expiresAt: number } | undefined> };
        }
      ).store.getRematch(),
    );
    expect(offer).toBeDefined();
    expect(offer?.expiresAt).toBeGreaterThan(0);

    const expiredAt = offer?.expiresAt as number;
    await setNow(code, expiredAt);
    expect(await runDurableObjectAlarm(stub(code))).toBe(true);
    await c0.until(() =>
      c0.frames
        .slice(start)
        .find((f) => f.type === "rematchOffer" && f.offer === null && f.reason === "expired"),
    );
    expect(
      await runInDurableObject(stub(code), (r: GameRoom) =>
        (
          r as unknown as {
            store: { getRematch(): Promise<unknown> };
          }
        ).store.getRematch(),
      ),
    ).toBeUndefined();
    expect(expiredAt - (offer?.sentAt as number)).toBe(10 * 60_000);
    for (const c of conns) c.close();
  });

  it("a finished room is deleted by the alarm after 25 h, but not after 23 h", async () => {
    const { code, conns } = await finishedRoom();
    const meta = await metaOf(code);
    expect(meta?.status).toBe("finished");
    const finishedAt = meta?.finishedAt as number;
    expect(finishedAt).toBeGreaterThan(0);

    await setNow(code, finishedAt + 23 * HOUR);
    await runDurableObjectAlarm(stub(code));
    expect(await metaOf(code)).toBeDefined();

    await setNow(code, finishedAt + 25 * HOUR);
    expect(await runDurableObjectAlarm(stub(code))).toBe(true);
    expect(await metaOf(code)).toBeUndefined();
    for (const c of conns) c.close();
  });

  it("rematch resets finishedAt and the finished-room TTL no longer applies", async () => {
    const { code, conns } = await finishedRoom();
    const finishedAt = (await metaOf(code))?.finishedAt as number;
    expect(finishedAt).toBeGreaterThan(0);
    const c0 = conns[0] as Conn;
    c0.send({ type: "rematchRequest" });
    for (const c of conns.slice(1) as Conn[]) c.send({ type: "rematchAccept" });
    await c0.until(() => c0.view().game?.phase === "AWAIT_ROLL");
    const after = await metaOf(code);
    expect(after?.status).toBe("playing");
    expect(after?.finishedAt).toBeNull();

    // 25 h after the old finish the room survives (only the 7 d idle TTL applies).
    await setNow(code, finishedAt + 25 * HOUR);
    await runDurableObjectAlarm(stub(code));
    expect(await metaOf(code)).toBeDefined();
    for (const c of conns) c.close();
  });
});

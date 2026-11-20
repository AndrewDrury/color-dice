/// <reference types="@cloudflare/vitest-plugin/types" />
/** K2.2 room cleanup: in-game leave, delete when everyone left, 30-min abandoned alarm. */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { ABANDONED_ROOM_MS, type AuthRes, type MeRes, type PublicGame } from "@cd/protocol";
import { describe, expect, it } from "vitest";
import type { GameRoom } from "../src/game-room";
import type { SeatRecord } from "../src/room-store";
import {
  api,
  type Conn,
  connect,
  connectAll,
  createRoom,
  PASSWORD,
  queueDice,
  startGame,
} from "./helpers/client";
import { seat0RollOff } from "./helpers/plan";

const MIN = 60_000;
const stub = (code: string) => env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
const lobbyList = (): Promise<PublicGame[]> => env.LOBBY.get(env.LOBBY.idFromName("main")).list();
const leave = (code: string, token: string) => api("POST", `/api/games/${code}/leave`, { token });
const me = (code: string, token: string) => api("GET", `/api/games/${code}/me`, { token });

function setClock(code: string, t: { now: number }): Promise<void> {
  return runInDurableObject(stub(code), async (room: GameRoom) => {
    (room as unknown as { now: () => number }).now = () => t.now;
  });
}

const storageSize = (code: string) =>
  runInDurableObject(stub(code), async (_r: GameRoom, s: DurableObjectState) => ({
    keys: (await s.storage.list()).size,
    alarm: await s.storage.getAlarm(),
  }));

async function listedRoom(): Promise<AuthRes> {
  const res = await api("POST", "/api/games", {
    body: { roomName: "Cleanup", name: "Ana", password: PASSWORD, maxPlayers: 4, listed: true },
  });
  expect(res.status).toBe(201);
  return (await res.json()) as AuthRes;
}

describe("leave during play", () => {
  it("the seat becomes LEFT: session ends (4004), auto-passed, host passes on", async () => {
    const room = await createRoom(3);
    await queueDice(room.code, seat0RollOff(3));
    await startGame(room);
    const conns = await connectAll(room);
    const [host, p1, p2] = room.players as [AuthRes, AuthRes, AuthRes];
    const c1 = conns[1] as Conn;
    expect((await leave(room.code, host.token)).status).toBe(204);
    const c0 = conns[0] as Conn;
    await c0.until(() => c0.frames.some((f) => f.type === "sessionEnded"));
    expect((await me(room.code, host.token)).status).toBe(401);
    const v = await c1.until(() => {
      const x = c1.view();
      return x.seats.find((s) => s.seatId === host.seatId)?.away ? x : undefined;
    });
    expect(v.seats.find((s) => s.seatId === host.seatId)).toMatchObject({
      away: true,
      left: true,
      online: false,
    });
    expect(v.seats.filter((s) => s.seatId !== host.seatId).map((s) => s.left)).toEqual([
      false,
      false,
    ]);
    // No hidden info added: seat entries carry only the allow-listed keys.
    for (const s of v.seats)
      expect(Object.keys(s).sort()).toEqual(
        ["away", "host", "kind", "left", "name", "online", "profile", "record", "seatId"].sort(),
      );
    expect(((await (await me(room.code, p1.token)).json()) as MeRes).host).toBe(true);
    // The left seat can't come back.
    const back = await api("POST", `/api/games/${room.code}/reclaim`, {
      body: { name: "P0", password: PASSWORD },
    });
    expect(back.status).toBe(409);
    // Auto-passed: once dice are rolled the left seat's Action 1 is a PASS without it.
    const g = c1.view().game;
    const active = g?.turn?.activeSeat as number;
    if (g?.phase === "AWAIT_ROLL" && active !== 0) {
      (conns[active] as Conn).send({ type: "roll", turn: g.turn?.number });
    }
    await c1.until(() => {
      const x = c1.view().game;
      return (
        x?.phase === "ACTION_1" && x.players.find((p) => p.seatId === host.seatId)?.action1Submitted
      );
    });
    const seats = await runInDurableObject(stub(room.code), (_r: GameRoom, s: DurableObjectState) =>
      s.storage.get<SeatRecord[]>("seats"),
    );
    expect(seats?.find((s) => s.seatId === host.seatId)).toMatchObject({
      left: true,
      away: true,
      host: false,
    });

    // Everyone else leaves → deleted at once.
    expect((await leave(room.code, p1.token)).status).toBe(204);
    expect((await leave(room.code, p2.token)).status).toBe(204);
    expect(await storageSize(room.code)).toEqual({ keys: 0, alarm: null });
    expect((await me(room.code, p2.token)).status).toBe(401);
    for (const c of conns) c.close();
  });

  it("lobby seats report left=false; a lobby leave removes the seat", async () => {
    const room = await createRoom(3); // third seat held back: a full room would auto-start
    const [host, p1] = room.players as [AuthRes, AuthRes];
    const c0 = await connect(room.code, host.token);
    const v0 = await c0.until(() => (c0.view().seats.length === 2 ? c0.view() : undefined));
    expect(v0.seats.map((s) => s.left)).toEqual([false, false]);
    expect((await leave(room.code, p1.token)).status).toBe(204);
    const v1 = await c0.until(() => (c0.view().seats.length === 1 ? c0.view() : undefined));
    expect(v1.seats.map((s) => s.left)).toEqual([false]);
    c0.close();
  });

  it("the last lobby player leaving deletes the room and its public entry", async () => {
    const host = await listedRoom();
    expect((await lobbyList()).some((g) => g.code === host.code)).toBe(true);
    const conn = await connect(host.code, host.token);
    expect((await leave(host.code, host.token)).status).toBe(204);
    await conn.until(() => conn.frames.some((f) => f.type === "sessionEnded"));
    expect(await storageSize(host.code)).toEqual({ keys: 0, alarm: null });
    expect((await lobbyList()).some((g) => g.code === host.code)).toBe(false);
  });
});

describe("abandoned room alarm", () => {
  it("no socket for 30 min → deleted and unlisted; 29 min → kept", async () => {
    const host = await listedRoom();
    const t = { now: Date.now() };
    await setClock(host.code, t);
    t.now += ABANDONED_ROOM_MS - MIN;
    await runDurableObjectAlarm(stub(host.code));
    expect(await stub(host.code).isFree()).toBe(false);
    t.now += 2 * MIN;
    expect(await runDurableObjectAlarm(stub(host.code))).toBe(true);
    expect(await storageSize(host.code)).toEqual({ keys: 0, alarm: null });
    expect((await lobbyList()).some((g) => g.code === host.code)).toBe(false);
    expect((await me(host.code, host.token)).status).toBe(401);
  });

  it("a reconnect within 30 min pushes the deadline back", async () => {
    const host = await listedRoom();
    const t = { now: Date.now() };
    await setClock(host.code, t);
    t.now += 25 * MIN;
    const conn = await connect(host.code, host.token);
    // While a seat is connected the abandoned rule does not apply.
    t.now += 40 * MIN;
    await runDurableObjectAlarm(stub(host.code));
    expect(await stub(host.code).isFree()).toBe(false);
    conn.close();
    await new Promise((r) => setTimeout(r, 50));
    const seen = async () =>
      runInDurableObject(
        stub(host.code),
        async (_r: GameRoom, s: DurableObjectState) =>
          (await s.storage.get<SeatRecord[]>("seats"))?.[0]?.lastSeenAt,
      );
    for (let i = 0; i < 100 && (await seen()) !== t.now; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(await seen()).toBe(t.now);
    t.now += 25 * MIN;
    await runDurableObjectAlarm(stub(host.code));
    expect(await stub(host.code).isFree()).toBe(false);
    t.now += 6 * MIN;
    expect(await runDurableObjectAlarm(stub(host.code))).toBe(true);
    expect(await stub(host.code).isFree()).toBe(true);
  });
});

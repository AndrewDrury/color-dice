/// <reference types="@cloudflare/vitest-plugin/types" />

import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import type { AuthRes, MeRes, PublicGame } from "@cd/protocol";
import { describe, expect, it } from "vitest";
import type { GameRoom } from "../src/game-room";
import { publicEntry, removeSeat } from "../src/room-lobby-ops";
import type { RoomMeta, SeatRecord } from "../src/room-store";
import { connect } from "./helpers/client";

const BASE = "https://worker.test";
const PW = "hunter22";

let ipSeq = 0;
/** Every request gets its own IP so per-IP rate limits never interfere. */
function nextIp(): string {
  ipSeq++;
  return `10.77.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
}

async function api(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "cf-connecting-ip": nextIp() };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return exports.default.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  );
}

async function create(over: Record<string, unknown> = {}): Promise<AuthRes> {
  const res = await api("POST", "/api/games", {
    body: {
      roomName: "Friday dice",
      name: "Alice",
      password: PW,
      maxPlayers: 4,
      listed: true,
      ...over,
    },
  });
  expect(res.status).toBe(201);
  return (await res.json()) as AuthRes;
}

async function join(code: string, name: string, password = PW): Promise<Response> {
  return api("POST", `/api/games/${code}/join`, { body: { name, password } });
}

async function joinOk(code: string, name: string): Promise<AuthRes> {
  const res = await join(code, name);
  expect(res.status).toBe(201);
  return (await res.json()) as AuthRes;
}

async function me(code: string, token: string): Promise<Response> {
  return api("GET", `/api/games/${code}/me`, { token });
}

const roomStub = (code: string) => env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));

function setClock(code: string, t: { now: number }): Promise<void> {
  return runInDurableObject(roomStub(code), async (room: GameRoom) => {
    (room as unknown as { now: () => number }).now = () => t.now;
  });
}

async function lobbyList(): Promise<PublicGame[]> {
  return env.LOBBY.get(env.LOBBY.idFromName("main")).list();
}

describe("create / join / me", () => {
  it("create → join → me, and the lobby lists public fields only", async () => {
    const host = await create();
    expect(host.code).toMatch(/^[A-Z2-9]{5}$/);
    const bob = await joinOk(host.code, "Bob");
    expect(bob.code).toBe(host.code);
    expect(bob.seatId).not.toBe(host.seatId);

    const r1 = await me(host.code, host.token);
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({
      seatId: host.seatId,
      name: "Alice",
      host: true,
      status: "lobby",
    } satisfies MeRes);
    const r2 = (await (await me(host.code.toLowerCase(), bob.token)).json()) as MeRes;
    expect(r2).toMatchObject({ seatId: bob.seatId, name: "Bob", host: false });

    const entry = (await lobbyList()).find((g) => g.code === host.code);
    expect(entry).toMatchObject({
      roomName: "Friday dice",
      players: 2,
      maxPlayers: 4,
    });
    expect(Object.keys(entry ?? {}).sort()).toEqual(
      ["code", "createdAt", "maxPlayers", "players", "roomName"].sort(),
    );
    expect(JSON.stringify(entry)).not.toMatch(/pwd|hash|salt|token|invite|Alice|Bob/i);
  });

  it("unlisted rooms never reach the lobby", async () => {
    const host = await create({ listed: false });
    expect((await lobbyList()).some((g) => g.code === host.code)).toBe(false);
  });

  it("wrong password → 401 with exactly the same body as an unknown code", async () => {
    const host = await create();
    const wrong = await join(host.code, "Bob", "nope-nope");
    const unknown = await join("ZZZZ2", "Bob", PW);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const a = await wrong.text();
    expect(a).toBe(await unknown.text());
    expect(JSON.parse(a)).toEqual({ code: "E_BAD_CREDENTIALS" });
    // Probing an unknown code creates nothing.
    expect(await roomStub("ZZZZ2").isFree()).toBe(true);
  });

  it("bad bearer tokens → 401", async () => {
    const host = await create();
    expect((await api("GET", `/api/games/${host.code}/me`)).status).toBe(401);
    expect((await me(host.code, "x".repeat(43))).status).toBe(401);
    expect((await me(host.code, "short")).status).toBe(401);
  });

  it("invalid bodies → 400", async () => {
    const host = await create();
    expect(
      (
        await api("POST", `/api/games/${host.code}/join`, {
          body: { name: "B", password: PW, x: 1 },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api("POST", "/api/games", {
          body: { roomName: "ab", name: "A", password: PW, maxPlayers: 4, listed: true },
        })
      ).status,
    ).toBe(400);
  });
});

describe("lockout", () => {
  it("10 wrong → right password still 401; unlocked after 15 min", async () => {
    const host = await create();
    const t = { now: Date.now() };
    await setClock(host.code, t);
    for (let i = 0; i < 10; i++)
      expect((await join(host.code, "Bob", "wrong-pw")).status).toBe(401);
    const locked = await join(host.code, "Bob");
    expect(locked.status).toBe(401);
    expect(await locked.json()).toEqual({ code: "E_BAD_CREDENTIALS" });
    t.now += 14 * 60_000;
    expect((await join(host.code, "Bob")).status).toBe(401);
    t.now += 60_000 + 1;
    expect((await join(host.code, "Bob")).status).toBe(201);
    await runInDurableObject(
      roomStub(host.code),
      async (_r: GameRoom, state: DurableObjectState) => {
        const meta = (await state.storage.get<RoomMeta>("meta")) as RoomMeta;
        expect(meta.failedJoins).toBe(0);
        expect(meta.joinLockedUntil).toBeNull();
      },
    );
  });
});

describe("lockout broadcast", () => {
  it("host's live socket gets a higher-version view with the lockout flag", async () => {
    const host = await create();
    const conn = await connect(host.code, host.token);
    const before = conn.view();
    expect(before.room.joinLockedUntil).toBeNull();
    for (let i = 0; i < 10; i++)
      expect((await join(host.code, "Bob", "wrong-pw")).status).toBe(401);
    const v = await conn.until(() => {
      const x = conn.view();
      return x.room.joinLockedUntil !== null ? x : undefined;
    });
    expect(v.version).toBeGreaterThan(before.version);
    conn.close();
  });
});

describe("join rules", () => {
  it("full room 409, duplicate name 409 (case-insensitive), join after start 409", async () => {
    const host = await create({ maxPlayers: 2 });
    const dup = await join(host.code, "aLiCe");
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ code: "E_NAME_TAKEN" });
    await joinOk(host.code, "Bob");
    // The join that fills the room auto-starts it (T-UX-17), so a late join is "not in lobby".
    const full = await join(host.code, "Carol");
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ code: "E_NOT_IN_LOBBY" });
    expect((await lobbyList()).some((g) => g.code === host.code)).toBe(false);

    const h2 = await create();
    await joinOk(h2.code, "Bob");
    expect((await api("POST", `/api/games/${h2.code}/start`, { token: h2.token })).status).toBe(
      204,
    );
    const late = await join(h2.code, "Carol");
    expect(late.status).toBe(409);
    expect(await late.json()).toEqual({ code: "E_NOT_IN_LOBBY" });
    expect(((await (await me(h2.code, h2.token)).json()) as MeRes).status).toBe("playing");
  });
});

describe("host-only actions", () => {
  it("non-host start/kick/patch → 403", async () => {
    const host = await create();
    const bob = await joinOk(host.code, "Bob");
    for (const [m, p, body] of [
      ["POST", "start", undefined],
      ["POST", "kick", { seatId: host.seatId }],
      ["PATCH", "", { listed: false }],
    ] as const) {
      const res = await api(m, `/api/games/${host.code}${p ? `/${p}` : ""}`, {
        token: bob.token,
        body,
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "E_NOT_HOST" });
    }
  });

  it("start with 1 seat → 422", async () => {
    const host = await create();
    const res = await api("POST", `/api/games/${host.code}/start`, { token: host.token });
    expect(res.status).toBe(422);
  });

  it("start assigns seatIndex by joinOrder and opens the roll-off", async () => {
    const host = await create();
    const bob = await joinOk(host.code, "Bob");
    await runInDurableObject(
      roomStub(host.code),
      async (room: GameRoom, state: DurableObjectState) => {
        expect(await room.start(host.token)).toEqual({ ok: true, value: null });
        const seats = (await state.storage.get<SeatRecord[]>("seats")) as SeatRecord[];
        expect(seats.map((s) => [s.seatId, s.seatIndex])).toEqual([
          [host.seatId, 0],
          [bob.seatId, 1],
        ]);
        // No scripted dice: the players roll off themselves (T-NEW-2), so no engine state yet.
        expect(await state.storage.get("state")).toBeUndefined();
        expect(await state.storage.get("rollOff")).toEqual({
          round: 1,
          current: [null, null],
          completed: [],
        });
      },
    );
  });

  it("kick removes the seat (its token stops working); patch updates settings and password", async () => {
    const host = await create();
    const bob = await joinOk(host.code, "Bob");
    expect(
      (
        await api("POST", `/api/games/${host.code}/kick`, {
          token: host.token,
          body: { seatId: bob.seatId },
        })
      ).status,
    ).toBe(204);
    expect((await me(host.code, bob.token)).status).toBe(401);

    const res = await api("PATCH", `/api/games/${host.code}`, {
      token: host.token,
      body: { roomName: "New name", listed: true, password: "newpass1" },
    });
    expect(res.status).toBe(204);
    expect((await join(host.code, "Carol")).status).toBe(401);
    expect((await join(host.code, "Carol", "newpass1")).status).toBe(201);
    expect((await lobbyList()).find((g) => g.code === host.code)?.roomName).toBe("New name");
  });
});

describe("reclaim", () => {
  it("online seat → 409; offline seat → new token works and the old one is 401", async () => {
    const host = await create();
    const bob = await joinOk(host.code, "Bob");
    // Simulate Bob's open game socket.
    await runInDurableObject(
      roomStub(host.code),
      async (_r: GameRoom, state: DurableObjectState) => {
        const pair = new WebSocketPair();
        state.acceptWebSocket(pair[1]);
        pair[1].serializeAttachment({ seatId: bob.seatId });
      },
    );
    const online = await api("POST", `/api/games/${host.code}/reclaim`, {
      body: { name: "bob", password: PW },
    });
    expect(online.status).toBe(409);
    expect(await online.json()).toEqual({ code: "E_SEAT_ONLINE" });

    const bad = await api("POST", `/api/games/${host.code}/reclaim`, {
      body: { name: "Alice", password: "wrong-pw" },
    });
    expect(bad.status).toBe(401);

    const res = await api("POST", `/api/games/${host.code}/reclaim`, {
      body: { name: "Alice", password: PW },
    });
    expect(res.status).toBe(200);
    const fresh = (await res.json()) as AuthRes;
    expect(fresh.seatId).toBe(host.seatId);
    expect(fresh.token).not.toBe(host.token);
    expect((await me(host.code, fresh.token)).status).toBe(200);
    expect((await me(host.code, host.token)).status).toBe(401);
  });
});

describe("leave", () => {
  it("host leaving passes host to the lowest joinOrder; last seat leaving deletes the room", async () => {
    const host = await create();
    const bob = await joinOk(host.code, "Bob");
    const carol = await joinOk(host.code, "Carol");
    expect((await api("POST", `/api/games/${host.code}/leave`, { token: host.token })).status).toBe(
      204,
    );
    expect((await me(host.code, host.token)).status).toBe(401);
    expect(((await (await me(host.code, bob.token)).json()) as MeRes).host).toBe(true);
    expect(((await (await me(host.code, carol.token)).json()) as MeRes).host).toBe(false);
    expect((await lobbyList()).find((g) => g.code === host.code)?.players).toBe(2);

    await api("POST", `/api/games/${host.code}/leave`, { token: bob.token });
    await api("POST", `/api/games/${host.code}/leave`, { token: carol.token });
    expect(await roomStub(host.code).isFree()).toBe(true);
    expect((await lobbyList()).some((g) => g.code === host.code)).toBe(false);
  });
});

describe("storage secrecy", () => {
  it("no plain password or token in any stored value", async () => {
    const host = await create();
    const bob = await joinOk(host.code, "Bob");
    await api("PATCH", `/api/games/${host.code}`, {
      token: host.token,
      body: { password: "second-pw" },
    });
    await runInDurableObject(
      roomStub(host.code),
      async (_r: GameRoom, state: DurableObjectState) => {
        const dump = JSON.stringify([...(await state.storage.list()).entries()]);
        expect(dump).toContain("tokenHash");
        for (const secret of [PW, "second-pw", host.token, bob.token])
          expect(dump).not.toContain(secret);
      },
    );
  });
});

describe("alarm", () => {
  it("deletes an idle room and removes it from the lobby", async () => {
    const host = await create();
    // A connected seat: only the 7-day idle TTL applies (not the 30-min abandoned rule).
    const conn = await connect(host.code, host.token);
    expect((await lobbyList()).some((g) => g.code === host.code)).toBe(true);
    await setClock(host.code, { now: Date.now() + 6 * 24 * 3_600_000 });
    expect(await runDurableObjectAlarm(roomStub(host.code))).toBe(true);
    expect(await roomStub(host.code).isFree()).toBe(false); // not yet idle 7 d: re-armed

    await setClock(host.code, { now: Date.now() + 8 * 24 * 3_600_000 });
    expect(await runDurableObjectAlarm(roomStub(host.code))).toBe(true);
    await runInDurableObject(
      roomStub(host.code),
      async (_r: GameRoom, state: DurableObjectState) => {
        expect((await state.storage.list()).size).toBe(0);
        expect(await state.storage.getAlarm()).toBeNull();
      },
    );
    expect((await lobbyList()).some((g) => g.code === host.code)).toBe(false);
    expect((await me(host.code, host.token)).status).toBe(401);
    conn.close();
  });
});

describe("pure helpers", () => {
  const seat = (id: string, order: number, host = false): SeatRecord => ({
    seatId: id,
    name: id,
    joinOrder: order,
    host,
    seatIndex: null,
    tokenHash: "h",
    away: false,
    record: { wins: 0, ties: 0, losses: 0 },
    lastSeenAt: 0,
  });

  it("removeSeat transfers host by joinOrder", () => {
    const rest = removeSeat([seat("c", 3), seat("a", 1, true), seat("b", 2)], "a");
    expect(rest.map((s) => [s.seatId, s.host])).toEqual([
      ["b", true],
      ["c", false],
    ]);
  });

  it("publicEntry uses an explicit allow-list", () => {
    const meta = {
      code: "ABCDE",
      roomName: "Room",
      listed: true,
      maxPlayers: 4,
      status: "lobby",
      pwd: { saltB64: "s", hashB64: "h", iterations: 1 },
      inviteKey: "k".repeat(43),
      failedJoins: 0,
      joinLockedUntil: null,
      createdAt: 5,
      lastActivityAt: 5,
      finishedAt: null,
      version: 1,
    } satisfies RoomMeta;
    expect(publicEntry(meta, [seat("a", 1, true)])).toEqual({
      code: "ABCDE",
      roomName: "Room",
      players: 1,
      maxPlayers: 4,
      createdAt: 5,
    });
    expect(publicEntry({ ...meta, status: "playing" }, [seat("a", 1, true)])).toBeNull();
  });
});

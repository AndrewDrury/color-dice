/// <reference types="@cloudflare/vitest-plugin/types" />

import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import type { LobbyMessage, PublicGame } from "@cd/protocol";
import { describe, expect, it } from "vitest";
import type { Lobby } from "../src/lobby";

const BASE = "https://worker.test";
const GOOD = "http://localhost:5173";
const SECRET_RE = /pwd|password|hash|salt|token|lastActivityAt/i;
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

let seq = 0;
/** A fresh Lobby instance per test (storage is shared within the file). */
function freshLobby() {
  return env.LOBBY.get(env.LOBBY.idFromName(`lobby-test-${seq++}`));
}

function code(i: number): string {
  return `AA${ALPHA[Math.floor(i / ALPHA.length) % ALPHA.length]}${ALPHA[i % ALPHA.length]}A`;
}

function game(i: number, createdAt = 1_000 + i): PublicGame {
  return {
    code: code(i),
    roomName: `Room ${i}`,
    players: 1,
    maxPlayers: 4,
    createdAt,
  };
}

/** Swap the instance clock (test seam). */
function setClock(lobby: Lobby, t: { now: number }): void {
  (lobby as unknown as { now: () => number }).now = () => t.now;
}

describe("Lobby RPC", () => {
  it("upsert ×3 → list newest first with public fields only", async () => {
    const stub = freshLobby();
    await stub.upsert(game(1, 100));
    await stub.upsert(game(2, 300));
    await stub.upsert(game(3, 200));
    const list = await stub.list();
    expect(list.map((g) => g.code)).toEqual([code(2), code(3), code(1)]);
    expect(list[0]).toEqual(game(2, 300));
    for (const g of list) {
      expect(Object.keys(g).sort()).toEqual(
        ["code", "createdAt", "maxPlayers", "players", "roomName"].sort(),
      );
    }
    expect(JSON.stringify(list)).not.toMatch(SECRET_RE);
  });

  it("rejects entries with extra fields (e.g. a password)", async () => {
    await runInDurableObject(freshLobby(), async (lobby: Lobby) => {
      await expect(
        lobby.upsert({ ...game(1), pwd: "secret" } as unknown as PublicGame),
      ).rejects.toThrow();
      expect(lobby.list()).toEqual([]);
    });
  });

  it("upsert replaces, remove deletes", async () => {
    const stub = freshLobby();
    await stub.upsert(game(1));
    await stub.upsert({ ...game(1), players: 3 });
    expect((await stub.list()).map((g) => g.players)).toEqual([3]);
    await stub.remove(code(1));
    expect(await stub.list()).toEqual([]);
  });

  it("hides entries idle > 30 min and caps the list at 50", async () => {
    const stub = freshLobby();
    await runInDurableObject(stub, async (lobby: Lobby) => {
      const t = { now: 1_000_000_000 };
      setClock(lobby, t);
      // Newest by createdAt, but idle for 31 min → hidden.
      await lobby.upsert(game(0, 1e12));
      t.now += 31 * 60_000;
      for (let i = 1; i <= 55; i++) await lobby.upsert(game(i));
      const list = lobby.list();
      expect(list).toHaveLength(50);
      expect(list.some((g) => g.code === code(0))).toBe(false);
      expect(list[0]?.code).toBe(code(55));
      expect(JSON.stringify(list)).not.toMatch(SECRET_RE);
    });
  });

  it("persists entries under 'rooms' and the alarm prunes stale ones", async () => {
    const stub = freshLobby();
    await stub.upsert(game(1));
    await runInDurableObject(stub, async (lobby: Lobby, state: DurableObjectState) => {
      expect(await state.storage.get("rooms")).toHaveLength(1);
      expect(await state.storage.getAlarm()).not.toBeNull();
      setClock(lobby, { now: Date.now() + 31 * 60_000 });
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await runInDurableObject(stub, async (_lobby: Lobby, state: DurableObjectState) => {
      expect(await state.storage.get("rooms")).toEqual([]);
      expect(await state.storage.getAlarm()).toBeNull();
    });
  });

  it("no alarm while empty", async () => {
    const stub = freshLobby();
    await stub.upsert(game(1));
    await stub.remove(code(1));
    await runInDurableObject(stub, async (_lobby: Lobby, state: DurableObjectState) => {
      expect(await state.storage.getAlarm()).toBeNull();
    });
  });
});

/** Collects messages; resolves `next()` with the next one. */
function collector(ws: WebSocket) {
  const queue: LobbyMessage[] = [];
  const waiters: ((m: LobbyMessage) => void)[] = [];
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data as string) as LobbyMessage;
    const w = waiters.shift();
    if (w) w(msg);
    else queue.push(msg);
  });
  return {
    next(): Promise<LobbyMessage> {
      const m = queue.shift();
      return m ? Promise.resolve(m) : new Promise((r) => waiters.push(r));
    },
  };
}

describe("Lobby socket and HTTP", () => {
  const main = () => env.LOBBY.get(env.LOBBY.idFromName("main"));

  it("sends the list on connect, updates after upsert, closes 4008 on any message", async () => {
    await main().upsert(game(7));
    const res = await exports.default.fetch(
      new Request(`${BASE}/ws/lobby`, {
        headers: { upgrade: "websocket", origin: GOOD, "cf-connecting-ip": "10.0.0.1" },
      }),
    );
    expect(res.status).toBe(101);
    const ws = res.webSocket as WebSocket;
    ws.accept();
    const msgs = collector(ws);

    const first = await msgs.next();
    expect(first.type).toBe("games");
    expect(first.games.map((g) => g.code)).toContain(code(7));

    await main().upsert(game(8, 9_999));
    const update = await msgs.next();
    expect(update.games[0]?.code).toBe(code(8));
    expect(JSON.stringify(update)).not.toMatch(SECRET_RE);

    const closed = new Promise<number>((r) => ws.addEventListener("close", (e) => r(e.code)));
    ws.send("hello");
    expect(await closed).toBe(4008);
  });

  it("GET /api/games returns the public list", async () => {
    await main().upsert(game(9));
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/games`, { headers: { "cf-connecting-ip": "10.0.0.2" } }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(SECRET_RE);
    expect((JSON.parse(text) as PublicGame[]).map((g) => g.code)).toContain(code(9));
  });
});

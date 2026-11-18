/// <reference types="@cloudflare/vitest-plugin/types" />

import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import type { AuthRes, ViewMessage } from "@cd/protocol";
import { describe, expect, it } from "vitest";
import type { GameRoom } from "../src/game-room";

const BASE = "https://worker.test";
const PW = "hunter22";

let ipSeq = 0;
function nextIp(): string {
  ipSeq++;
  return `10.88.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
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

const roomStub = (code: string) => env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));

/** Turns the test hooks on for the Worker and (per room) the Durable Object. */
function hooks(on: boolean): void {
  (env as unknown as Record<string, string | undefined>).ALLOW_TEST_HOOKS = on ? "1" : undefined;
}
async function hooksInRoom(code: string, clock: { now: number }): Promise<void> {
  await runInDurableObject(roomStub(code), async (room: GameRoom) => {
    const r = room as unknown as { env: Record<string, unknown> };
    r.env = { ...r.env, ALLOW_TEST_HOOKS: "1" };
    (room as unknown as { now: () => number }).now = () => clock.now;
  });
}

interface Frame {
  type: string;
  [k: string]: unknown;
}

class Client {
  frames: Frame[] = [];
  raw: string[] = [];
  closed: { code: number } | null = null;
  private constructor(private ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const s = String(e.data);
      this.raw.push(s);
      this.frames.push(JSON.parse(s) as Frame);
    });
    ws.addEventListener("close", (e) => {
      this.closed = { code: e.code };
    });
  }
  static async open(code: string): Promise<Client> {
    const res = await exports.default.fetch(
      new Request(`${BASE}/ws/game/${code}`, {
        headers: {
          Upgrade: "websocket",
          Origin: "http://localhost:5173",
          "cf-connecting-ip": nextIp(),
        },
      }),
    );
    expect(res.status).toBe(101);
    const ws = res.webSocket as WebSocket;
    ws.accept();
    return new Client(ws);
  }
  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }
  close(): void {
    this.ws.close(1000, "bye");
  }
  async until<T>(fn: () => T | undefined | false, ms = 3000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timeout; frames: ${this.raw.join("\n").slice(-600)}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  view(): ViewMessage | undefined {
    return [...this.frames].reverse().find((f) => f.type === "view") as ViewMessage | undefined;
  }
  async nextView(after: number): Promise<ViewMessage> {
    return this.until(() => {
      const v = this.view();
      return v && v.version > after ? v : undefined;
    });
  }
  async lastError(from = 0): Promise<Frame> {
    return this.until(() => this.frames.slice(from).find((f) => f.type === "error"));
  }
  async waitClose(): Promise<number> {
    return this.until(() => this.closed?.code);
  }
}

interface Room {
  code: string;
  host: AuthRes;
  players: AuthRes[];
  clients: Client[];
  clock: { now: number };
}

/** Creates a room with `n` seats, starts it, and connects + authenticates every seat. */
async function setup(n: number, opts: { start?: boolean } = {}): Promise<Room> {
  const cr = await api("POST", "/api/games", {
    body: { roomName: "Play", name: "P0", password: PW, maxPlayers: Math.max(n, 2), listed: false },
  });
  expect(cr.status).toBe(201);
  const host = (await cr.json()) as AuthRes;
  const players = [host];
  for (let i = 1; i < n; i++) {
    const r = await api("POST", `/api/games/${host.code}/join`, {
      body: { name: `P${i}`, password: PW },
    });
    expect(r.status).toBe(201);
    players.push((await r.json()) as AuthRes);
  }
  const clock = { now: Date.now() };
  await hooksInRoom(host.code, clock);
  if (opts.start !== false) {
    // Seat 0 rolls a 6 in the first-player roll-off, so it is always the active seat.
    hooks(true);
    const d = await api("POST", `/api/games/${host.code}/__test/dice`, {
      body: { faces: [6, ...Array(n - 1).fill(1)] },
    });
    hooks(false);
    expect(d.status).toBe(204);
    expect((await api("POST", `/api/games/${host.code}/start`, { token: host.token })).status).toBe(
      204,
    );
  }
  const clients: Client[] = [];
  for (const p of players) {
    const c = await Client.open(host.code);
    c.send({ type: "auth", token: p.token });
    await c.until(() => c.view());
    clients.push(c);
  }
  // Settle: every client has seen every seat online (all presence broadcasts delivered).
  for (const c of clients) await c.until(() => c.view()?.seats.every((x) => x.online));
  return { code: host.code, host, players, clients, clock };
}

const turnOf = (v: ViewMessage) => (v.game?.turn?.number ?? 0) as number;

describe("auth", () => {
  it("command before auth closes 4001; bad token → sessionEnded + 4004", async () => {
    const r = await setup(2, { start: false });
    const a = await Client.open(r.code);
    a.send({ type: "roll", turn: 1 });
    expect(await a.waitClose()).toBe(4001);
    const b = await Client.open(r.code);
    b.send({ type: "auth", token: "A".repeat(43) });
    await b.until(() => b.frames.find((f) => f.type === "sessionEnded"));
    expect(await b.waitClose()).toBe(4004);
  });

  it("5 invalid frames close with 4008; ping → pong", async () => {
    const r = await setup(2, { start: false });
    const c = r.clients[0] as Client;
    c.send({ type: "ping" });
    await c.until(() => c.frames.find((f) => f.type === "pong"));
    for (let i = 0; i < 5; i++) c.send({ type: "nope" });
    expect(await c.waitClose()).toBe(4008);
  });
});

describe("commands", () => {
  it("passive roll → E_NOT_ACTIVE_PLAYER, version unchanged; stale turn → E_STALE_TURN", async () => {
    const r = await setup(3);
    const c1 = r.clients[1] as Client;
    const v0 = c1.view() as ViewMessage;
    c1.send({ type: "roll", turn: turnOf(v0) });
    const e = await c1.lastError();
    expect(e.code).toBe("E_NOT_ACTIVE_PLAYER");
    expect((c1.view() as ViewMessage).version).toBe(v0.version);
    c1.send({ type: "roll", turn: turnOf(v0) + 5 });
    await c1.until(() => c1.frames.filter((f) => f.type === "error").length >= 2);
    expect(c1.frames.filter((f) => f.type === "error")[1]?.code).toBe("E_STALE_TURN");
  });

  it("5 players: hidden Action 1 decisions are never leaked before the reveal", async () => {
    const r = await setup(5);
    hooks(true);
    const dice = await api("POST", `/api/games/${r.code}/__test/dice`, {
      body: { faces: Array(12).fill(1) },
    });
    hooks(false);
    expect(dice.status).toBe(204);
    const [c0, c1, c2, c3, c4] = r.clients as [Client, Client, Client, Client, Client];
    const t = turnOf(c0.view() as ViewMessage);
    c0.send({ type: "roll", turn: t });
    await c0.until(() => c0.view()?.game?.phase === "ACTION_1");
    const mark = { type: "action1", turn: t, kind: "MARK", color: "RED" };
    // Seat 4 marks; the others pass. Frames are only inspected before the 5th decision.
    c4.send(mark);
    await c4.until(() => c4.view()?.you.action1Decision);
    const cut = [c0, c1, c2, c3].map((c) => c.raw.length);
    for (const c of [c0, c1, c2]) c.send({ type: "action1", turn: t, kind: "PASS" });
    await c0.until(() => c0.view()?.game?.players.filter((p) => p.action1Submitted).length === 4);
    // 4 decisions in: still ACTION_1 everywhere, 4 flagged submitted.
    for (const c of [c0, c1, c2, c3, c4]) expect(c.view()?.game?.phase).toBe("ACTION_1");
    const ownerless = [c0, c1, c2, c3].map((c, i) => c.raw.slice(cut[i]).join("\n"));
    for (const s of ownerless) expect(s).not.toMatch(/"action1Decision":\{"kind":"MARK"/);
    const before = [c0, c1, c2, c3].map((c) => c.raw.join("\n"));
    for (const s of before) expect(s).not.toMatch(/"action1Decision":\{"kind":"MARK"/);
    // Each seat only ever saw its own decision (seats 0-2 passed; none saw a MARK).
    c3.send({ type: "action1", turn: t, kind: "PASS" });
    await c0.until(() => c0.view()?.game?.phase === "ACTION_2");
    for (const c of [c0, c1, c2, c3, c4]) expect(c.view()?.game?.phase).toBe("ACTION_2");
  });
});

describe("lobby phase", () => {
  it("a kicked seat's socket gets kicked + 4003", async () => {
    const r = await setup(3, { start: false });
    const victim = r.clients[2] as Client;
    const res = await api("POST", `/api/games/${r.code}/kick`, {
      token: r.host.token,
      body: { seatId: r.players[2]?.seatId },
    });
    expect(res.status).toBe(204);
    await victim.until(() => victim.frames.find((f) => f.type === "kicked"));
    expect(await victim.waitClose()).toBe(4003);
  });
});

describe("away and rematch", () => {
  it("host marks an offline seat away; rounds complete and its penalties accrue", async () => {
    const r = await setup(3);
    const [c0, c1, c2] = r.clients as [Client, Client, Client];
    const away = r.players[1]?.seatId as string;
    // Too soon while the seat is still online / just left.
    c0.send({ type: "setAway", seatId: away, away: true });
    expect((await c0.lastError()).code).toBe("E_TOO_SOON");
    c1.close();
    await c0.until(() => c0.view()?.seats.find((s) => s.seatId === away)?.online === false);
    r.clock.now += 3 * 60_000;
    c0.send({ type: "setAway", seatId: away, away: true });
    await c0.until(() => c0.view()?.seats.find((s) => s.seatId === away)?.away);
    // Play until seat 1 has taken a turn (turn 2) and the game is back awaiting seat 2.
    for (let guard = 0; guard < 6; guard++) {
      const v = c0.view() as ViewMessage;
      if (turnOf(v) >= 3) break;
      const t = turnOf(v);
      const active = v.game?.turn?.activeSeat;
      const cs = [c0, c2];
      if (v.game?.phase === "AWAIT_ROLL" && active !== 1) {
        (active === 0 ? c0 : c2).send({ type: "roll", turn: t });
        await c0.until(() => c0.view()?.game?.phase !== "AWAIT_ROLL");
      }
      const p = (c0.view() as ViewMessage).game?.phase;
      if (p === "ACTION_1") {
        const before = (c0.view() as ViewMessage).version;
        for (const c of cs) c.send({ type: "action1", turn: t, kind: "PASS" });
        await c0.nextView(before);
        await c0.until(() => c0.view()?.game?.phase !== "ACTION_1");
      }
      if ((c0.view() as ViewMessage).game?.phase === "ACTION_2" && active !== 1) {
        (active === 0 ? c0 : c2).send({ type: "action2", turn: t, kind: "PASS" });
        await c0.until(() => turnOf(c0.view() as ViewMessage) > t);
      }
      await c0.until(() => c0.view()?.game?.phase);
    }
    const v = c0.view() as ViewMessage;
    expect(turnOf(v)).toBeGreaterThanOrEqual(3);
    const sheet1 = v.game?.players.find((p) => p.seat === 1)?.sheet as { penalties: number };
    expect(sheet1.penalties).toBeGreaterThanOrEqual(1);
  });

  it("rematch resets the game and keeps the seats", async () => {
    const r = await setup(2);
    // Force GAME_OVER by editing stored state is engine-specific; instead check the guards.
    const c0 = r.clients[0] as Client;
    const c1 = r.clients[1] as Client;
    c1.send({ type: "rematch" });
    expect((await c1.lastError()).code).toBe("E_NOT_HOST");
    c0.send({ type: "rematch" });
    expect((await c0.lastError()).code).toBe("E_WRONG_PHASE");
    // Drive the game to GAME_OVER via the room internals, then rematch.
    await runInDurableObject(roomStub(r.code), async (room: GameRoom) => {
      const { fromJSON, toJSON } = await import("@cd/engine");
      const store = (room as unknown as { store: { getState(): Promise<string | undefined> } })
        .store;
      const raw = (await store.getState()) as string;
      const s = fromJSON(raw);
      const over = { ...s, phase: "GAME_OVER" as const };
      await (room as unknown as { ctx: DurableObjectState }).ctx.storage.put(
        "state",
        toJSON(over as typeof s),
      );
    });
    const before = (c0.view() as ViewMessage).seats.map((s) => s.seatId);
    c0.send({ type: "rematch" });
    const v = await c0.until(() => {
      const x = c0.view();
      return x?.game?.phase === "AWAIT_ROLL" ? x : undefined;
    });
    expect(v.seats.map((s) => s.seatId)).toEqual(before);
    expect(v.room.status).toBe("playing");
    expect(turnOf(v)).toBe(1);
  });
});

describe("test hooks", () => {
  it("dice route is 404 when ALLOW_TEST_HOOKS is not 1", async () => {
    hooks(false);
    const r = await api("POST", "/api/games/ABCDEF/__test/dice", { body: { faces: [1] } });
    expect(r.status).toBe(404);
  });
});

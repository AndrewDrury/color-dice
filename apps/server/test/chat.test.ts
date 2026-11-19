/// <reference types="@cloudflare/vitest-plugin/types" />

import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import type { AuthRes, ViewMessage } from "@cd/protocol";
import { describe, expect, it } from "vitest";

const BASE = "https://worker.test";
const PW = "hunter22";

let ipSeq = 0;
const nextIp = () => `10.77.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

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

interface Frame {
  type: string;
  [k: string]: unknown;
}

class Client {
  frames: Frame[] = [];
  closed: number | null = null;
  private constructor(private ws: WebSocket) {
    ws.addEventListener("message", (e) => this.frames.push(JSON.parse(String(e.data)) as Frame));
    ws.addEventListener("close", (e) => {
      this.closed = e.code;
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
  async until<T>(fn: () => T | undefined | false, ms = 3000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timeout: ${JSON.stringify(this.frames).slice(-500)}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  of(type: string): Frame[] {
    return this.frames.filter((f) => f.type === type);
  }
  /** Waits until `n` frames of `type` have arrived. */
  async count(type: string, n: number): Promise<Frame[]> {
    return this.until(() => (this.of(type).length >= n ? this.of(type) : undefined));
  }
}

async function setup(n: number, opts: { start?: boolean; listed?: boolean } = {}) {
  const cr = await api("POST", "/api/games", {
    body: {
      roomName: "Chat",
      name: "P0",
      password: PW,
      maxPlayers: Math.max(opts.start ? n : n + 1, 2),
      listed: opts.listed ?? false,
    },
  });
  const host = (await cr.json()) as AuthRes;
  const players = [host];
  for (let i = 1; i < n; i++) {
    const r = await api("POST", `/api/games/${host.code}/join`, {
      body: { name: `P${i}`, password: PW },
    });
    players.push((await r.json()) as AuthRes);
  }
  const clients: Client[] = [];
  for (const p of players) clients.push(await connect(host.code, p.token));
  return { code: host.code, players, clients };
}

async function connect(code: string, token: string): Promise<Client> {
  const c = await Client.open(code);
  c.send({ type: "auth", token });
  await c.count("chatHistory", 1);
  return c;
}

describe("chat", () => {
  it("broadcasts one cleaned text to every seat, in every status; no view, no version bump", async () => {
    for (const start of [false, true]) {
      const r = await setup(3, { start });
      const [a, b, c] = r.clients as [Client, Client, Client];
      const views = a.of("view").length;
      const v0 = (a.of("view").at(-1) as unknown as ViewMessage).version;
      a.send({ type: "chat", text: "  hello \n  world 🎉 " });
      const got = await Promise.all([a, b, c].map((x) => x.count("chat", 1)));
      const first = got[0]?.[0] as Frame;
      expect(first).toMatchObject({
        kind: "text",
        text: "hello world 🎉",
        seatId: r.players[0]?.seatId,
      });
      expect(typeof first.id).toBe("number");
      expect(typeof first.at).toBe("number");
      for (const g of got) expect(g[0]).toEqual(first);
      await new Promise((res) => setTimeout(res, 50));
      expect(a.of("view").length).toBe(views);
      expect((a.of("view").at(-1) as unknown as ViewMessage).version).toBe(v0);
    }
  });

  it("broadcasts allow-listed reactions; rejects others", async () => {
    const r = await setup(2);
    const [a, b] = r.clients as [Client, Client];
    a.send({ type: "react", emoji: "mad-the-internet-gif-by-moodman" });
    expect((await b.count("chat", 1))[0]).toMatchObject({
      kind: "reaction",
      emoji: "mad-the-internet-gif-by-moodman",
    });
    // Old emoji keys (K5.1) and anything else off the allow-list are rejected.
    a.send({ type: "react", emoji: "🔥" });
    a.send({ type: "react", emoji: "hello" });
    await a.count("error", 2);
    expect(a.of("error").every((e) => e.code === "E_INVALID_COMMAND")).toBe(true);
    expect(b.of("chat")).toHaveLength(1);
  });

  it("rejects empty, control-only and over-long text; echoes HTML verbatim", async () => {
    const r = await setup(2);
    const [a, b] = r.clients as [Client, Client];
    for (const text of ["", "   \n\t ", "\u0000\u0007", "x".repeat(201)])
      a.send({ type: "chat", text });
    await a.count("error", 4);
    expect(a.of("error").every((e) => e.code === "E_INVALID_COMMAND" && e.command === "chat")).toBe(
      true,
    );
    expect(b.of("chat")).toHaveLength(0);
    a.send({ type: "chat", text: "<img src=x onerror=alert(1)>" });
    expect((await b.count("chat", 1))[0]?.text).toBe("<img src=x onerror=alert(1)>");
  });

  it("rate limits the 6th text to the sender only", async () => {
    const r = await setup(2);
    const [a, b] = r.clients as [Client, Client];
    for (let i = 0; i < 6; i++) a.send({ type: "chat", text: `m${i}` });
    const e = (await a.count("error", 1))[0] as Frame;
    expect(e).toMatchObject({ code: "E_RATE_LIMITED", command: "chat" });
    await b.count("chat", 5);
    await new Promise((res) => setTimeout(res, 50));
    expect(b.of("chat")).toHaveLength(5);
    expect(b.of("error")).toHaveLength(0);
    expect(a.closed).toBeNull();
  });

  it("closes unauthed senders with 4001; extra fields are invalid", async () => {
    const r = await setup(2);
    const u = await Client.open(r.code);
    u.send({ type: "chat", text: "hi" });
    await u.until(() => u.closed === 4001);
    const a = r.clients[0] as Client;
    a.send({ type: "chat", text: "hi", extra: 1 });
    expect((await a.count("error", 1))[0]?.code).toBe("E_INVALID_COMMAND");
  });

  it("sends the last 30 text messages (no reactions) to a fresh socket", async () => {
    const r = await setup(2);
    const clock = { now: Date.now() };
    await runInDurableObject(
      env.GAME_ROOM.get(env.GAME_ROOM.idFromName(r.code)),
      async (room: unknown) => {
        (room as { now: () => number }).now = () => clock.now;
      },
    );
    const a = r.clients[0] as Client;
    let sent = 0;
    for (let batch = 0; batch < 7; batch++) {
      clock.now += 11_000;
      for (let i = 0; i < 5; i++) a.send({ type: "chat", text: `m${sent++}` });
      a.send({ type: "react", emoji: "cat-gif" });
      await a.count("chat", (batch + 1) * 6);
    }
    const c = await connect(r.code, (r.players[1] as AuthRes).token);
    const hist = c.of("chatHistory")[0]?.messages as Frame[];
    expect(hist).toHaveLength(30);
    expect(hist.every((m) => m.kind === "text")).toBe(true);
    expect(hist.map((m) => m.text)).toEqual(Array.from({ length: 30 }, (_, i) => `m${i + 5}`));
    const ids = hist.map((m) => m.id as number);
    expect([...ids].sort((x, y) => x - y)).toEqual(ids);
  });

  it("a reclaimed (old) session cannot send", async () => {
    const r = await setup(2);
    const [, b] = r.clients as [Client, Client];
    b.send({ type: "ping" });
    // Old socket closes, then the seat is reclaimed with a new token.
    (b as unknown as { ws: WebSocket }).ws.close(1000, "bye");
    await new Promise((res) => setTimeout(res, 50));
    const rc = await api("POST", `/api/games/${r.code}/reclaim`, {
      body: { name: "P1", password: PW },
    });
    expect(rc.status).toBe(200);
    const fresh = (await rc.json()) as AuthRes;
    const old = await Client.open(r.code);
    old.send({ type: "auth", token: (r.players[1] as AuthRes).token });
    await old.until(() => old.of("sessionEnded").length > 0);
    await old.until(() => old.closed === 4004);
    expect(old.of("chat")).toHaveLength(0);
    const c = await connect(r.code, fresh.token);
    expect(c.of("chatHistory")[0]?.messages).toEqual([]);
  });

  it("never reaches the public list", async () => {
    const r = await setup(2, { listed: true });
    const a = r.clients[0] as Client;
    a.send({ type: "chat", text: "secret-chat-text" });
    await a.count("chat", 1);
    const list = await env.LOBBY.get(env.LOBBY.idFromName("main")).list();
    expect(JSON.stringify(list)).not.toContain("secret-chat-text");
    const res = await api("GET", "/api/games");
    expect(await res.text()).not.toContain("secret-chat-text");
  });
});

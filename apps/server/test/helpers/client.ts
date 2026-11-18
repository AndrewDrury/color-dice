/// <reference types="@cloudflare/vitest-plugin/types" />
/** HTTP + WebSocket helpers for server-level end-to-end tests. */
import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import type { AuthRes, ViewMessage } from "@cd/protocol";
import { expect } from "vitest";
import type { GameRoom } from "../../src/game-room";

const BASE = "https://worker.test";
export const PASSWORD = "hunter22";

let ipSeq = 0;
/** A fresh client IP per request so the rate limiter never interferes. */
function nextIp(): string {
  ipSeq++;
  return `10.77.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
}

export async function api(
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

export interface Frame {
  type: string;
  [k: string]: unknown;
}

export interface Conn {
  frames: Frame[];
  send(msg: unknown): void;
  close(): void;
  /** Waits for the first not-yet-consumed frame of this type. */
  next(type: string): Promise<Frame>;
  view(): ViewMessage;
  until<T>(fn: () => T | undefined | false, ms?: number): Promise<T>;
}

async function pollUntil<T>(
  fn: () => T | undefined | false,
  describe: () => string,
  ms: number,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout; ${describe()}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Opens a socket for `code`, authenticates with `token`, resolves after the first view. */
export async function connect(code: string, token: string): Promise<Conn> {
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
  const frames: Frame[] = [];
  const consumed = new Map<string, number>();
  ws.addEventListener("message", (e) => frames.push(JSON.parse(String(e.data)) as Frame));
  const tail = () => JSON.stringify(frames.slice(-2)).slice(-500);
  const until = <T>(fn: () => T | undefined | false, ms = 4000) =>
    pollUntil(fn, () => `last frames: ${tail()}`, ms);
  const conn: Conn = {
    frames,
    send: (m) => ws.send(JSON.stringify(m)),
    close: () => ws.close(1000, "bye"),
    next: async (type) => {
      const from = consumed.get(type) ?? 0;
      const f = await until(() => frames.filter((x) => x.type === type)[from]);
      consumed.set(type, from + 1);
      return f;
    },
    view: () => {
      const v = [...frames].reverse().find((f) => f.type === "view");
      if (!v) throw new Error("no view yet");
      return v as unknown as ViewMessage;
    },
    until,
  };
  conn.send({ type: "auth", token });
  await until(() => frames.find((f) => f.type === "view"));
  return conn;
}

export interface TestRoom {
  code: string;
  players: AuthRes[];
  clock: { now: number };
}

const roomStub = (code: string) => env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));

/** Test hooks are read from the Worker env (route) and from the room's own env. */
export function setHooks(on: boolean): void {
  (env as unknown as Record<string, string | undefined>).ALLOW_TEST_HOOKS = on ? "1" : undefined;
}

export async function createRoom(n: number): Promise<TestRoom> {
  const cr = await api("POST", "/api/games", {
    body: {
      roomName: "Full",
      name: "P0",
      password: PASSWORD,
      maxPlayers: Math.max(n, 2),
      listed: false,
    },
  });
  expect(cr.status).toBe(201);
  const host = (await cr.json()) as AuthRes;
  const room: TestRoom = { code: host.code, players: [host], clock: { now: Date.now() } };
  for (let i = 1; i < n; i++) room.players.push(await joinRoom(host.code, `P${i}`));
  await runInDurableObject(roomStub(host.code), async (r: GameRoom) => {
    const x = r as unknown as { env: Record<string, unknown> };
    x.env = { ...x.env, ALLOW_TEST_HOOKS: "1" };
  });
  return room;
}

export async function joinRoom(code: string, name: string): Promise<AuthRes> {
  const r = await api("POST", `/api/games/${code}/join`, { body: { name, password: PASSWORD } });
  expect(r.status).toBe(201);
  return (await r.json()) as AuthRes;
}

/** Appends scripted dice faces to the room's queue. */
export async function queueDice(code: string, faces: number[]): Promise<void> {
  setHooks(true);
  try {
    const r = await api("POST", `/api/games/${code}/__test/dice`, { body: { faces } });
    expect(r.status).toBe(204);
  } finally {
    setHooks(false);
  }
}

export async function startGame(room: TestRoom): Promise<void> {
  const host = room.players[0] as AuthRes;
  const r = await api("POST", `/api/games/${room.code}/start`, { token: host.token });
  expect(r.status).toBe(204);
}

export async function connectAll(room: TestRoom): Promise<Conn[]> {
  const conns: Conn[] = [];
  for (const p of room.players) conns.push(await connect(room.code, p.token));
  // Settle: every client has seen every seat online.
  for (const c of conns) await c.until(() => c.view().seats.every((s) => s.online));
  return conns;
}

export type Decision = "PASS" | "RED" | "YELLOW" | "GREEN" | "BLUE";

export interface TurnScript {
  /** Per-seat Action 1 decision. */
  a1: Decision[];
  /** Active player's Action 2 (always PASS in these scripts). */
  a2?: "PASS";
}

/**
 * Plays one scripted turn: active seat rolls, every seat submits Action 1, and
 * the active seat passes Action 2 if the game is still running. Dice must already be queued.
 */
export async function playTurn(conns: Conn[], script: TurnScript): Promise<void> {
  const c0 = conns[0] as Conn;
  const v = c0.view();
  const turn = v.game?.turn as { number: number; activeSeat: number };
  const active = conns[turn.activeSeat] as Conn;
  active.send({ type: "roll", turn: turn.number });
  await c0.until(() => c0.view().game?.phase === "ACTION_1");
  conns.forEach((c, i) => {
    const d = script.a1[i] as Decision;
    c.send(
      d === "PASS"
        ? { type: "action1", turn: turn.number, kind: "PASS" }
        : { type: "action1", turn: turn.number, kind: "MARK", color: d },
    );
  });
  await c0.until(() => c0.view().game?.phase !== "ACTION_1");
  if (c0.view().game?.phase === "ACTION_2") {
    active.send({ type: "action2", turn: turn.number, kind: "PASS" });
    await c0.until(() => c0.view().game?.phase !== "ACTION_2");
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay } from "../src/backoff";
import { GameSocket, LobbySocket } from "../src/ws";
import { CODE, makeView, TOKEN } from "./fixtures";

class FakeWS {
  static instances: FakeWS[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const Impl = FakeWS as unknown as new (url: string) => WebSocket;
const last = () => FakeWS.instances[FakeWS.instances.length - 1] as FakeWS;

beforeEach(() => {
  FakeWS.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("backoffDelay", () => {
  it("doubles from 0.5 s to a cap of 8 s with ±20 % jitter", () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 6].map((a) => backoffDelay(a, mid))).toEqual([
      500, 1000, 2000, 4000, 8000, 8000, 8000,
    ]);
    expect(backoffDelay(0, () => 0)).toBe(400);
    expect(backoffDelay(4, () => 1)).toBe(9600);
  });
});

describe("GameSocket", () => {
  it("sends auth first, goes online on a valid view, and pings every 25 s", () => {
    const sock = new GameSocket({ baseUrl: "ws://x", WebSocketImpl: Impl });
    const statuses: string[] = [];
    const msgs: string[] = [];
    sock.onStatus((s) => statuses.push(s));
    sock.onMessage((m) => msgs.push(m.type));
    sock.connect(CODE, TOKEN);
    const ws = last();
    expect(ws.url).toBe(`ws://x/ws/game/${CODE}`);
    ws.open();
    expect(JSON.parse(ws.sent[0] ?? "")).toEqual({ type: "auth", token: TOKEN });
    ws.receive({ type: "view", extra: 1 }); // invalid → dropped
    ws.receive("not json");
    ws.receive(makeView(1));
    expect(msgs).toEqual(["view"]);
    expect(statuses).toEqual(["connecting", "online"]);
    vi.advanceTimersByTime(25_000);
    expect(JSON.parse(ws.sent[1] ?? "")).toEqual({ type: "ping" });
    expect(sock.send({ type: "roll", turn: 0 })).toBe(false); // invalid turn
    expect(sock.send({ type: "roll", turn: 1 })).toBe(true);
    sock.close();
    expect(statuses.at(-1)).toBe("ended");
  });

  it("reconnects with 0.5, 1, 2, 4, 8, 8 s and re-sends auth", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const sock = new GameSocket({ baseUrl: "ws://x", WebSocketImpl: Impl });
    const statuses: string[] = [];
    sock.onStatus((s) => statuses.push(s));
    sock.connect(CODE, TOKEN);
    expect(FakeWS.instances).toHaveLength(1);
    for (const delay of [500, 1000, 2000, 4000, 8000, 8000]) {
      const n = FakeWS.instances.length;
      last().serverClose(1006);
      vi.advanceTimersByTime(delay - 1);
      expect(FakeWS.instances).toHaveLength(n);
      vi.advanceTimersByTime(1);
      expect(FakeWS.instances).toHaveLength(n + 1);
    }
    expect(statuses).toEqual(["connecting", "reconnecting"]);
    // A successful reconnect resets the backoff.
    last().open();
    expect(JSON.parse(last().sent[0] ?? "")).toEqual({ type: "auth", token: TOKEN });
    last().receive({ type: "pong" });
    expect(statuses.at(-1)).toBe("online");
    const n = FakeWS.instances.length;
    last().serverClose(1006);
    vi.advanceTimersByTime(500);
    expect(FakeWS.instances).toHaveLength(n + 1);
    sock.close();
  });

  it.each([
    [4004, "sessionEnded"],
    [4003, "kicked"],
    [4001, "notAuthed"],
  ])("does not reconnect after close code %i", (code, reason) => {
    const sock = new GameSocket({ baseUrl: "ws://x", WebSocketImpl: Impl });
    const ended: Array<string | undefined> = [];
    sock.onStatus((s, r) => {
      if (s === "ended") ended.push(r);
    });
    sock.connect(CODE, TOKEN);
    last().open();
    last().receive({ type: "sessionEnded" });
    last().serverClose(code);
    vi.advanceTimersByTime(60_000);
    expect(FakeWS.instances).toHaveLength(1);
    expect(ended).toEqual([reason]);
    expect(sock.status).toBe("ended");
  });

  it("refuses an invalid code or token without opening a socket", () => {
    const sock = new GameSocket({ baseUrl: "ws://x", WebSocketImpl: Impl });
    sock.connect("bad", TOKEN);
    sock.connect(CODE, "short");
    expect(FakeWS.instances).toHaveLength(0);
  });
});

describe("LobbySocket", () => {
  it("emits validated games lists, never sends, and reconnects", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const sock = new LobbySocket({ baseUrl: "ws://x", WebSocketImpl: Impl });
    const lists: number[] = [];
    sock.onGames((g) => lists.push(g.length));
    sock.connect();
    const ws = last();
    expect(ws.url).toBe("ws://x/ws/lobby");
    ws.open();
    const game = {
      code: CODE,
      roomName: "Friday dice",
      players: 1,
      maxPlayers: 4,
      createdAt: 1,
    };
    ws.receive({ type: "games", games: [game] });
    ws.receive({ type: "games", games: [{ ...game, password: "x" }] }); // extra field → dropped
    expect(lists).toEqual([1]);
    expect(ws.sent).toEqual([]);
    ws.serverClose(1006);
    vi.advanceTimersByTime(500);
    expect(FakeWS.instances).toHaveLength(2);
    sock.close();
  });
});

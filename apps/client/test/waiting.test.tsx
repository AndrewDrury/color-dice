import type { ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { getRoute, navigate } from "../src/router";
import { inviteUrl, KICKED_TEXT, startLabel } from "../src/screens/WaitingRoom";
import { _resetMemoryForTests, getSession, saveSession } from "../src/session";
import { _resetStoreForTests, applyView, getState } from "../src/store";
import { CODE, makeView, SEAT, TOKEN } from "./fixtures";

const { FakeSocket, sockets } = vi.hoisted(() => {
  type Msg = import("@cd/protocol").ServerMessage;
  type St = import("../src/ws").SocketStatus;
  type Re = import("../src/ws").EndReason;
  const sockets: InstanceType<typeof FakeSocket>[] = [];
  class FakeSocket {
    msg = new Set<(m: Msg) => void>();
    stat = new Set<(s: St, r?: Re) => void>();
    connected: [string, string] | null = null;
    closed = false;
    constructor() {
      sockets.push(this);
    }
    connect(code: string, token: string) {
      this.connected = [code, token];
    }
    close() {
      this.closed = true;
    }
    onMessage(cb: (m: Msg) => void) {
      this.msg.add(cb);
      return () => this.msg.delete(cb);
    }
    onStatus(cb: (s: St, r?: Re) => void) {
      this.stat.add(cb);
      return () => this.stat.delete(cb);
    }
    emit(m: Msg) {
      for (const cb of this.msg) cb(m);
    }
    status(s: St, r?: Re) {
      for (const cb of this.stat) cb(s, r);
    }
  }
  return { FakeSocket, sockets };
});

vi.mock("../src/ws", () => {
  class LobbySocket {
    connect() {}
    close() {}
    onGames() {
      return () => {};
    }
    onStatus() {
      return () => {};
    }
  }
  return { GameSocket: FakeSocket, LobbySocket };
});
vi.mock("../src/fx/feedback", () => ({ feedback: vi.fn() }));
vi.mock("../src/api", async (orig) => {
  const actual = await orig<typeof import("../src/api")>();
  return {
    ApiError: actual.ApiError,
    startGame: vi.fn(),
    leaveGame: vi.fn(),
    kickSeat: vi.fn(),
    patchRoom: vi.fn(),
  };
});

const api = await import("../src/api");
const OTHER = "e5f6a7b8";

let version = 0;
function view(opts: { host?: boolean; seats?: number; status?: "lobby" | "playing" } = {}) {
  const v = makeView(++version);
  const host = opts.host ?? true;
  const names = ["Andrew", "Sam", "Cleo", "Dev", "Ria"];
  const ids = [SEAT, OTHER, "c0c0c0c0", "d0d0d0d0", "e0e0e0e0"];
  v.seats = names.slice(0, opts.seats ?? 1).map((name, i) => ({
    seatId: ids[i] ?? SEAT,
    name,
    host: host ? i === 0 : i === 1,
    online: true,
    away: false,
  }));
  v.you.host = host;
  if (opts.status) v.room.status = opts.status;
  return v;
}

function socket(): InstanceType<typeof FakeSocket> {
  const s = sockets.at(-1);
  if (!s) throw new Error("no socket");
  return s;
}

function show(v: ViewMessage) {
  act(() => {
    socket().emit(v);
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  _resetMemoryForTests();
  _resetStoreForTests();
  sockets.length = 0;
  vi.mocked(api.startGame).mockReset().mockResolvedValue();
  vi.mocked(api.kickSeat).mockReset().mockResolvedValue();
  vi.mocked(api.leaveGame).mockReset().mockResolvedValue();
  saveSession(CODE, { token: TOKEN, seatId: SEAT, name: "Andrew", roomName: "Friday dice" });
  history.replaceState(null, "", "/");
  navigate("waiting", CODE);
  render(<App />);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WaitingRoom", () => {
  it("connects with the saved session and shows the code", () => {
    expect(socket().connected).toEqual([CODE, TOKEN]);
    show(view());
    expect(screen.getByText(CODE)).toBeTruthy();
    expect(screen.getByText("Share the password privately — it isn't in the link.")).toBeTruthy();
    expect(screen.getByText("(you)")).toBeTruthy();
    expect(screen.getByText("Host")).toBeTruthy();
  });

  it("host sees Start, kick buttons and settings", () => {
    show(view({ seats: 2 }));
    expect(screen.getByRole("button", { name: "Start game" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Sam" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Andrew" })).toBeNull();
    expect(screen.getByText("Room settings")).toBeTruthy();
  });

  it("non-host sees a waiting line and no host controls", () => {
    show(view({ host: false, seats: 2 }));
    expect(screen.getByText("Waiting for the host to start…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start game|Need/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(screen.queryByText("Room settings")).toBeNull();
  });

  it("Start is disabled with 1 player and enabled with 2", async () => {
    show(view({ seats: 1 }));
    const need = screen.getByRole("button", { name: "Need 1 more player" }) as HTMLButtonElement;
    expect(need.disabled).toBe(true);
    show(view({ seats: 2 }));
    const start = screen.getByRole("button", { name: "Start game" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await flush();
    expect(api.startGame).toHaveBeenCalledWith(CODE, TOKEN);
  });

  it("startLabel covers the bounds", () => {
    expect(startLabel(1, 4)).toBe("Need 1 more player");
    expect(startLabel(0, 4)).toBe("Need 2 more players");
    expect(startLabel(4, 4)).toBe("Start game");
    expect(startLabel(5, 4)).toBe("Too many players");
  });

  it("kick asks for confirmation, then calls the API", async () => {
    show(view({ seats: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
    expect(api.kickSeat).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Remove Sam?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await flush();
    expect(api.kickSeat).toHaveBeenCalledWith(CODE, TOKEN, { seatId: OTHER });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("status playing switches to the game screen", () => {
    show(view({ seats: 2 }));
    show(view({ seats: 2, status: "playing" }));
    expect(getRoute()).toEqual({ screen: "game", code: CODE });
  });

  it("a kicked message forgets the session and goes home with a toast", () => {
    show(view({ host: false, seats: 2 }));
    act(() => socket().emit({ type: "kicked" }));
    expect(getRoute().screen).toBe("home");
    expect(getSession(CODE)).toBeNull();
    expect(getState().toast?.text).toBe(KICKED_TEXT);
    expect(socket().closed).toBe(true);
  });

  it("a sessionEnded close goes home with 'Your session ended'", () => {
    act(() => socket().status("ended", "sessionEnded"));
    expect(getRoute().screen).toBe("home");
    expect(getSession(CODE)).toBeNull();
    expect(getState().toast?.text).toBe("Your session ended");
  });

  it("Leave confirms, posts /leave, forgets the session and goes home", async () => {
    show(view());
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(api.leaveGame).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Leave game" }));
    await flush();
    expect(api.leaveGame).toHaveBeenCalledWith(CODE, TOKEN);
    expect(getSession(CODE)).toBeNull();
    expect(getRoute().screen).toBe("home");
    expect(getState().toast).toBeNull();
  });

  it("the lockout banner shows only for the host", () => {
    const locked = view({ seats: 2 });
    locked.room.joinLockedUntil = Date.now() + 10 * 60_000;
    show(locked);
    expect(screen.getByText(/Joining is paused until/)).toBeTruthy();
    const other = view({ host: false, seats: 2 });
    other.room.joinLockedUntil = Date.now() + 10 * 60_000;
    show(other);
    expect(screen.queryByText(/Joining is paused until/)).toBeNull();
  });

  it("renders names as text, never markup", () => {
    const v = view({ seats: 2 });
    const evil = "<img src=x onerror=alert(1)>";
    v.seats[1] = { ...v.seats[1], name: evil } as ViewMessage["seats"][number];
    show(v);
    expect(screen.getByText(evil)).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("Invite", () => {
  it("uses navigator.share when present", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText } });
    show(view());
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await flush();
    expect(share).toHaveBeenCalledWith({ title: "Join my Color Dice game", url: inviteUrl(CODE) });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the link (and only the link) without navigator.share", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });
    show(view());
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await flush();
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/?game=${CODE}`);
    expect(screen.getByRole("button", { name: /Link copied/ })).toBeTruthy();
  });

  it("ignores a cancelled share sheet", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText } });
    show(view());
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await flush();
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("store wiring", () => {
  it("applies views from the socket", () => {
    show(view());
    expect(getState().view?.code).toBe(CODE);
    expect(applyView(view())).toBe(true);
  });
});

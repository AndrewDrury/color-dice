import type { ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { t } from "../src/i18n";
import { _resetInviteForTests, inviteLink, primeInvite } from "../src/invite";
import { getRoute, navigate } from "../src/router";
import { startLabel } from "../src/screens/WaitingRoom";
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
    getInvite: vi.fn(),
    resetInvite: vi.fn(),
  };
});

const api = await import("../src/api");
const OTHER = "e5f6a7b8";
const KEY = "k".repeat(43);

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
    left: false,
    record: { wins: 0, ties: 0, losses: 0 },
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
  vi.mocked(api.getInvite).mockReset().mockResolvedValue({ inviteKey: KEY });
  _resetInviteForTests();
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
  it("connects with the saved session and never renders the code", () => {
    expect(socket().connected).toEqual([CODE, TOKEN]);
    show(view());
    expect(screen.queryByText(CODE)).toBeNull();
    expect(screen.getByText("Anyone with this link can join. No password needed.")).toBeTruthy();
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

  it("a full room shows the starting notice instead of Start / the waiting line", () => {
    const v = view({ seats: 2 });
    v.room.maxPlayers = 2;
    show(v);
    expect(screen.getByText("Room full — starting…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start game|Need/ })).toBeNull();
    const g = view({ host: false, seats: 2 });
    g.room.maxPlayers = 2;
    show(g);
    expect(screen.getByText("Room full — starting…")).toBeTruthy();
    expect(screen.queryByText("Waiting for the host to start…")).toBeNull();
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
    expect(getState().toast?.text).toBe(t("toast.kicked"));
    expect(socket().closed).toBe(true);
  });

  it("a sessionEnded close goes home and explains (generic text when /me is unreachable)", async () => {
    act(() => socket().status("ended", "sessionEnded"));
    expect(getRoute().screen).toBe("home");
    expect(getSession(CODE)).toBeNull();
    await vi.waitFor(() =>
      expect(getState().toast?.text).toBe(
        "Your session ended (maybe you joined from another device).",
      ),
    );
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
    expect(document.querySelector("img[src='x']")).toBeNull();
  });
});

describe("Invite", () => {
  const touch = (on: boolean) =>
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("coarse") }));

  it("loads the key and shows 'Copy invite link' without rendering the code", async () => {
    show(view());
    await flush();
    expect(api.getInvite).toHaveBeenCalledWith(CODE, TOKEN);
    const btn = screen.getByRole("button", { name: "Copy invite link" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(screen.queryByText(CODE)).toBeNull();
    expect(screen.queryByRole("heading", { name: CODE })).toBeNull();
  });

  it("uses navigator.share on touch devices", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    touch(true);
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText } });
    show(view());
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));
    await flush();
    expect(share).toHaveBeenCalledWith({
      title: "Join my Color Dice game",
      url: inviteLink(CODE, KEY),
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies on desktop even when navigator.share exists, then shows Copied!", async () => {
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    touch(false);
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText } });
    show(view());
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));
    await flush();
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
    const link = writeText.mock.calls[0]?.[0] as string;
    expect(link).toBe(`${location.origin}${import.meta.env.BASE_URL}#/join/${CODE}/${KEY}`);
    expect(link).not.toContain("?");
    expect(screen.getByRole("button", { name: /Copied!/ })).toBeTruthy();
  });

  it("ignores a cancelled share sheet", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    const writeText = vi.fn();
    touch(true);
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText } });
    primeInvite(CODE, KEY);
    show(view());
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));
    await flush();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("the host sees Reset invite link; a guest does not", async () => {
    vi.mocked(api.resetInvite).mockResolvedValue({ inviteKey: "n".repeat(43) });
    show(view({ host: true }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Reset invite link" }));
    await flush();
    expect(api.resetInvite).toHaveBeenCalledWith(CODE, TOKEN);
  });

  it("a guest does not get Reset invite link", async () => {
    show(view({ host: false, seats: 2 }));
    await flush();
    expect(screen.queryByRole("button", { name: "Reset invite link" })).toBeNull();
  });
});

describe("store wiring", () => {
  it("applies views from the socket", () => {
    show(view());
    expect(getState().view?.code).toBe(CODE);
    expect(applyView(view())).toBe(true);
  });
});

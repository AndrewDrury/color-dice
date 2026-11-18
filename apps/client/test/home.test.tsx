import type { PublicGame } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api";
import { getRoute, navigate } from "../src/router";
import { CreateGame } from "../src/screens/CreateGame";
import { Home } from "../src/screens/Home";
import { _resetMemoryForTests, getSession, listSessions, saveSession } from "../src/session";
import { CODE, SEAT, TOKEN } from "./fixtures";

const lobby = vi.hoisted(() => ({
  instances: [] as Array<{
    emit: (games: unknown[]) => void;
    closed: boolean;
  }>,
}));

vi.mock("../src/ws", () => {
  class LobbySocket {
    private cbs = new Set<(g: unknown[]) => void>();
    closed = false;
    constructor() {
      lobby.instances.push(this);
    }
    connect() {}
    close() {
      this.closed = true;
    }
    onGames(cb: (g: unknown[]) => void) {
      this.cbs.add(cb);
      return () => this.cbs.delete(cb);
    }
    onStatus() {
      return () => {};
    }
    emit(games: unknown[]) {
      for (const cb of this.cbs) cb(games);
    }
  }
  return { LobbySocket };
});

vi.mock("../src/api", async (orig) => {
  const actual = await orig<typeof import("../src/api")>();
  return {
    ApiError: actual.ApiError,
    getMe: vi.fn(),
    createGame: vi.fn(),
    joinGame: vi.fn(),
    reclaimSeat: vi.fn(),
  };
});

const api = await import("../src/api");

const INVITE = "A".repeat(43);
const XSS = "<img src=x onerror=alert(1)>";

function game(code: string, roomName: string, extra: Partial<PublicGame> = {}): PublicGame {
  return {
    code,
    roomName,
    players: 2,
    maxPlayers: 5,
    createdAt: Date.now() - 3 * 60_000,
    ...extra,
  };
}

function emit(games: PublicGame[]): void {
  const sock = lobby.instances.at(-1);
  if (!sock) throw new Error("no lobby socket");
  act(() => sock.emit(games));
}

beforeEach(() => {
  localStorage.clear();
  _resetMemoryForTests();
  lobby.instances.length = 0;
  vi.mocked(api.getMe).mockReset();
  vi.mocked(api.createGame).mockReset();
  history.replaceState(null, "", "/");
  navigate("home");
});

afterEach(() => {
  cleanup();
});

describe("Home", () => {
  it("renders live rows from a games message, names as literal text", () => {
    const { container } = render(<Home route={{ screen: "home", code: null }} />);
    expect(screen.getByText("Looking for open games…")).toBeTruthy();
    emit([game("K7QF2", "Friday dice"), game("ABCDE", XSS)]);
    expect(screen.getByText("Friday dice")).toBeTruthy();
    expect(screen.getByText(XSS)).toBeTruthy();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getAllByText("3 min ago")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Create game" }).className).toContain("btn-primary");
  });

  it("shows the empty state", () => {
    render(<Home route={{ screen: "home", code: null }} />);
    emit([]);
    expect(screen.getByText("No open games right now. Create one!")).toBeTruthy();
  });

  it("closes the lobby socket on unmount", () => {
    const { unmount } = render(<Home route={{ screen: "home", code: null }} />);
    expect(lobby.instances).toHaveLength(1);
    act(() => unmount());
    expect(lobby.instances[0]?.closed).toBe(true);
  });

  it("drops saved games whose session is gone (401)", async () => {
    saveSession(CODE, { token: TOKEN, seatId: SEAT, name: "Me", roomName: "Old room" });
    vi.mocked(api.getMe).mockRejectedValue(new ApiError(401, "E_NOT_AUTHED"));
    render(<Home route={{ screen: "home", code: null }} />);
    expect(screen.getByText("Old room")).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("Old room")).toBeNull();
    expect(getSession(CODE)).toBeNull();
  });

  it("filters the invite code and opens the join route", () => {
    render(<Home route={{ screen: "home", code: null }} />);
    const input = screen.getByLabelText("Have an invite code?") as HTMLInputElement;
    expect(input.getAttribute("autocapitalize")).toBe("characters");
    expect(input.getAttribute("enterkeyhint")).toBe("go");
    fireEvent.input(input, { target: { value: "k7-q f2x" } });
    expect(input.value).toBe("K7QF2");
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(getRoute()).toEqual({ screen: "join", code: "K7QF2" });
  });
});

describe("CreateGame", () => {
  it("shows inline field errors and does not submit invalid input", () => {
    render(<CreateGame />);
    fireEvent.click(screen.getByRole("button", { name: "Create game" }));
    expect(screen.getByText("Room names are 3–50 characters.")).toBeTruthy();
    expect(screen.getByText("Passwords are 4–64 characters.")).toBeTruthy();
    expect(api.createGame).not.toHaveBeenCalled();
  });

  it("a game card shows the room, count and age but no player name", () => {
    render(<Home route={{ screen: "home", code: null }} />);
    // Even if a (buggy or old) server sent a name, the card must not render it.
    emit([game("ABCDE", "Friday dice", { hostName: "Ana" } as Partial<PublicGame>)]);
    const card = screen.getByText("Friday dice").closest("li") as HTMLElement;
    expect(card.textContent).not.toContain("Ana");
    expect(card.textContent).not.toMatch(/host/i);
  });

  it("submits cleaned values, saves the session and goes to the waiting room", async () => {
    vi.mocked(api.createGame).mockResolvedValue({
      code: CODE,
      token: TOKEN,
      seatId: SEAT,
      inviteKey: INVITE,
    });
    render(<CreateGame />);
    fireEvent.input(screen.getByLabelText("Room name"), {
      target: { value: "  Friday ​  dice " },
    });
    fireEvent.input(screen.getByLabelText("Your name"), { target: { value: " Andrew  " } });
    fireEvent.input(screen.getByLabelText("Password"), { target: { value: " pw 1 " } });
    fireEvent.click(screen.getByLabelText("3"));
    fireEvent.click(screen.getByLabelText("Show in public list"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create game" }));
      await Promise.resolve();
    });
    expect(api.createGame).toHaveBeenCalledWith({
      roomName: "Friday dice",
      name: "Andrew",
      password: " pw 1 ",
      maxPlayers: 3,
      listed: false,
    });
    expect(listSessions()).toEqual([
      { code: CODE, token: TOKEN, seatId: SEAT, name: "Andrew", roomName: "Friday dice" },
    ]);
    expect(getRoute()).toEqual({ screen: "waiting", code: CODE });
    expect(location.search).toBe(`?game=${CODE}`);
  });

  it("shows a friendly rate-limit message", async () => {
    vi.mocked(api.createGame).mockRejectedValue(new ApiError(429, "E_RATE_LIMITED", undefined, 42));
    render(<CreateGame />);
    fireEvent.input(screen.getByLabelText("Room name"), { target: { value: "Room" } });
    fireEvent.input(screen.getByLabelText("Your name"), { target: { value: "Me" } });
    fireEvent.input(screen.getByLabelText("Password"), { target: { value: "pass" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create game" }));
      await Promise.resolve();
    });
    expect(screen.getByText("Too many attempts, try again in 42 s.")).toBeTruthy();
  });
});

describe("Home record", () => {
  it("shows 'Your record' only when history is non-empty", async () => {
    const { recordGame, _resetHistoryForTests } = await import("../src/history");
    _resetHistoryForTests();
    const { unmount } = render(<Home route={{ screen: "home", code: null }} />);
    expect(screen.queryByTestId("your-record")).toBeNull();
    act(() => {
      recordGame({ code: CODE, game: 1, result: "W", at: 1 });
    });
    expect(screen.getByTestId("your-record").textContent).toBe("Your record: 1 W – 0 T – 0 L");
    unmount();
    localStorage.clear();
    _resetHistoryForTests();
  });
});

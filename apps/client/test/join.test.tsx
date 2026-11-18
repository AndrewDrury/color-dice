import type { PublicGame } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { ApiError } from "../src/api";
import { t } from "../src/i18n";
import { getRoute, navigate, startRouter } from "../src/router";
import { JoinDialog, WRONG_PASSWORD_LOCK_MS } from "../src/screens/JoinDialog";
import { _resetMemoryForTests, getSession } from "../src/session";
import { SEAT, TOKEN } from "./fixtures";

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

const CODE = "ABCDE";
const ROOM: PublicGame = {
  code: CODE,
  roomName: "Lunch break",
  hostName: "Sam",
  players: 1,
  maxPlayers: 2,
  createdAt: 0,
};

function fill(name: string, password: string): void {
  fireEvent.input(screen.getByLabelText("Your name"), { target: { value: name } });
  fireEvent.input(screen.getByLabelText("Password"), { target: { value: password } });
}

async function submit(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  _resetMemoryForTests();
  vi.mocked(api.joinGame).mockReset();
  history.replaceState(null, "", "/");
  navigate("home");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("JoinDialog", () => {
  it("shows the room name from the live list", () => {
    render(<JoinDialog code={CODE} games={[ROOM]} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Join Lunch break" })).toBeTruthy();
  });

  it("401 shows 'Wrong password.' and disables Join for 2 s", async () => {
    vi.useFakeTimers();
    vi.mocked(api.joinGame).mockRejectedValue(new ApiError(401, "E_BAD_CREDENTIALS"));
    render(<JoinDialog code={CODE} games={[ROOM]} onClose={() => {}} />);
    fill("Cleo", "nope");
    await submit();
    expect(api.joinGame).toHaveBeenCalledWith(CODE, { name: "Cleo", password: "nope" });
    expect(screen.getByText("Wrong password.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Join" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(WRONG_PASSWORD_LOCK_MS - 100);
    });
    expect(button.disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(button.disabled).toBe(false);
  });

  it("409 codes show their text; 429 shows the retry time", async () => {
    vi.mocked(api.joinGame).mockRejectedValueOnce(new ApiError(409, "E_NAME_TAKEN"));
    render(<JoinDialog code={CODE} games={[ROOM]} onClose={() => {}} />);
    fill("Cleo", "secret");
    await submit();
    expect(screen.getByText("Someone at the table already has that name.")).toBeTruthy();
    vi.mocked(api.joinGame).mockRejectedValueOnce(
      new ApiError(429, "E_RATE_LIMITED", undefined, 30),
    );
    await submit();
    expect(screen.getByText("Too many attempts, try again in 30 s.")).toBeTruthy();
  });

  it("shows a notice when the room disappears from the live list", () => {
    const { rerender } = render(<JoinDialog code={CODE} games={[ROOM]} onClose={() => {}} />);
    expect(screen.queryByText(t("join.gone"))).toBeNull();
    rerender(<JoinDialog code={CODE} games={[]} onClose={() => {}} />);
    expect(screen.getByText(t("join.gone"))).toBeTruthy();
    expect((screen.getByRole("button", { name: "Join" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("joins, saves the session and goes to the waiting room", async () => {
    vi.mocked(api.joinGame).mockResolvedValue({ code: CODE, token: TOKEN, seatId: SEAT });
    render(<JoinDialog code={CODE} games={[ROOM]} onClose={() => {}} />);
    fill("  Cleo ", "secret");
    await submit();
    expect(getSession(CODE)).toEqual({
      token: TOKEN,
      seatId: SEAT,
      name: "Cleo",
      roomName: "Lunch break",
    });
    expect(getRoute()).toEqual({ screen: "waiting", code: CODE });
  });

  it("links to Reclaim", () => {
    render(<JoinDialog code={CODE} games={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Reclaim my seat" }));
    expect(getRoute()).toEqual({ screen: "reclaim", code: CODE });
  });
});

describe("App", () => {
  it("?game=ABCDE opens the Join dialog", () => {
    history.replaceState(null, "", `/?game=${CODE.toLowerCase()}`);
    startRouter();
    render(<App />);
    expect(screen.getByRole("dialog", { name: "Join game" })).toBeTruthy();
    expect(screen.getByText(CODE)).toBeTruthy();
    expect(location.search).toBe(`?game=${CODE}`);
  });
});

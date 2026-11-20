import type { PublicGame } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { ApiError } from "../src/api";
import { t } from "../src/i18n";
import { rememberedProfile } from "../src/remembered";
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
    getTakenColors: vi.fn().mockResolvedValue({ taken: [] }),
    joinGame: vi.fn(),
    reclaimSeat: vi.fn(),
  };
});

const api = await import("../src/api");

const CODE = "ABCDE";
const ROOM: PublicGame = {
  code: CODE,
  roomName: "Lunch break",
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
    expect(api.joinGame).toHaveBeenCalledWith(CODE, {
      name: "Cleo",
      password: "nope",
      profile: expect.objectContaining({ cat: "mad-cat" }),
    });
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

  it("T-NEW-32: preselects a free colour when the remembered one is taken, and shows a lost race", async () => {
    const taken = rememberedProfile().color;
    const taken2 = taken === "sky" ? "teal" : "sky";
    vi.mocked(api.getTakenColors).mockResolvedValueOnce({ taken: [taken] });
    vi.mocked(api.joinGame).mockRejectedValueOnce(
      new ApiError(409, "E_COLOUR_TAKEN", `${taken},${taken2}`),
    );
    render(<JoinDialog code={CODE} games={[ROOM]} onClose={() => {}} />);
    await screen.findByRole("group", { name: "Choose colour" });
    await act(async () => {
      await Promise.resolve();
    });
    const radios = within(screen.getByRole("group", { name: "Choose colour" })).getAllByRole(
      "radio",
    ) as HTMLInputElement[];
    expect(radios.filter((r) => r.disabled).length).toBe(1);
    expect(radios.find((r) => r.checked)?.disabled).toBe(false);
    fill("Cleo", "secret");
    await submit();
    expect(screen.getByText(/just taken/)).toBeTruthy();
    const updated = within(screen.getByRole("group", { name: "Choose colour" })).getAllByRole(
      "radio",
    ) as HTMLInputElement[];
    expect(updated.filter((r) => r.disabled).length).toBe(2);
    expect(updated.find((r) => r.checked)?.disabled).toBe(false);
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
    expect(screen.queryByText(CODE)).toBeNull();
    expect(location.search).toBe(`?game=${CODE}`);
  });
});

describe("ProfilePicker taken colours (T-NEW-32)", () => {
  it("disables taken colours with an accessible label", async () => {
    const { ProfilePicker } = await import("../src/components/ProfilePicker");
    const onChange = vi.fn();
    render(
      <ProfilePicker
        value={{ color: "sky", cat: "mad-cat" }}
        onChange={onChange}
        taken={["teal"]}
      />,
    );
    const teal = screen.getByRole("radio", { name: /Teal \(taken\)/ }) as HTMLInputElement;
    expect(teal.disabled).toBe(true);
    fireEvent.click(teal);
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole("radio", { name: "Lime" }) as HTMLInputElement).disabled).toBe(false);
  });
});

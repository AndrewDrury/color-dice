import { CODE_ALPHABET, PASSWORD_MAX, PLAYER_NAME_MAX } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api";
import { Settings } from "../src/components/SettingsPanel";
import { _resetPrefsForTests } from "../src/prefs";
import {
  _resetRememberedForTests,
  clearRemembered,
  getRemembered,
  getRoomPassword,
  MAX_ROOM_PASSWORDS,
  REMEMBERED_KEY,
  rememberSubmit,
} from "../src/remembered";
import { navigate } from "../src/router";
import { CreateGame } from "../src/screens/CreateGame";
import { JoinDialog } from "../src/screens/JoinDialog";
import { Reclaim } from "../src/screens/Reclaim";
import { _resetMemoryForTests, saveSession } from "../src/session";
import { SEAT, TOKEN } from "./fixtures";

vi.mock("../src/api", async (orig) => {
  const actual = await orig<typeof import("../src/api")>();
  return {
    ApiError: actual.ApiError,
    getMe: vi.fn().mockResolvedValue({ status: "lobby" }),
    createGame: vi.fn(),
    joinGame: vi.fn(),
    reclaimSeat: vi.fn(),
  };
});
const api = await import("../src/api");

const CODE = "ABCDE";
const INVITE = "A".repeat(43);
const sess = { token: TOKEN, seatId: SEAT, name: "Cleo", roomName: "Lunch" };

function stored(): Record<string, unknown> | null {
  const raw = localStorage.getItem(REMEMBERED_KEY);
  return raw === null ? null : JSON.parse(raw);
}
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.input(input(label), { target: { value } });
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  _resetMemoryForTests();
  _resetPrefsForTests();
  _resetRememberedForTests();
  for (const f of [api.createGame, api.joinGame, api.reclaimSeat]) vi.mocked(f).mockReset();
  history.replaceState(null, "", "/");
  navigate("home");
});
afterEach(cleanup);

describe("remembered store", () => {
  it("ignores corrupt, non-string and oversized storage", () => {
    localStorage.setItem(REMEMBERED_KEY, "{not json");
    expect(getRemembered()).toEqual({
      name: "",
      roomName: "",
      password: "",
      maxPlayers: 2,
      rooms: [],
    });
    _resetRememberedForTests();
    localStorage.setItem(
      REMEMBERED_KEY,
      JSON.stringify({
        name: "x".repeat(500),
        roomName: 5,
        password: "p".repeat(500),
        rooms: [{ code: "bad", password: "abcd" }, { code: CODE, password: 7 }, "x"],
      }),
    );
    const r = getRemembered();
    expect(r.name.length).toBe(PLAYER_NAME_MAX);
    expect(r.roomName).toBe("");
    expect(r.password.length).toBe(PASSWORD_MAX);
    expect(r.rooms).toEqual([]);
  });

  it("caps per-room passwords at 20, evicting the oldest", () => {
    const codes = Array.from(
      { length: MAX_ROOM_PASSWORDS + 3 },
      (_, i) => `AAA${CODE_ALPHABET[i]}${CODE_ALPHABET[i + 1]}`,
    );
    for (const c of codes) {
      saveSession(c, sess);
      rememberSubmit({ code: c, name: "Cleo", password: "secret" });
    }
    const rooms = getRemembered().rooms.map((r) => r.code);
    expect(rooms).toHaveLength(MAX_ROOM_PASSWORDS);
    expect(rooms).toEqual(codes.slice(-MAX_ROOM_PASSWORDS));
  });

  it("drops a room password once the session is forgotten", () => {
    saveSession(CODE, sess);
    rememberSubmit({ code: CODE, name: "Cleo", password: "secret" });
    expect(getRoomPassword(CODE)).toBe("secret");
    localStorage.removeItem("colorDice:sessions");
    _resetMemoryForTests();
    expect(getRoomPassword(CODE)).toBe("");
  });
});

describe("CreateGame", () => {
  it("pre-fills from storage and stays editable (clearing does not snap back)", () => {
    localStorage.setItem(
      REMEMBERED_KEY,
      JSON.stringify({ name: "Cleo", roomName: "Lunch", password: "secret", rooms: [] }),
    );
    render(<CreateGame />);
    expect(input("Room name").value).toBe("Lunch");
    expect(input("Your name").value).toBe("Cleo");
    expect(input("Password").value).toBe("secret");
    expect(input("Password").getAttribute("type")).toBe("password");
    expect(input("Password").getAttribute("autocomplete")).toBe("new-password");
    type("Your name", "");
    type("Password", "");
    expect(input("Your name").value).toBe("");
    expect(input("Password").value).toBe("");
  });

  it("stores after success; the next form is pre-filled", async () => {
    vi.mocked(api.createGame).mockResolvedValue({
      code: CODE,
      token: TOKEN,
      seatId: SEAT,
      inviteKey: INVITE,
    });
    render(<CreateGame />);
    type("Room name", "Lunch");
    type("Your name", "Cleo");
    type("Password", "secret");
    await click("Create game");
    expect(stored()).toMatchObject({ name: "Cleo", roomName: "Lunch", password: "secret" });
    cleanup();
    render(<CreateGame />);
    expect(input("Password").value).toBe("secret");
  });

  it("remembers without any checkbox (always on)", async () => {
    vi.mocked(api.createGame).mockResolvedValue({
      code: CODE,
      token: TOKEN,
      seatId: SEAT,
      inviteKey: INVITE,
    });
    render(<CreateGame />);
    expect(screen.queryByLabelText("Remember on this device")).toBeNull();
    type("Room name", "Lunch");
    type("Your name", "Cleo");
    type("Password", "secret");
    await click("Create game");
    expect(stored()).toMatchObject({ name: "Cleo", roomName: "Lunch", password: "secret" });
  });

  it("pre-selects the last player count after a create", async () => {
    vi.mocked(api.createGame).mockResolvedValue({
      code: CODE,
      token: TOKEN,
      seatId: SEAT,
      inviteKey: INVITE,
    });
    render(<CreateGame />);
    expect((screen.getByLabelText("2") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("4"));
    type("Room name", "Lunch");
    type("Your name", "Cleo");
    type("Password", "secret");
    await click("Create game");
    expect(stored()).toMatchObject({ maxPlayers: 4 });
    cleanup();
    render(<CreateGame />);
    expect((screen.getByLabelText("4") as HTMLInputElement).checked).toBe(true);
  });

  it.each([9, 1, 2.5, "x", "3", null])(
    "an invalid stored player count (%s) falls back to 2",
    (bad) => {
      localStorage.setItem(REMEMBERED_KEY, JSON.stringify({ name: "Cleo", maxPlayers: bad }));
      expect(getRemembered().maxPlayers).toBe(2);
      render(<CreateGame />);
      expect((screen.getByLabelText("2") as HTMLInputElement).checked).toBe(true);
    },
  );

  it("Clear saved info also resets the player count", () => {
    saveSession(CODE, sess);
    rememberSubmit({ code: CODE, name: "Cleo", password: "secret", maxPlayers: 5 });
    expect(getRemembered().maxPlayers).toBe(5);
    render(<Settings onClose={() => {}} onPanel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear saved info" }));
    expect(getRemembered().maxPlayers).toBe(2);
    expect(stored()).toBeNull();
  });

  it("failed create stores nothing", async () => {
    vi.mocked(api.createGame).mockRejectedValue(new ApiError(500, "E_INTERNAL"));
    render(<CreateGame />);
    type("Room name", "Lunch");
    type("Your name", "Cleo");
    type("Password", "secret");
    await click("Create game");
    expect(stored()).toBeNull();
  });
});

describe("JoinDialog", () => {
  it("pre-fills the room password only for a room this device has used", () => {
    saveSession(CODE, sess);
    rememberSubmit({ code: CODE, name: "Cleo", password: "secret" });
    const { unmount } = render(<JoinDialog code={CODE} games={null} onClose={() => {}} />);
    expect(input("Your name").value).toBe("Cleo");
    expect(input("Password").value).toBe("secret");
    unmount();
    render(<JoinDialog code="ZZZZ2" games={null} onClose={() => {}} />);
    expect(input("Password").value).toBe("");
  });

  it("a wrong password is never stored", async () => {
    vi.mocked(api.joinGame).mockRejectedValue(new ApiError(401, "E_BAD_CREDENTIALS"));
    render(<JoinDialog code={CODE} games={null} onClose={() => {}} />);
    type("Your name", "Cleo");
    type("Password", "wrong1");
    await click("Join");
    expect(screen.getByText("Wrong password.")).toBeTruthy();
    expect(stored()).toBeNull();
  });

  it("stores the password after a successful join", async () => {
    vi.mocked(api.joinGame).mockResolvedValue({ code: CODE, token: TOKEN, seatId: SEAT });
    render(<JoinDialog code={CODE} games={null} onClose={() => {}} />);
    type("Your name", "Cleo");
    type("Password", "secret");
    await click("Join");
    expect(getRoomPassword(CODE)).toBe("secret");
  });
});

describe("Reclaim", () => {
  it("pre-fills name and the room password", () => {
    saveSession(CODE, sess);
    rememberSubmit({ code: CODE, name: "Cleo", password: "secret" });
    render(<Reclaim code={CODE} />);
    expect(input("Your name").value).toBe("Cleo");
    expect(input("Password").value).toBe("secret");
  });
});

describe("Settings saved info", () => {
  it("shows no password and Clear saved info wipes everything", () => {
    saveSession(CODE, sess);
    rememberSubmit({ code: CODE, name: "Cleo", roomName: "Lunch", password: "hunter22" });
    render(<Settings onClose={() => {}} onPanel={() => {}} />);
    expect(screen.getByText("Room password: saved")).toBeTruthy();
    expect(document.body.textContent).not.toContain("hunter22");
    fireEvent.click(screen.getByRole("button", { name: "Clear saved info" }));
    expect(stored()).toBeNull();
    expect(localStorage.getItem("colorDice:prefs") ?? "").not.toContain("Cleo");
    expect(screen.getByText("Nothing saved on this device.")).toBeTruthy();
    clearRemembered();
  });
});

import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api";
import { AwayControls } from "../src/components/AwayControls";
import { GameMenu } from "../src/components/GameMenu";
import { GearButton } from "../src/components/Settings";
import { Settings } from "../src/components/SettingsPanel";
import { _resetInviteForTests, isInviteHash, parseInviteHash } from "../src/invite";
import { _resetPrefsForTests, getPrefs, setPrefs } from "../src/prefs";
import { _resetRememberedForTests, getRoomPassword, rememberSubmit } from "../src/remembered";
import { getPendingInvite, getRoute, initialRoute, navigate, startRouter } from "../src/router";
import { InviteJoin } from "../src/screens/InviteJoin";
import { _resetMemoryForTests, getSession, saveSession } from "../src/session";
import { _resetStoreForTests, getState } from "../src/store";
import { SEAT, TOKEN } from "./fixtures";
import { CODE, makeGameView } from "./fixtures/views";

vi.mock("../src/api", async (orig) => {
  const actual = await orig<typeof import("../src/api")>();
  return {
    ApiError: actual.ApiError,
    getMe: vi.fn().mockResolvedValue({ status: "lobby" }),
    getTakenColors: vi.fn().mockResolvedValue({ taken: [] }),
    joinGame: vi.fn(),
    reclaimSeat: vi.fn(),
    leaveGame: vi.fn(),
    getInvite: vi.fn().mockResolvedValue({ inviteKey: "k".repeat(43) }),
  };
});
const api = await import("../src/api");

const KEY = `${"Zq9-_".repeat(8)}abc`; // 43 base64url chars
const res = { code: CODE, token: TOKEN, seatId: SEAT };

beforeEach(() => {
  localStorage.clear();
  _resetMemoryForTests();
  _resetPrefsForTests();
  _resetRememberedForTests();
  _resetStoreForTests();
  _resetInviteForTests();
  for (const f of [api.joinGame, api.reclaimSeat, api.leaveGame]) vi.mocked(f).mockReset();
  history.replaceState(null, "", "/");
  navigate("home");
});
afterEach(cleanup);

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("invite fragment routing", () => {
  it("parses #/join/<CODE>/<key> and rejects malformed ones", () => {
    expect(parseInviteHash(`#/join/${CODE}/${KEY}`)).toEqual({ code: CODE, key: KEY });
    expect(parseInviteHash(`#/join/${CODE.toLowerCase()}/${KEY}`)?.code).toBe(CODE);
    for (const bad of [
      "",
      "#/join/",
      `#/join/${CODE}`,
      `#/join/${CODE}/short`,
      `#/join/${CODE}/${KEY}/extra`,
      `#/join/bad!/${KEY}`,
      `#/other/${CODE}/${KEY}`,
    ]) {
      expect(parseInviteHash(bad)).toBeNull();
    }
    expect(isInviteHash("#/join/x")).toBe(true);
  });

  it("goes to the invite screen, or straight to the room when a seat is saved", () => {
    expect(initialRoute("", `#/join/${CODE}/${KEY}`)).toEqual({ screen: "invite", code: CODE });
    saveSession(CODE, { token: TOKEN, seatId: SEAT, name: "Ana", roomName: "R" });
    expect(initialRoute("", `#/join/${CODE}/${KEY}`)).toEqual({ screen: "waiting", code: CODE });
  });

  it("strips the key from the URL at once and keeps it in memory only", () => {
    history.replaceState(null, "", `/#/join/${CODE}/${KEY}`);
    const r = startRouter();
    expect(r).toEqual({ screen: "invite", code: CODE });
    expect(location.hash).toBe("");
    expect(location.href).not.toContain(KEY);
    expect(getPendingInvite(CODE)).toBe(KEY);
    expect(getPendingInvite("ZZZZ2")).toBeNull();
    navigate("home");
    expect(getPendingInvite(CODE)).toBeNull();
  });

  it("a malformed #/join fragment is stripped and ignored", () => {
    history.replaceState(null, "", `/#/join/${CODE}/nope`);
    expect(startRouter().screen).toBe("home");
    expect(location.hash).toBe("");
  });
});

describe("InviteJoin", () => {
  function open() {
    history.replaceState(null, "", `/#/join/${CODE}/${KEY}`);
    startRouter();
    render(<InviteJoin code={CODE} />);
  }
  const type = (v: string) => fireEvent.input(input("Your name"), { target: { value: v } });

  it("asks only for a name and joins with `invite`, never `password`", async () => {
    vi.mocked(api.joinGame).mockResolvedValue(res);
    open();
    expect(screen.queryByLabelText("Password")).toBeNull();
    type("Cleo");
    await click("Join");
    expect(api.joinGame).toHaveBeenCalledTimes(1);
    const [code, body] = vi.mocked(api.joinGame).mock.calls[0] ?? [];
    expect(code).toBe(CODE);
    expect(body).toEqual({
      name: "Cleo",
      invite: KEY,
      profile: expect.objectContaining({ cat: "mad-cat" }),
    });
    expect(body).not.toHaveProperty("password");
    expect(getSession(CODE)?.token).toBe(TOKEN);
    expect(getRoute().screen).toBe("waiting");
  });

  it("never writes the invite key to storage", async () => {
    vi.mocked(api.joinGame).mockResolvedValue(res);
    open();
    type("Cleo");
    await click("Join");
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) as string;
      expect(k).not.toContain(KEY);
      expect(localStorage.getItem(k)).not.toContain(KEY);
    }
    expect(JSON.stringify(sessionStorage)).not.toContain(KEY);
    // The name is remembered, the (unknown) password is not invented.
    expect(localStorage.getItem("colorDice:remembered")).toContain("Cleo");
    expect(getRoomPassword(CODE)).toBe("");
  });

  it("a tampered key shows 'Link is invalid or expired.'", async () => {
    vi.mocked(api.joinGame).mockRejectedValue(new ApiError(401, "E_BAD_CREDENTIALS"));
    open();
    type("Cleo");
    await click("Join");
    expect(screen.getByText("Link is invalid or expired.")).toBeTruthy();
    expect(getSession(CODE)).toBeNull();
  });

  it("after the game started, takes back the seat with the invite (reclaim)", async () => {
    vi.mocked(api.joinGame).mockRejectedValue(new ApiError(409, "E_NOT_IN_LOBBY"));
    vi.mocked(api.reclaimSeat).mockResolvedValue(res);
    open();
    type("Cleo");
    await click("Join");
    expect(api.reclaimSeat).toHaveBeenCalledWith(CODE, {
      name: "Cleo",
      invite: KEY,
      profile: expect.objectContaining({ cat: "mad-cat" }),
    });
    expect(getRoute().screen).toBe("game");
  });
});

describe("Settings", () => {
  it("the cog button keeps aria-label Settings", () => {
    render(<GearButton onClick={() => {}} />);
    const btn = screen.getByRole("button", { name: "Settings" });
    expect(btn.querySelector("svg path")).toBeTruthy();
  });

  it("Show hints again re-enables hints", () => {
    setPrefs({ hintsOff: true, seenHints: ["roll", "mark"] });
    render(<Settings onClose={() => {}} onPanel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Show hints again" }));
    expect(getPrefs().hintsOff).toBe(false);
    expect(getPrefs().seenHints).toEqual([]);
  });
});

describe("left seats", () => {
  it("says 'Cleo left the game.' and not 'away'", () => {
    const v = makeGameView({ version: 5 });
    const seats = v.seats.map((s, i) => (i === 1 ? { ...s, away: true, left: true } : s));
    const { container } = render(<AwayControls view={{ ...v, seats }} />);
    expect(screen.getByText("Cleo left the game.")).toBeTruthy();
    expect(container.textContent).not.toContain("away");
    expect(screen.queryByRole("button", { name: "Bring back" })).toBeNull();
  });
});

describe("GameMenu leave", () => {
  it("confirms, calls leave, forgets the seat and the password, goes home", async () => {
    saveSession(CODE, { token: TOKEN, seatId: SEAT, name: "Ana", roomName: "R" });
    rememberSubmit({ code: CODE, name: "Ana", password: "secret" });
    vi.mocked(api.leaveGame).mockResolvedValue();
    navigate("game", CODE);
    render(<GameMenu code={CODE} onClose={() => {}} />);
    await click("Leave game");
    expect(api.leaveGame).not.toHaveBeenCalled();
    expect(screen.getByText("Leave this game?")).toBeTruthy();
    await click("Leave game");
    expect(api.leaveGame).toHaveBeenCalledWith(CODE, TOKEN);
    expect(getSession(CODE)).toBeNull();
    expect(getRoomPassword(CODE)).toBe("");
    expect(getRoute().screen).toBe("home");
    expect(getState().toast?.text).toBe("You left the game.");
  });

  it("Back to home keeps the seat", async () => {
    saveSession(CODE, { token: TOKEN, seatId: SEAT, name: "Ana", roomName: "R" });
    navigate("game", CODE);
    render(<GameMenu code={CODE} onClose={() => {}} />);
    await click("Back to home");
    expect(api.leaveGame).not.toHaveBeenCalled();
    expect(getSession(CODE)).not.toBeNull();
    expect(getRoute().screen).toBe("home");
  });
});

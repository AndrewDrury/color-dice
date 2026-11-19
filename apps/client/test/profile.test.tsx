import type { Profile, ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Avatar } from "../src/components/Avatar";
import { SeatList } from "../src/components/SeatList";
import {
  _resetRememberedForTests,
  getRemembered,
  REMEMBERED_KEY,
  rememberedProfile,
  rememberSubmit,
} from "../src/remembered";
import { navigate } from "../src/router";
import { CreateGame } from "../src/screens/CreateGame";
import { _resetMemoryForTests } from "../src/session";
import { SEAT, TOKEN } from "./fixtures";

vi.mock("../src/api", async (orig) => {
  const actual = await orig<typeof import("../src/api")>();
  return { ApiError: actual.ApiError, createGame: vi.fn() };
});
const api = await import("../src/api");

beforeEach(() => {
  localStorage.clear();
  _resetMemoryForTests();
  _resetRememberedForTests();
  vi.mocked(api.createGame).mockReset();
  history.replaceState(null, "", "/");
  navigate("home");
});
afterEach(cleanup);

describe("remembered profile (T-NEW-13)", () => {
  it("defaults to a valid colour with the default cat, stable until chosen", () => {
    const a = rememberedProfile();
    expect(a.cat).toBe("mad-cat");
    expect(rememberedProfile()).toEqual(a);
  });

  it("stores the last selection and ignores a tampered one", () => {
    rememberSubmit({
      code: "ABCDE",
      name: "Cleo",
      profile: { color: "teal", cat: "cat-laugh-gif" },
    });
    expect(rememberedProfile()).toEqual({ color: "teal", cat: "cat-laugh-gif" });
    rememberSubmit({ code: "ABCDE", name: "Cleo", profile: { color: "pink", cat: "cat-gif" } });
    expect(getRemembered().profile).toEqual({ color: "pink", cat: "cat-gif" });
    _resetRememberedForTests();
    localStorage.setItem(
      REMEMBERED_KEY,
      JSON.stringify({ name: "x", profile: { color: "red", cat: "../x" } }),
    );
    expect(getRemembered().profile).toBeUndefined();
  });
});

describe("CreateGame profile picker", () => {
  it("is pre-filled, changeable, sent and remembered", async () => {
    localStorage.setItem(
      REMEMBERED_KEY,
      JSON.stringify({
        name: "Cleo",
        roomName: "Lunch",
        password: "secret",
        profile: { color: "teal", cat: "cat-laugh-gif" },
      }),
    );
    vi.mocked(api.createGame).mockResolvedValue({
      code: "ABCDE",
      token: TOKEN,
      seatId: SEAT,
      inviteKey: "A".repeat(43),
    });
    render(<CreateGame />);
    const teal = await screen.findByRole("radio", { name: "Teal" });
    expect((teal as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Violet" }));
    expect((screen.getByRole("radio", { name: "Violet" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Pick your cat" }));
    fireEvent.click(screen.getByRole("radio", { name: "dance cat" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create game" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const sent = vi.mocked(api.createGame).mock.calls[0]?.[0];
    expect(sent?.profile).toEqual({ color: "violet", cat: "dance-cat-gif" });
    expect(getRemembered().profile).toEqual({ color: "violet", cat: "dance-cat-gif" });
  });
});

describe("avatar rendering", () => {
  const profile: Profile = { color: "coral", cat: "cat-laugh-gif" };

  it("shows the GIF with a colour ring, decorative, and nothing without a profile", () => {
    const { container, rerender } = render(<Avatar profile={profile} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("Cat%20Laugh%20GIF.gif");
    expect(img?.getAttribute("alt")).toBe("");
    expect(container.querySelector(".av.pc-coral")).toBeTruthy();
    rerender(<Avatar profile={undefined} />);
    expect(container.querySelector(".av")).toBeNull();
  });

  it("appears on waiting-room seats", () => {
    const seats: ViewMessage["seats"] = [
      {
        seatId: SEAT,
        name: "Andrew",
        host: true,
        online: true,
        away: false,
        left: false,
        record: { wins: 0, ties: 0, losses: 0 },
        profile,
      },
    ];
    const { container } = render(<SeatList seats={seats} youSeatId={SEAT} isHost={false} />);
    expect(container.querySelector("li .av.pc-coral img")).toBeTruthy();
  });
});

import type { Profile, ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Avatar, ringWidth } from "../src/components/Avatar";
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
import cssText from "../src/styles/avatar.css?raw";
import { contrastRatio, TOKENS } from "../src/styles/contrast";
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
    fireEvent.click(screen.getByRole("radio", { name: "cat dance" }));
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

describe("picker layout (T-NEW-15)", () => {
  it("shows both labelled sections open, with no toggle button", async () => {
    render(<CreateGame />);
    await screen.findByRole("group", { name: "Choose colour" });
    expect(screen.getByRole("group", { name: "Choose avatar" })).toBeTruthy();
    expect(screen.getAllByRole("radio", { name: /cat/ }).length).toBeGreaterThan(3);
    expect(screen.queryByRole("button", { name: "Pick your cat" })).toBeNull();
    expect(document.querySelector("[aria-expanded]")).toBeNull();
  });

  it("puts the large avatar left of the name input", async () => {
    const { container } = render(<CreateGame />);
    await screen.findByRole("group", { name: "Choose colour" });
    const head = container.querySelector(".pf-head") as HTMLElement;
    const av = head.querySelector(".pf-av") as HTMLElement;
    const input = screen.getByLabelText("Your name");
    expect(head.contains(input)).toBe(true);
    expect(av.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(av.querySelector("img")?.getAttribute("width")).toBe("80");
  });
});

describe("avatar ring + colours (T-NEW-15)", () => {
  it("scales the ring with size through one CSS var, min 2 px", () => {
    expect(ringWidth(80)).toBe(4);
    expect(ringWidth(96)).toBe(5);
    expect(ringWidth(16)).toBe(2);
    const { container } = render(<Avatar profile={{ color: "teal", cat: "cat-gif" }} size={80} />);
    const el = container.querySelector(".av") as HTMLElement;
    expect(el.style.getPropertyValue("--av-ring")).toBe("4px");
    expect(cssText).toMatch(/box-shadow: 0 0 0 var\(--av-ring/);
  });

  const hexes = [...cssText.matchAll(/\.pc-[a-z]+ \{\s*--pc: (#[0-9a-f]{6});/g)].map(
    (m) => m[1] as string,
  );
  const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));

  it("declares ten distinguishable profile colours", () => {
    expect(hexes).toHaveLength(10);
    for (let i = 0; i < hexes.length; i++) {
      for (let j = i + 1; j < hexes.length; j++) {
        const a = rgb(hexes[i] as string);
        const b = rgb(hexes[j] as string);
        expect(Math.hypot(...a.map((v, k) => v - (b[k] as number)))).toBeGreaterThan(70);
      }
    }
  });

  it("keeps every ring visible on light and dark paper", () => {
    for (const hex of hexes) {
      for (const theme of ["light", "dark"] as const) {
        const paper = TOKENS[theme]["--paper"] as string;
        expect(contrastRatio(hex, paper)).toBeGreaterThanOrEqual(2.4);
      }
    }
  });
});

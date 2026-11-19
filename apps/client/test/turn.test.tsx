import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { Game } from "../src/screens/Game";
import { _resetMemoryForTests, saveSession } from "../src/session";
import { _resetStoreForTests, applyView } from "../src/store";
import { TOKEN } from "./fixtures";
import { CODE, makeGameView, player, seatIdOf } from "./fixtures/views";

const { sent, FakeSocket } = vi.hoisted(() => {
  const sent: unknown[] = [];
  class FakeSocket {
    connect() {}
    close() {}
    send(m: unknown) {
      sent.push(m);
      return true;
    }
    onMessage() {
      return () => {};
    }
    onStatus() {
      return () => {};
    }
  }
  return { sent, FakeSocket };
});
vi.mock("../src/ws", () => ({ GameSocket: FakeSocket, LobbySocket: FakeSocket }));

beforeEach(() => {
  sent.length = 0;
  localStorage.clear();
  _resetMemoryForTests();
  _resetStoreForTests();
  _resetPrefsForTests();
  _resetPlayedRollsForTests();
  setPrefs({ sound: false, haptics: false, motion: "full" });
  saveSession(CODE, { token: TOKEN, seatId: seatIdOf(0), name: "Andrew", roomName: "Friday dice" });
});
afterEach(cleanup);

let ver = 10;
const show = (v: Parameters<typeof applyView>[0]) => {
  act(() => {
    applyView({ ...v, version: ++ver });
  });
};
const banner = () => screen.getByTestId("turn-banner").textContent ?? "";
const ALL = ["RED", "YELLOW", "GREEN", "BLUE"] as const;

describe("turn clarity (T-NEW-9)", () => {
  it("banner: your turn with the step and a call to action", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    expect(banner()).toContain("Your turn");
    expect(banner()).toContain("Step 1 of 2 · white dice");
    expect(banner()).toContain("Pick a box or press “Pass on white”");
    cleanup();
    show(makeGameView({ phase: "ACTION_2", legal2: [{ whiteDie: 0, color: "RED", number: 5 }] }));
    render(<Game code={CODE} />);
    expect(banner()).toContain("Step 2 of 2 · colour dice");
  });

  it("banner: someone else's turn, and Roll / Confirm calls to action", () => {
    show(makeGameView({ active: 1, legal1: ["RED"] }));
    render(<Game code={CODE} />);
    expect(banner()).toContain("Cleo's turn");
    expect(screen.getByTestId("turn-banner").classList.contains("is-mine")).toBe(false);
    cleanup();
    show(makeGameView({ phase: "AWAIT_ROLL", canRoll: true }));
    render(<Game code={CODE} />);
    expect(banner()).toContain("Roll the dice");
    cleanup();
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    fireEvent.click(screen.getByLabelText("Red 8, can mark"));
    expect(banner()).toContain("Press Confirm");
  });

  it("opponent chips: the active seat is highlighted, the others dim", () => {
    show(makeGameView({ active: 1, legal1: ["RED"] }));
    render(<Game code={CODE} />);
    const chips = [...document.querySelectorAll(".g-chip")];
    expect(chips.filter((c) => c.classList.contains("is-active"))).toHaveLength(1);
    expect(chips.filter((c) => c.classList.contains("is-dim")).length).toBe(chips.length - 1);
  });

  it("only a penalty is possible: one Take penalty button sends both passes", () => {
    show(makeGameView({ lockedColors: [...ALL] }));
    render(<Game code={CODE} />);
    expect(screen.queryByText("Pass on white")).toBeNull();
    fireEvent.click(screen.getByText("Take penalty (−5)"));
    expect(sent).toEqual([
      { type: "turn", turn: 9, action1: { kind: "PASS" }, action2: { kind: "PASS" } },
    ]);
  });

  it("decided: Waiting for the players still deciding, and Undo only when canUndo", () => {
    const players = [
      player(0, { decided: true, action1Submitted: true }),
      player(1, { decided: true, action1Submitted: true }),
      player(2),
    ];
    const v = (canUndo: boolean) =>
      makeGameView({ active: 1, decision: true, gamePlayers: players, canUndo, pass1: false });
    show(v(true));
    render(<Game code={CODE} />);
    expect(screen.getByText("Waiting for Dev…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(sent).toEqual([{ type: "undo", turn: 9 }]);
    cleanup();
    show(v(false));
    render(<Game code={CODE} />);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});

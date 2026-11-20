import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { Game } from "../src/screens/Game";
import { _resetMemoryForTests, saveSession } from "../src/session";
import { _resetStoreForTests, applyView } from "../src/store";
import { TOKEN } from "./fixtures";
import { CODE, makeGameView, seatIdOf } from "./fixtures/views";

vi.mock("../src/ws", () => {
  class FakeSocket {
    connect() {}
    close() {}
    send() {
      return true;
    }
    onMessage() {
      return () => {};
    }
    onStatus() {
      return () => {};
    }
  }
  return { GameSocket: FakeSocket, LobbySocket: FakeSocket };
});

const steps = () => [...document.querySelectorAll(".g-step")].map((e) => e.textContent);
const show = (v: Parameters<typeof applyView>[0]) =>
  act(() => {
    applyView(v);
  });

beforeEach(() => {
  localStorage.clear();
  _resetMemoryForTests();
  _resetStoreForTests();
  _resetPrefsForTests();
  _resetPlayedRollsForTests();
  setPrefs({ sound: false, haptics: false, motion: "full" });
  saveSession(CODE, { token: TOKEN, seatId: seatIdOf(0), name: "Andrew", roomName: "Friday dice" });
});
afterEach(cleanup);

describe("step number markers (T-NEW-14)", () => {
  it("active step 1 shows 1, then both staged show 1 and 2", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    expect(steps()).toEqual([]);
    fireEvent.click(screen.getByLabelText("Red 8, can mark"));
    expect(steps()).toEqual(["1"]);
    fireEvent.click(screen.getByLabelText("Green 11, can mark"));
    expect(steps()).toEqual(["1", "2"]);
    expect(screen.getByLabelText("Green 11, can mark, step 2")).toBeTruthy();
  });

  it("a lone step-2 selection shows only 2; undo removes it", () => {
    show(makeGameView({ phase: "ACTION_2", legal2: [{ whiteDie: 1, color: "GREEN", number: 9 }] }));
    render(<Game code={CODE} />);
    fireEvent.click(screen.getByLabelText("Green 9, can mark"));
    expect(steps()).toEqual(["2"]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(steps()).toEqual([]);
  });

  it("non-active players never see numbers", () => {
    show(makeGameView({ active: 1, legal1: ["RED"] }));
    render(<Game code={CODE} />);
    fireEvent.click(screen.getByLabelText("Red 8, can mark"));
    expect(steps()).toEqual([]);
    expect(screen.getByLabelText("Red 8, can mark").getAttribute("aria-pressed")).toBe("true");
  });

  it("after the move is sent the number gives way to the corner cross", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    fireEvent.click(screen.getByLabelText("Red 8, can mark"));
    fireEvent.click(screen.getByText("Submit"));
    expect(steps()).toEqual([]);
    expect(document.querySelectorAll(".g-box.is-ghost .g-x").length).toBe(1);
  });
});

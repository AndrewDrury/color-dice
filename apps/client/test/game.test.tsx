import type { ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { diffViews } from "../src/game/feedback";
import { passLabel, passTakesPenalty } from "../src/game/staging";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { Game } from "../src/screens/Game";
import { _resetMemoryForTests, saveSession } from "../src/session";
import { _resetStoreForTests, applyView } from "../src/store";
import { TOKEN } from "./fixtures";
import { CODE, makeGameView, mark, player, seatIdOf } from "./fixtures/views";

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

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
}

function show(v: ViewMessage) {
  act(() => {
    applyView(v);
  });
}

beforeEach(() => {
  sent.length = 0;
  localStorage.clear();
  _resetMemoryForTests();
  _resetStoreForTests();
  _resetPrefsForTests();
  _resetPlayedRollsForTests();
  setPrefs({ sound: false, haptics: false, motion: "full" });
  saveSession(CODE, { token: TOKEN, seatId: seatIdOf(0), name: "Andrew", roomName: "Friday dice" });
  setWidth(390);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mount = () => render(<Game code={CODE} />);
const status = () => document.querySelector(".g-status-text")?.textContent;

describe("Game screen", () => {
  it("AWAIT_ROLL: active sees Roll, passive sees who we wait for", () => {
    show(makeGameView({ phase: "AWAIT_ROLL", canRoll: true, active: 0 }));
    mount();
    expect(status()).toBe("Your turn — roll the dice");
    expect(screen.getAllByText("Roll").length).toBeGreaterThan(0);
    cleanup();
    _resetStoreForTests();
    show(makeGameView({ phase: "AWAIT_ROLL", active: 1, version: 6 }));
    mount();
    expect(status()).toBe("Waiting for Cleo to roll…");
  });

  it("exactly one Roll control at phone, tablet and desktop widths", () => {
    for (const w of [390, 768, 1280]) {
      setWidth(w);
      show(makeGameView({ phase: "AWAIT_ROLL", canRoll: true, active: 0 }));
      const { container } = mount();
      const rolls = screen.getAllByRole("button", { name: /roll/i });
      expect(rolls).toHaveLength(1);
      expect(container.querySelectorAll(".tray button")).toHaveLength(0);
      cleanup();
      _resetStoreForTests();
    }
  });

  it("lays out sheet, guide slot, dice tray, then action bar (sheet above the dice)", () => {
    for (const w of [390, 1280]) {
      setWidth(w);
      show(makeGameView({ phase: "AWAIT_ROLL", canRoll: true, active: 0 }));
      const { container } = mount();
      const kids = Array.from(container.querySelector(".g-left")?.children ?? []);
      const order = ["g-sheet", "g-guide-slot", "tray"].map((c) =>
        kids.findIndex((k) => k.classList.contains(c)),
      );
      expect(order.every((i) => i >= 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      cleanup();
      _resetStoreForTests();
    }
  });

  it("ACTION_1 before and after submitting", () => {
    show(makeGameView({ legal1: ["RED"] }));
    mount();
    expect(status()).toBe("Everyone: use white 8 in one row, or pass");
    act(() => {
      applyView(
        makeGameView({
          version: 6,
          decision: true,
          pass1: false,
          gamePlayers: [player(0, { action1Submitted: true }), player(1), player(2)],
        }),
      );
    });
    expect(status()).toBe("Waiting for Cleo and Dev");
  });

  it("ACTION_2: tap stages, second tap sends with turn and whiteDie, Esc cancels", () => {
    show(
      makeGameView({
        phase: "ACTION_2",
        legal2: [
          { whiteDie: 1, color: "GREEN", number: 9 },
          { whiteDie: 0, color: "RED", number: 5 },
        ],
      }),
    );
    mount();
    const box = screen.getByLabelText("Green 9, can mark");
    fireEvent.click(box);
    expect(screen.getByText("Mark Green 9")).toBeTruthy();
    expect(sent).toHaveLength(0);
    expect(screen.getByLabelText("Green 9, can mark").getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Mark Green 9")).toBeNull();
    fireEvent.click(screen.getByLabelText("Green 9, can mark"));
    fireEvent.click(screen.getByLabelText("Green 9, can mark"));
    expect(sent).toEqual([{ type: "action2", turn: 9, kind: "MARK", whiteDie: 1, color: "GREEN" }]);
  });

  it("Pass is staged and shows the penalty wording", () => {
    const v = makeGameView({ phase: "ACTION_2" });
    show(v);
    mount();
    expect(passTakesPenalty(v)).toBe(true);
    expect(passLabel(v, false)).toBe("Pass (take −5 penalty)");
    fireEvent.click(screen.getByText("Pass (take −5 penalty)"));
    expect(screen.getByText("Pass and take −5?")).toBeTruthy();
    expect(sent).toHaveLength(0);
    fireEvent.click(screen.getByText("Pass and take −5?"));
    expect(sent).toEqual([{ type: "action2", turn: 9, kind: "PASS" }]);
  });

  it("legal boxes do not glow until the dice have landed", () => {
    vi.useFakeTimers();
    show(makeGameView({ phase: "AWAIT_ROLL", active: 1, version: 5 }));
    mount();
    act(() => {
      applyView(makeGameView({ version: 6, legal1: ["RED"] }));
    });
    expect(document.querySelectorAll(".g-box.is-legal")).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(document.querySelectorAll(".g-box.is-legal")).toHaveLength(1);
  });

  it("a resync view shows legal boxes at once", () => {
    show(makeGameView({ legal1: ["RED"] }));
    mount();
    expect(document.querySelectorAll(".g-box.is-legal")).toHaveLength(1);
  });

  it("a locked row is closed and its die removed", () => {
    show(makeGameView({ lockedColors: ["YELLOW"] }));
    const { container } = mount();
    expect(container.querySelector(".g-row.c-yellow")?.classList.contains("is-closed")).toBe(true);
    expect(container.querySelector('[data-die="YELLOW"]')?.classList.contains("is-removed")).toBe(
      true,
    );
  });

  it("5 players: 4 opponent chips (no grids, no bars) at 390 px and at 1280 px", () => {
    show(makeGameView({ players: 5 }));
    const { container } = mount();
    expect(container.querySelectorAll(".g-chip")).toHaveLength(4);
    cleanup();
    setWidth(1280);
    const r = mount();
    expect(r.container.querySelectorAll(".g-chip")).toHaveLength(4);
    for (const root of [r.container]) {
      expect(root.querySelectorAll(".g-mini, .g-mini-cell, .g-bars, .g-bar")).toHaveLength(0);
      // Only your own card is on screen: one sheet, four rows.
      expect(root.querySelectorAll(".g-sheet")).toHaveLength(1);
      expect(root.querySelectorAll(".g-row")).toHaveLength(4);
      // Chips are not buttons and open nothing.
      expect(root.querySelectorAll("button.g-chip")).toHaveLength(0);
    }
  });

  it("chips show name, total and penalty count", () => {
    show(
      makeGameView({
        gamePlayers: [
          player(0),
          player(1, {
            score: { rows: { RED: 3, YELLOW: 0, GREEN: 0, BLUE: 0 }, penalties: -10, total: -7 },
          }),
          player(2),
        ],
      }),
    );
    const { container } = mount();
    const chip = container.querySelector(`.g-chip[data-seat-id="${seatIdOf(1)}"]`);
    expect(chip?.textContent).toContain("Cleo");
    expect(chip?.querySelector(".num")?.getAttribute("data-total")).toBe("-7");
    expect(chip?.querySelector(".g-chip-pen")?.getAttribute("data-penalties")).toBe("2");
  });

  it("GAME_OVER with a tie", () => {
    show(
      makeGameView({
        phase: "GAME_OVER",
        winners: ["seat-0", "seat-1"],
        endReason: { kind: "TWO_ROWS_LOCKED", lockedColors: ["RED", "BLUE"] },
        gamePlayers: [
          player(0, {
            score: { rows: { RED: 10, YELLOW: 0, GREEN: 0, BLUE: 0 }, penalties: 0, total: 10 },
          }),
          player(1, {
            score: { rows: { RED: 10, YELLOW: 0, GREEN: 0, BLUE: 0 }, penalties: 0, total: 10 },
          }),
          player(2),
        ],
      }),
    );
    mount();
    expect(document.querySelector(".g-winner")?.textContent).toContain("Tie: ");
    expect(screen.getByText("Two rows locked")).toBeTruthy();
    expect(document.querySelectorAll("tr[data-winner]")).toHaveLength(2);
    // Every player's full read-only card is revealed.
    expect(document.querySelectorAll(".g-final-card .g-sheet")).toHaveLength(3);
    expect(screen.getByText("Rematch")).toBeTruthy();
    expect(screen.getByText("Back to home")).toBeTruthy();
  });
});

describe("diffViews", () => {
  const before = () => makeGameView({ version: 5, legal1: ["RED"] });

  it("reveal view emits reveal and mark for you", () => {
    const next = makeGameView({
      version: 6,
      phase: "ACTION_2",
      gamePlayers: [mark(player(0), "RED", 6), player(1), player(2)],
    });
    const kinds = diffViews(before(), next).map((e) => e.kind);
    expect(kinds).toEqual(["reveal", "mark"]);
  });

  it("resync views emit nothing", () => {
    const next = makeGameView({
      version: 60,
      phase: "ACTION_2",
      gamePlayers: [mark(player(0), "RED", 6), player(1), player(2)],
    });
    expect(diffViews(before(), next)).toEqual([]);
    expect(diffViews(null, next)).toEqual([]);
  });

  it("opponent penalty comes from the log, not their (hidden) sheet", () => {
    const next = makeGameView({
      version: 6,
      phase: "AWAIT_ROLL",
      active: 1,
      events: [{ type: "PENALTY", playerId: "seat-1", total: -5 }],
    });
    const evs = diffViews(makeGameView({ version: 5, phase: "ACTION_2" }), next);
    expect(evs.find((e) => e.kind === "penalty")?.seat).toBe(1);
  });

  it("your own penalty still comes from your sheet", () => {
    const next = makeGameView({
      version: 6,
      phase: "AWAIT_ROLL",
      gamePlayers: [
        player(0, { sheet: { ...player(0).sheet, penalties: 1 } }),
        player(1),
        player(2),
      ],
    });
    const evs = diffViews(makeGameView({ version: 5, phase: "ACTION_2" }), next);
    expect(evs.find((e) => e.kind === "penalty")?.seat).toBe(0);
  });

  it("opponent marks flash from new MARKED log events only", () => {
    const m = {
      type: "MARKED",
      playerId: "seat-1",
      action: "ACTION_1",
      color: "GREEN",
      number: 7,
      index: 5,
      lockedNow: false,
    };
    const old = { type: "TURN_STARTED", turnNumber: 9, activeSeat: 0 };
    const prev = makeGameView({ version: 5, phase: "ACTION_2", events: [old] });
    const next = makeGameView({ version: 6, phase: "ACTION_2", events: [old, m] });
    const evs = diffViews(prev, next).filter((e) => e.kind === "opponentMark");
    expect(evs).toEqual([
      { kind: "opponentMark", moment: null, seat: 1, color: "GREEN", index: 5 },
    ]);
    // Same window again: nothing new.
    expect(
      diffViews(next, makeGameView({ version: 7, phase: "ACTION_2", events: [old, m] })),
    ).toEqual([]);
    // A full 30-event window that slid by one still yields just the new event.
    const win = Array.from({ length: 29 }, (_, i) => ({
      type: "TURN_STARTED",
      turnNumber: i,
      activeSeat: 0,
    }));
    const a = makeGameView({ version: 8, phase: "ACTION_2", events: [...win, old] });
    const b = makeGameView({ version: 9, phase: "ACTION_2", events: [...win.slice(1), old, m] });
    expect(diffViews(a, b).filter((e) => e.kind === "opponentMark")).toHaveLength(1);
  });
});

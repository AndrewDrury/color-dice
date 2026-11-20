import type { ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { diffViews } from "../src/game/feedback";
import { passTakesPenalty, submitLabel } from "../src/game/staging";
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
      const order = ["g-sheet", "g-guide-slot", "g-dicegroup"].map((c) =>
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
    expect(status()).toBe("Pick the white total 8 and / or a white + colour box, then Submit.");
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

  it("staged move Undo removes one staged mark", () => {
    show(makeGameView({ legal1: ["RED"] }));
    mount();
    fireEvent.click(screen.getByLabelText("Red 8, can mark"));
    expect(screen.getByText("Submit")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("Submit")).toBeNull();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("ACTION_2: tap stages, Submit sends with turn and whiteDie, Esc cancels, tapping again unselects", () => {
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
    expect(screen.getByText("Submit")).toBeTruthy();
    expect(sent).toHaveLength(0);
    expect(screen.getByLabelText("Green 9, can mark, step 2").getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Submit")).toBeNull();
    fireEvent.click(screen.getByLabelText("Green 9, can mark"));
    fireEvent.click(screen.getByLabelText("Green 9, can mark, step 2"));
    expect(screen.queryByText("Submit")).toBeNull();
    expect(sent).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("Green 9, can mark"));
    fireEvent.click(screen.getByText("Submit"));
    expect(sent).toEqual([{ type: "action2", turn: 9, kind: "MARK", whiteDie: 1, color: "GREEN" }]);
  });

  it("Pass (−5) sends at once (one click, one command) and shows the penalty wording", () => {
    const v = makeGameView({ phase: "ACTION_2" });
    show(v);
    mount();
    expect(passTakesPenalty(v)).toBe(true);
    expect(submitLabel(v, false)).toBe("Pass (−5)");
    const btn = screen.getByText("Pass (−5)") as HTMLButtonElement;
    expect(btn.classList.contains("is-danger")).toBe(true);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(sent).toEqual([{ type: "action2", turn: 9, kind: "PASS" }]);
    expect(screen.queryByText("Pass and take −5?")).toBeNull();
    expect((screen.getByText("Sent…") as HTMLButtonElement).disabled).toBe(true);
  });

  it("the pass label is the penalty text exactly when passing would cost −5", () => {
    // Step 2 after an Action 1 mark: plain Pass.
    const marked = makeGameView({
      phase: "ACTION_2",
      events: [
        { type: "TURN_STARTED", turnNumber: 9, activeSeat: 0 },
        { type: "MARKED", playerId: "seat-0", action: 1, color: "RED", number: 8 },
      ],
    });
    expect(passTakesPenalty(marked)).toBe(false);
    expect(submitLabel(marked, false)).toBe("Pass");
    // Active, nothing staged, both actions open: Pass (−5) (D-L4).
    const step1 = makeGameView({ legal1: ["RED"] });
    expect(passTakesPenalty(step1)).toBe(true);
    expect(submitLabel(step1, false)).toBe("Pass (−5)");
    // Something staged: Submit.
    expect(submitLabel(step1, true)).toBe("Submit");
    // Passive player: plain Pass.
    const passive = makeGameView({ active: 1, legal1: ["RED"] });
    expect(submitLabel(passive, false)).toBe("Pass");
    // Nothing marked and nothing staged at step 2 (ACTION_1 early): penalty.
    const early = makeGameView({
      decision: true,
      pass2: true,
      legal2: [],
    });
    early.you.legalAction2 = [{ kind: "PASS" }];
    expect(passTakesPenalty(early)).toBe(true);
  });

  it("step texts: active step 1, active step 2, passive", () => {
    show(makeGameView({ legal1: ["RED"] }));
    mount();
    expect(status()).toBe("Pick the white total 8 and / or a white + colour box, then Submit.");
    cleanup();
    _resetStoreForTests();
    show(makeGameView({ phase: "ACTION_2", version: 6 }));
    mount();
    expect(status()).toContain("Step 2 of 2 · Mark a white die + one colour die");
    cleanup();
    _resetStoreForTests();
    show(makeGameView({ active: 1, legal1: ["RED"], version: 7 }));
    mount();
    expect(status()).toBe("Mark the white total 8 in any row, or pass (no penalty).");
  });

  it("white then colour staged, one Submit sends one turn command", () => {
    // White 3 + 5 = 8, red 2: red 8 is the white sum; red 5 (3+2) is left of it.
    // Green 6: 3+6 = 9, 5+6 = 11. Stage Red 8 (step 1), then Green 11 (step 2).
    show(makeGameView({ legal1: ["RED"] }));
    mount();
    fireEvent.click(screen.getByLabelText("Red 8, can mark"));
    fireEvent.click(screen.getByLabelText("Green 11, can mark"));
    expect(sent).toHaveLength(0);
    fireEvent.click(screen.getByText("Submit"));
    expect(sent).toEqual([
      {
        type: "turn",
        turn: 9,
        action1: { kind: "MARK", color: "RED" },
        action2: { kind: "MARK", whiteDie: 1, color: "GREEN" },
      },
    ]);
  });

  it("a staged white box alone: Submit sends step 1 mark + step 2 pass together", () => {
    show(makeGameView({ legal1: ["RED"] }));
    mount();
    fireEvent.click(screen.getByLabelText("Red 8, can mark"));
    fireEvent.click(screen.getByText("Submit"));
    expect(sent).toEqual([
      {
        type: "turn",
        turn: 9,
        action1: { kind: "MARK", color: "RED" },
        action2: { kind: "PASS" },
      },
    ]);
  });

  it("passive player: Submit sends action1 MARK, Pass sends action1 PASS once", () => {
    show(makeGameView({ active: 1, legal1: ["RED"] }));
    mount();
    fireEvent.click(screen.getByLabelText("Red 8, can mark"));
    fireEvent.click(screen.getByText("Submit"));
    expect(sent).toEqual([{ type: "action1", turn: 9, kind: "MARK", color: "RED" }]);
    cleanup();
    sent.length = 0;
    _resetStoreForTests();
    show(makeGameView({ active: 1, legal1: ["RED"], version: 8 }));
    mount();
    fireEvent.click(screen.getByText("Pass"));
    fireEvent.click(screen.getByText("Sent…"));
    expect(sent).toEqual([{ type: "action1", turn: 9, kind: "PASS" }]);
  });

  it("after step 1 the active player sees step 2 at once (early Action 2 options)", () => {
    const v = makeGameView({ decision: true, pass1: false, version: 6 });
    v.you.legalAction2 = [
      { kind: "PASS" },
      { kind: "MARK", whiteDie: 1, color: "GREEN", number: 11 },
    ];
    show(v);
    mount();
    expect(status()).toContain("Step 2 of 2");
    fireEvent.click(screen.getByLabelText("Green 11, can mark"));
    fireEvent.click(screen.getByText("Submit"));
    expect(sent).toEqual([{ type: "action2", turn: 9, kind: "MARK", whiteDie: 1, color: "GREEN" }]);
  });

  it("K4.9: a passive player with no white-sum move is auto-passed once and sees the disabled label", () => {
    vi.useFakeTimers();
    show(makeGameView({ active: 1, legal1: [] }));
    mount();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(sent).toEqual([{ type: "action1", turn: 9, kind: "PASS" }]);
    const btn = screen.getByText("No white-sum move — waiting for Cleo") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    act(() => {
      applyView(makeGameView({ active: 1, legal1: [], version: 7 }));
      vi.advanceTimersByTime(1000);
    });
    expect(sent).toHaveLength(1);
  });

  it("K4.9: with legal options nothing is auto-sent", () => {
    show(makeGameView({ active: 1, legal1: ["RED"] }));
    mount();
    expect(sent).toHaveLength(0);
    expect(screen.queryByText(/No white-sum move/)).toBeNull();
  });

  it("K4.3: the one Roll button follows the dice tray", () => {
    for (const w of [390, 1280]) {
      setWidth(w);
      show(makeGameView({ phase: "AWAIT_ROLL", canRoll: true, active: 0 }));
      const { container } = mount();
      const tray = container.querySelector(".tray") as Element;
      const roll = screen.getByRole("button", { name: /roll/i });
      expect(tray.nextElementSibling?.contains(roll)).toBe(true);
      expect(container.querySelector(".g-actionbar")?.contains(roll)).toBe(false);
      cleanup();
      _resetStoreForTests();
    }
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
    expect(document.querySelectorAll(".g-box.is-cw")).toHaveLength(1);
  });

  it("a resync view shows legal boxes at once", () => {
    show(makeGameView({ legal1: ["RED"] }));
    mount();
    expect(document.querySelectorAll(".g-box.is-cw")).toHaveLength(1);
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
    expect(chip?.querySelector("[data-total]")).toBeNull(); // opponent totals stay hidden
    expect(chip?.textContent).not.toContain("-7");
    expect(chip?.getAttribute("aria-label") ?? "").not.toContain("-7");
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

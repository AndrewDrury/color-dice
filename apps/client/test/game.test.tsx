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

  it("5 players: 4 chips at 390 px, 4 mini sheets at 1280 px", () => {
    show(makeGameView({ players: 5 }));
    const { container } = mount();
    expect(container.querySelectorAll(".g-chip")).toHaveLength(4);
    expect(container.querySelectorAll(".g-mini")).toHaveLength(0);
    cleanup();
    setWidth(1280);
    const r = mount();
    expect(r.container.querySelectorAll(".g-mini")).toHaveLength(4);
    expect(r.container.querySelectorAll(".g-chip")).toHaveLength(0);
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
    expect(screen.getByText(/Tied winners/)).toBeTruthy();
    expect(screen.getByText("Two rows locked")).toBeTruthy();
    expect(document.querySelectorAll("tr[data-winner]")).toHaveLength(2);
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

  it("penalty diff emits penalty", () => {
    const next = makeGameView({
      version: 6,
      phase: "AWAIT_ROLL",
      active: 1,
      gamePlayers: [
        player(0),
        player(1, { sheet: { ...player(1).sheet, penalties: 1 } }),
        player(2),
      ],
    });
    const evs = diffViews(makeGameView({ version: 5, phase: "ACTION_2" }), next);
    expect(evs.find((e) => e.kind === "penalty")?.seat).toBe(1);
  });
});

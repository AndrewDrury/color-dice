import type { GameEvent } from "@cd/engine";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURN_SUMMARY_MS, TurnSummary } from "../src/components/TurnSummary";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { summarizeTurn } from "../src/game/turnSummary";
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

const started = (n: number, seat: number): GameEvent => ({
  type: "TURN_STARTED",
  turnNumber: n,
  activeSeat: seat,
});
const rolled: GameEvent = {
  type: "DICE_ROLLED",
  white: [3, 4],
  colored: { RED: 2, BLUE: 5 },
  whiteSum: 7,
};
const m1: GameEvent = {
  type: "MARKED",
  playerId: "seat-1",
  action: 1,
  color: "GREEN",
  number: 7,
  index: 5,
  lockedNow: false,
};
const m2: GameEvent = {
  type: "MARKED",
  playerId: "seat-0",
  action: 2,
  color: "RED",
  number: 5,
  index: 3,
  whiteDie: 0,
  lockedNow: false,
};
const turn = (...mid: GameEvent[]): GameEvent[] => [started(1, 0), rolled, ...mid, started(2, 1)];
const view = (events: GameEvent[], players = 3) => makeGameView({ players, events });
const sum = (events: GameEvent[], fresh = events.slice(-1), players = 3) =>
  summarizeTurn(view(events, players), fresh);

describe("summarizeTurn (T-NEW-12)", () => {
  it("returns null without a new turn boundary or a previous turn", () => {
    expect(summarizeTurn(view(turn(m1)), [m1])).toBeNull();
    expect(summarizeTurn(view([started(2, 1)]), [started(2, 1)])).toBeNull();
  });

  it("a mark shows its dice: white pair for action 1, white + coloured for action 2", () => {
    const s = sum(turn(m1, m2));
    expect(s?.turn).toBe(1);
    const p0 = s?.players.find((p) => p.seat === 0);
    const p1 = s?.players.find((p) => p.seat === 1);
    expect(p1?.marks[0]?.dice).toEqual([
      { color: "WHITE", face: 3 },
      { color: "WHITE", face: 4 },
    ]);
    expect(p0?.marks[0]?.dice).toEqual([
      { color: "WHITE", face: 3 },
      { color: "RED", face: 2 },
    ]);
  });

  it("no mark, penalty, both, and lock", () => {
    const pen: GameEvent = { type: "PENALTY", playerId: "seat-0", total: -5 };
    const lock: GameEvent = { type: "ROW_LOCKED", color: "GREEN", lockedBy: ["seat-1"], action: 1 };
    const s = sum(turn(m1, pen, lock));
    const by = (n: number) => s?.players.find((p) => p.seat === n);
    expect(by(0)?.marks).toEqual([]);
    expect(by(0)?.penalty).toBe(true);
    expect(by(1)?.marks.length).toBe(1);
    expect(by(1)?.penalty).toBe(false);
    expect(by(1)?.locks).toEqual(["GREEN"]);
    expect(by(2)?.marks).toEqual([]);
    expect(by(2)?.penalty).toBe(false);
    const both = sum(turn(m2, { ...m1, playerId: "seat-0" }, pen));
    expect(both?.players[0]?.marks.length).toBe(2);
    expect(both?.players[0]?.penalty).toBe(true);
  });

  it("orders the active player first, the rest by seat", () => {
    const evs = [started(1, 2), rolled, started(2, 0)];
    expect(sum(evs, evs.slice(-1), 4)?.players.map((p) => p.seat)).toEqual([2, 0, 1, 3]);
  });

  it("an undone mark is dropped", () => {
    const undo: GameEvent = {
      type: "UNDO",
      playerId: "seat-1",
      kind: "MARK",
      color: "GREEN",
      index: 5,
    };
    expect(sum(turn(m1, undo))?.players.find((p) => p.seat === 1)?.marks).toEqual([]);
  });
});

describe("TurnSummary popup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPrefs({ motion: "full" });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    _resetPrefsForTests();
  });
  const data = () => sum(turn(m1, m2, { type: "PENALTY", playerId: "seat-2", total: -5 })) as never;

  it("renders names, marks, dice and the penalty chip for everyone", () => {
    render(<TurnSummary summary={data()} onClose={() => {}} />);
    expect(screen.getByText("Red 5 ✓")).toBeTruthy();
    expect(screen.getByText("Green 7 ✓")).toBeTruthy();
    expect(screen.getAllByTestId("ts-penalty").length).toBe(1);
    expect(document.querySelectorAll(".die[data-face]").length).toBe(4);
  });

  it("auto-closes, and a tap anywhere dismisses", () => {
    const close = vi.fn();
    render(<TurnSummary summary={data()} onClose={close} />);
    act(() => {
      vi.advanceTimersByTime(TURN_SUMMARY_MS);
    });
    expect(close).toHaveBeenCalledTimes(1);
    close.mockClear();
    fireEvent.pointerDown(document.body);
    expect(close).toHaveBeenCalled();
  });

  it("reduced motion: static card, same content", () => {
    setPrefs({ motion: "reduced" });
    render(<TurnSummary summary={data()} onClose={() => {}} />);
    expect(screen.getByTestId("turn-summary").classList.contains("is-reduced")).toBe(true);
    expect(screen.getByText("Green 7 ✓")).toBeTruthy();
  });
});

describe("Game integration", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetMemoryForTests();
    _resetStoreForTests();
    _resetPrefsForTests();
    _resetPlayedRollsForTests();
    setPrefs({ sound: false, haptics: false, motion: "full" });
    saveSession(CODE, { token: TOKEN, seatId: seatIdOf(0), name: "Andrew", roomName: "R" });
  });
  afterEach(cleanup);

  it("pops up when a new turn starts live, is replaced, and hides at game over", () => {
    act(() => {
      applyView(makeGameView({ version: 1, events: [started(1, 0), rolled, m1] }));
    });
    render(<Game code={CODE} />);
    expect(screen.queryByTestId("turn-summary")).toBeNull();
    act(() => {
      applyView(makeGameView({ version: 2, events: [started(1, 0), rolled, m1, started(2, 1)] }));
    });
    expect(screen.getByTestId("turn-summary").getAttribute("data-turn")).toBe("1");
    const t2: GameEvent[] = [started(1, 0), rolled, m1, started(2, 1), rolled, started(3, 0)];
    act(() => {
      applyView(makeGameView({ version: 3, events: t2 }));
    });
    expect(screen.getAllByTestId("turn-summary").length).toBe(1);
    expect(screen.getByTestId("turn-summary").getAttribute("data-turn")).toBe("2");
    act(() => {
      applyView(makeGameView({ version: 4, phase: "GAME_OVER", events: t2 }));
    });
    expect(screen.queryByTestId("turn-summary")).toBeNull();
  });
});

import type { ViewMessage, ViewPlayer } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockPopup } from "../src/components/LockPopup";
import { OpponentChip } from "../src/components/OpponentChip";
import { _resetRollOffForTests } from "../src/components/RollOff";
import { Sheet } from "../src/components/Sheet";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { lockMessage } from "../src/game/flow";
import { applyLanguage } from "../src/i18n";
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
  _resetRollOffForTests();
  setPrefs({ sound: false, haptics: false, motion: "full" });
  saveSession(CODE, { token: TOKEN, seatId: seatIdOf(0), name: "Andrew", roomName: "Friday dice" });
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await applyLanguage("en");
});

const show = (v: ViewMessage) => {
  act(() => {
    applyView(v);
  });
};
const view = (o: Parameters<typeof makeGameView>[0] = {}): ViewMessage => makeGameView(o);

describe("roll-off overlay (K4.1)", () => {
  it("the roll-off shows once; tap skips to the result, Let's go closes it", () => {
    const rounds = [
      [4, 4, 1],
      [3, 5, 0],
    ];
    const v = view({
      phase: "AWAIT_ROLL",
      canRoll: true,
      events: [{ type: "FIRST_PLAYER_CHOSEN", seat: 1, method: "ROLL_OFF", rounds }],
    });
    show(v);
    render(<Game code={CODE} />);
    expect(screen.getByTestId("rolloff")).toBeTruthy();
    fireEvent.click(screen.getByTestId("rolloff"));
    expect(screen.getByTestId("rolloff")).toBeTruthy(); // the result waits for Let's go (D-L2)
    fireEvent.click(screen.getByTestId("rolloff-go"));
    expect(screen.queryByTestId("rolloff")).toBeNull();
    cleanup();
    render(<Game code={CODE} />);
    expect(screen.queryByTestId("rolloff")).toBeNull();
  });

  it("is not shown for a configured first player", () => {
    show(
      view({
        phase: "AWAIT_ROLL",
        events: [{ type: "FIRST_PLAYER_CHOSEN", seat: 0, method: "CONFIGURED", rounds: [] }],
      }),
    );
    render(<Game code={CODE} />);
    expect(screen.queryByTestId("rolloff")).toBeNull();
  });
});

describe("lock popup (K4.2)", () => {
  it("names who locked the row: you / someone else / both", () => {
    const v = view({});
    const e = (lockedBy: string[]) => ({
      type: "ROW_LOCKED" as const,
      color: "RED" as const,
      lockedBy,
      action: 1 as const,
    });
    expect(lockMessage(v, e(["seat-0"]))).toBe("You locked the Red row!");
    expect(lockMessage(v, e(["seat-1"]))).toBe("Cleo locked the Red row!");
    expect(lockMessage(v, e(["seat-1", "seat-0"]))).toBe("You and Cleo locked the Red row!");
  });

  it("queues popups one after another in an aria-live region without blocking clicks", () => {
    vi.useFakeTimers();
    let queue = [
      { id: 1, color: "RED" as const, text: "Cleo locked the Red row!" },
      { id: 2, color: "BLUE" as const, text: "Cleo locked the Blue row!" },
    ];
    const shift = () => {
      queue = queue.slice(1);
      r.rerender(<LockPopup queue={queue} shift={shift} />);
    };
    const r = render(<LockPopup queue={queue} shift={shift} />);
    expect(r.container.querySelector("[aria-live=polite]")).not.toBeNull();
    expect(screen.getByText("Cleo locked the Red row!")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2300);
    });
    expect(screen.queryByText("Cleo locked the Red row!")).toBeNull();
    expect(screen.getByText("Cleo locked the Blue row!")).toBeTruthy();
  });

  it("a ROW_LOCKED event in a live view pops up for the viewer", () => {
    show(view({ version: 5, phase: "ACTION_1", legal1: ["RED"] }));
    render(<Game code={CODE} />);
    const next = view({
      version: 6,
      phase: "ACTION_2",
      lockedColors: ["RED"],
      events: [
        { type: "ROW_LOCKED", color: "RED", lockedBy: ["seat-1"], action: 1 },
        { type: "ACTION2_VOIDED", playerId: "seat-0", reason: "ROW_LOCKED" },
      ],
    });
    show(next);
    expect(screen.getByText("Cleo locked the Red row!")).toBeTruthy();
  });
});

describe("gameplay hints (T-FIX-NEW-remove-hints-name-winner)", () => {
  it("does not render coaching hints, desktop key hint, or hint actions", () => {
    show(view({ phase: "ACTION_1", legal1: ["RED"], canRoll: true }));
    const { container } = render(<Game code={CODE} />);
    expect(container.querySelector(".g-hintline")).toBeNull();
    expect(container.querySelector(".key-hint")).toBeNull();
    expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Don't show hints" })).toBeNull();
  });
});

describe("opponent penalties in words (K4.7)", () => {
  it("0 / 1 / 2 / 4 strikes in EN, FR, ES", async () => {
    const cases: [string, number, string][] = [
      ["en", 0, ""],
      ["en", 1, "1 penalty (−5)"],
      ["en", 2, "2 penalties (−10)"],
      ["fr", 1, "1 pénalité (−5)"],
      ["fr", 4, "4 pénalités (−20)"],
      ["es", 2, "2 penalizaciones (−10)"],
      ["es", 1, "1 penalización (−5)"],
    ];
    for (const [lang, strikes, text] of cases) {
      await applyLanguage(lang as "en");
      const p = player(1, {
        score: {
          rows: { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 },
          penalties: -5 * strikes,
          total: -5 * strikes,
        },
      });
      const v = view({ gamePlayers: [player(0), p, player(2)] });
      const { container, unmount } = render(
        <OpponentChip view={v} player={v.game?.players[1] as ViewPlayer} flash={false} />,
      );
      expect((container.querySelector(".g-chip-pen")?.textContent ?? "").trim()).toBe(text);
      const aria = container.querySelector(".g-chip")?.getAttribute("aria-label") ?? "";
      if (strikes > 0) expect(aria).toContain(text);
      unmount();
    }
  });
});

describe("score card, round 3 (K3.5, K4.8)", () => {
  const fx = { flash: {}, glint: null, floats: [], shakeKey: 0 };
  const card = () => (
    <Sheet
      player={player(0)}
      lockedColors={[]}
      legal={new Set()}
      staged={[]}
      ghost={[]}
      disabled
      fx={fx}
      onPick={() => {}}
    />
  );

  it("the total pill holds the number and a 'total' caption", () => {
    const { container } = render(card());
    const pill = container.querySelector(".g-total");
    expect(pill?.querySelector(".num")?.textContent).toBe("0");
    expect(pill?.querySelector(".g-total-cap")?.textContent).toBe("total");
  });

  it("one lock column: a labelled lock tab and one outline segment per row", () => {
    const { container } = render(card());
    const tabs = container.querySelectorAll(".g-locktab");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.getAttribute("aria-label")).toBe(
      "Lock column — mark 5 then the last box to lock a row",
    );
    const rows = container.querySelectorAll(".g-row");
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.querySelectorAll(".g-lockseg")).toHaveLength(1);
      expect(row.querySelectorAll(".g-box")).toHaveLength(11);
      expect(row.querySelectorAll(".g-lockbox")).toHaveLength(1);
    }
  });
});

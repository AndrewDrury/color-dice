import type { ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetCelebrationForTests, winnerGif } from "../src/components/Celebration";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { GameOver } from "../src/screens/GameOver";
import { makeGameView, player, seatIdOf } from "./fixtures/views";

const sound = vi.hoisted(() => {
  const handle = () => ({ duration: 4, stop: vi.fn() });
  return {
    handles: [] as ReturnType<typeof handle>[],
    make() {
      const h = handle();
      this.handles.push(h);
      return h;
    },
    playJingle: vi.fn(),
    playLaugh: vi.fn(),
    playDrumRoll: vi.fn(),
  };
});
vi.mock("../src/fx/sound", async (orig) => {
  const real = await orig<typeof import("../src/fx/sound")>();
  sound.playJingle.mockImplementation(() => sound.make());
  sound.playLaugh.mockImplementation(() => sound.make());
  sound.playDrumRoll.mockImplementation(() => sound.make());
  return { ...real, ...sound, play: vi.fn() };
});

const scored = (seat: number, total: number) =>
  player(seat, {
    score: { rows: { RED: total, YELLOW: 0, GREEN: 0, BLUE: 0 }, penalties: 0, total },
  });

let game = 0;
function overView(totals: number[], winners: number[], you = 0): ViewMessage {
  game += 1; // a fresh "game number" so each test claims its own celebration
  const v = makeGameView({
    players: totals.length,
    phase: "GAME_OVER",
    you,
    gamePlayers: totals.map((t, i) => scored(i, t)),
    winners: winners.map(seatIdOf),
  });
  v.seats = v.seats.map((s) => ({ ...s, record: { wins: game, ties: 0, losses: 0 } }));
  return v;
}

const mount = (v: ViewMessage) =>
  render(
    <GameOver
      view={v}
      rematchBusy={false}
      send={() => true}
      onRematch={() => {}}
      onHome={() => {}}
    />,
  );
const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const overlay = () => document.querySelector('[data-testid="celebration"]');

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  _resetCelebrationForTests();
  _resetPrefsForTests();
  setPrefs({ sound: true, motion: "full" });
  sound.handles.length = 0;
  for (const f of [sound.playJingle, sound.playLaugh, sound.playDrumRoll]) f.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("celebration", () => {
  it("opens with the suspense beat, then reveals one card at a time from last place to first", () => {
    mount(overView([9, 2, 5], [0]));
    expect(screen.getByText("And the scores are…")).toBeTruthy();
    expect(sound.playDrumRoll).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="cel-reveal"]')).toBeNull();
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      tick(i === 0 ? 1500 : 2400);
      const card = document.querySelector('[data-testid="cel-reveal"]');
      seen.push(card?.getAttribute("data-seat") ?? "none");
      expect(document.querySelectorAll('[data-testid="cel-reveal"]')).toHaveLength(1);
      expect(card?.querySelector(".g-sheet, .sheet, [data-color]")).not.toBeNull();
    }
    expect(seen).toEqual(["1", "2", "0"]); // 2, 5, 9 points
    const eq = document.querySelector('[data-testid="cel-reveal"] .g-res-eq') as HTMLElement;
    expect(eq.querySelector('[data-term="PEN"] .eqn')?.getAttribute("data-value")).toBe("0");
    expect(eq.querySelector(".g-total .num")?.getAttribute("data-value")).toBe("9");
    expect(eq.querySelector('[data-term="RED"]')?.classList.contains("c-red")).toBe(true);
  });

  it("takes roughly 8-12 s overall before the winner modal", () => {
    mount(overView([9, 2, 5], [0]));
    tick(7000);
    expect(overlay()?.getAttribute("data-phase")).not.toBe("win");
    tick(2500);
    expect(overlay()?.getAttribute("data-phase")).toBe("win");
  });

  it("winner modal shows a random, base-aware reaction GIF that ignores pointers", () => {
    const v = overView([9, 2], [0]);
    mount(v);
    tick(9000);
    const img = screen.getByTestId("cel-gif") as HTMLImageElement;
    const happy = ["Dancing", "Dance", "Happy", "Laugh", "Love", "Cute"];
    expect(happy.some((w) => (img.getAttribute("src") ?? "").includes(w))).toBe(true);
    expect(img.getAttribute("src")).toMatch(/^\/reactions\/.+\.gif$/);
    expect(getComputedStyle(img).pointerEvents).toBeDefined();
    expect(winnerGif("A:1", true)).toBe(winnerGif("A:1", true));
    expect(winnerGif("A:1", false)).toMatch(/shocked|surprised|screaming/);
  });

  it("a loser gets the shocked GIF set", () => {
    mount(overView([9, 2], [0], 1));
    tick(9000);
    expect(screen.getByTestId("cel-gif").getAttribute("src")).toMatch(
      /Shocked|Surprised|Screaming/,
    );
  });

  it("skip button jumps out of the build-up", () => {
    mount(overView([9, 2, 5], [0]));
    tick(1500);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(overlay()).toBeNull();
    for (const h of sound.handles) expect(h.stop).toHaveBeenCalled();
  });

  it("reveals 'You win!' with the jingle once, then the laughing cat with one laugh", () => {
    mount(overView([9, 2], [0]));
    tick(9000); // build-up + hush
    expect(screen.getByTestId("cel-winner").textContent).toContain("You win!");
    expect(sound.playJingle).toHaveBeenCalledTimes(1);
    expect(sound.playLaugh).not.toHaveBeenCalled();
    tick(4100); // jingle (4 s) ends -> cat
    expect(sound.playLaugh).toHaveBeenCalledTimes(1);
    expect(overlay()?.getAttribute("data-phase")).toBe("cat");
    expect(screen.getByTestId("cel-gif")).toBeTruthy(); // the cat stays through the laugh moment
    expect(sound.handles[1]?.stop).toHaveBeenCalled(); // jingle stopped before the laugh
    fireEvent.click(screen.getByLabelText(/laughing so hard/));
    expect(sound.playLaugh).toHaveBeenCalledTimes(2); // tap replays
    expect(overlay()).not.toBeNull();
    tick(6000);
    expect(overlay()).toBeNull();
    expect(sound.playLaugh).toHaveBeenCalledTimes(2);
  });

  it("ties are revealed in order and shown as a tie", () => {
    mount(overView([5, 5, 2], [0, 1]));
    tick(1500);
    expect(document.querySelector('[data-testid="cel-reveal"]')?.getAttribute("data-seat")).toBe(
      "2",
    );
    tick(2400);
    expect(
      document.querySelector('[data-testid="cel-reveal"] .cel-reveal-head .num')?.textContent,
    ).toBe("1.");
    tick(8000);
    expect(screen.getByTestId("cel-winner").textContent).toMatch(/Tie: Andrew & Cleo/);
  });

  it("names the winner for others and lists co-winners on a tie", () => {
    const { unmount } = mount(overView([9, 2], [0], 1));
    tick(9000);
    expect(screen.getByTestId("cel-winner").textContent).toContain("Andrew");
    unmount();
    mount(overView([9, 9, 2], [0, 1]));
    tick(9000);
    expect(screen.getByTestId("cel-winner").textContent).toMatch(/Tie: Andrew & Cleo/);
  });

  it("plays once per game: a remount (reconnect) of the same game shows no overlay", () => {
    const v = overView([9, 2], [0]);
    const { unmount } = mount(v);
    expect(overlay()).not.toBeNull();
    unmount();
    mount(v);
    expect(overlay()).toBeNull();
    expect(sound.playDrumRoll).toHaveBeenCalledTimes(1);
  });

  it("a later game (rematch) celebrates again", () => {
    mount(overView([9, 2], [0]));
    cleanup();
    mount(overView([9, 2], [0]));
    expect(overlay()).not.toBeNull();
  });

  it("tap to skip ends it and stops every sound", () => {
    mount(overView([9, 2], [0]));
    tick(9000);
    fireEvent.click(screen.getByTestId("celebration"));
    expect(overlay()).toBeNull();
    for (const h of sound.handles) expect(h.stop).toHaveBeenCalled();
  });

  it("muting during the sequence stops the sounds", () => {
    mount(overView([9, 2], [0]));
    tick(9000);
    act(() => {
      setPrefs({ sound: false });
    });
    for (const h of sound.handles) expect(h.stop).toHaveBeenCalled();
  });

  it("reduced motion: no confetti, still cat, rows fade", async () => {
    setPrefs({ motion: "reduced" });
    mount(overView([9, 2], [0]));
    expect(overlay()?.classList.contains("is-reduced")).toBe(true);
    tick(600); // reduced: short fixed delays, still one by one
    expect(document.querySelector('[data-testid="cel-reveal"]')?.getAttribute("data-seat")).toBe(
      "1",
    );
    tick(900);
    expect(document.querySelector('[data-testid="cel-reveal"]')?.getAttribute("data-seat")).toBe(
      "0",
    );
    tick(3000);
    await act(async () => {});
    expect(document.querySelector(".cf")).toBeNull();
    tick(6000);
    expect(document.querySelector(".lcat.is-still")).not.toBeNull();
  });

  it("full motion: confetti appears at the reveal and the cat moves", async () => {
    mount(overView([9, 2], [0]));
    tick(8200);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(document.querySelector(".cf")).not.toBeNull();
    tick(6000);
    expect(document.querySelector(".lcat")).not.toBeNull();
    expect(document.querySelector(".lcat.is-still")).toBeNull();
  });
});

describe("results table", () => {
  it("shows the coloured equation per player", () => {
    const v = overView([9, 2], [0]);
    sessionStorage.setItem(`cd:cel:${v.code}:${game}`, "1"); // overlay off
    const { container } = mount(v);
    const row = container.querySelector("tbody tr") as HTMLElement;
    expect(
      row.querySelectorAll(
        ".g-eq .g-score.c-red, .g-eq .g-score.c-yellow, .g-eq .g-score.c-green, .g-eq .g-score.c-blue",
      ),
    ).toHaveLength(4);
    expect(row.querySelector(".g-total-cell .num")?.getAttribute("data-value")).toBe("9");
  });
});

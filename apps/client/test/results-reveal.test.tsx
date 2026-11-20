import type { ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsReveal } from "../src/components/ResultsReveal";
import { type CelebrationKind, KINDS, pickCelebration } from "../src/fx/celebrate";
import {
  _resetCelebrationForTests,
  FIRST_STEP_MS,
  HUSH_MS,
  PLAYER_STAGGER_MS,
  revealSchedule,
  SETTLE_MS,
  STEP_GAP_MS,
  TOTAL_GAP_MS,
} from "../src/game/useReveal";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { GameOver } from "../src/screens/GameOver";
import { makeGameView, player, seatIdOf } from "./fixtures/views";

const sound = vi.hoisted(() => {
  const handles: { stop: ReturnType<typeof vi.fn> }[] = [];
  const make = () => {
    const h = { duration: 4, stop: vi.fn() };
    handles.push(h);
    return h;
  };
  return { handles, make, playJingle: vi.fn(), playDrumRoll: vi.fn(), play: vi.fn() };
});
vi.mock("../src/fx/sound", async (orig) => {
  const real = await orig<typeof import("../src/fx/sound")>();
  sound.playJingle.mockImplementation(() => sound.make());
  sound.playDrumRoll.mockImplementation(() => sound.make());
  return { ...real, ...sound };
});

const scored = (seat: number, total: number) =>
  player(seat, {
    score: { rows: { RED: total, YELLOW: 0, GREEN: 0, BLUE: 0 }, penalties: 0, total },
  });

let game = 0;
function overView(totals: number[], winners: number[], you = 0): ViewMessage {
  game += 1; // a fresh "game number" so each test claims its own reveal
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
const overlay = () => document.querySelector<HTMLElement>('[data-testid="celebration"]');
/** Colour/penalty terms revealed so far, per seat, e.g. {0: ["RED"], 1: ["RED"]}. */
const shown = () => {
  const out: Record<string, string[]> = {};
  for (const c of document.querySelectorAll(".rv-card"))
    out[c.getAttribute("data-seat") as string] = [...c.querySelectorAll(".rv-pill.is-in")].map(
      (p) => p.getAttribute("data-term") as string,
    );
  return out;
};
const allShow = (terms: string[]) => Object.values(shown()).every((v) => v.join() === terms.join());
const totals = () => document.querySelectorAll(".rv-card.has-total").length;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  _resetCelebrationForTests();
  _resetPrefsForTests();
  setPrefs({ sound: true, motion: "full" });
  sound.handles.length = 0;
  for (const f of [sound.playJingle, sound.playDrumRoll, sound.play]) f.mockClear();
  // jsdom has no canvas: the canvas kinds then simply draw nothing.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("reveal timeline", () => {
  it("all cards are visible from the start, scores hidden", () => {
    mount(overView([9, 2, 5], [0]));
    expect(screen.getByText("And the scores are…")).toBeTruthy();
    expect(document.querySelectorAll(".rv-card")).toHaveLength(3);
    expect(allShow([])).toBe(true);
    expect(document.querySelector(".rv-rank")?.textContent).toBe(""); // no rank spoiler
  });

  it("reveals one colour at a time for every player at once: red, yellow, green, blue, penalties", () => {
    mount(overView([9, 2, 5], [0]));
    const s = revealSchedule(3);
    expect(s.steps).toEqual([0, 1, 2, 3, 4].map((i) => FIRST_STEP_MS + i * STEP_GAP_MS));
    tick(FIRST_STEP_MS - 1);
    expect(allShow([])).toBe(true);
    const seq = ["RED", "YELLOW", "GREEN", "BLUE", "PEN"];
    for (let i = 0; i < 5; i++) {
      tick(i === 0 ? 1 : STEP_GAP_MS - 1);
      if (i > 0) expect(allShow(seq.slice(0, i))).toBe(true); // not early
      if (i > 0) tick(1);
      expect(allShow(seq.slice(0, i + 1))).toBe(true); // same fake time, every player
    }
    expect(totals()).toBe(0);
  });

  it("staggers players by a few ms inside a colour", () => {
    mount(overView([9, 2, 5], [0]));
    const delays = [...document.querySelectorAll<HTMLElement>(".rv-card")].map((c) =>
      c.style.getPropertyValue("--p"),
    );
    expect(delays).toEqual(["0ms", `${PLAYER_STAGGER_MS}ms`, `${PLAYER_STAGGER_MS * 2}ms`]);
    expect(PLAYER_STAGGER_MS).toBeLessThan(150);
  });

  it("pauses much longer before the totals than between colours, then slams them in order", () => {
    expect(STEP_GAP_MS).toBeGreaterThanOrEqual(800);
    expect(HUSH_MS).toBeGreaterThanOrEqual(1800);
    expect(HUSH_MS).toBeGreaterThan(STEP_GAP_MS * 1.5);
    mount(overView([9, 2, 5], [0]));
    const s = revealSchedule(3);
    tick(s.steps[4] as number);
    expect(allShow(["RED", "YELLOW", "GREEN", "BLUE", "PEN"])).toBe(true);
    tick(HUSH_MS - 1);
    expect(totals()).toBe(0);
    expect(screen.getByText("And the winner is…")).toBeTruthy();
    expect(sound.playDrumRoll).toHaveBeenCalledTimes(1);
    tick(1);
    expect(totals()).toBe(1);
    expect(document.querySelector(".rv-card.has-total")?.getAttribute("data-seat")).toBe("1");
    tick(TOTAL_GAP_MS * 2);
    expect(totals()).toBe(3);
    expect(sound.playJingle).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("rv-title").textContent).toContain("You win!");
    expect(document.querySelector(".rv-card.is-winner")?.getAttribute("data-seat")).toBe("0");
    expect(
      document.querySelector(".rv-card.is-winner .rv-total-num")?.getAttribute("data-value"),
    ).toBe("9");
    expect(screen.queryByTestId("rv-show-cards")).toBeNull(); // not before the slam settles
    tick(SETTLE_MS);
    expect(screen.getByTestId("rv-show-cards")).toBeTruthy();
    expect(screen.queryByTestId("rv-skip")).toBeNull();
  });

  it("each card shows avatar, name, four coloured pills and penalties", () => {
    mount(overView([9, 2], [0]));
    tick(FIRST_STEP_MS);
    const card = document.querySelector(".rv-card") as HTMLElement;
    expect(
      card.querySelectorAll(".rv-pill.c-red, .rv-pill.c-yellow, .rv-pill.c-green, .rv-pill.c-blue"),
    ).toHaveLength(4);
    expect(card.querySelector('[data-term="PEN"]')).toBeTruthy();
    expect(card.querySelector(".rv-name")?.textContent).toBe("Andrew");
    expect(card.querySelector(".rv-q")).toBeTruthy(); // total still hidden
  });
});

describe("skip, reduced motion, buttons", () => {
  it("Skip completes at once and stops the sounds", () => {
    mount(overView([9, 2, 5], [0]));
    tick(FIRST_STEP_MS);
    fireEvent.click(screen.getByTestId("rv-skip"));
    expect(allShow(["RED", "YELLOW", "GREEN", "BLUE", "PEN"])).toBe(true);
    expect(totals()).toBe(3);
    expect(screen.getByTestId("rv-show-cards")).toBeTruthy();
    for (const h of sound.handles) expect(h.stop).toHaveBeenCalled();
    tick(10_000);
    expect(sound.playJingle).not.toHaveBeenCalled();
  });

  it("tapping the backdrop skips; Escape skips, then closes", () => {
    mount(overView([9, 2], [0]));
    fireEvent.click(screen.getByTestId("celebration"));
    expect(totals()).toBe(2);
    expect(overlay()).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(overlay()).toBeNull();
  });

  it("reduced motion: instant, no moving backdrop, button right away", () => {
    setPrefs({ motion: "reduced" });
    mount(overView([9, 2], [0]));
    expect(overlay()?.classList.contains("is-reduced")).toBe(true);
    expect(totals()).toBe(2);
    expect(allShow(["RED", "YELLOW", "GREEN", "BLUE", "PEN"])).toBe(true);
    expect(screen.getByTestId("rv-show-cards")).toBeTruthy();
    expect(document.querySelector(".rv-fx--still")).not.toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
    expect(document.querySelector(".rv-fx i")).toBeNull();
    expect(sound.playJingle).not.toHaveBeenCalled();
  });

  it("'Show full score cards' closes the overlay onto every player's full card", () => {
    mount(overView([9, 2, 5], [0]));
    fireEvent.click(screen.getByTestId("rv-skip"));
    fireEvent.click(screen.getByRole("button", { name: "Show full score cards" }));
    expect(overlay()).toBeNull();
    expect(document.querySelectorAll(".g-final-card .g-sheet")).toHaveLength(3);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("Rematch and Back home are in the overlay at every stage, never behind it", () => {
    mount(overView([9, 2], [0]));
    const foot = () => document.querySelector(".rv-foot") as HTMLElement;
    expect(foot().textContent).toContain("Rematch");
    expect(foot().textContent).toContain("Back to home");
    tick(FIRST_STEP_MS + 5000);
    expect(foot().textContent).toContain("Rematch");
    tick(10_000);
    expect(foot().textContent).toContain("Rematch");
    // The results card's own copy is hidden while the overlay is up (no duplicates).
    expect(document.querySelector(".g-over-actions")?.hasAttribute("hidden")).toBe(true);
    fireEvent.click(screen.getByTestId("rv-show-cards"));
    expect(document.querySelector(".g-over-actions")?.hasAttribute("hidden")).toBe(false);
  });

  it("muting during the sequence stops the sounds", () => {
    mount(overView([9, 2], [0]));
    tick(FIRST_STEP_MS + STEP_GAP_MS + 1000);
    act(() => {
      setPrefs({ sound: false });
    });
    for (const h of sound.handles) expect(h.stop).toHaveBeenCalled();
  });

  it("plays once per game; a rematch plays again", () => {
    const v = overView([9, 2], [0]);
    const { unmount } = mount(v);
    expect(overlay()).not.toBeNull();
    unmount();
    mount(v);
    expect(overlay()).toBeNull();
    cleanup();
    mount(overView([9, 2], [0]));
    expect(overlay()).not.toBeNull();
  });
});

describe("celebrations", () => {
  it("picks uniformly from the whole set, seedable", () => {
    expect(KINDS).toEqual(expect.arrayContaining(["confetti", "lasers", "hearts"]));
    expect(KINDS.length).toBeGreaterThanOrEqual(6);
    expect(pickCelebration(() => 0)).toBe(KINDS[0]);
    expect(pickCelebration(() => 0.999999)).toBe(KINDS[KINDS.length - 1]);
    const seen = new Set(KINDS.map((_, i) => pickCelebration(() => (i + 0.5) / KINDS.length)));
    expect(seen.size).toBe(KINDS.length);
  });

  it("renders every kind behind the cards, aria-hidden and without pointer capture", () => {
    for (const kind of KINDS) {
      const { unmount } = render(<GameOverWithKind kind={kind} />);
      tick(10_000);
      const fx = document.querySelector(`.rv-fx--${kind}`) as HTMLElement;
      expect(fx, kind).not.toBeNull();
      expect(fx.getAttribute("aria-hidden")).toBe("true");
      expect(overlay()?.getAttribute("data-celebration")).toBe(kind);
      unmount();
    }
  });

  it("the CSS particle count stays small", async () => {
    const { CSS_COUNT, particleCap } = await import("../src/fx/celebrate");
    for (const n of Object.values(CSS_COUNT)) expect(n).toBeLessThanOrEqual(24);
    expect(particleCap(360)).toBeLessThan(particleCap(1280));
  });
});

function GameOverWithKind({ kind }: { kind: CelebrationKind }) {
  return (
    <ResultsReveal view={overView([9, 2], [0])} kind={kind} onDone={() => {}} actions={null} />
  );
}

describe("players, ties, names", () => {
  it("five players: all cards up front, every colour together, totals ascending", () => {
    mount(overView([4, 9, 1, 7, 7], [1]));
    expect(document.querySelectorAll(".rv-card")).toHaveLength(5);
    tick(FIRST_STEP_MS);
    expect(Object.values(shown()).every((v) => v.join() === "RED")).toBe(true);
    tick(revealSchedule(5).doneAt);
    expect(totals()).toBe(5);
    const order = [...document.querySelectorAll(".rv-card")].map((c) =>
      c.getAttribute("data-order"),
    );
    expect(order.sort()).toEqual(["0", "1", "2", "3", "4"]); // seat order on screen, rank in data
  });

  it("a tie shows the tie badge and heading, never a crown", () => {
    mount(overView([5, 5, 2], [0, 1]));
    fireEvent.click(screen.getByTestId("rv-skip"));
    expect(screen.getByTestId("rv-title").textContent).toMatch(/Tie: Andrew & Cleo/);
    expect(document.querySelectorAll(".rv-card.is-winner .rv-badge")).toHaveLength(2);
    expect(document.querySelectorAll(".rv-card .rv-name")).toHaveLength(3);
  });

  it("an all-way tie says so", () => {
    mount(overView([5, 5], [0, 1]));
    fireEvent.click(screen.getByTestId("rv-skip"));
    expect(screen.getByTestId("rv-title").textContent).toContain("It's a tie!");
  });

  it("names someone else as the winner, and keeps long names clipped with a title", () => {
    const v = overView([9, 2], [0], 1);
    const long = "Bartholomew-Maximilian the Magnificent of Dice";
    v.seats = v.seats.map((s, i) => (i === 0 ? { ...s, name: long } : s));
    mount(v);
    fireEvent.click(screen.getByTestId("rv-skip"));
    expect(screen.getByTestId("rv-title").textContent).toContain(long);
    const nm = [...document.querySelectorAll(".rv-name")].find((e) => e.textContent === long);
    expect(nm?.getAttribute("title")).toBe(long);
    expect(nm?.classList.contains("g-name")).toBe(true); // ellipsis class
  });
});

describe("results table", () => {
  it("shows the coloured equation per player once the reveal is closed", () => {
    const v = overView([9, 2], [0]);
    sessionStorage.setItem(`cd:cel:${v.code}:${game}`, "1"); // overlay off
    const { container } = mount(v);
    const row = container.querySelector("tbody tr") as HTMLElement;
    expect(row.querySelectorAll(".g-eq .g-score")).toHaveLength(5);
    expect(row.querySelector(".g-total-cell .num")?.getAttribute("data-value")).toBe("9");
  });
});

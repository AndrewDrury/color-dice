/** T-NEW-2 / T-NEW-17: the full-screen "Who goes first?" roll-off (live + replay). */
import type { ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetRollOffForTests,
  ROUND_HOLD_MS,
  RollOff,
  RollOffLive,
} from "../src/components/RollOff";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { contrastRatio } from "../src/styles/contrast";
import css from "../src/styles/rolloff.css?raw";
import { CODE, makeGameView } from "./fixtures/views";

/** Long enough for any tumble + settle. */
const LAND = 1000;

beforeEach(() => {
  _resetPrefsForTests();
  _resetRollOffForTests();
  setPrefs({ sound: false, haptics: false, motion: "full" });
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Faces = (number | null)[];
function liveView(faces: Faces, mySeat: number, completed: number[][] = []): ViewMessage {
  // Seats out of the current round (0 in `faces`) are not eligible.
  const base = makeGameView({ players: faces.length });
  return {
    ...base,
    game: null,
    rollOff: {
      round: completed.length + 1,
      rolled: faces.map((f) => f !== null),
      eligible: faces.map((f) => f !== 0),
      faces,
      completed,
    },
    you: { ...base.you, seat: mySeat },
  } as ViewMessage;
}
const seats = () => screen.getAllByTestId("rolloff-seat");
const faceOf = (seat: number) => seats()[seat]?.getAttribute("data-face") ?? null;
const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("RollOffLive", () => {
  it("Roll button: amber style class, pulses when ready, sends the round, disabled after I roll", () => {
    const send = vi.fn(() => true);
    const { rerender } = render(
      <RollOffLive view={liveView([null, null], 1, [[3, 3]])} send={send} />,
    );
    const roll = screen.getByTestId("rolloff-roll") as HTMLButtonElement;
    expect(roll.classList.contains("ro-roll")).toBe(true);
    expect(roll.classList.contains("is-ready")).toBe(true);
    expect(roll.disabled).toBe(false);
    fireEvent.click(roll);
    expect(send).toHaveBeenCalledWith({ type: "rollOff", round: 2 });
    rerender(<RollOffLive view={liveView([null, 3], 1, [[3, 3]])} send={send} />);
    const after = screen.getByTestId("rolloff-roll") as HTMLButtonElement;
    expect(after.disabled).toBe(true);
    expect(after.classList.contains("is-ready")).toBe(false);
    // A re-roll round says which round it is.
    expect(screen.getByTestId("rolloff-history").textContent).toBe("Round 2");
  });

  it("other seats' dice tumble and land on their face as it arrives; idle seats wait", () => {
    const { rerender } = render(
      <RollOffLive view={liveView([null, null, null], 0)} send={() => true} />,
    );
    expect(screen.getByText("Who goes first?")).toBeTruthy();
    expect(seats()).toHaveLength(3);
    expect(screen.getAllByText("Waiting…")).toHaveLength(3);
    rerender(<RollOffLive view={liveView([null, 4, null], 0)} send={() => true} />);
    expect(faceOf(1)).toBeNull(); // still tumbling
    tick(LAND);
    expect(faceOf(1)).toBe("4");
    expect(faceOf(0)).toBeNull();
    expect(screen.getAllByText("Waiting…")).toHaveLength(2);
    rerender(<RollOffLive view={liveView([3, 4, 6], 0)} send={() => true} />);
    tick(LAND);
    // Everything landed: only the highest die is highlighted.
    expect(seats()[2]?.classList.contains("is-lead")).toBe(true);
    expect(seats()[1]?.classList.contains("is-lead")).toBe(false);
  });

  it("faces already rolled show at once after a reconnect", () => {
    render(<RollOffLive view={liveView([5, null], 1)} send={() => true} />);
    expect(faceOf(0)).toBe("5");
  });

  it("a tied round is held with every face, then the SAME dice are tossed again", () => {
    const { rerender } = render(<RollOffLive view={liveView([5, null, 1], 0)} send={() => true} />);
    const nodes = () => seats().map((li) => li.querySelector(".die"));
    const before = nodes();
    expect(before.every(Boolean)).toBe(true);
    // Seat 1 rolls the last die: the server moves round 1 to `completed` (seats 0 and 1 tie).
    rerender(<RollOffLive view={liveView([null, null, 0], 0, [[5, 5, 1]])} send={() => true} />);
    tick(LAND);
    expect(faceOf(1)).toBe("5");
    expect(screen.getByTestId("rolloff-caption").textContent).toBe("Tie — roll again");
    expect(seats()[0]?.classList.contains("is-lead")).toBe(true);
    expect(seats()[2]?.classList.contains("is-lead")).toBe(false);
    expect((screen.getByTestId("rolloff-roll") as HTMLButtonElement).disabled).toBe(true);
    tick(ROUND_HOLD_MS);
    // Round 2: tied dice keep their face while waiting; the loser's die stays, dimmed + "Out".
    expect(faceOf(0)).toBe("5");
    expect(faceOf(2)).toBe("1");
    expect(seats()[2]?.classList.contains("is-out")).toBe(true);
    expect(seats()[2]?.textContent).toContain("Out");
    expect(screen.getByTestId("rolloff-history").textContent).toBe("Round 2");
    expect((screen.getByTestId("rolloff-roll") as HTMLButtonElement).disabled).toBe(false);
    // Seat 0 re-rolls the same 5: tossed again (not frozen), and still the identical node.
    rerender(<RollOffLive view={liveView([5, null, 0], 0, [[5, 5, 1]])} send={() => true} />);
    expect(faceOf(0)).toBeNull(); // in the air
    expect(seats()[0]?.querySelector(".die")?.classList.contains("is-moving")).toBe(true);
    tick(LAND);
    rerender(<RollOffLive view={liveView([5, 2, 0], 0, [[5, 5, 1]])} send={() => true} />);
    tick(LAND);
    expect(faceOf(1)).toBe("2");
    expect(faceOf(0)).toBe("5");
    // The die elements never changed: no unmount/remount, no fresh die per round.
    expect(nodes()).toEqual(before);
    nodes().forEach((n, i) => {
      expect(n).toBe(before[i]);
    });
    expect(seats()[1]?.querySelector(".die")?.getAttribute("data-face")).toBe("2");
  });

  it("reduced motion: a tied die changes face instantly on the same element", () => {
    setPrefs({ motion: "reduced" });
    const { rerender } = render(<RollOffLive view={liveView([5, 5, 1], 0)} send={() => true} />);
    const die = seats()[1]?.querySelector(".die");
    rerender(<RollOffLive view={liveView([null, null, 0], 0, [[5, 5, 1]])} send={() => true} />);
    tick(ROUND_HOLD_MS);
    rerender(<RollOffLive view={liveView([null, 3, 0], 0, [[5, 5, 1]])} send={() => true} />);
    expect(seats()[1]?.querySelector(".die")).toBe(die);
    expect(die?.getAttribute("data-face")).toBe("3");
    expect(faceOf(1)).toBe("3");
  });

  it("reduced motion: no tumble, faces appear instantly", () => {
    setPrefs({ motion: "reduced" });
    const { rerender } = render(<RollOffLive view={liveView([null, null], 0)} send={() => true} />);
    expect(screen.getByTestId("rolloff-live").classList.contains("is-reduced")).toBe(true);
    rerender(<RollOffLive view={liveView([null, 6], 0)} send={() => true} />);
    expect(faceOf(1)).toBe("6");
  });
});

describe("RollOff replay + result hold (D-L2)", () => {
  const rounds = [
    [3, 5, 5],
    [0, 6, 2],
  ];
  const view = () => makeGameView({ players: 3 });

  it("plays the rounds, then holds '{name} goes first!' until Let's go", () => {
    const onDone = vi.fn();
    render(<RollOff view={view()} rounds={rounds} onDone={onDone} />);
    tick(LAND);
    expect(screen.getByTestId("rolloff-caption").textContent).toBe("Tie — roll again");
    tick(ROUND_HOLD_MS);
    tick(LAND);
    expect(screen.getByTestId("rolloff-caption").textContent).toBe("Cleo goes first!");
    expect(seats()[1]?.classList.contains("is-winner")).toBe(true);
    tick(60_000);
    expect(screen.getByTestId("rolloff")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("rolloff-go"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("tap skips the animation but not the result; 'You go first!' for me", () => {
    const onDone = vi.fn();
    const v = makeGameView({ players: 3, you: 1 });
    render(<RollOff view={v} rounds={rounds} onDone={onDone} />);
    fireEvent.click(screen.getByTestId("rolloff"));
    expect(faceOf(1)).toBe("6");
    expect(screen.getByTestId("rolloff-caption").textContent).toBe("You go first!");
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("rolloff-go"));
    expect(onDone).toHaveBeenCalled();
  });

  it("after a live roll-off only the deciding round replays; dice seen live don't re-tumble", () => {
    const { unmount } = render(
      <RollOffLive view={liveView([0, null, 2], 0, [[3, 5, 5]])} send={() => true} />,
    );
    unmount();
    render(<RollOff view={view()} rounds={rounds} live onDone={() => {}} />);
    expect(screen.queryByTestId("rolloff-history")?.textContent).toBe("Round 2");
    expect(faceOf(0)).toBe("3"); // out: keeps its die from round 1
    expect(faceOf(2)).toBe("2");
    expect(faceOf(1)).toBeNull(); // being tossed again
    tick(LAND);
    expect(faceOf(1)).toBe("6");
    expect(screen.getByTestId("rolloff-go")).toBeTruthy();
  });

  it("reduced motion: faces at once, same result hold", () => {
    setPrefs({ motion: "reduced" });
    render(<RollOff view={view()} rounds={rounds.slice(1)} onDone={() => {}} />);
    expect(faceOf(1)).toBe("6");
    expect(screen.getByTestId("rolloff-go")).toBeTruthy();
  });
});

describe("roll-off layout and colours", () => {
  it("5 players at 360 px: cards wrap 3 + 2, dice stay ≥ 56 px, no horizontal scroll", () => {
    render(<RollOffLive view={liveView([null, null, null, null, null], 0)} send={() => true} />);
    expect(seats()).toHaveLength(5);
    expect(document.querySelector(".ro-seats")?.getAttribute("data-count")).toBe("5");
    const phone = css.slice(css.indexOf("@media (max-width: 480px)"));
    expect(phone).toMatch(/--die-size:\s*56px/);
    expect(phone).toMatch(/flex-basis:\s*calc\(\(100% - 2 \* var\(--s3\)\) \/ 3\)/);
    expect(css).toMatch(/\.ro-screen \{[^}]*overflow-x: hidden/);
    expect(css).toMatch(/\.ro-seat \{[^}]*min-width: 0/);
    expect(css).toMatch(/\.ro-name \{[^}]*text-overflow: ellipsis/);
    // 360 − 2 × 16 gutter = 328: three cards and two gaps fit.
    expect(3 * 56 + 2 * 12).toBeLessThanOrEqual(328);
  });

  it("the amber Roll button passes contrast", () => {
    const bg = /--ro-roll-bg:\s*(#[0-9a-f]{6})/i.exec(css)?.[1] as string;
    const ink = /--ro-roll-ink:\s*(#[0-9a-f]{6})/i.exec(css)?.[1] as string;
    expect(contrastRatio(ink, bg)).toBeGreaterThanOrEqual(4.5);
    expect(CODE).toBeTruthy();
  });
});

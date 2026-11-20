import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { useRef, useState } from "preact/hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DiceTray,
  type DiceTrayProps,
  RollButton,
  type RollControls,
} from "../src/components/DiceTray";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";

const ROLL: DiceTrayProps["roll"] = { white: [3, 5], colored: { RED: 2, GREEN: 6, BLUE: 1 } };
const FULL: DiceTrayProps["roll"] = {
  white: [3, 5],
  colored: { RED: 2, YELLOW: 4, GREEN: 6, BLUE: 1 },
};

function props(over: Partial<DiceTrayProps> = {}): DiceTrayProps {
  return {
    roll: null,
    lockedColors: [],
    canRoll: false,
    onRoll: () => {},
    turnKey: { code: "K7QF2", turnNumber: 9 },
    ...over,
  };
}

/** The tray plus the single Roll control the ActionBar renders. */
function Harness(p: DiceTrayProps) {
  const controls = useRef<RollControls | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <DiceTray {...p} controls={controls} onBusyChange={setBusy} />
      {p.canRoll ? (
        <RollButton controls={controls} class="tray__roll" disabled={busy}>
          Roll
        </RollButton>
      ) : null}
    </>
  );
}

const dieEl = (c: Element, id: string) => c.querySelector<HTMLElement>(`[data-die="${id}"]`);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  _resetPrefsForTests();
  _resetPlayedRollsForTests();
  setPrefs({ motion: "full", sound: false, haptics: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DiceTray", () => {
  it("renders a locked colour as removed, without a face", () => {
    const { container } = render(<DiceTray {...props({ roll: ROLL, lockedColors: ["YELLOW"] })} />);
    const y = dieEl(container, "YELLOW");
    expect(y?.classList.contains("is-removed")).toBe(true);
    expect(y?.hasAttribute("data-face")).toBe(false);
    expect(y?.getAttribute("aria-label")).toBe("Yellow die, removed");
  });

  it("after settling, data-face matches the roll for every present die", async () => {
    const view = render(
      <DiceTray {...props({ roll: null, canRoll: true, lockedColors: ["YELLOW"] })} />,
    );
    view.rerender(<DiceTray {...props({ roll: ROLL, lockedColors: ["YELLOW"] })} />);
    expect(dieEl(view.container, "RED")?.hasAttribute("data-face")).toBe(false);
    await act(() => {
      vi.advanceTimersByTime(3000);
    });
    const c = view.container;
    expect(dieEl(c, "WHITE_1")?.dataset.face).toBe("3");
    expect(dieEl(c, "WHITE_2")?.dataset.face).toBe("5");
    expect(dieEl(c, "RED")?.dataset.face).toBe("2");
    expect(dieEl(c, "GREEN")?.dataset.face).toBe("6");
    expect(dieEl(c, "BLUE")?.dataset.face).toBe("1");
    expect(dieEl(c, "RED")?.getAttribute("aria-label")).toBe("Red die: 2");
    expect(c.querySelector(".tray__sum")?.textContent).toContain("8");
  });

  it("reveals faces one die at a time, left to right, 400 ms apart; sum after the 2nd white", () => {
    const onLanded = vi.fn();
    const locked = { lockedColors: ["YELLOW"] as const, onLanded };
    const view = render(<DiceTray {...props({ roll: null, ...locked })} />);
    view.rerender(<DiceTray {...props({ roll: ROLL, ...locked })} />);
    const c = view.container;
    const faced = () =>
      Array.from(c.querySelectorAll<HTMLElement>("[data-die][data-face]")).map(
        (d) => d.dataset.die,
      );
    const tick = (ms: number) =>
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    tick(550 + 239);
    expect(faced()).toEqual([]);
    expect(c.querySelector(".tray__sum")).toBeNull();
    tick(1);
    expect(faced()).toEqual(["WHITE_1"]);
    expect(dieEl(c, "WHITE_1")?.getAttribute("aria-label")).toBe("White die: 3");
    expect(c.querySelector(".tray__sum")).toBeNull();
    tick(399);
    expect(faced()).toEqual(["WHITE_1"]);
    tick(1);
    expect(faced()).toEqual(["WHITE_1", "WHITE_2"]);
    expect(c.querySelector(".tray__sum")?.textContent).toBe("8");
    // YELLOW is locked: the next landing is RED, one gap later, no hole in the timing.
    tick(400);
    expect(faced()).toEqual(["WHITE_1", "WHITE_2", "RED"]);
    tick(400);
    expect(faced()).toEqual(["WHITE_1", "WHITE_2", "RED", "GREEN"]);
    expect(onLanded).not.toHaveBeenCalled();
    expect(c.querySelector(".tray[data-settled]")).toBeNull();
    tick(400);
    expect(faced()).toEqual(["WHITE_1", "WHITE_2", "RED", "GREEN", "BLUE"]);
    tick(110);
    expect(onLanded).toHaveBeenCalledTimes(1);
    expect(c.querySelector(".tray[data-settled]")).not.toBeNull();
  });

  it("skips locked colours in the landing order", () => {
    const view = render(<DiceTray {...props({ roll: null, lockedColors: ["YELLOW"] })} />);
    view.rerender(<DiceTray {...props({ roll: ROLL, lockedColors: ["YELLOW"] })} />);
    const c = view.container;
    expect(dieEl(c, "RED")?.dataset.order).toBe("2");
    expect(dieEl(c, "GREEN")?.dataset.order).toBe("3");
    expect(dieEl(c, "BLUE")?.dataset.order).toBe("4");
  });

  it("a tap on the tray skips to the end (all faces, onLanded)", () => {
    const onLanded = vi.fn();
    const view = render(<DiceTray {...props({ roll: null, onLanded })} />);
    view.rerender(<DiceTray {...props({ roll: FULL, onLanded })} />);
    const c = view.container;
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(c.querySelectorAll("[data-die][data-face]")).toHaveLength(1);
    const tray = c.querySelector<HTMLElement>(".tray");
    if (!tray) throw new Error("no tray");
    fireEvent.click(tray);
    expect(c.querySelectorAll("[data-die][data-face]")).toHaveLength(6);
    expect(onLanded).toHaveBeenCalledTimes(1);
    expect(c.querySelector(".tray__sum")?.textContent).toBe("8");
  });

  it("reduced motion shows every face at once", () => {
    setPrefs({ motion: "reduced" });
    const onLanded = vi.fn();
    const view = render(<DiceTray {...props({ roll: null, onLanded })} />);
    view.rerender(<DiceTray {...props({ roll: FULL, onLanded })} />);
    expect(view.container.querySelectorAll("[data-die][data-face]")).toHaveLength(6);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("keeps six dice in one grid row W W | R Y G B, locked colour keeping its slot", () => {
    const { container } = render(<DiceTray {...props({ roll: ROLL, lockedColors: ["YELLOW"] })} />);
    const row = container.querySelector(".tray__dice");
    const ids = Array.from(row?.children ?? []).map(
      (c) => c.getAttribute("data-die") ?? (c.classList.contains("tray__divider") ? "|" : "?"),
    );
    expect(ids).toEqual(["WHITE_1", "WHITE_2", "|", "RED", "YELLOW", "GREEN", "BLUE", "?"]);
  });

  it("puts the white sum in a fixed slot under the white pair only (K3.1)", async () => {
    const view = render(<DiceTray {...props({ roll: null, canRoll: true })} />);
    const slot = () => view.container.querySelectorAll(".tray__dice > .tray__wsum");
    // The slot exists before any roll, so the sum appearing never moves the dice.
    expect(slot()).toHaveLength(1);
    expect(slot()[0]?.textContent).toBe("");
    view.rerender(<DiceTray {...props({ roll: ROLL })} />);
    await act(() => {
      vi.advanceTimersByTime(3000);
    });
    const sums = view.container.querySelectorAll(".tray__sum");
    expect(sums).toHaveLength(1);
    expect(sums[0]?.closest(".tray__wsum")).toBe(slot()[0]);
    expect(sums[0]?.textContent).toBe("8");
    expect(sums[0]?.getAttribute("aria-label")).toBe("White sum 8");
    // Nothing tray-wide any more.
    expect(view.container.querySelector(".tray__side")).toBeNull();
  });

  it("never renders its own Roll button (the ActionBar owns the one Roll control)", () => {
    const { container } = render(<DiceTray {...props({ roll: ROLL, canRoll: true })} />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("a quick tap on Roll throws once and tumbles", () => {
    const onRoll = vi.fn();
    const { container } = render(<Harness {...props({ canRoll: true, onRoll })} />);
    const btn = container.querySelector<HTMLButtonElement>(".tray__roll");
    if (!btn) throw new Error("no Roll button");
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(btn, { button: 0, pointerId: 1 });
    fireEvent.click(btn);
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    expect(dieEl(container, "RED")?.getAttribute("aria-label")).toBe("Red die, rolling");
  });

  it("holding Space shakes, releasing throws", () => {
    const onRoll = vi.fn();
    const { container } = render(<Harness {...props({ canRoll: true, onRoll })} />);
    const btn = container.querySelector<HTMLButtonElement>(".tray__roll");
    if (!btn) throw new Error("no Roll button");
    fireEvent.keyDown(btn, { key: " " });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.querySelector(".die.is-moving")).not.toBeNull();
    expect(onRoll).not.toHaveBeenCalled();
    fireEvent.keyUp(btn, { key: " " });
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it("shows the Action 2 helper highlight", async () => {
    const { container } = render(
      <DiceTray {...props({ roll: ROLL, highlight: { white: 1, color: "GREEN" } })} />,
    );
    expect(dieEl(container, "WHITE_2")?.classList.contains("is-highlight")).toBe(true);
    expect(dieEl(container, "GREEN")?.classList.contains("is-highlight")).toBe(true);
    expect(dieEl(container, "RED")?.classList.contains("is-highlight")).toBe(false);
    expect(container.querySelector(".tray__combo")?.textContent).toBe("5 + 6");
  });
});

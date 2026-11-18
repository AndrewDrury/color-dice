import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiceTray, type DiceTrayProps } from "../src/components/DiceTray";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";

const ROLL: DiceTrayProps["roll"] = { white: [3, 5], colored: { RED: 2, GREEN: 6, BLUE: 1 } };

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
      vi.advanceTimersByTime(2000);
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

  it("hides Roll when canRoll is false", () => {
    const { container } = render(<DiceTray {...props({ roll: ROLL })} />);
    expect(container.querySelector(".tray__roll")).toBeNull();
  });

  it("a quick tap on Roll throws once and tumbles", () => {
    const onRoll = vi.fn();
    const { container } = render(<DiceTray {...props({ canRoll: true, onRoll })} />);
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
    const { container } = render(<DiceTray {...props({ canRoll: true, onRoll })} />);
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

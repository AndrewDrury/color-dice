import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetPlayedRollsForTests,
  type RollAnimInput,
  useRollAnimation,
} from "../src/fx/useRollAnimation";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";

const ROLL = { white: [3, 5], colored: { RED: 2, YELLOW: 4, GREEN: 6, BLUE: 1 } };

function setup(initial: RollAnimInput) {
  const onLanded = vi.fn();
  const onDieLand = vi.fn();
  const hook = renderHook((p: RollAnimInput) => useRollAnimation(p, { onLanded, onDieLand }), {
    initialProps: initial,
  });
  return { ...hook, onLanded, onDieLand };
}

const step = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  _resetPrefsForTests();
  _resetPlayedRollsForTests();
  setPrefs({ motion: "full" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRollAnimation", () => {
  it("a first render with an existing roll is settled at once", () => {
    const { result, onLanded } = setup({ code: "K7QF2", turnNumber: 9, roll: ROLL });
    expect(result.current.phase).toBe("settled");
    expect(onLanded).not.toHaveBeenCalled();
  });

  it("starts idle with no roll", () => {
    const { result } = setup({ code: "K7QF2", turnNumber: 1, roll: null });
    expect(result.current.phase).toBe("idle");
  });

  it("tumbles at least 550 ms even if the result arrives after 10 ms", async () => {
    const { result, rerender, onLanded, onDieLand } = setup({
      code: "A",
      turnNumber: 1,
      roll: null,
    });
    act(() => result.current.throwDice());
    expect(result.current.phase).toBe("tumbling");
    await step(10);
    rerender({ code: "A", turnNumber: 1, roll: ROLL });
    await step(500);
    expect(result.current.phase).toBe("tumbling");
    await step(40);
    expect(result.current.phase).toBe("settling");
    await step(2000);
    expect(result.current.phase).toBe("settled");
    expect(onDieLand).toHaveBeenCalledTimes(6);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("a result arriving at 2 s settles then", async () => {
    const { result, rerender } = setup({ code: "A", turnNumber: 1, roll: null });
    act(() => result.current.throwDice());
    await step(2000);
    expect(result.current.phase).toBe("tumbling");
    rerender({ code: "A", turnNumber: 1, roll: ROLL });
    await step(0);
    expect(result.current.phase).toBe("settling");
    await step(600);
    expect(result.current.phase).toBe("settled");
  });

  it("never animates the same (code, turn) twice", async () => {
    const first = setup({ code: "A", turnNumber: 1, roll: null });
    first.rerender({ code: "A", turnNumber: 1, roll: ROLL });
    expect(first.result.current.phase).toBe("tumbling");
    await step(2000);
    expect(first.onLanded).toHaveBeenCalledTimes(1);
    first.unmount();
    // A remount (reconnect / navigation) with the same roll shows it settled.
    const again = setup({ code: "A", turnNumber: 1, roll: null });
    again.rerender({ code: "A", turnNumber: 1, roll: ROLL });
    expect(again.result.current.phase).toBe("settled");
    await step(2000);
    expect(again.onLanded).not.toHaveBeenCalled();
  });

  it("another player's roll tumbles 550 ms from arrival, then settles", async () => {
    const { result, rerender } = setup({ code: "A", turnNumber: 4, roll: null });
    rerender({ code: "A", turnNumber: 4, roll: ROLL });
    expect(result.current.phase).toBe("tumbling");
    await step(549);
    expect(result.current.phase).toBe("tumbling");
    await step(1);
    expect(result.current.phase).toBe("settling");
  });

  it("resync views show settled with no animation", () => {
    const { result, rerender, onLanded } = setup({ code: "A", turnNumber: 2, roll: null });
    rerender({ code: "A", turnNumber: 2, roll: ROLL, resync: true });
    expect(result.current.phase).toBe("settled");
    expect(onLanded).not.toHaveBeenCalled();
  });

  it("reduced motion goes straight to settled within 150 ms", async () => {
    setPrefs({ motion: "reduced" });
    const { result, rerender, onDieLand, onLanded } = setup({
      code: "A",
      turnNumber: 1,
      roll: null,
    });
    act(() => result.current.throwDice());
    rerender({ code: "A", turnNumber: 1, roll: ROLL });
    await step(150);
    expect(result.current.phase).toBe("settled");
    expect(onDieLand).toHaveBeenCalledTimes(1);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("an error eases back to the previous faces", async () => {
    const { result } = setup({ code: "A", turnNumber: 3, roll: ROLL });
    act(() => result.current.throwDice());
    await step(300);
    act(() => result.current.cancelThrow());
    expect(result.current.phase).toBe("settled");
  });

  it("shows slow after 3 s and gives up after 10 s without a result", async () => {
    const { result } = setup({ code: "A", turnNumber: 1, roll: null });
    act(() => result.current.throwDice());
    await step(3000);
    expect(result.current.slow).toBe(true);
    await step(7000);
    expect(result.current.phase).toBe("idle");
    expect(result.current.slow).toBe(false);
  });

  it("shake then cancel returns to rest", () => {
    const { result } = setup({ code: "A", turnNumber: 1, roll: null });
    act(() => result.current.shake());
    expect(result.current.phase).toBe("shaking");
    act(() => result.current.cancelShake());
    expect(result.current.phase).toBe("idle");
  });
});

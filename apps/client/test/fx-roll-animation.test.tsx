import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetPlayedRollsForTests,
  GAMEPLAY_TIMING,
  ROLL_TIMING,
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

  it("a rematch repeats code:turn but its roll still animates and lands", async () => {
    const { rerender, onLanded } = setup({ code: "K7QF2", turnNumber: 1, roll: null });
    rerender({ code: "K7QF2", turnNumber: 1, roll: ROLL });
    await step(ROLL_TIMING.minTumble + 6 * GAMEPLAY_TIMING.landGap + ROLL_TIMING.settle);
    expect(onLanded).toHaveBeenCalledTimes(1);
    // Rematch: same turn number again, rolled from scratch.
    rerender({ code: "K7QF2", turnNumber: 1, roll: null });
    rerender({ code: "K7QF2", turnNumber: 1, roll: ROLL });
    await step(ROLL_TIMING.minTumble + 6 * GAMEPLAY_TIMING.landGap + ROLL_TIMING.settle);
    expect(onLanded).toHaveBeenCalledTimes(2);
  });

  it("starts idle with no roll", () => {
    const { result } = setup({ code: "K7QF2", turnNumber: 1, roll: null });
    expect(result.current.phase).toBe("idle");
  });

  it("tumbles at least 400 ms even if the result arrives after 10 ms", async () => {
    const { result, rerender, onLanded, onDieLand } = setup({
      code: "A",
      turnNumber: 1,
      roll: null,
    });
    act(() => result.current.throwDice());
    expect(result.current.phase).toBe("tumbling");
    await step(10);
    rerender({ code: "A", turnNumber: 1, roll: ROLL });
    await step(350);
    expect(result.current.phase).toBe("tumbling");
    await step(50);
    expect(result.current.phase).toBe("settling");
    await step(3000);
    expect(result.current.phase).toBe("settled");
    expect(onDieLand).toHaveBeenCalledTimes(6);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("dice land left to right, 220 ms apart; gated (no onLanded) until the last", async () => {
    const { result, rerender, onDieLand, onLanded } = setup({
      code: "S",
      turnNumber: 1,
      roll: null,
    });
    act(() => result.current.throwDice());
    rerender({ code: "S", turnNumber: 1, roll: ROLL });
    await step(400);
    expect(result.current.phase).toBe("settling");
    expect(GAMEPLAY_TIMING.landGap).toBe(220);
    const base = ROLL_TIMING.landAt;
    const order: number[] = [];
    onDieLand.mockImplementation((i: number) => order.push(i));
    await step(base - 1);
    expect(order).toEqual([]);
    expect(result.current.landed).toBe(0);
    for (let i = 0; i < 6; i++) {
      await step(1);
      expect(order).toEqual([0, 1, 2, 3, 4, 5].slice(0, i + 1));
      expect(result.current.landed).toBe(i + 1);
      expect(result.current.phase).toBe("settling");
      expect(onLanded).not.toHaveBeenCalled();
      if (i < 5) await step(GAMEPLAY_TIMING.landGap - 1);
    }
    await step(ROLL_TIMING.settle - ROLL_TIMING.landAt);
    expect(result.current.phase).toBe("settled");
    expect(onLanded).toHaveBeenCalledTimes(1);
    // Whole sequence for six dice is quicker: tumble plus staggered landings.
    const lastLanding = 400 + base + 5 * GAMEPLAY_TIMING.landGap;
    expect(lastLanding).toBeLessThan(1800);
  });

  it("fewer dice (locked colours) land back to back with no timing gaps", async () => {
    const short = { white: [3, 5], colored: { RED: 2, BLUE: 1 } };
    const { result, rerender, onDieLand, onLanded } = setup({
      code: "L",
      turnNumber: 1,
      roll: null,
    });
    rerender({ code: "L", turnNumber: 1, roll: short });
    await step(400 + ROLL_TIMING.landAt + 3 * GAMEPLAY_TIMING.landGap);
    expect(onDieLand).toHaveBeenCalledTimes(4);
    expect(onDieLand).toHaveBeenLastCalledWith(3);
    await step(ROLL_TIMING.settle - ROLL_TIMING.landAt);
    expect(result.current.phase).toBe("settled");
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("skip jumps to the end: all landed, onLanded once, no more ticks", async () => {
    const { result, rerender, onDieLand, onLanded } = setup({
      code: "K",
      turnNumber: 1,
      roll: null,
    });
    act(() => result.current.throwDice());
    rerender({ code: "K", turnNumber: 1, roll: ROLL });
    await step(400 + ROLL_TIMING.landAt + GAMEPLAY_TIMING.landGap);
    expect(onDieLand).toHaveBeenCalledTimes(2);
    act(() => result.current.skip());
    expect(result.current.phase).toBe("settled");
    expect(result.current.landed).toBe(6);
    expect(onLanded).toHaveBeenCalledTimes(1);
    await step(5000);
    expect(onDieLand).toHaveBeenCalledTimes(2);
    expect(onLanded).toHaveBeenCalledTimes(1);
    act(() => result.current.skip());
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("skip also works while the result is known but the tumble is still running", async () => {
    const { result, rerender, onLanded } = setup({ code: "T", turnNumber: 1, roll: null });
    act(() => result.current.throwDice());
    rerender({ code: "T", turnNumber: 1, roll: ROLL });
    await step(100);
    act(() => result.current.skip());
    expect(result.current.phase).toBe("settled");
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  it("skip does nothing before the result arrives", () => {
    const { result, onLanded } = setup({ code: "N", turnNumber: 1, roll: null });
    act(() => result.current.throwDice());
    act(() => result.current.skip());
    expect(result.current.phase).toBe("tumbling");
    expect(onLanded).not.toHaveBeenCalled();
  });

  it("a result arriving at 2 s settles then", async () => {
    const { result, rerender } = setup({ code: "A", turnNumber: 1, roll: null });
    act(() => result.current.throwDice());
    await step(2000);
    expect(result.current.phase).toBe("tumbling");
    rerender({ code: "A", turnNumber: 1, roll: ROLL });
    await step(0);
    expect(result.current.phase).toBe("settling");
    await step(2400);
    expect(result.current.phase).toBe("settled");
  });

  it("never animates the same (code, turn) twice", async () => {
    const first = setup({ code: "A", turnNumber: 1, roll: null });
    first.rerender({ code: "A", turnNumber: 1, roll: ROLL });
    expect(first.result.current.phase).toBe("tumbling");
    await step(3000);
    expect(first.onLanded).toHaveBeenCalledTimes(1);
    first.unmount();
    // A remount (reconnect / navigation) with the same roll shows it settled.
    const again = setup({ code: "A", turnNumber: 1, roll: null });
    again.rerender({ code: "A", turnNumber: 1, roll: ROLL });
    expect(again.result.current.phase).toBe("settled");
    await step(3000);
    expect(again.onLanded).not.toHaveBeenCalled();
  });

  it("another player's roll tumbles 400 ms from arrival, then settles", async () => {
    const { result, rerender } = setup({ code: "A", turnNumber: 4, roll: null });
    rerender({ code: "A", turnNumber: 4, roll: ROLL });
    expect(result.current.phase).toBe("tumbling");
    await step(399);
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

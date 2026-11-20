import { act, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTypewriter } from "../src/game/useTypewriter";

type L = { id: number; text: string }[];
let out: (id: number) => number | undefined;
function H({ lines }: { lines: L }) {
  out = useTypewriter(lines);
  return null;
}
const a: L = [{ id: 1, text: "old line" }];
const b: L = [...a, { id: 2, text: "x".repeat(40) }];

describe("useTypewriter", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => vi.useRealTimers());

  it("initial lines are instant; new line types progressively and completes", () => {
    const r = render(<H lines={a} />);
    expect(out(1)).toBeUndefined();
    r.rerender(<H lines={b} />);
    expect(out(2)).toBe(0);
    act(() => void vi.advanceTimersByTime(300));
    const mid = out(2) as number;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(40);
    act(() => void vi.advanceTimersByTime(1500));
    expect(out(2)).toBeUndefined();
  });

  it("queues sequentially and speeds up a big backlog", () => {
    const r = render(<H lines={a} />);
    r.rerender(<H lines={[...a, { id: 2, text: "aaaa" }, { id: 3, text: "bbbb" }]} />);
    expect(out(3)).toBe(0);
    const many = [...a, ...Array.from({ length: 10 }, (_, i) => ({ id: 10 + i, text: "zzzz" }))];
    r.rerender(<H lines={many} />);
    act(() => void vi.advanceTimersByTime(400));
    expect(out(10)).toBeUndefined();
  });
});

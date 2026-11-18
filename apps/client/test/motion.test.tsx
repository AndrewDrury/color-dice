import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT_MS, useDismiss, useExitAnimation } from "../src/fx/motion";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";

function Probe({ open, onClose }: { open: boolean; onClose?: () => void }) {
  const { mounted, closing } = useExitAnimation(open);
  const [dClosing, dismiss] = useDismiss(onClose ?? (() => {}));
  return mounted ? (
    <button
      type="button"
      class={closing ? "mo-exit" : ""}
      data-d={String(dClosing)}
      onClick={dismiss}
    >
      x
    </button>
  ) : null;
}

beforeEach(() => {
  localStorage.clear();
  _resetPrefsForTests();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("exit animation", () => {
  it("keeps the node until the exit is done", () => {
    const { container, rerender } = render(<Probe open />);
    expect(container.querySelector("button")).not.toBeNull();
    rerender(<Probe open={false} />);
    expect(container.querySelector("button.mo-exit")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(EXIT_MS - 10);
    });
    expect(container.querySelector("button")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(container.querySelector("button")).toBeNull();
  });

  it("never mounts when it starts closed", () => {
    const { container } = render(<Probe open={false} />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("works under reduced motion too (opacity-only is a CSS concern)", () => {
    setPrefs({ motion: "reduced" });
    const { container, rerender } = render(<Probe open />);
    rerender(<Probe open={false} />);
    expect(container.querySelector("button.mo-exit")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(EXIT_MS + 5);
    });
    expect(container.querySelector("button")).toBeNull();
  });

  it("dismiss() plays the exit, then calls onClose once", () => {
    const onClose = vi.fn();
    const { container } = render(<Probe open onClose={onClose} />);
    const b = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      b.click();
      b.click();
    });
    expect(container.querySelector("button")?.getAttribute("data-d")).toBe("true");
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(EXIT_MS + 5);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("motion.css has opacity-only reduced-motion paths", async () => {
    const css = (await import("../src/styles/motion.css?raw")).default;
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*mo-fade-in/);
    expect(css).toMatch(/:root\[data-motion="reduced"\] \.mo-enter/);
  });
});

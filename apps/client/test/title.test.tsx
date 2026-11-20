import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../src/i18n";
import type { Route } from "../src/router";
import { useDocumentTitle } from "../src/useDocumentTitle";
import { makeGameView } from "./fixtures/views";

function Harness({ route, view }: { route: Route; view: ReturnType<typeof makeGameView> | null }) {
  useDocumentTitle(route, view);
  return null;
}

afterEach(cleanup);
afterEach(async () => {
  await setLanguage("auto");
});

beforeEach(() => {
  document.title = "Color Dice";
});

describe("useDocumentTitle", () => {
  it("sets turn titles and waiting titles", () => {
    const view = makeGameView({ active: 1, phase: "ACTION_2" });
    render(<Harness route={{ screen: "game", code: view.code }} view={view} />);
    expect(document.title).toBe("Cleo's turn — Color Dice");
    cleanup();
    render(<Harness route={{ screen: "waiting", code: view.code }} view={view} />);
    expect(document.title).toContain("Waiting (3/5)");
  });

  it("uses localized title copy", async () => {
    await setLanguage("es");
    const view = makeGameView({ active: 1, phase: "ACTION_2" });
    render(<Harness route={{ screen: "game", code: view.code }} view={view} />);
    expect(document.title).toBe("Turno de Cleo — Color Dice");
  });

  it("flashes while hidden on your turn and stops when visible", () => {
    vi.useFakeTimers();
    const view = makeGameView({ phase: "AWAIT_ROLL", canRoll: true });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    render(<Harness route={{ screen: "game", code: view.code }} view={view} />);
    expect(document.title).toContain("Your turn!");
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    const now = document.title;
    expect(now === "🎲 Your turn — Color Dice" || now.includes("Your turn!")).toBe(true);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(document.title).toBe("🎲 Your turn — Color Dice");
    vi.useRealTimers();
  });
});

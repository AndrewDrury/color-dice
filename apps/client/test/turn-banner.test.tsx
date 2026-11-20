import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { TurnBanner } from "../src/components/TurnBanner";
import { _resetPrefsForTests } from "../src/prefs";
import flowCss from "../src/styles/flow.css?raw";
import { makeGameView } from "./fixtures/views";

afterEach(cleanup);
_resetPrefsForTests();

describe("turn banner (T-NEW-22)", () => {
  it("my turn: is-mine, glyph, polite live text", () => {
    render(<TurnBanner view={makeGameView({ legal1: ["RED"] })} staged={false} noMove={false} />);
    const el = screen.getByTestId("turn-banner");
    expect(el.className).toContain("is-mine");
    expect(el.textContent).toContain("Your turn");
    expect(el.querySelector(".g-turnbar-who")?.getAttribute("aria-live")).toBe("polite");
  });
  it("other's turn: calm state names the player, clamps via title", () => {
    render(<TurnBanner view={makeGameView({ active: 1 })} staged={false} noMove={false} />);
    const el = screen.getByTestId("turn-banner");
    expect(el.className).not.toContain("is-mine");
    expect(el.querySelector(".g-turnbar-who")?.getAttribute("title")).toBe("Cleo's turn");
  });
  it("my roll turn: the step text is dropped when it repeats the call to action", () => {
    render(
      <TurnBanner
        view={makeGameView({ phase: "AWAIT_ROLL", canRoll: true })}
        staged={false}
        noMove={false}
      />,
    );
    const el = screen.getByTestId("turn-banner");
    expect(el.querySelector(".g-turnbar-cta")?.textContent).toBe("Roll the dice");
    expect(el.querySelector(".g-turnbar-step")).toBeNull();
  });
  it("reduced motion removes the glow", () => {
    expect(flowCss).toMatch(/data-motion="reduced"\] \.g-turnbar\.is-mine \{\s*animation: none/);
    expect(flowCss).toMatch(
      /prefers-reduced-motion: reduce\) \{\s*\.g-turnbar\.is-mine \{\s*animation: none/,
    );
  });
});

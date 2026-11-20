import type { ViewMessage } from "@cd/protocol";
import { PLAYER_NAME_MAX } from "@cd/protocol";
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { OPP_AVATAR } from "../src/components/OpponentChip";
import { OpponentStrip } from "../src/components/OpponentStrip";
import { SeatList } from "../src/components/SeatList";
import { TurnBanner } from "../src/components/TurnBanner";
import cssText from "../src/styles/avatar.css?raw";
import { makeGameView } from "./fixtures/views";

// T-NEW-15: the widest legal name clips with an ellipsis and keeps the full name in `title`.
const LONG = "W".repeat(PLAYER_NAME_MAX);

function longView(): ViewMessage {
  const v = makeGameView({ players: 4, you: 0, active: 1 });
  return {
    ...v,
    seats: v.seats.map((s, i) =>
      i === 0
        ? s
        : {
            ...s,
            name: LONG.slice(0, PLAYER_NAME_MAX - i + 1),
            profile: { color: "sky" as const, cat: "cat-gif" as const },
          },
    ),
  };
}

afterEach(cleanup);

describe("long names", () => {
  it("defines the shared .name-clip utility", () => {
    const rule = /\.name-clip \{([^}]*)\}/.exec(cssText)?.[1] ?? "";
    for (const decl of [
      "min-width: 0",
      "overflow: hidden",
      "text-overflow: ellipsis",
      "white-space: nowrap",
    ]) {
      expect(rule).toContain(decl);
    }
  });

  it("clips opponent chip names with a title and a 40 px avatar", () => {
    const view = longView();
    const { container } = render(<OpponentStrip view={view} viewport="phone" flash={new Set()} />);
    const names = [...container.querySelectorAll(".g-chip .g-name")];
    expect(names).toHaveLength(3);
    for (const [i, el] of names.entries()) {
      expect(el.classList.contains("name-clip")).toBe(true);
      expect(el.getAttribute("title")).toBe(view.seats[i + 1]?.name);
    }
    expect(OPP_AVATAR).toBeGreaterThanOrEqual(40);
    const img = container.querySelector(".g-chip .av img");
    expect(img?.getAttribute("width")).toBe(String(OPP_AVATAR));
  });

  it("clips the turn banner name with a title", () => {
    const view = longView();
    render(<TurnBanner view={view} staged={false} noMove={false} s1={null} />);
    const who = screen.getByTestId("turn-banner").querySelector(".g-turnbar-who");
    expect(who?.classList.contains("name-clip")).toBe(true);
    expect(who?.getAttribute("title")).toContain(view.seats[1]?.name as string);
  });

  it("clips waiting-room seat names with a title", () => {
    const seats = longView().seats.map((s) => ({ ...s, name: LONG }));
    const { container } = render(<SeatList seats={seats} youSeatId={null} isHost={false} />);
    const names = [...container.querySelectorAll("li .name-clip")];
    expect(names).toHaveLength(seats.length);
    for (const el of names) {
      expect(el.getAttribute("title")).toBe(LONG);
      expect(el.textContent).toBe(LONG);
    }
  });
});

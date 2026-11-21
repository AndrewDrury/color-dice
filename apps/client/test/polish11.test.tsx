import { REACTIONS, type ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REACTION_MOOD_ORDER, reactionAsset } from "../src/components/CatReaction";
import { Field } from "../src/components/Field";
import { MoveLog } from "../src/components/MoveLog";
import { PasswordField } from "../src/components/PasswordField";
import { ReactionPicker } from "../src/components/ReactionPicker";
import { makeGameView } from "./fixtures/views";

afterEach(cleanup);

describe("autofill opt-outs", () => {
  const ignores = (el: HTMLElement) => {
    expect(el.hasAttribute("data-1p-ignore")).toBe(true);
    expect(el.getAttribute("data-lpignore")).toBe("true");
    expect(el.hasAttribute("data-bwignore")).toBe(true);
    expect(el.getAttribute("data-form-type")).toBe("other");
  };
  it("room password input uses new-password, a neutral name and the manager opt-outs", () => {
    render(<PasswordField value="" onValue={() => {}} />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.getAttribute("autocomplete")).toBe("new-password");
    expect(input.name).toBe("room-pass");
    expect(input.getAttribute("autocorrect")).toBe("off");
    ignores(input);
    fireEvent.click(screen.getByRole("button", { name: /show/i }));
    expect(input.type).toBe("text");
    ignores(input);
  });
  it("invite-code input is plain text with autocomplete off", () => {
    render(<Field label="Code" type="text" value="" onValue={() => {}} autocomplete="off" />);
    const input = screen.getByLabelText("Code") as HTMLInputElement;
    expect(input.type).toBe("text");
    ignores(input);
  });
});

describe("reaction mood order", () => {
  it("is a permutation of REACTIONS", () => {
    expect([...REACTION_MOOD_ORDER].sort()).toEqual([...REACTIONS].sort());
    expect(new Set(REACTION_MOOD_ORDER).size).toBe(REACTIONS.length);
  });
  it("picker renders in that order", () => {
    const { container } = render(<ReactionPicker onPick={() => {}} onClose={() => {}} />);
    const srcs = [...container.querySelectorAll(".rx-pick img")].map((i) => i.getAttribute("src"));
    expect(srcs).toEqual(REACTION_MOOD_ORDER.map(reactionAsset));
  });
});

describe("MoveLog", () => {
  const view = (n: number): ViewMessage => {
    const v = makeGameView();
    const g = v.game as NonNullable<ViewMessage["game"]>;
    const id = (g.players[0] as { seatId: string }).seatId;
    const events = Array.from({ length: n }, (_, i) => [
      { type: "TURN_STARTED", turnNumber: i + 1, activeSeat: 0 },
      { type: "ACTION2_PASSED", playerId: id, i },
    ]).flat();
    events.push({ type: "TURN_STARTED", turnNumber: n + 1, activeSeat: 1 });
    return { ...v, game: { ...g, events } } as unknown as ViewMessage;
  };
  const geometry = (el: HTMLElement, scrollTop: number) => {
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 500 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 100 });
    el.scrollTop = scrollTop;
  };
  it("sticks to the bottom for new entries only when already near it", () => {
    const { rerender } = render(<MoveLog view={view(3)} />);
    const box = screen.getByTestId("log-scroll");
    geometry(box, 395); // within 24px of the bottom (500 - 100 = 400)
    box.scrollTo = vi.fn(({ top }: { top: number }) => {
      box.scrollTop = top;
    }) as never;
    act(() => {
      fireEvent.scroll(box);
    });
    rerender(<MoveLog view={view(4)} />);
    expect(box.scrollTop).toBe(500);
    geometry(box, 100); // reading older entries
    act(() => {
      fireEvent.scroll(box);
    });
    rerender(<MoveLog view={view(5)} />);
    expect(box.scrollTop).toBe(100);
    expect(screen.queryByTestId("log-fade-top")).not.toBeNull();
    expect(screen.queryByTestId("log-fade-bottom")).not.toBeNull();
  });
  it("renders one turn per line with all player actions, keeps prose sr-only", () => {
    const v = makeGameView();
    const g = v.game as NonNullable<ViewMessage["game"]>;
    const p0 = g.players[0] as { seatId: string };
    const p1 = g.players[1] as { seatId: string };
    const events = [
      { type: "TURN_STARTED", turnNumber: 9, activeSeat: 0 },
      { type: "DICE_ROLLED", white: [3, 4], whiteSum: 7 },
      { type: "MARKED", playerId: p0.seatId, action: 1, color: "RED", number: 7, index: 5 },
      { type: "ACTION2_PASSED", playerId: p1.seatId },
      { type: "PENALTY", playerId: p1.seatId },
      { type: "ROW_LOCKED", color: "BLUE", lockedBy: [p0.seatId] },
      { type: "TURN_STARTED", turnNumber: 10, activeSeat: 1 },
    ];
    const { container } = render(
      <MoveLog view={{ ...v, game: { ...g, events } } as unknown as ViewMessage} />,
    );
    const items = container.querySelectorAll(".g-log li");
    expect(items).toHaveLength(1);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Red 7/);
    expect(text).toMatch(/Turn 9/);
    const sr = items[0]?.querySelector(".sr-only")?.textContent ?? "";
    expect(sr).toMatch(/Turn 9/);
    expect(sr).toMatch(/Blue row locked/);
    expect(container.querySelector(".lg-box.c-red")?.textContent).toBe("7");
    expect(container.querySelector(".lg-pass")).not.toBeNull();
    expect(container.querySelector(".lg-pen")?.textContent).toBe("−5");
    expect(container.querySelector(".lg-lock.c-blue svg")).not.toBeNull();
    // Visible parts are aria-hidden; the prose is not in them.
    for (const el of container.querySelectorAll(".lg-name, .lg-box, .lg-actors")) {
      expect(el.getAttribute("aria-hidden")).toBe("true");
    }
  });
  it("shows no fades when the entries are not scrollable", () => {
    render(<MoveLog view={view(1)} />);
    expect(screen.queryByTestId("log-fade-top")).toBeNull();
    expect(screen.queryByTestId("log-fade-bottom")).toBeNull();
  });
});

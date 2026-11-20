import type { Color } from "@cd/engine";
import type { ServerMessage, ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { candidates, submitLabel, submitMessage } from "../src/game/staging";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { Game } from "../src/screens/Game";
import { _resetMemoryForTests, saveSession } from "../src/session";
import { _resetStoreForTests, applyView } from "../src/store";
import { TOKEN } from "./fixtures";
import { CODE, makeGameView, mark, player, seatIdOf } from "./fixtures/views";

const { sent, emitters, FakeSocket } = vi.hoisted(() => {
  const sent: unknown[] = [];
  const emitters = new Set<(m: unknown) => void>();
  class FakeSocket {
    connect() {}
    close() {}
    send(m: unknown) {
      sent.push(m);
      return true;
    }
    onMessage(cb: (m: unknown) => void) {
      emitters.add(cb);
      return () => emitters.delete(cb);
    }
    onStatus() {
      return () => {};
    }
  }
  return { sent, emitters, FakeSocket };
});
vi.mock("../src/ws", () => ({ GameSocket: FakeSocket, LobbySocket: FakeSocket }));

const emit = (m: ServerMessage) =>
  act(() => {
    for (const cb of emitters) cb(m);
  });
const show = (v: ViewMessage) =>
  act(() => {
    applyView(v);
  });
const k = (c: Color, n: number) => `${c}:${n}`;
const box = (label: string) => screen.getByLabelText(label);
const count = (sel: string) => document.querySelectorAll(sel).length;

beforeEach(() => {
  sent.length = 0;
  localStorage.clear();
  _resetMemoryForTests();
  _resetStoreForTests();
  _resetPrefsForTests();
  _resetPlayedRollsForTests();
  setPrefs({ sound: false, haptics: false, motion: "full" });
  saveSession(CODE, { token: TOKEN, seatId: seatIdOf(0), name: "Andrew", roomName: "Friday dice" });
});
afterEach(cleanup);

/** White 6 + 3 (sum 9), red die 6 only; red row already has 4 marks (2, 3, 4, 5). */
function lockView(): ViewMessage {
  let me = player(0);
  for (const i of [0, 1, 2, 3]) me = mark(me, "RED", i);
  const v = makeGameView({ legal1: ["RED"], gamePlayers: [me, player(1), player(2)] });
  if (v.game?.roll) {
    v.game.roll = { white: [6, 3], colored: { RED: 6 }, whiteSum: 9 } as never;
  }
  return v;
}

describe("candidates (D-L3, D-L5)", () => {
  // Fixture: white 3 + 5 = 8; red 2, yellow 4, green 6, blue 1.
  it("active, nothing staged: white sum and every early Action 2 box", () => {
    const { white, colour } = candidates(makeGameView({ legal1: ["RED", "YELLOW"] }), null, null);
    expect([...white].sort()).toEqual([k("RED", 8), k("YELLOW", 8)]);
    expect(colour.has(k("RED", 5))).toBe(true);
    expect(colour.has(k("GREEN", 11))).toBe(true);
    expect(colour.has(k("BLUE", 4))).toBe(true);
  });

  it("passive: white boxes only; step 2 only (ACTION_2): colour boxes only", () => {
    const passive = candidates(makeGameView({ active: 1, legal1: ["RED"] }), null, null);
    expect([...passive.white]).toEqual([k("RED", 8)]);
    expect(passive.colour.size).toBe(0);
    const two = candidates(
      makeGameView({ phase: "ACTION_2", legal2: [{ whiteDie: 1, color: "GREEN", number: 9 }] }),
      null,
      null,
    );
    expect(two.white.size).toBe(0);
    expect([...two.colour]).toEqual([k("GREEN", 9)]);
  });

  it("colour first: a white box in the same row to the right of it is not offered", () => {
    const v = makeGameView({ legal1: ["RED", "YELLOW"] });
    // Red 5 is left of Red 8: marking Red 8 first would make Red 5 illegal. Yellow 8 is fine.
    const a = candidates(v, null, { color: "RED", number: 5 });
    expect([...a.white]).toEqual([k("YELLOW", 8)]);
    // A colour box in another row never blocks the white box.
    const b = candidates(v, null, { color: "GREEN", number: 11 });
    expect([...b.white].sort()).toEqual([k("RED", 8), k("YELLOW", 8)]);
  });

  it("white staged: the colour boxes are those left legal (same row to its right only)", () => {
    const v = makeGameView({ legal1: ["RED"] });
    const { colour } = candidates(v, { color: "RED", number: 8 }, null);
    expect(colour.has(k("RED", 5))).toBe(false);
    expect(colour.has(k("RED", 7))).toBe(false);
    expect(colour.has(k("GREEN", 11))).toBe(true);
  });

  it("lock rule: the 12 needs the 5th mark, which a staged white box can provide", () => {
    const v = lockView();
    expect(candidates(v, null, null).colour.has(k("RED", 12))).toBe(false);
    const hov = candidates(v, null, null, { color: "RED", number: 9 });
    expect(hov.colour.has(k("RED", 12))).toBe(true);
    const staged = candidates(v, { color: "RED", number: 9 }, null);
    expect([...staged.colour]).toEqual([k("RED", 12)]);
    // With the 12 staged as colour, the white Red 9 stays offered (it enables the lock).
    const both = candidates(v, null, { color: "RED", number: 12 });
    expect(both.white.has(k("RED", 9))).toBe(true);
  });

  it("locked colours offer nothing", () => {
    const { colour } = candidates(
      makeGameView({ legal1: ["RED"], lockedColors: ["GREEN"] }),
      null,
      null,
    );
    expect([...colour].some((x) => x.startsWith("GREEN"))).toBe(false);
  });

  it("submit messages: both, white only, colour only, nothing; passive", () => {
    const v = makeGameView({ legal1: ["RED"] });
    const red8 = { color: "RED" as const, number: 8 };
    const green11 = { color: "GREEN" as const, number: 11 };
    expect(submitMessage(v, red8, green11)).toEqual({
      type: "turn",
      turn: 9,
      action1: { kind: "MARK", color: "RED" },
      action2: { kind: "MARK", whiteDie: 1, color: "GREEN" },
    });
    expect(submitMessage(v, red8, null)).toEqual({
      type: "turn",
      turn: 9,
      action1: { kind: "MARK", color: "RED" },
      action2: { kind: "PASS" },
    });
    expect(submitMessage(v, null, green11)).toEqual({
      type: "turn",
      turn: 9,
      action1: { kind: "PASS" },
      action2: { kind: "MARK", whiteDie: 1, color: "GREEN" },
    });
    expect(submitMessage(v, null, null)).toEqual({
      type: "turn",
      turn: 9,
      action1: { kind: "PASS" },
      action2: { kind: "PASS" },
    });
    expect(submitMessage(v, { color: "BLUE", number: 8 }, null)).toBeNull();
    const passive = makeGameView({ active: 1, legal1: ["RED"] });
    expect(submitMessage(passive, red8, null)).toEqual({
      type: "action1",
      turn: 9,
      kind: "MARK",
      color: "RED",
    });
    expect(submitMessage(passive, null, null)).toEqual({ type: "action1", turn: 9, kind: "PASS" });
  });

  it("submit label: passive Pass, active Pass (−5), staged Submit", () => {
    expect(submitLabel(makeGameView({ active: 1, legal1: ["RED"] }), false)).toBe("Pass");
    expect(submitLabel(makeGameView({ legal1: ["RED"] }), false)).toBe("Pass (−5)");
    expect(submitLabel(makeGameView({ legal1: ["RED"] }), true)).toBe("Submit");
  });
});

describe("selection in the game screen (T-NEW-19)", () => {
  it("previews candidates before anything is selected, with distinct styles", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    expect(count(".g-box.is-cw")).toBe(1);
    expect(count(".g-box.is-cc")).toBeGreaterThan(5);
    expect(box("Red 8, can mark").classList.contains("is-cw")).toBe(true);
    expect(box("Red 8, can mark").getAttribute("aria-description")).toBe("possible white sum");
    expect(box("Green 11, can mark").classList.contains("is-cc")).toBe(true);
    expect(box("Green 11, can mark").getAttribute("aria-description")).toBe("possible colour move");
  });

  it("passive players only see white-sum candidates", () => {
    show(makeGameView({ active: 1, legal1: ["RED"] }));
    render(<Game code={CODE} />);
    expect(count(".g-box.is-cw")).toBe(1);
    expect(count(".g-box.is-cc")).toBe(0);
  });

  it("hovering a white candidate previews the colour boxes it would leave", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    expect(count(".g-box.is-cc")).toBeGreaterThan(0);
    const before = box("Red 7, can mark");
    expect(before.classList.contains("is-cc")).toBe(true);
    fireEvent.mouseEnter(box("Red 8, can mark"));
    expect(document.querySelector('[aria-label="Red 7, can mark"]')).toBeNull();
    fireEvent.mouseLeave(box("Red 8, can mark"));
    expect(box("Red 7, can mark")).toBeTruthy();
  });

  it("colour first, then white: legal combination submits both in rule order", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    fireEvent.click(box("Green 11, can mark"));
    expect(box("Green 11, can mark, step 2").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(box("Red 8, can mark"));
    expect(document.querySelector(".g-step")?.textContent).toBe("1");
    fireEvent.click(screen.getByText("Submit"));
    expect(sent).toEqual([
      {
        type: "turn",
        turn: 9,
        action1: { kind: "MARK", color: "RED" },
        action2: { kind: "MARK", whiteDie: 1, color: "GREEN" },
      },
    ]);
  });

  it("colour first: a white box that would make it illegal is not selectable", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    fireEvent.click(box("Red 5, can mark")); // colour: 3 + red 2
    const red8 = document.querySelector('[aria-label^="Red 8"]') as HTMLButtonElement;
    expect(red8.disabled).toBe(true);
    fireEvent.click(red8);
    expect(document.querySelectorAll(".g-step")).toHaveLength(1);
    expect(box("Red 5, can mark, step 2")).toBeTruthy();
  });

  it("tapping a staged box unselects it; the white box takes the colour box with it", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    fireEvent.click(box("Red 8, can mark"));
    fireEvent.click(box("Green 11, can mark"));
    expect(count(".g-step")).toBe(2);
    // The colour box alone.
    fireEvent.click(box("Green 11, can mark, step 2"));
    expect(count(".g-step")).toBe(1);
    // Back to both, then unselect the white box: both go.
    fireEvent.click(box("Green 11, can mark"));
    expect(count(".g-step")).toBe(2);
    fireEvent.click(box("Red 8, can mark, step 1"));
    expect(count(".g-step")).toBe(0);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("the step markers are the big ones", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    fireEvent.click(box("Red 8, can mark"));
    const step = document.querySelector(".g-box.is-staged > .g-step");
    expect(step).toBeTruthy();
    expect(step?.closest(".g-box")?.querySelector(".g-num")).toBeTruthy();
  });

  it("no Mark … or separate Pass buttons are ever rendered", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    const labels = () =>
      [...document.querySelectorAll(".g-actions button")].map((b) => b.textContent);
    expect(labels()).toEqual(["Pass (−5)"]);
    fireEvent.click(box("Red 8, can mark"));
    expect(labels()).toEqual(["Undo", "Submit"]);
    expect(count(".g-pass, .g-mark")).toBe(0);
  });

  it("a rejected submit restores the staged marks (and Submit is back)", () => {
    show(makeGameView({ legal1: ["RED"] }));
    render(<Game code={CODE} />);
    fireEvent.click(box("Red 8, can mark"));
    fireEvent.click(screen.getByText("Submit"));
    expect(sent).toHaveLength(1);
    expect((screen.getByText("Sent…") as HTMLButtonElement).disabled).toBe(true);
    emit({ type: "error", code: "E_ILLEGAL_MOVE", command: "turn" } as never);
    expect(count(".g-step")).toBe(1);
    expect(screen.getByText("Submit")).toBeTruthy();
  });

  it("Undo is absent from the DOM with nothing to undo, shown with a staged mark, gone after resolve", () => {
    show(makeGameView({ legal1: ["RED"], version: 5 }));
    render(<Game code={CODE} />);
    expect(count(".g-undo")).toBe(0);
    fireEvent.click(box("Red 8, can mark"));
    expect(count(".g-undo")).toBe(1);
    fireEvent.click(screen.getByText("Submit"));
    expect(count(".g-undo")).toBe(0);
    // The server took the decision: still waiting on others, undoable.
    show(
      makeGameView({
        version: 6,
        decision: true,
        pass1: false,
        canUndo: true,
        gamePlayers: [player(0, { action1Submitted: true }), player(1), player(2)],
      }),
    );
    expect(count(".g-undo")).toBe(1);
    // The turn resolved: next roll, nothing to undo.
    show(makeGameView({ version: 7, phase: "AWAIT_ROLL", active: 1 }));
    expect(count(".g-undo")).toBe(0);
  });
});

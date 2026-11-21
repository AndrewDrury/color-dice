import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { Game } from "../src/screens/Game";
import { _resetMemoryForTests, saveSession } from "../src/session";
import { _resetStoreForTests, applyView } from "../src/store";
import { TOKEN } from "./fixtures";
import { CODE, makeGameView, player, seatIdOf } from "./fixtures/views";

const { sent, FakeSocket } = vi.hoisted(() => {
  const sent: unknown[] = [];
  class FakeSocket {
    connect() {}
    close() {}
    send(m: unknown) {
      sent.push(m);
      return true;
    }
    onMessage() {
      return () => {};
    }
    onStatus() {
      return () => {};
    }
  }
  return { sent, FakeSocket };
});
vi.mock("../src/ws", () => ({ GameSocket: FakeSocket, LobbySocket: FakeSocket }));

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

let ver = 10;
const show = (v: Parameters<typeof applyView>[0]) => {
  act(() => {
    applyView({ ...v, version: ++ver });
  });
};
const nudge = () => screen.queryByTestId("idle-nudge");
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("idle nudge (T-NEW-22)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function mount(v: Parameters<typeof makeGameView>[0]) {
    await import("../src/components/lateUi"); // warm the actual lazy boundary
    show(makeGameView(v));
    render(<Game code={CODE} />);
    await tick(50); // the lazy chunk resolves
  }

  it("not at 7.9 s, shown at 8 s with the call to action", async () => {
    await mount({ legal1: ["RED"] });
    await tick(7800);
    expect(nudge()).toBeNull();
    await tick(300);
    expect(nudge()?.textContent).toContain("Your move!");
    expect(nudge()?.textContent).toContain("Pick a box");
    expect(nudge()?.getAttribute("role")).toBe("alert");
  });

  it("any interaction hides it and restarts the 8 s", async () => {
    await mount({ legal1: ["RED"] });
    await tick(8100);
    expect(nudge()).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(nudge()).toBeNull();
    await tick(7000);
    expect(nudge()).toBeNull();
    await tick(1200);
    expect(nudge()).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "a" });
    await tick(5000);
    fireEvent.keyDown(document.body, { key: "a" });
    await tick(5000);
    expect(nudge()).toBeNull();
  });

  it("the state ending hides it", async () => {
    await mount({ legal1: ["RED"] });
    await tick(8100);
    expect(nudge()).not.toBeNull();
    show(makeGameView({ active: 1, legal1: ["RED"], decision: true, pass1: false }));
    expect(nudge()).toBeNull();
    await tick(20000);
    expect(nudge()).toBeNull();
  });

  it("another player's turn (nothing to do) never shows it", async () => {
    show(makeGameView({ active: 1, phase: "ACTION_2" }));
    render(<Game code={CODE} />);
    await tick(30000);
    expect(nudge()).toBeNull();
  });

  it("a hidden tab pauses the timer", async () => {
    await mount({ legal1: ["RED"] });
    await tick(5000);
    const vis = vi.spyOn(document, "visibilityState", "get");
    vis.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await tick(20000);
    expect(nudge()).toBeNull();
    vis.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await tick(7900);
    expect(nudge()).toBeNull();
    await tick(200);
    expect(nudge()).not.toBeNull();
    vis.mockRestore();
  });

  it("works for the roll (canRoll)", async () => {
    await mount({ phase: "AWAIT_ROLL", canRoll: true });
    await tick(8100);
    expect(nudge()?.textContent).toContain("Roll the dice");
  });
});

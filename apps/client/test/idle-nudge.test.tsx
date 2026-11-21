import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IdleNudge from "../src/components/IdleNudge";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { Game } from "../src/screens/Game";
import { _resetMemoryForTests, saveSession } from "../src/session";
import { _resetStoreForTests, applyView, setStatus } from "../src/store";
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
  setStatus("online");
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

  it("not before 10 s, shown once at 10 s with the call to action", async () => {
    await mount({ legal1: ["RED"] });
    expect(nudge()).toBeNull();
    await tick(9999);
    expect(nudge()).toBeNull();
    await tick(1);
    expect(nudge()?.textContent).toContain("Your move!");
    expect(nudge()?.textContent).toContain("Pick a box");
    expect(nudge()?.getAttribute("role")).toBe("alert");
    await tick(30_000);
    expect(screen.getAllByTestId("idle-nudge")).toHaveLength(1);
  });

  it("an action hides it and restarts a fresh 10 s interval", async () => {
    await mount({ legal1: ["RED"] });
    await tick(10_000);
    expect(nudge()).not.toBeNull();
    fireEvent.click(screen.getByLabelText("Red 8, can mark"));
    expect(nudge()).toBeNull();
    await tick(9999);
    expect(nudge()).toBeNull();
    await tick(2);
    expect(nudge()).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "a" });
    await tick(5000);
    fireEvent.keyDown(document.body, { key: "a" });
    await tick(9999);
    expect(nudge()).toBeNull();
  });

  it("turn and actionable-state changes clean up the old nudge", async () => {
    await mount({ legal1: ["RED"] });
    await tick(10_000);
    expect(nudge()).not.toBeNull();
    const next = makeGameView({ legal1: ["RED"] });
    next.game!.turn!.number = 10;
    show(next);
    expect(nudge()).toBeNull();
    await tick(50);
    await tick(9999);
    expect(nudge()).toBeNull();
    await tick(10_000);
    expect(nudge()).not.toBeNull();
    show(makeGameView({ active: 1, legal1: ["RED"], decision: true, pass1: false }));
    expect(nudge()).toBeNull();
    await tick(20_000);
    expect(nudge()).toBeNull();
  });

  it("another player's turn never shows it even while the viewer can submit", async () => {
    await mount({ active: 1, legal1: ["RED"] });
    await tick(30_000);
    expect(nudge()).toBeNull();
  });

  it("an active CPU seat never shows a human nudge", async () => {
    const cpu = makeGameView({ legal1: ["RED"] });
    cpu.seats[0]!.kind = "cpu";
    await import("../src/components/lateUi");
    show(cpu);
    render(<Game code={CODE} />);
    await tick(30_050);
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
    await tick(9999);
    expect(nudge()).toBeNull();
    await tick(1);
    expect(nudge()).not.toBeNull();
    vis.mockRestore();
  });

  it("works for the roll (canRoll)", async () => {
    await mount({ phase: "AWAIT_ROLL", canRoll: true });
    await tick(10_000);
    expect(nudge()?.textContent).toContain("Roll the dice");
  });

  it("a modal suppresses it and closing the modal starts a fresh interval", async () => {
    await import("../src/components/SettingsPanel");
    await mount({ legal1: ["RED"] });
    await tick(5000);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await tick(20_000);
    expect(nudge()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await tick(50);
    await tick(9999);
    expect(nudge()).toBeNull();
    await tick(10_000);
    expect(nudge()).not.toBeNull();
  });

  it("remounting requires a fresh 10-second interval", async () => {
    const view = makeGameView({ legal1: ["RED"] });
    render(<IdleNudge view={view} staged={false} noMove={false} blocked={false} />);
    await tick(8000);
    cleanup();
    render(<IdleNudge view={view} staged={false} noMove={false} blocked={false} />);
    await tick(9999);
    expect(nudge()).toBeNull();
    await tick(1);
    expect(nudge()).not.toBeNull();
  });

  it("disconnect suppresses and reconnect starts a fresh interval", async () => {
    await mount({ legal1: ["RED"] });
    await tick(5000);
    act(() => setStatus("reconnecting"));
    await tick(20_000);
    expect(nudge()).toBeNull();
    act(() => setStatus("online"));
    await tick(50);
    await tick(9999);
    expect(nudge()).toBeNull();
    await tick(1);
    expect(nudge()).not.toBeNull();
  });
});

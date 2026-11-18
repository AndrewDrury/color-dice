import type { ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { feedback } from "../src/fx/feedback";
import { _resetPlayedRollsForTests } from "../src/fx/useRollAnimation";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { navigate } from "../src/router";
import { _resetMemoryForTests, getSession, saveSession } from "../src/session";
import { _resetStoreForTests, getState } from "../src/store";
import { TOKEN } from "./fixtures";
import { CODE, makeGameView, seatIdOf } from "./fixtures/views";

vi.mock("../src/fx/feedback", () => ({ feedback: vi.fn() }));

class FakeWS {
  static instances: FakeWS[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  view(v: ViewMessage) {
    this.onmessage?.({ data: JSON.stringify(v) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}
const sock = () => FakeWS.instances[FakeWS.instances.length - 1] as FakeWS;
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function seatsOffline(v: ViewMessage, idx: number): ViewMessage {
  return {
    ...v,
    seats: v.seats.map((s, i) => (i === idx ? { ...s, online: false } : s)),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(feedback).mockClear();
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  localStorage.clear();
  _resetMemoryForTests();
  _resetStoreForTests();
  _resetPrefsForTests();
  _resetPlayedRollsForTests();
  setPrefs({ sound: true, haptics: true, motion: "full" });
  saveSession(CODE, { token: TOKEN, seatId: seatIdOf(0), name: "Andrew", roomName: "Friday dice" });
  navigate("game", CODE);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function connect(first: ViewMessage) {
  render(<App />);
  act(() => {
    sock().open();
    sock().view(first);
  });
}

describe("reconnect", () => {
  it("shows the banner after 1 s, then the fresh view silently", () => {
    connect(makeGameView({ version: 5, phase: "AWAIT_ROLL", roll: false, canRoll: true }));
    act(() => sock().drop());
    wait(500);
    expect(screen.queryByTestId("conn-banner")).toBeNull();
    wait(600);
    expect(screen.getByTestId("conn-banner").textContent).toBe("Reconnecting…");

    // Backoff elapses, new socket; a roll happened while we were offline.
    wait(1000);
    expect(FakeWS.instances.length).toBe(2);
    vi.mocked(feedback).mockClear();
    act(() => {
      sock().open();
      sock().view(makeGameView({ version: 6, phase: "ACTION_1", roll: true }));
    });
    expect(sock().sent[0]).toEqual({ type: "auth", token: TOKEN });
    expect(screen.getByTestId("conn-banner").textContent).toBe("Back online");
    expect(getState().view?.version).toBe(6);
    expect(feedback).not.toHaveBeenCalled();
    expect(screen.queryAllByLabelText(/rolling/).length).toBe(0);
    expect(screen.getAllByLabelText(/die: \d/).length).toBeGreaterThan(0);

    wait(2100);
    expect(screen.queryByTestId("conn-banner")).toBeNull();
  });

  it("clears a staged selection after reconnecting", () => {
    connect(makeGameView({ version: 5, phase: "ACTION_1", legal1: ["RED"], decision: false }));
    fireEvent.click(screen.getByLabelText("Red 8, can mark"));
    expect(document.querySelector("[aria-pressed='true'], .is-staged")).not.toBeNull();
    act(() => sock().drop());
    wait(2000);
    act(() => {
      sock().open();
      sock().view(makeGameView({ version: 6, phase: "ACTION_1", legal1: ["RED"] }));
    });
    expect(document.querySelector("[aria-pressed='true'], .is-staged")).toBeNull();
  });

  it("reconnects immediately when the tab becomes visible", () => {
    connect(makeGameView());
    act(() => sock().drop());
    expect(FakeWS.instances.length).toBe(1);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(FakeWS.instances.length).toBe(2);
  });
});

describe("session end", () => {
  it("4004 forgets the session, goes home and toasts", () => {
    connect(makeGameView());
    act(() => sock().drop(4004));
    expect(getSession(CODE)).toBeNull();
    expect(window.location.hash).not.toContain(CODE);
    expect(getState().toast?.text).toBe(
      "Your session ended (maybe you joined from another device).",
    );
    expect(screen.getByText(/maybe you joined from another device/)).toBeTruthy();
  });
});

describe("away controls", () => {
  const offline = () => seatsOffline(makeGameView({ version: 5 }), 2);

  it("host sees Mark as away only after 2 min offline, and it confirms then sends", () => {
    connect(offline());
    expect(screen.queryByText("Mark as away")).toBeNull();
    wait(119_000);
    expect(screen.queryByText("Mark as away")).toBeNull();
    wait(2000);
    fireEvent.click(screen.getByText("Mark as away"));
    expect(screen.getByText("Dev will auto-pass and take penalties on their turns.")).toBeTruthy();
    const confirm = screen.getAllByText("Mark as away").pop() as HTMLElement;
    fireEvent.click(confirm);
    expect(sock().sent).toContainEqual({ type: "setAway", seatId: seatIdOf(2), away: true });
  });

  it("non-hosts never see Mark as away", () => {
    connect({ ...offline(), you: { ...offline().you, host: false, seatId: seatIdOf(1), seat: 1 } });
    wait(200_000);
    expect(screen.queryByText("Mark as away")).toBeNull();
  });

  it("an away player sees I'm back, which sends setAway false for their seat", () => {
    const v = makeGameView({ version: 5, you: 1 });
    connect({
      ...v,
      seats: v.seats.map((s, i) => (i === 1 ? { ...s, away: true } : s)),
    });
    fireEvent.click(screen.getByText("I'm back"));
    expect(sock().sent).toContainEqual({ type: "setAway", seatId: seatIdOf(1), away: false });
  });
});

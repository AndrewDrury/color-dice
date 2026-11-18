import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetMemoryForTests,
  forgetSession,
  getSession,
  listSessions,
  SESSIONS_KEY,
  saveSession,
} from "../src/session";
import { CODE, SEAT, TOKEN } from "./fixtures";

const s = { token: TOKEN, seatId: SEAT, name: "Andrew", roomName: "Friday dice" };

beforeEach(() => {
  _resetMemoryForTests();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session store", () => {
  it("saves, lists, gets and forgets under colorDice:sessions", () => {
    saveSession(CODE, s);
    expect(JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "{}")).toEqual({ [CODE]: s });
    expect(getSession(CODE)).toEqual(s);
    expect(listSessions()).toEqual([{ code: CODE, ...s }]);
    forgetSession(CODE);
    expect(getSession(CODE)).toBeNull();
    expect(listSessions()).toEqual([]);
  });

  it("falls back to memory when localStorage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    vi.stubGlobal("localStorage", throwing);
    saveSession(CODE, s);
    expect(getSession(CODE)).toEqual(s);
    expect(listSessions()).toHaveLength(1);
    forgetSession(CODE);
    expect(getSession(CODE)).toBeNull();
  });

  it("falls back to memory when accessing localStorage itself throws", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      saveSession(CODE, s);
      expect(getSession(CODE)).toEqual(s);
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
    }
  });

  it("ignores corrupt or malformed stored data", () => {
    localStorage.setItem(SESSIONS_KEY, "{not json");
    expect(listSessions()).toEqual([]);
    localStorage.setItem(
      SESSIONS_KEY,
      JSON.stringify({ [CODE]: { ...s, token: "short" }, bad: s, ZZZZZ: s }),
    );
    expect(listSessions().map((x) => x.code)).toEqual(["ZZZZZ"]);
  });

  it("refuses to save invalid sessions", () => {
    saveSession("nope", s);
    saveSession(CODE, { ...s, seatId: "x" });
    expect(listSessions()).toEqual([]);
  });
});

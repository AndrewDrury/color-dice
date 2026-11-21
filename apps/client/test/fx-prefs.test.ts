import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reducedMotion } from "../src/fx/motion";
import {
  _resetPrefsForTests,
  DEFAULT_PREFS,
  getPrefs,
  onPrefs,
  PREFS_KEY,
  setPrefs,
} from "../src/prefs";

beforeEach(() => {
  localStorage.clear();
  _resetPrefsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prefs", () => {
  it("has the H12 defaults", () => {
    expect(getPrefs()).toEqual({ ...DEFAULT_PREFS });
    expect(getPrefs()).toMatchObject({
      sound: true,
      haptics: true,
      motion: "system",
      theme: "classic-light",
    });
  });

  it("persists, notifies and sanitises stored data", () => {
    const cb = vi.fn();
    const off = onPrefs(cb);
    setPrefs({ sound: false, lastName: "Cleo" });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ sound: false, lastName: "Cleo" }));
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}").sound).toBe(false);
    off();
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ sound: "yes", motion: "warp", theme: "dark" }),
    );
    _resetPrefsForTests();
    expect(getPrefs()).toMatchObject({ sound: true, motion: "system", theme: "classic-dark" });
  });

  it("falls back to memory when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getPrefs().sound).toBe(true);
    setPrefs({ sound: false, motion: "reduced" });
    expect(getPrefs()).toMatchObject({ sound: false, motion: "reduced" });
  });

  it("falls back to memory when localStorage itself is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    setPrefs({ haptics: false });
    expect(getPrefs().haptics).toBe(false);
  });

  it("reducedMotion follows the preference, then the OS", () => {
    setPrefs({ motion: "reduced" });
    expect(reducedMotion()).toBe(true);
    setPrefs({ motion: "full" });
    expect(reducedMotion()).toBe(false);
    setPrefs({ motion: "system" });
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q }));
    expect(reducedMotion()).toBe(true);
  });
});

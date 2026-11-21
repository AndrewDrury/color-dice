import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPrefs, startPrefs } from "../src/App";
import { ThemePicker } from "../src/components/ThemePicker";
import {
  _resetPrefsForTests,
  getPrefs,
  PREFS_KEY,
  setPrefs,
  THEME_SCHEME,
  THEMES,
} from "../src/prefs";
import cssText from "../src/styles/themes.css?raw";

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  _resetPrefsForTests();
  root.removeAttribute("data-theme");
  root.removeAttribute("data-scheme");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const stored = (theme: unknown) => {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ theme }));
  _resetPrefsForTests();
  return getPrefs().theme;
};

describe("theme pref", () => {
  it("defaults explicitly and migrates legacy or unknown values", () => {
    expect(["classic-light", "classic-dark"]).toContain(getPrefs().theme);
    expect(["classic-light", "classic-dark"]).toContain(stored("system"));
    expect(stored("light")).toBe("classic-light");
    expect(stored("dark")).toBe("classic-dark");
    expect(stored("classic")).toBe(getPrefs().theme);
    expect(stored("hearts")).toBe("hearts");
    expect(["classic-light", "classic-dark"]).toContain(stored("neon"));
    expect(["classic-light", "classic-dark"]).toContain(stored(7));
  });

  it("round-trips through localStorage and survives blocked storage", () => {
    setPrefs({ theme: "ocean" });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}").theme).toBe("ocean");
    _resetPrefsForTests();
    expect(getPrefs().theme).toBe("ocean");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setPrefs({ theme: "forest" });
    expect(getPrefs().theme).toBe("forest");
  });
});

describe("applyPrefs", () => {
  it("sets data-theme and data-scheme per theme", () => {
    for (const theme of THEMES) {
      setPrefs({ theme });
      applyPrefs();
      expect(root.dataset.theme).toBe(theme);
      const scheme = THEME_SCHEME[theme];
      expect(root.dataset.scheme).toBe(scheme);
    }
  });
});

describe("ThemePicker", () => {
  it("renders every theme as a radio and applies the choice live", () => {
    startPrefs();
    render(<ThemePicker legend="Choose theme" />);
    expect(screen.getAllByRole("radio")).toHaveLength(THEMES.length);
    expect(screen.queryByRole("radio", { name: "Classic (auto)" })).toBeNull();
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Hearts" }));
    });
    expect(root.dataset.theme).toBe("hearts");
    expect(root.dataset.scheme).toBe("light");
    expect(screen.getByRole("radio", { name: "Hearts" })).toHaveProperty("checked", true);
    expect(getPrefs().theme).toBe("hearts");
  });
});

describe("theme allow-list", () => {
  it("contains no classic auto id and finishes with an opaque graphite theme", () => {
    expect(THEMES).not.toContain("classic");
    expect(THEMES.at(-1)).toBe("graphite");
    expect(cssText).toMatch(
      /:root\[data-theme="graphite"\][\s\S]*\.th-graphite[\s\S]*--table:\s*#[0-9a-f]{6}/i,
    );
    expect(cssText).toMatch(/\.th-graphite[\s\S]*--paper:\s*#[0-9a-f]{6}/i);
  });

  it("persists a migrated legacy value as an explicit theme", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: "light" }));
    _resetPrefsForTests();
    expect(getPrefs().theme).toBe("classic-light");
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}").theme).toBe("classic-light");
  });
});

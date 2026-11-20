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
  it("defaults to classic and migrates the old values", () => {
    expect(getPrefs().theme).toBe("classic");
    expect(stored("system")).toBe("classic");
    expect(stored("light")).toBe("classic-light");
    expect(stored("dark")).toBe("classic-dark");
    expect(stored("hearts")).toBe("hearts");
    expect(stored("neon")).toBe("classic");
    expect(stored(7)).toBe("classic");
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
      if (scheme === "auto") expect(root.dataset.scheme).toBeUndefined();
      else expect(root.dataset.scheme).toBe(scheme);
    }
  });
});

describe("ThemePicker", () => {
  it("renders every theme as a radio and applies the choice live", () => {
    startPrefs();
    render(<ThemePicker legend="Choose theme" />);
    expect(screen.getAllByRole("radio")).toHaveLength(THEMES.length);
    expect(screen.getByRole("radio", { name: "Classic (auto)" })).toHaveProperty("checked", true);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Hearts" }));
    });
    expect(root.dataset.theme).toBe("hearts");
    expect(root.dataset.scheme).toBe("light");
    expect(screen.getByRole("radio", { name: "Hearts" })).toHaveProperty("checked", true);
    expect(getPrefs().theme).toBe("hearts");
  });
});

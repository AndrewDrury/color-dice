import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Confetti } from "../src/components/Confetti";
import { Settings } from "../src/components/Settings";
import { handleKey, type KeyActions } from "../src/fx/keyboard";
import { trackTabAttention } from "../src/fx/tabAttention";
import { holdWakeLock } from "../src/fx/wakeLock";
import { t as tr } from "../src/i18n";
import { _resetPrefsForTests, getPrefs, setPrefs } from "../src/prefs";

beforeEach(() => {
  localStorage.clear();
  _resetPrefsForTests();
  document.body.innerHTML = "";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Settings", () => {
  it("toggles persist to prefs", () => {
    render(<Settings onClose={() => {}} onPanel={() => {}} />);
    fireEvent.click(screen.getByRole("switch", { name: "Sound" }));
    expect(getPrefs().sound).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Reduced" }));
    expect(getPrefs().motion).toBe("reduced");
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(getPrefs().theme).toBe("dark");
    expect(JSON.parse(localStorage.getItem("colorDice:prefs") ?? "{}")).toMatchObject({
      sound: false,
      motion: "reduced",
      theme: "dark",
    });
  });

  it("hides Haptics when unsupported and shows it when vibrate exists", () => {
    const had = "vibrate" in navigator;
    expect(had).toBe(false);
    const a = render(<Settings onClose={() => {}} onPanel={() => {}} />);
    expect(screen.queryByRole("switch", { name: "Haptics" })).toBeNull();
    a.unmount();
    Object.defineProperty(navigator, "vibrate", { value: () => true, configurable: true });
    try {
      render(<Settings onClose={() => {}} onPanel={() => {}} />);
      expect(screen.getByRole("switch", { name: "Haptics" })).toBeTruthy();
    } finally {
      delete (navigator as unknown as Record<string, unknown>).vibrate;
    }
  });
});

describe("tabAttention", () => {
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  afterEach(() => setHidden(false));

  it("sets the title when hidden on your move and restores it when visible", () => {
    document.title = "Color Dice";
    const t = trackTabAttention(() => true);
    setHidden(true);
    expect(document.title).toBe(tr("attention.title"));
    expect(tr("attention.title")).toBe("● Your turn — Color Dice");
    setHidden(false);
    expect(document.title).toBe("Color Dice");
    t.stop();
  });

  it("leaves the title alone when it is not your move", () => {
    document.title = "Color Dice";
    const t = trackTabAttention(() => false);
    setHidden(true);
    expect(document.title).toBe("Color Dice");
    t.stop();
  });
});

describe("keyboard", () => {
  function actions(over: Partial<KeyActions> = {}): KeyActions {
    return {
      canRoll: false,
      canPass: false,
      canUndo: false,
      undo: vi.fn(),
      roll: vi.fn(),
      pass: vi.fn(),
      cancel: vi.fn(),
      mute: vi.fn(),
      help: vi.fn(),
      ...over,
    };
  }
  const press = (key: string, target: Element = document.body) => {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    Object.defineProperty(e, "target", { value: target });
    return handleKey(e, actionsRef);
  };
  let actionsRef: KeyActions;

  it("Space rolls only when canRoll", () => {
    actionsRef = actions();
    press(" ");
    expect(actionsRef.roll).not.toHaveBeenCalled();
    actionsRef = actions({ canRoll: true });
    press(" ");
    press("r");
    expect(actionsRef.roll).toHaveBeenCalledTimes(2);
  });

  it("arrows move focus between legal (enabled) boxes only", () => {
    document.body.innerHTML = `<div class="g-sheet">
      <div class="g-row"><button class="g-box" id="a"></button><button class="g-box" disabled id="b"></button><button class="g-box" id="c"></button></div>
      <div class="g-row"><button class="g-box" disabled id="d"></button><button class="g-box" disabled id="e"></button><button class="g-box" id="f"></button></div>
    </div>`;
    actionsRef = actions();
    press("ArrowRight");
    expect(document.activeElement?.id).toBe("a"); // first legal box
    press("ArrowRight");
    expect(document.activeElement?.id).toBe("c"); // skips the disabled box
    press("ArrowRight");
    expect(document.activeElement?.id).toBe("c"); // nothing further
    press("ArrowDown");
    expect(document.activeElement?.id).toBe("f");
    press("ArrowLeft");
    expect(document.activeElement?.id).toBe("f");
  });

  it("ignores shortcuts inside inputs", () => {
    const input = document.createElement("input");
    document.body.append(input);
    actionsRef = actions({ canRoll: true, canPass: true });
    press(" ", input);
    press("p", input);
    press("m", input);
    expect(actionsRef.roll).not.toHaveBeenCalled();
    expect(actionsRef.pass).not.toHaveBeenCalled();
    expect(actionsRef.mute).not.toHaveBeenCalled();
  });

  it("Esc cancels staging; P, M and ? call their actions", () => {
    actionsRef = actions({ canPass: true });
    press("Escape");
    press("p");
    press("m");
    press("?");
    expect(actionsRef.cancel).toHaveBeenCalledTimes(1);
    expect(actionsRef.pass).toHaveBeenCalledTimes(1);
    expect(actionsRef.mute).toHaveBeenCalledTimes(1);
    expect(actionsRef.help).toHaveBeenCalledTimes(1);
  });
});

describe("wake lock", () => {
  it("requests on mount and releases on unmount", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    const stop = holdWakeLock();
    await act(async () => {
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledWith("screen");
    stop();
    expect(release).toHaveBeenCalled();
  });

  it("does not throw without the API", () => {
    vi.stubGlobal("navigator", { ...navigator, wakeLock: undefined });
    expect(() => holdWakeLock()()).not.toThrow();
  });
});

describe("Confetti", () => {
  it("renders 60 particles normally and nothing under reduced motion", () => {
    setPrefs({ motion: "full" });
    const a = render(<Confetti />);
    expect(a.container.querySelectorAll(".cf-p").length).toBe(60);
    a.unmount();
    setPrefs({ motion: "reduced" });
    const b = render(<Confetti />);
    expect(b.container.querySelectorAll(".cf-p").length).toBe(0);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { Settings } from "../src/components/SettingsPanel";
import {
  applyLanguage,
  colorLetter,
  colorName,
  errorText,
  getLocale,
  type Messages,
  resolveLocale,
  setLanguage,
  t,
  tn,
} from "../src/i18n";
import { en } from "../src/i18n/en";
import { _resetPrefsForTests, getPrefs, PREFS_KEY, setPrefs } from "../src/prefs";

const placeholders = (s: string) =>
  [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

afterEach(async () => {
  localStorage.clear();
  _resetPrefsForTests();
  await applyLanguage("en");
});

describe("catalogs", async () => {
  const fr: Messages = (await import("../src/i18n/fr")).fr;
  const es: Messages = (await import("../src/i18n/es")).es;
  for (const [name, cat] of [
    ["fr", fr],
    ["es", es],
  ] as const) {
    it(`${name}: same keys as English, no empty text, same {placeholders}`, () => {
      expect(Object.keys(cat).sort()).toEqual(Object.keys(en).sort());
      for (const [key, text] of Object.entries(cat)) {
        expect(text.trim(), key).not.toBe("");
        expect(placeholders(text), key).toEqual(placeholders(en[key as keyof typeof en]));
      }
    });
  }

  it("rail letters differ per language (Amarillo vs Azul)", () => {
    expect(
      ["RED", "YELLOW", "GREEN", "BLUE"].map((c) => en[`colorLetter.${c}` as keyof typeof en]),
    ).toEqual(["R", "Y", "G", "B"]);
    expect(
      ["RED", "YELLOW", "GREEN", "BLUE"].map((c) => fr[`colorLetter.${c}` as keyof Messages]),
    ).toEqual(["R", "J", "V", "B"]);
    expect(
      ["RED", "YELLOW", "GREEN", "BLUE"].map((c) => es[`colorLetter.${c}` as keyof Messages]),
    ).toEqual(["R", "Am", "V", "Az"]);
  });
});

describe("resolveLocale", () => {
  it("auto follows navigator.languages in order", () => {
    expect(resolveLocale("auto", ["fr-CA", "en-US"])).toBe("fr");
    expect(resolveLocale("auto", ["es-MX"])).toBe("es");
    expect(resolveLocale("auto", ["de-DE", "es-ES", "fr"])).toBe("es");
    expect(resolveLocale("auto", ["de"])).toBe("en");
    expect(resolveLocale("auto", [])).toBe("en");
  });
  it("an explicit choice overrides the browser", () => {
    expect(resolveLocale("en", ["fr-FR"])).toBe("en");
    expect(resolveLocale("es", ["fr-FR"])).toBe("es");
  });
});

describe("prefs.language", () => {
  it("defaults to auto and sanitizes junk", () => {
    expect(getPrefs().language).toBe("auto");
    localStorage.setItem(PREFS_KEY, JSON.stringify({ language: "klingon" }));
    _resetPrefsForTests();
    expect(getPrefs().language).toBe("auto");
    setPrefs({ language: "fr" });
    expect(getPrefs().language).toBe("fr");
  });
});

describe("switching", () => {
  it("t / tn / colours follow the active language", async () => {
    await applyLanguage("fr");
    expect(getLocale()).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(colorName("RED")).toBe("Rouge");
    expect(colorLetter("YELLOW")).toBe("J");
    expect(tn("waiting.start.need", 1)).toBe("Il manque 1 joueur");
    expect(errorText("E_NOT_HOST")).toBe("Seul l'hôte peut faire ça.");
    await applyLanguage("es");
    expect(colorLetter("YELLOW")).toBe("Am");
    expect(colorLetter("BLUE")).toBe("Az");
    expect(tn("waiting.start.need", 2)).toBe("Faltan 2 jugadores");
    expect(t("home.record", { wins: 1, ties: 2, losses: 3 })).toBe("Tu récord: 1 G – 2 E – 3 P");
  });

  it("Settings: choosing a language updates the text and <html lang>, and persists", async () => {
    render(<Settings onClose={() => {}} onPanel={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Français" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Réglages" })).toBeTruthy());
    expect(document.documentElement.lang).toBe("fr");
    expect(getPrefs().language).toBe("fr");
    fireEvent.click(screen.getByRole("button", { name: "Español" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Ajustes" })).toBeTruthy());
    expect(document.documentElement.lang).toBe("es");
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(getPrefs().language).toBe("auto");
    await setLanguage("en");
  });
});

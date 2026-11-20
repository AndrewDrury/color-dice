import { describe, expect, it } from "vitest";
import { THEMES } from "../src/prefs";
import {
  contrastRatio,
  PAIRS,
  THEME_BASE,
  THEME_OVERRIDES,
  type Theme,
  TOKENS,
  themeTokens,
} from "../src/styles/contrast";
import themesCss from "../src/styles/themes.css?raw";
import css from "../src/styles/tokens.css?raw";

const themes: Theme[] = ["light", "dark"];

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

function declared(text: string, name: string): string | undefined {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(text);
  return m?.[1]?.toUpperCase();
}

describe("contrast", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });

  for (const theme of themes) {
    for (const { fg, bg, large } of PAIRS[theme]) {
      const min = large ? 3 : 4.5;
      it(`${theme}: ${fg} on ${bg} ≥ ${min}`, () => {
        const f = TOKENS[theme][fg];
        const b = TOKENS[theme][bg];
        expect(f && b).toBeTruthy();
        expect(contrastRatio(f as string, b as string)).toBeGreaterThanOrEqual(min);
      });
    }
  }

  it("contrast.ts matches tokens.css", () => {
    const light = block(":root");
    const dark = block(':root[data-scheme="dark"]');
    const media = block(":root:not([data-scheme])");
    for (const [name, value] of Object.entries(TOKENS.light)) {
      expect(declared(light, name), name).toBe(value.toUpperCase());
    }
    for (const [name, value] of Object.entries(TOKENS.dark)) {
      const expected = value.toUpperCase();
      expect(declared(dark, name) ?? declared(light, name), name).toBe(expected);
      expect(declared(media, name) ?? declared(light, name), name).toBe(expected);
    }
  });

  it("covers every theme id", () => {
    expect(Object.keys(THEME_BASE).sort()).toEqual([...THEMES].sort());
  });

  for (const id of THEMES) {
    const base = THEME_BASE[id] as Theme;
    for (const { fg, bg, large } of PAIRS[base]) {
      const min = large ? 3 : 4.5;
      it(`theme ${id}: ${fg} on ${bg} >= ${min}`, () => {
        const tok = themeTokens(id);
        expect(contrastRatio(tok[fg] as string, tok[bg] as string)).toBeGreaterThanOrEqual(min);
      });
    }
  }

  it("themes.css matches the theme overrides in contrast.ts", () => {
    for (const [id, tokens] of Object.entries(THEME_OVERRIDES)) {
      const start = themesCss.indexOf(`:root[data-theme="${id}"]`);
      expect(start, id).toBeGreaterThanOrEqual(0);
      const text = themesCss.slice(start, themesCss.indexOf("--bg-pattern", start));
      for (const [name, value] of Object.entries(tokens)) {
        expect(declared(text, name), `${id} ${name}`).toBe(value.toUpperCase());
      }
    }
  });

  it("only classic has no pattern and nothing sets a row colour", () => {
    for (const id of THEMES) {
      if (id.startsWith("classic")) continue;
      expect(themesCss).toContain(`:root[data-theme="${id}"]`);
    }
    expect(themesCss).not.toMatch(/--(row|die)-/);
  });
});

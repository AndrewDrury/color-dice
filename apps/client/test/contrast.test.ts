import { describe, expect, it } from "vitest";
import { contrastRatio, PAIRS, type Theme, TOKENS } from "../src/styles/contrast";
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
    const dark = block(':root[data-theme="dark"]');
    const media = block(':root:not([data-theme="light"])');
    for (const [name, value] of Object.entries(TOKENS.light)) {
      expect(declared(light, name), name).toBe(value.toUpperCase());
    }
    for (const [name, value] of Object.entries(TOKENS.dark)) {
      const expected = value.toUpperCase();
      expect(declared(dark, name) ?? declared(light, name), name).toBe(expected);
      expect(declared(media, name) ?? declared(light, name), name).toBe(expected);
    }
  });
});

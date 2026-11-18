/**
 * H2 colour tokens and the text/background pairs that must meet WCAG AA.
 * `test/contrast.test.ts` checks every pair here and that each value matches
 * `tokens.css`, so a token change can't silently break contrast.
 */

export type Theme = "light" | "dark";

/** Opaque token values per theme (alpha tints are pre-composited over paper). */
export const TOKENS: Record<Theme, Record<string, string>> = {
  light: {
    "--table": "#EFE9DF",
    "--paper": "#FFFDF8",
    "--ink": "#1C2230",
    "--ink-muted": "#5E626A", // ~65 % ink over paper, AA on paper and table
    "--accent": "#5B5BF0",
    "--on-accent": "#FFFFFF",
    "--danger": "#B3342A",
    "--on-danger": "#FFFFFF",
    "--row-red": "#E02633",
    "--row-red-tint": "#FFD9DB",
    "--row-red-ink": "#7A1015",
    "--row-red-on": "#FFFFFF",
    "--row-red-vivid": "#FF6B74",
    "--row-red-vivid-ink": "#1C2230",
    "--row-yellow": "#FFC20A",
    "--row-yellow-tint": "#FFF0B3",
    "--row-yellow-ink": "#6B4E00",
    "--row-yellow-on": "#1C2230",
    "--row-yellow-vivid": "#FFD43B",
    "--row-yellow-vivid-ink": "#1C2230",
    "--row-green": "#1FB866",
    "--row-green-tint": "#CFF5DE",
    "--row-green-ink": "#0B5A2E",
    "--row-green-on": "#1C2230",
    "--row-green-vivid": "#3EDC86",
    "--row-green-vivid-ink": "#1C2230",
    "--row-blue": "#1F63F0",
    "--row-blue-tint": "#D9E5FF",
    "--row-blue-ink": "#0F3778",
    "--row-blue-on": "#FFFFFF",
    "--row-blue-vivid": "#5E9BFF",
    "--row-blue-vivid-ink": "#1C2230",
    "--die-ivory": "#FBF8F1",
    "--die-ink": "#1C2230",
    "--die-red": "#E02633",
    "--die-red-pip": "#FFFFFF",
    "--die-yellow": "#FFC20A",
    "--die-yellow-pip": "#1C2230",
    "--die-green": "#12A150",
    "--die-green-pip": "#FFFFFF",
    "--die-blue": "#1F63F0",
    "--die-blue-pip": "#FFFFFF",
  },
  dark: {
    "--table": "#0E131C",
    "--paper": "#1A2130",
    "--ink": "#EEF1F6",
    "--ink-muted": "#9DA2AB", // 62 % ink over paper
    "--accent": "#8C8CFF",
    "--on-accent": "#0E131C",
    "--danger": "#FF7A70",
    "--on-danger": "#0E131C",
    "--row-red": "#E02633",
    "--row-red-tint": "#5C1F2C",
    "--row-red-ink": "#F4F6FA",
    "--row-red-on": "#FFFFFF",
    "--row-red-vivid": "#FF6B74",
    "--row-red-vivid-ink": "#1C2230",
    "--row-yellow": "#FFC20A",
    "--row-yellow-tint": "#574814",
    "--row-yellow-ink": "#F4F6FA",
    "--row-yellow-on": "#1C2230",
    "--row-yellow-vivid": "#FFD43B",
    "--row-yellow-vivid-ink": "#1C2230",
    "--row-green": "#1FB866",
    "--row-green-tint": "#134A35",
    "--row-green-ink": "#F4F6FA",
    "--row-green-on": "#1C2230",
    "--row-green-vivid": "#3EDC86",
    "--row-green-vivid-ink": "#1C2230",
    "--row-blue": "#1F63F0",
    "--row-blue-tint": "#1B3A78",
    "--row-blue-ink": "#F4F6FA",
    "--row-blue-on": "#FFFFFF",
    "--row-blue-vivid": "#5E9BFF",
    "--row-blue-vivid-ink": "#1C2230",
    "--die-ivory": "#FBF8F1",
    "--die-ink": "#1C2230",
    "--die-red": "#E02633",
    "--die-red-pip": "#FFFFFF",
    "--die-yellow": "#FFC20A",
    "--die-yellow-pip": "#1C2230",
    "--die-green": "#12A150",
    "--die-green-pip": "#FFFFFF",
    "--die-blue": "#1F63F0",
    "--die-blue-pip": "#FFFFFF",
  },
};

export interface ContrastPair {
  fg: string;
  bg: string;
  /** Only used for ≥ 18.66 px bold (or ≥ 24 px) text: needs 3:1 instead of 4.5:1. */
  large?: boolean;
}

/** Text/background pairs used by the UI (token names; resolved per theme). */
export const PAIRS: Record<Theme, ContrastPair[]> = {
  light: [
    { fg: "--ink", bg: "--table" },
    { fg: "--ink", bg: "--paper" },
    { fg: "--ink-muted", bg: "--paper" },
    { fg: "--ink-muted", bg: "--table" },
    { fg: "--danger", bg: "--table" },
    { fg: "--on-danger", bg: "--danger" }, // toast and danger buttons
    { fg: "--accent", bg: "--paper" },
    { fg: "--on-accent", bg: "--accent" },
    { fg: "--danger", bg: "--paper" },
    ...rowPairs(),
  ],
  dark: [
    { fg: "--ink", bg: "--table" },
    { fg: "--ink", bg: "--paper" },
    { fg: "--ink-muted", bg: "--paper" },
    { fg: "--ink-muted", bg: "--table" },
    { fg: "--danger", bg: "--table" },
    { fg: "--on-danger", bg: "--danger" }, // toast and danger buttons
    { fg: "--accent", bg: "--paper" },
    { fg: "--on-accent", bg: "--accent" },
    { fg: "--danger", bg: "--paper" },
    ...rowPairs(),
  ],
};

function rowPairs(): ContrastPair[] {
  return [
    // Footer total badge (K3.4): paper text on an ink pill.
    { fg: "--paper", bg: "--ink" },
    // White dice pips (graphics: 3:1).
    { fg: "--die-ink", bg: "--die-ivory", large: true },
    ...["red", "yellow", "green", "blue"].flatMap((c) => [
      { fg: `--row-${c}-ink`, bg: `--row-${c}-tint` },
      { fg: `--row-${c}-on`, bg: `--row-${c}` },
      // K3.3: numbers on the vivid markable-box fill keep 4.5:1.
      { fg: `--row-${c}-vivid-ink`, bg: `--row-${c}-vivid` },
      // K3.1: coloured dice pips are graphics: 3:1 (WCAG 1.4.11).
      { fg: `--die-${c}-pip`, bg: `--die-${c}`, large: true },
    ]),
  ];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => channel(Number.parseInt(x ?? "0", 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG contrast ratio (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

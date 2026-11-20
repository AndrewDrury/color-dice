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
    // Focus ring and selected-swatch outline (graphics: 3:1) on page and card surfaces.
    { fg: "--accent", bg: "--table", large: true },
    { fg: "--accent", bg: "--paper", large: true },
    { fg: "--ink", bg: "--table", large: true },
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

/**
 * T-NEW-16 themes (D-L6/D-L7): each is a light or dark base plus surface/text/accent overrides.
 * Mirrored in themes.css (checked by contrast.test.ts). Row, dice and profile colours never
 * change. classic, classic-light and classic-dark are the plain bases (no overrides, no pattern).
 */
export const THEME_BASE: Record<string, Theme> = {
  classic: "light",
  "classic-light": "light",
  "classic-dark": "dark",
  hearts: "light",
  midnight: "dark",
  ocean: "dark",
  forest: "dark",
  lavender: "light",
  sunset: "light",
};

export const THEME_OVERRIDES: Record<string, Record<string, string>> = {
  hearts: {
    "--table": "#F8E1E8",
    "--paper": "#FFF8FA",
    "--ink": "#2A1A22",
    "--ink-muted": "#6A5260",
    "--accent": "#C0245E",
    "--on-accent": "#FFFFFF",
    "--danger": "#B3342A",
    "--on-danger": "#FFFFFF",
  },
  midnight: {
    "--table": "#0B0B0E",
    "--paper": "#18181D",
    "--ink": "#F2EEE4",
    "--ink-muted": "#A8A294",
    "--accent": "#D9B65E",
    "--on-accent": "#17130A",
    "--danger": "#FF7A70",
    "--on-danger": "#0B0B0E",
  },
  ocean: {
    "--table": "#0A2236",
    "--paper": "#11314B",
    "--ink": "#EAF4FB",
    "--ink-muted": "#A3BDD0",
    "--accent": "#5CC8E8",
    "--on-accent": "#06202F",
    "--danger": "#FF8A80",
    "--on-danger": "#0A2236",
  },
  forest: {
    "--table": "#0F2219",
    "--paper": "#183326",
    "--ink": "#EEF5EF",
    "--ink-muted": "#A5BBAC",
    "--accent": "#7FD18B",
    "--on-accent": "#0F2219",
    "--danger": "#FF8A80",
    "--on-danger": "#0F2219",
  },
  lavender: {
    "--table": "#ECE5F7",
    "--paper": "#FCFAFF",
    "--ink": "#241E33",
    "--ink-muted": "#605870",
    "--accent": "#6A43C9",
    "--on-accent": "#FFFFFF",
    "--danger": "#B3342A",
    "--on-danger": "#FFFFFF",
  },
  sunset: {
    "--table": "#FBE3CF",
    "--paper": "#FFF9F3",
    "--ink": "#2E1E14",
    "--ink-muted": "#6B5343",
    "--accent": "#B0441A",
    "--on-accent": "#FFFFFF",
    "--danger": "#A3261C",
    "--on-danger": "#FFFFFF",
  },
};

/** Resolved opaque tokens for a theme id. */
export function themeTokens(id: string): Record<string, string> {
  return { ...TOKENS[THEME_BASE[id] ?? "light"], ...THEME_OVERRIDES[id] };
}

/**
 * T-NEW-22: button and turn-banner tokens. Each is an alias of a base token or a sRGB
 * `color-mix(in srgb, A pct%, B)`; app.css declares them identically (checked by the tests).
 */
export type Derived = string | [a: string, pct: number, b: string];

export const DERIVED: Record<string, Derived> = {
  "--btn-bg": ["--accent", 14, "--paper"],
  "--btn-fg": "--ink",
  "--btn-border": ["--ink", 60, "--paper"],
  "--btn-primary-bg": "--accent",
  "--btn-primary-fg": "--on-accent",
  "--btn-primary-border": "--accent",
  "--btn-danger-bg": "--danger",
  "--btn-danger-fg": "--on-danger",
  "--btn-danger-border": "--danger",
  "--btn-disabled-bg": ["--ink", 10, "--paper"],
  "--btn-disabled-fg": "--ink-muted",
  "--btn-disabled-border": ["--ink", 60, "--paper"],
  "--turn-mine-bg": "--accent",
  "--turn-mine-fg": "--on-accent",
  "--turn-other-bg": ["--ink", 8, "--paper"],
  "--turn-other-fg": "--ink",
  "--turn-other-border": ["--ink", 25, "--paper"],
};

/** Mix two `#RRGGBB` colours like CSS `color-mix(in srgb, a pct%, b)`. */
export function mixHex(a: string, pct: number, b: string): string {
  const ch = (h: string, i: number) => Number.parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round((ch(a, i) * pct) / 100 + (ch(b, i) * (100 - pct)) / 100)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Base tokens plus the derived button / banner tokens, resolved for a theme id. */
export function resolvedTokens(id: string): Record<string, string> {
  const t = themeTokens(id);
  for (const [name, d] of Object.entries(DERIVED)) {
    t[name] =
      typeof d === "string" ? (t[d] as string) : mixHex(t[d[0]] as string, d[1], t[d[2]] as string);
  }
  return t;
}

/** Label pairs min 4.5, borders (and fills against surfaces) min 3, per DERIVED token names. */
export const BUTTON_PAIRS: { fg: string; bg: string; min: number }[] = [
  ...["btn", "btn-primary", "btn-danger", "btn-disabled"].flatMap((v) => [
    { fg: `--${v}-fg`, bg: `--${v}-bg`, min: 4.5 },
  ]),
  { fg: "--btn-border", bg: "--btn-bg", min: 3 },
  { fg: "--btn-border", bg: "--paper", min: 3 },
  { fg: "--btn-border", bg: "--table", min: 3 },
  { fg: "--btn-primary-border", bg: "--paper", min: 3 },
  { fg: "--btn-primary-border", bg: "--table", min: 3 },
  { fg: "--btn-danger-border", bg: "--paper", min: 3 },
  { fg: "--btn-disabled-border", bg: "--paper", min: 3 },
  { fg: "--btn-disabled-border", bg: "--btn-disabled-bg", min: 3 },
  { fg: "--turn-mine-fg", bg: "--turn-mine-bg", min: 4.5 },
  { fg: "--turn-other-fg", bg: "--turn-other-bg", min: 4.5 },
  { fg: "--turn-mine-bg", bg: "--table", min: 3 },
  { fg: "--turn-mine-bg", bg: "--turn-other-bg", min: 1.5 },
];

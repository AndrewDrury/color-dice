/** Device preferences (H12). Stored in localStorage with an in-memory fallback, like session.ts. */

export type MotionPref = "system" | "reduced" | "full";
/** D-L6/D-L7 theme ids; "classic" follows the system light/dark setting. */
export const THEMES = [
  "classic",
  "classic-light",
  "classic-dark",
  "hearts",
  "midnight",
  "ocean",
  "forest",
  "lavender",
  "sunset",
  "sakura",
  "candy",
  "synthwave",
  "aurora",
  "desert",
  "coffee",
  "mint",
  "space",
  "autumn",
  "ice",
  "graphite",
] as const;
export type ThemePref = (typeof THEMES)[number];
export const THEME_SCHEME: Record<ThemePref, "auto" | "light" | "dark"> = {
  classic: "auto",
  "classic-light": "light",
  "classic-dark": "dark",
  hearts: "light",
  midnight: "dark",
  ocean: "dark",
  forest: "dark",
  lavender: "light",
  sunset: "light",
  sakura: "light",
  candy: "light",
  synthwave: "dark",
  aurora: "dark",
  desert: "light",
  coffee: "dark",
  mint: "light",
  space: "dark",
  autumn: "light",
  ice: "light",
  graphite: "dark",
};
export type LanguagePref = "auto" | "en" | "fr" | "es";

export interface Prefs {
  sound: boolean;
  haptics: boolean;
  /** Show incoming chat toasts, unread badge and reaction floats (I3). */
  showChat: boolean;
  motion: MotionPref;
  theme: ThemePref;
  /** UI language; "auto" follows the browser (navigator.languages). */
  language: LanguagePref;
  lastName: string;
  seenHints: string[];
  /** K4.6: never show the coaching hint card on this device. */
  hintsOff: boolean;
}

export const PREFS_KEY = "colorDice:prefs";

const MAX_NAME = 40;
const MAX_HINTS = 50;

export const DEFAULT_PREFS: Readonly<Prefs> = Object.freeze({
  sound: true,
  haptics: true,
  showChat: true,
  motion: "system",
  theme: "classic",
  language: "auto",
  lastName: "",
  seenHints: [],
  hintsOff: false,
});

type Listener = (p: Prefs) => void;

let memory: Prefs | null = null;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const MOTIONS: readonly MotionPref[] = ["system", "reduced", "full"];
const LANGUAGES: readonly LanguagePref[] = ["auto", "en", "fr", "es"];

/** Storage content is not trusted: keep only well-formed fields, defaults for the rest. */
function sanitize(data: unknown): Prefs {
  const out: Prefs = { ...DEFAULT_PREFS, seenHints: [] };
  if (typeof data !== "object" || data === null || Array.isArray(data)) return out;
  const d = data as Record<string, unknown>;
  if (typeof d.sound === "boolean") out.sound = d.sound;
  if (typeof d.haptics === "boolean") out.haptics = d.haptics;
  if (typeof d.showChat === "boolean") out.showChat = d.showChat;
  if (MOTIONS.includes(d.motion as MotionPref)) out.motion = d.motion as MotionPref;
  // Old values: system -> classic, light/dark -> classic-light/-dark; anything unknown -> classic.
  const th = d.theme === "light" || d.theme === "dark" ? `classic-${d.theme}` : d.theme;
  if (THEMES.includes(th as ThemePref)) out.theme = th as ThemePref;
  if (LANGUAGES.includes(d.language as LanguagePref)) out.language = d.language as LanguagePref;
  if (typeof d.hintsOff === "boolean") out.hintsOff = d.hintsOff;
  if (typeof d.lastName === "string") out.lastName = d.lastName.slice(0, MAX_NAME);
  if (Array.isArray(d.seenHints)) {
    out.seenHints = d.seenHints
      .filter((h): h is string => typeof h === "string" && h.length <= 64)
      .slice(0, MAX_HINTS);
  }
  return out;
}

function clone(p: Prefs): Prefs {
  return { ...p, seenHints: [...p.seenHints] };
}

export function getPrefs(): Prefs {
  if (memory) return clone(memory);
  const ls = storage();
  let p: Prefs = sanitize(null);
  if (ls) {
    try {
      const raw = ls.getItem(PREFS_KEY);
      if (raw !== null) p = sanitize(JSON.parse(raw));
    } catch {
      // Blocked or corrupt storage: defaults for this tab.
    }
  }
  memory = p;
  return clone(p);
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = sanitize({ ...getPrefs(), ...patch });
  memory = next;
  const ls = storage();
  if (ls) {
    try {
      ls.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // Quota exceeded or storage blocked: the in-memory copy still works for this tab.
    }
  }
  for (const cb of listeners) cb(clone(next));
  return clone(next);
}

/** Subscribe to changes; returns an unsubscribe function. */
export function onPrefs(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Test helper: drop the in-memory copy and listeners. */
export function _resetPrefsForTests(): void {
  memory = null;
  listeners.clear();
}

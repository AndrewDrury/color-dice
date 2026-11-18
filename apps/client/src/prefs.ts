/** Device preferences (H12). Stored in localStorage with an in-memory fallback, like session.ts. */

export type MotionPref = "system" | "reduced" | "full";
export type ThemePref = "system" | "light" | "dark";
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
  theme: "system",
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
const THEMES: readonly ThemePref[] = ["system", "light", "dark"];
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
  if (THEMES.includes(d.theme as ThemePref)) out.theme = d.theme as ThemePref;
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

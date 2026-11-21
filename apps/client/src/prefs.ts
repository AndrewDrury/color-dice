/** Device preferences (H12). Stored in localStorage with an in-memory fallback, like session.ts. */

export type MotionPref = "system" | "reduced" | "full";
/** D-L6/D-L7 explicit theme ids. "classic" is migration-only and never accepted by the UI. */
export const THEMES = [
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
export const THEME_SCHEME: Record<ThemePref, "light" | "dark"> = {
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
}

export const PREFS_KEY = "colorDice:prefs";

const MAX_NAME = 40;

export const DEFAULT_PREFS: Readonly<Prefs> = Object.freeze({
  sound: true,
  haptics: true,
  showChat: true,
  motion: "system",
  theme: "classic-light",
  language: "auto",
  lastName: "",
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

export function defaultTheme(): ThemePref {
  try {
    // i18n-ok: CSS media query, not user-facing copy.
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "classic-dark"
      : "classic-light";
  } catch {
    return "classic-light";
  }
}

function migrateTheme(value: unknown): ThemePref {
  if (value === "light") return "classic-light";
  if (value === "dark") return "classic-dark";
  if (value === "classic") return defaultTheme();
  if (typeof value === "string" && THEMES.includes(value as ThemePref)) return value as ThemePref;
  return defaultTheme();
}

/** Storage content is not trusted: keep only well-formed fields, defaults for the rest. */
function sanitize(data: unknown): Prefs {
  const out: Prefs = { ...DEFAULT_PREFS };
  if (typeof data !== "object" || data === null || Array.isArray(data)) return out;
  const d = data as Record<string, unknown>;
  if (typeof d.sound === "boolean") out.sound = d.sound;
  if (typeof d.haptics === "boolean") out.haptics = d.haptics;
  if (typeof d.showChat === "boolean") out.showChat = d.showChat;
  if (MOTIONS.includes(d.motion as MotionPref)) out.motion = d.motion as MotionPref;
  out.theme = migrateTheme(d.theme);
  if (LANGUAGES.includes(d.language as LanguagePref)) out.language = d.language as LanguagePref;
  if (typeof d.lastName === "string") out.lastName = d.lastName.slice(0, MAX_NAME);
  return out;
}

function clone(p: Prefs): Prefs {
  return { ...p };
}

export function getPrefs(): Prefs {
  if (memory) return clone(memory);
  const ls = storage();
  let p: Prefs = sanitize(null);
  if (ls) {
    try {
      const raw = ls.getItem(PREFS_KEY);
      if (raw !== null) p = sanitize(JSON.parse(raw));
      else p = sanitize(null);
      if (raw !== null) ls.setItem(PREFS_KEY, JSON.stringify(p));
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

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key !== PREFS_KEY || event.newValue === null) return;
    let data: unknown;
    try {
      data = JSON.parse(event.newValue);
    } catch {
      return;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) return;

    const next = sanitize(data);
    memory = next;
    const ls = storage();
    if (ls) {
      try {
        ls.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Quota exceeded or storage blocked: keep the in-memory copy.
      }
    }
    for (const cb of listeners) cb(clone(next));
  });
}

/** Test helper: drop the in-memory copy and listeners. */
export function _resetPrefsForTests(): void {
  memory = null;
  listeners.clear();
}

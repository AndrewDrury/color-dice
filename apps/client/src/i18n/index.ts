/** Tiny i18n layer: English is always loaded; French and Spanish load on demand (bundle budget). */
import { useEffect, useState } from "preact/hooks";
import { getPrefs, type LanguagePref, setPrefs } from "../prefs";
import { en } from "./en";

export type Locale = "en" | "fr" | "es";
export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
type PluralKey = { [K in MessageKey]: K extends `${infer B}_other` ? B : never }[MessageKey];
type Vars = Record<string, string | number>;

export const LOCALES: readonly Locale[] = ["en", "fr", "es"];
/** Language names are shown in their own language and are never translated. */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  en: "English",
  fr: "Français",
  es: "Español",
};

const LOADERS: Record<Exclude<Locale, "en">, () => Promise<Messages>> = {
  fr: () => import("./fr").then((m) => m.fr),
  es: () => import("./es").then((m) => m.es),
};

const catalogs: Partial<Record<Locale, Messages>> = { en };
let current: Locale = "en";
let seq = 0;
const listeners = new Set<(l: Locale) => void>();

const isLocale = (v: unknown): v is Locale => v === "en" || v === "fr" || v === "es";

/** First of the browser's languages whose primary subtag is en / fr / es, else English. */
export function resolveLocale(
  pref: LanguagePref,
  languages: readonly string[] = globalThis.navigator?.languages ?? [],
): Locale {
  if (pref !== "auto") return pref;
  for (const tag of languages) {
    const primary = String(tag).toLowerCase().split(/[-_]/)[0];
    if (isLocale(primary)) return primary;
  }
  return "en";
}

export function getLocale(): Locale {
  return current;
}

/** Load a locale's catalog (no-op when loaded). Failures leave English in place. */
async function ensureLoaded(locale: Locale): Promise<void> {
  if (catalogs[locale] || locale === "en") return;
  try {
    catalogs[locale] = await LOADERS[locale]();
  } catch {
    // Offline or a stale chunk: stay on the current language.
  }
}

function commit(locale: Locale): void {
  current = locale;
  try {
    document.documentElement.lang = locale;
  } catch {
    // No document (non-DOM tests).
  }
  for (const cb of listeners) cb(locale);
}

/** Resolve a preference, load its catalog, then switch (latest call wins). */
export async function applyLanguage(pref: LanguagePref = getPrefs().language): Promise<void> {
  const locale = resolveLocale(pref);
  const mine = ++seq;
  await ensureLoaded(locale);
  if (mine !== seq) return;
  commit(catalogs[locale] ? locale : "en");
}

/** Settings control: persist the choice and switch live. */
export function setLanguage(pref: LanguagePref): Promise<void> {
  setPrefs({ language: pref });
  return applyLanguage(pref);
}

/** Call once before the first render so the page never flashes English. */
export const initI18n = applyLanguage;

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function t(key: MessageKey, vars?: Vars): string {
  const text = catalogs[current]?.[key] ?? en[key] ?? key;
  return interpolate(text, vars);
}

/** Plural form: `base_one` / `base_other` chosen by `Intl.PluralRules`; `{count}` is filled in. */
export function tn(base: PluralKey, count: number, vars?: Vars): string {
  const rule = new Intl.PluralRules(current).select(count);
  const cat = catalogs[current];
  const one = `${base}_${rule}` as MessageKey;
  const key = (cat?.[one] !== undefined ? one : `${base}_other`) as MessageKey;
  return t(key, { ...vars, count });
}

/** Subscribe a component to locale changes (re-renders on switch, even inside memo()). */
export function useLocale(): Locale {
  const [l, setL] = useState(current);
  useEffect(() => {
    setL(current);
    listeners.add(setL);
    return () => {
      listeners.delete(setL);
    };
  }, []);
  return l;
}

export function useT(): typeof t {
  useLocale();
  return t;
}

/** Name of a colour (capitalised) or its lower-case form. */
export const colorName = (c: string): string => t(`color.${c}` as MessageKey);
/** Colour as used in a die label ("Red die", "Dé rouge"). */
export const dieColor = (c: string): string => t(`dieColor.${c}` as MessageKey);
export const colorLower = (c: string): string => t(`colorLower.${c}` as MessageKey);
export const colorLetter = (c: string): string => t(`colorLetter.${c}` as MessageKey);

/** "A, B and C" in the active language. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${t("list.and")} ${names[names.length - 1]}`;
}

/** Local time as "14:05" (24 h) in the active language's digits. */
export function clockTime(ms: number): string {
  return new Intl.DateTimeFormat(current, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

export function fmtNumber(n: number): string {
  return new Intl.NumberFormat(current).format(n);
}

// ---- error text (moved from the old src/i18n.ts; signatures unchanged) ----

function has<T extends object>(table: T, key: string): key is Extract<keyof T, string> {
  return Object.hasOwn(table, key);
}

/** Map an error code (+ optional reason) to text. Unknown codes → the generic message. */
export function errorText(code: string, reason?: string): string {
  if (code === "E_ILLEGAL_MARK" && reason !== undefined) {
    const k = `err.illegal.${reason}`;
    if (has(en, k)) return t(k);
  }
  const k = `err.${code}`;
  if (code.startsWith("E_") && has(en, k)) return t(k);
  return t("err.generic");
}

/** Friendly text for chat / reaction errors (I2); the code decides, nothing else is shown. */
export function chatErrorText(code: string): string {
  if (code === "E_RATE_LIMITED") return t("err.chatSlow");
  return errorText(code);
}

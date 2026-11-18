import { useEffect, useState } from "preact/hooks";
import { getPrefs, onPrefs } from "../prefs";

const QUERY = "(prefers-reduced-motion: reduce)";

function mediaQuery(): MediaQueryList | null {
  try {
    return typeof globalThis.matchMedia === "function" ? globalThis.matchMedia(QUERY) : null;
  } catch {
    return null;
  }
}

/** Settings → Motion wins; "system" follows the OS setting (H4 reduced motion). */
export function reducedMotion(): boolean {
  const pref = getPrefs().motion;
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return mediaQuery()?.matches ?? false;
}

/** Re-renders when either the preference or the OS setting changes. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => {
    const update = () => setReduced(reducedMotion());
    update();
    const off = onPrefs(update);
    const mq = mediaQuery();
    mq?.addEventListener?.("change", update);
    return () => {
      off();
      mq?.removeEventListener?.("change", update);
    };
  }, []);
  return reduced;
}

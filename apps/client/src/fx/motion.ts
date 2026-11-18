import { useCallback, useEffect, useRef, useState } from "preact/hooks";
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

/** Enter 210 ms, exit 170 ms (K5.3); the exit state keeps the node mounted until it is done. */
export const EXIT_MS = 180;

/**
 * Presence with an exit phase: `mounted` stays true for `ms` after `open` turns false so the
 * leave animation (class `mo-exit` while `closing`) can finish before the node is removed.
 */
export function useExitAnimation(
  open: boolean,
  ms = EXIT_MS,
): { mounted: boolean; closing: boolean } {
  const [hold, setHold] = useState(false);
  const was = useRef(open);
  useEffect(() => {
    if (open) {
      was.current = true;
      setHold(false);
      return;
    }
    if (!was.current) return;
    was.current = false;
    setHold(true);
    const id = setTimeout(() => setHold(false), ms);
    return () => clearTimeout(id);
  }, [open, ms]);
  return { mounted: open || hold, closing: !open && hold };
}

/** For overlays closed by their own controls: `dismiss()` plays the exit, then calls `onClose`. */
export function useDismiss(onClose: () => void, ms = EXIT_MS): [boolean, () => void] {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => () => clearTimeout(timer.current), []);
  const dismiss = useCallback(() => {
    if (timer.current !== undefined) return;
    setClosing(true);
    timer.current = setTimeout(() => cb.current(), ms);
  }, [ms]);
  return [closing, dismiss];
}

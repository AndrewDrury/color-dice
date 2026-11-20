/** Modal helpers: a Tab trap, `inert` for the rest of the app, and focus restore (T-FIX-12). */
import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

const TABBABLE =
  // i18n-ok: CSS selector, not user-facing copy.
  "input:not([disabled]), button:not([disabled]), a[href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** True while any `aria-modal` dialog is mounted: global shortcuts stand down. */
export function modalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/** Marks everything outside `root` (siblings of it and of each ancestor up to <body>) as inert. */
function inertOutside(root: HTMLElement): () => void {
  const marked: Element[] = [];
  for (let el: HTMLElement | null = root; el && el !== document.body; el = el.parentElement) {
    for (const sib of Array.from(el.parentElement?.children ?? [])) {
      if (sib === el || sib.hasAttribute("inert") || sib.tagName === "SCRIPT") continue;
      sib.setAttribute("inert", "");
      marked.push(sib);
    }
  }
  return () => {
    for (const m of marked) m.removeAttribute("inert");
  };
}

/**
 * Traps Tab / Shift+Tab inside `root`, makes the rest of the app inert while mounted, and on unmount
 * puts focus back on the opener (or `fallback()` when the opener is gone or was <body>).
 */
export function useModalTrap(
  root: RefObject<HTMLElement | null>,
  fallback?: () => HTMLElement | null,
) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;
    const release = inertOutside(el);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return; // i18n-ok: keyboard key token.
      const items = Array.from(el.querySelectorAll<HTMLElement>(TABBABLE));
      const head = items[0];
      const tail = items[items.length - 1];
      if (!head || !tail) {
        e.preventDefault();
        return;
      }
      const at = document.activeElement;
      if (!el.contains(at)) {
        e.preventDefault();
        head.focus();
      } else if (e.shiftKey && at === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && at === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      release();
      // After the commit that unmounts the modal (the page behind may be un-hidden in that same commit).
      requestAnimationFrame(() => {
        const back =
          opener && opener !== document.body && opener.isConnected
            ? opener
            : (fallback?.() ?? null);
        back?.focus?.();
      });
    };
  }, []);
}

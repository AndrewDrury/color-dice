/**
 * Dialog behaviour for the chat panel: focus the textarea at once (so the user can type straight
 * after pressing Chat, raising the keyboard on phones), Esc / backdrop close, Tab trap, focus
 * returns to the chat button, and the sheet tracks the visual viewport so the input stays above
 * the on-screen keyboard.
 */
import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

// i18n-ok: CSS selector, not user-facing copy.
const FOCUSABLE = "input, button, a[href], select, textarea, [tabindex]:not([tabindex='-1'])";

export function useChatSheet(o: {
  sheet: RefObject<HTMLElement | null>;
  backdrop: RefObject<HTMLElement | null>;
  area: RefObject<HTMLTextAreaElement | null>;
  /** True while the in-chat reaction picker is open: Esc then closes the picker only. */
  pickerOpen: RefObject<boolean>;
  onClose: () => void;
}): void {
  const close = useRef(o.onClose);
  close.current = o.onClose;

  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    o.area.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // i18n-ok: keyboard key token.
      if (e.key === "Escape") {
        if (o.pickerOpen.current) return;
        e.preventDefault();
        close.current();
        return;
      }
      const root = o.sheet.current;
      if (e.key !== "Tab" || !root) return; // i18n-ok: keyboard key token.
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !(el as HTMLButtonElement).disabled,
      );
      const head = items[0];
      const tail = items[items.length - 1];
      if (!head || !tail) return;
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    const bd = o.backdrop.current;
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === bd) close.current();
    };
    bd?.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);

    // Keyboard-aware: pin the backdrop to the visual viewport (iOS keeps the layout viewport tall).
    const vv = window.visualViewport;
    const fit = () => {
      if (!vv || !bd) return;
      bd.style.setProperty("--vv-top", `${vv.offsetTop}px`);
      bd.style.setProperty("--vv-h", `${vv.height}px`);
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);

    return () => {
      bd?.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      const back =
        opener && opener !== document.body && opener.isConnected
          ? opener
          : document.querySelector<HTMLElement>(".chat-btn");
      back?.focus?.();
    };
  }, []);
}

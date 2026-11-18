/** Bottom sheet on phones, anchored popover from 1024 px (H12). Esc / backdrop close, focus trap. */
import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import { useDismiss } from "../fx/motion";
import { t } from "../i18n";
import "../styles/motion.css";

export interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** Set by a parent that animates the exit itself (it removes the sheet after the animation). */
  closing?: boolean;
}

const FOCUSABLE = "input, button, a[href], select, textarea, [tabindex]:not([tabindex='-1'])";

export function BottomSheet({ title, onClose, children, closing }: BottomSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [selfClosing, dismiss] = useDismiss(onClose);
  const external = closing !== undefined;
  const request = external ? onClose : dismiss;
  const out = external ? closing : selfClosing;
  const closeRef = useRef(request);
  closeRef.current = request;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
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
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === backdrop.current) closeRef.current();
    };
    const bd = backdrop.current;
    bd?.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    return () => {
      bd?.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    <div ref={backdrop} class={`bs-backdrop mo-fade${out ? " mo-exit" : ""}`}>
      <div
        ref={ref}
        class={`bs-sheet${out ? " is-leaving" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div class="bs-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" class="btn" aria-label={t("common.close")} onClick={request}>
            ✕
          </button>
        </div>
        <div class="bs-body stack">{children}</div>
      </div>
    </div>
  );
}

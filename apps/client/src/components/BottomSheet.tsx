/** Bottom sheet on phones, anchored popover from 1024 px (H12). Esc / backdrop close, focus trap. */
import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

export interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

const FOCUSABLE = "input, button, a[href], select, textarea, [tabindex]:not([tabindex='-1'])";

export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

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
    <div ref={backdrop} class="bs-backdrop">
      <div ref={ref} class="bs-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div class="bs-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" class="btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div class="bs-body stack">{children}</div>
      </div>
    </div>
  );
}

import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import { t } from "../i18n";

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

const FOCUSABLE = "input, button, a[href], select, textarea, [tabindex]:not([tabindex='-1'])";

/**
 * Modal card over a dimmed backdrop. Escape or the backdrop closes it, focus moves
 * into it on open, Tab stays inside, and focus goes back to the opener on close.
 */
export function Dialog({ title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first =
      ref.current?.querySelector<HTMLElement>("input") ??
      ref.current?.querySelector<HTMLElement>("button");
    first?.focus();
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
    // A click on the dimmed backdrop (not the card) closes; keyboard users have Escape.
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
    <div
      ref={backdrop}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--gutter)",
        background: "rgb(0 0 0 / 0.45)",
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        class="card stack"
        style={{ width: "100%", maxWidth: "420px", maxHeight: "100%", overflowY: "auto" }}
      >
        <div class="row" style={{ justifyContent: "space-between" }}>
          <h2 id={titleId} style={{ fontSize: "var(--fs-large)", overflowWrap: "anywhere" }}>
            {title}
          </h2>
          <button type="button" class="btn" aria-label={t("common.close")} onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

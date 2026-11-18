import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

/** Simple local bottom sheet (T17b swaps it for the shared BottomSheet). Esc / backdrop close. */
export function SheetPanel(props: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const id = useId();
  const close = useRef(props.onClose);
  close.current = props.onClose;
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    card.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      opener?.focus?.();
    };
  }, []);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click; Esc is on the document
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled on the document
    <div
      class="g-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div ref={card} class="g-panel card" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div class="row" style={{ justifyContent: "space-between" }}>
          <h2 id={id} style={{ fontSize: "var(--fs-large)" }}>
            {props.title}
          </h2>
          <button type="button" class="btn" aria-label="Close" onClick={props.onClose}>
            ✕
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

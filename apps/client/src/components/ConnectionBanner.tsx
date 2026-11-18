import { useEffect, useRef, useState } from "preact/hooks";
import { useAppState } from "../store";

const SHOW_AFTER_MS = 1000;
const ONLINE_FOR_MS = 2000;

/** Slim pill under the top bar: "Reconnecting…" after 1 s offline, "Back online" for 2 s. */
export function ConnectionBanner() {
  const { status } = useAppState();
  const [text, setText] = useState("");
  const shown = useRef(false);

  useEffect(() => {
    if (status === "reconnecting") {
      const t = setTimeout(() => {
        shown.current = true;
        setText("Reconnecting…");
      }, SHOW_AFTER_MS);
      return () => clearTimeout(t);
    }
    if (status === "online" && shown.current) {
      shown.current = false;
      setText("Back online");
      const t = setTimeout(() => setText(""), ONLINE_FOR_MS);
      return () => clearTimeout(t);
    }
    shown.current = false;
    setText("");
  }, [status]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: "calc(56px + env(safe-area-inset-top))",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      {text ? (
        <span
          data-testid="conn-banner"
          style={{
            padding: "var(--s1) var(--s3)",
            borderRadius: "var(--r-pill)",
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: "var(--fs-small)",
            fontWeight: "var(--fw-bold)",
          }}
        >
          {text}
        </span>
      ) : null}
    </div>
  );
}

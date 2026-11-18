import { useEffect, useRef, useState } from "preact/hooks";
import { t, useT } from "../i18n";
import { useAppState } from "../store";

const SHOW_AFTER_MS = 1000;
const ONLINE_FOR_MS = 2000;

/** Slim pill under the top bar: "Reconnecting…" after 1 s offline, "Back online" for 2 s. */
export function ConnectionBanner() {
  useT();
  const { status } = useAppState();
  const [kind, setKind] = useState<"" | "reconnecting" | "online">("");
  const shown = useRef(false);

  useEffect(() => {
    if (status === "reconnecting") {
      const timer = setTimeout(() => {
        shown.current = true;
        setKind("reconnecting");
      }, SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }
    if (status === "online" && shown.current) {
      shown.current = false;
      setKind("online");
      const timer = setTimeout(() => setKind(""), ONLINE_FOR_MS);
      return () => clearTimeout(timer);
    }
    shown.current = false;
    setKind("");
  }, [status]);
  const text =
    kind === "reconnecting"
      ? t("conn.reconnecting")
      : kind === "online"
        ? t("conn.backOnline")
        : "";

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

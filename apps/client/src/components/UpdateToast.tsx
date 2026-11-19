import { useEffect, useState } from "preact/hooks";
import { useT } from "../i18n";
import { onUpdateWaiting } from "../update";

/** Small non-blocking note shown only when an update has waited a long time for the player to be idle. */
export function UpdateToast() {
  const t = useT();
  const [waiting, setWaiting] = useState(false);
  useEffect(() => onUpdateWaiting(setWaiting), []);
  if (!waiting) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="update-toast"
      style={{
        position: "fixed",
        top: "calc(12px + env(safe-area-inset-top))",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "var(--s2) var(--s4)",
        borderRadius: "var(--r-button)",
        background: "var(--ink)",
        color: "var(--paper)",
        fontWeight: "var(--fw-bold)",
        zIndex: 40,
      }}
    >
      {t("update.updating")}
    </div>
  );
}

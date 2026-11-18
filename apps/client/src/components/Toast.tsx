import { useEffect } from "preact/hooks";
import { dismissToast, useAppState } from "../store";

const TOAST_MS = 5000;
const INFO_STYLE = {
  position: "fixed",
  left: "50%",
  bottom: "calc(24px + env(safe-area-inset-bottom))",
  transform: "translateX(-50%)",
  maxWidth: "calc(100% - 2 * var(--gutter))",
  padding: "var(--s3) var(--s4)",
  borderRadius: "var(--r-button)",
  background: "var(--ink)",
  color: "var(--paper)",
  fontWeight: "var(--fw-bold)",
  zIndex: 40,
} as const;

/** App-level info toast (e.g. "session ended"). Error toasts are drawn by the game screen. */
export function Toast() {
  const { toast } = useAppState();
  const id = toast?.id;
  useEffect(() => {
    if (id === undefined) return;
    const t = setTimeout(() => dismissToast(id), TOAST_MS);
    return () => clearTimeout(t);
  }, [id]);
  return (
    <div
      role="status"
      aria-live="polite"
      class={toast?.kind === "info" ? undefined : "sr-only"}
      style={toast?.kind === "info" ? INFO_STYLE : undefined}
    >
      {toast?.text ?? ""}
    </div>
  );
}

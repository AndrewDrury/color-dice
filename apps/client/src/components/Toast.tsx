import { useEffect, useRef } from "preact/hooks";
import { useExitAnimation } from "../fx/motion";
import { dismissToast, useAppState } from "../store";
import "../styles/motion.css";

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
  const info = toast?.kind === "info";
  const last = useRef("");
  if (info && toast) last.current = toast.text;
  const { mounted, closing } = useExitAnimation(info);
  const visible = info || mounted;
  return (
    <div
      role="status"
      aria-live="polite"
      class={visible ? `mo-toast${closing ? " mo-exit" : " mo-enter"}` : "sr-only"}
      style={visible ? INFO_STYLE : undefined}
    >
      {toast?.text ?? (visible ? last.current : "")}
    </div>
  );
}

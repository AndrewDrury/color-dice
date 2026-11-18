/** Transient `Name: message` toasts at the top (never intercept taps) + the polite live region. */
import { useEffect, useState } from "preact/hooks";
import { dropToast, seatName, type TextEntry, useChat } from "../chat/store";
import { EXIT_MS } from "../fx/motion";
import "../styles/motion.css";

export const TOAST_MS = 4000;

function ToastItem({ entry }: { entry: TextEntry }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const out = setTimeout(() => setLeaving(true), TOAST_MS - EXIT_MS);
    const drop = setTimeout(() => dropToast(entry.id), TOAST_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(drop);
    };
  }, [entry.id]);
  return (
    <p class={`chat-toast mo-enter${leaving ? " mo-exit" : ""}`} aria-hidden="true">
      <b>{seatName(entry.seatId)}:</b> {entry.text}
    </p>
  );
}

export function ChatToasts() {
  const { toasts, announce } = useChat();
  return (
    <>
      <div class="chat-toasts" data-testid="chat-toasts">
        {toasts.map((t) => (
          <ToastItem key={t.id} entry={t} />
        ))}
      </div>
      <p class="sr-only" role="status" aria-live="polite" data-testid="chat-live">
        {announce?.text ?? ""}
      </p>
    </>
  );
}

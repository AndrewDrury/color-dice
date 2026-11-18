/** Transient `Name: message` toasts at the top (never intercept taps) + the polite live region. */
import { useEffect } from "preact/hooks";
import { dropToast, seatName, type TextEntry, useChat } from "../chat/store";

const TOAST_MS = 4000;

function ToastItem({ entry }: { entry: TextEntry }) {
  useEffect(() => {
    const t = setTimeout(() => dropToast(entry.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [entry.id]);
  return (
    <p class="chat-toast" aria-hidden="true">
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

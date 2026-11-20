/** Transient avatar + coloured-bubble toasts (no names) at the top (never intercept taps) + the polite live region. */
import { useEffect, useState } from "preact/hooks";
import { dropToast, seatProfile, type TextEntry, useChat } from "../chat/store";
import { EXIT_MS } from "../fx/motion";
import "../styles/motion.css";
import { Avatar } from "./Avatar";

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
  const profile = seatProfile(entry.seatId);
  return (
    <p
      class={`chat-toast pc-${profile?.color ?? "slate"} mo-enter${leaving ? " mo-exit" : ""}`}
      aria-hidden="true"
    >
      {profile ? <Avatar profile={profile} size={24} /> : null}
      <span class="chat-toast-text">{entry.text}</span>
    </p>
  );
}

export function ChatToasts() {
  const { toasts, announce, panelOpen } = useChat();
  return (
    <>
      <div class="chat-toasts" data-testid="chat-toasts">
        {(panelOpen ? [] : toasts).map((t) => (
          <ToastItem key={t.id} entry={t} />
        ))}
      </div>
      <p class="sr-only" role="status" aria-live="polite" data-testid="chat-live">
        {announce?.text ?? ""}
      </p>
    </>
  );
}

/** Chat log + input (I3). Own lines appear only after the server echo. Text nodes only. */
import { CHAT_TEXT_MAX, type ClientMessage } from "@cd/protocol";
import { useEffect, useRef } from "preact/hooks";
import { closePanel, seatName, setDraft, setSending, useChat } from "../chat/store";
import { chatErrorText } from "../i18n";
import { getState } from "../store";
import { BottomSheet } from "./BottomSheet";

export function ChatPanel({ send }: { send: (m: ClientMessage) => boolean }) {
  const { messages, draft, sending, error } = useChat();
  const log = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const me = getState().view?.you.seatId;

  useEffect(() => {
    const el = log.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (send({ type: "chat", text })) setSending(true);
  };

  return (
    <BottomSheet title="Chat" onClose={closePanel}>
      <div class="chat-panel">
        <div
          ref={log}
          class="chat-log"
          role="log"
          aria-label="Chat messages"
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
        >
          {messages.length === 0 ? <p class="muted">No messages yet.</p> : null}
          {messages.map((m) => (
            <p key={m.id} class={`chat-line${m.seatId === me ? " is-mine" : ""}`}>
              <span class="chat-who">{seatName(m.seatId)}</span> · <span>{m.text}</span>
            </p>
          ))}
        </div>
        <form
          class="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            class="chat-input"
            type="text"
            aria-label="Message"
            placeholder="Say something"
            enterkeyhint="send"
            autocomplete="off"
            maxLength={CHAT_TEXT_MAX}
            value={draft}
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
          <button type="submit" class="btn" disabled={sending || draft.trim() === ""}>
            Send
          </button>
        </form>
        <p class="chat-status muted" role="status" aria-live="polite">
          {error ? chatErrorText(error) : sending ? "sending…" : ""}
        </p>
      </div>
    </BottomSheet>
  );
}

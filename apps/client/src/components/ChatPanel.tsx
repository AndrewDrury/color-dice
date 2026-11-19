/** Chat log + input (I3). Own lines appear only after the server echo. Text nodes only. */
import { CHAT_TEXT_MAX, type ClientMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { closePanel, seatName, setDraft, setSending, useChat } from "../chat/store";
import { chatErrorText, t, useT } from "../i18n";
import { getState } from "../store";
import { BottomSheet } from "./BottomSheet";
import { CatReaction, REACTION_BUTTON_IMAGE, reactionUrl } from "./CatReaction";
import { ReactionPicker } from "./ReactionPicker";

export function ChatPanel({
  send,
  closing = false,
}: {
  send: (m: ClientMessage) => boolean;
  closing?: boolean;
}) {
  useT();
  const { messages, draft, sending, error } = useChat();
  const log = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [touching, setTouching] = useState(false);
  const [reactionPicker, setReactionPicker] = useState(false);
  const touchEnd = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(touchEnd.current), []);
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
    <BottomSheet title={t("chat.title")} onClose={closePanel} closing={closing}>
      <div class="chat-panel">
        <div
          ref={log}
          class={`chat-log${touching ? " is-touch" : ""}`}
          onTouchStart={() => {
            clearTimeout(touchEnd.current);
            setTouching(true);
          }}
          onTouchEnd={() => {
            touchEnd.current = setTimeout(() => setTouching(false), 1200);
          }}
          role="log"
          aria-label={t("chat.messages")}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
        >
          {messages.length === 0 ? <p class="muted">{t("chat.empty")}</p> : null}
          {messages.map((m) => (
            <p key={m.id} class={`chat-line${m.seatId === me ? " is-mine" : ""}`}>
              {m.kind === "text" ? (
                <>
                  <span class="chat-who">{seatName(m.seatId)}</span> · <span>{m.text}</span>
                </>
              ) : (
                <>
                  <span class="chat-who">{seatName(m.seatId)}</span> ·
                  <CatReaction id={m.emoji} size={72} />
                </>
              )}
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
            aria-label={t("chat.message")}
            placeholder={t("chat.placeholder")}
            enterkeyhint="send"
            autocomplete="off"
            maxLength={CHAT_TEXT_MAX}
            value={draft}
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
          <button
            type="button"
            class="btn chat-rx-toggle"
            aria-label={t("chat.reactionSend")}
            aria-expanded={reactionPicker ? "true" : "false"}
            onClick={() => setReactionPicker((open) => !open)}
          >
            <img
              src={reactionUrl(REACTION_BUTTON_IMAGE)}
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
            />
          </button>
          <button type="submit" class="btn" disabled={sending || draft.trim() === ""}>
            {t("chat.send")}
          </button>
        </form>
        {reactionPicker ? (
          <ReactionPicker
            inChat
            onClose={() => setReactionPicker(false)}
            onPick={(emoji) => {
              send({ type: "react", emoji });
              setReactionPicker(false);
            }}
          />
        ) : null}
        <p class="chat-status muted" role="status" aria-live="polite">
          {error ? chatErrorText(error) : sending ? t("chat.sending") : ""}
        </p>
      </div>
    </BottomSheet>
  );
}

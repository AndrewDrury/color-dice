/**
 * Chat panel (T-NEW-31): a messenger-style dialog. Own messages sit on the right, everyone
 * else's on the left, each bubble in its sender's player colour next to their avatar; names are
 * never shown (screen readers get an sr-only "<name> says"). The textarea is focused as soon as
 * the panel mounts so you can type straight after pressing Chat. Own lines appear only after
 * the server echo. Text nodes only.
 */
import { CHAT_TEXT_MAX, type ChatEntry, type ClientMessage } from "@cd/protocol";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useChatSheet } from "../chat/sheet";
import { closePanel, seatName, seatProfile, setDraft, setSending, useChat } from "../chat/store";
import { chatErrorText, t, useT } from "../i18n";
import { getState } from "../store";
import { Avatar } from "./Avatar";
import { CatReaction, REACTION_BUTTON_IMAGE, reactionUrl } from "./CatReaction";
import { ReactionPicker } from "./ReactionPicker";
import "../styles/chat.css";

const MAX_INPUT_LINES = 6;
/** Counter appears once this few code points remain. */
const COUNTER_AT = 100;

const cps = (s: string): number => {
  let n = 0;
  for (const _ of s) n += 1;
  return n;
};

function clip(s: string): string {
  return cps(s) > CHAT_TEXT_MAX ? Array.from(s).slice(0, CHAT_TEXT_MAX).join("") : s;
}

function clock(at: number): string {
  try {
    return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function Bubble({
  m,
  mine,
  first,
  last,
  stamped,
  onToggle,
}: {
  m: ChatEntry;
  mine: boolean;
  first: boolean;
  last: boolean;
  stamped: boolean;
  onToggle: () => void;
}) {
  const profile = seatProfile(m.seatId);
  const color = profile?.color ?? "slate";
  const cls =
    `chat-row pc-${color} ${mine ? "is-mine" : "is-other"}` +
    `${first ? " is-first" : ""}${last ? " is-last" : ""}${stamped ? " is-stamped" : ""}`;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: tap reveals the time; it is always in the DOM for assistive tech and shown on hover with a mouse
    <div class={cls} data-seat={m.seatId} onClick={onToggle}>
      <span class="chat-av">
        {last ? (
          profile ? (
            <Avatar profile={profile} size={32} />
          ) : (
            <span class="chat-av-ph" />
          )
        ) : null}
      </span>
      <div class="chat-col">
        <div title={clock(m.at)} class={`chat-b${m.kind === "reaction" ? " chat-b-media" : ""}`}>
          <span class="sr-only">{t("chat.from", { name: seatName(m.seatId) })} </span>
          {m.kind === "text" ? (
            <span class="chat-text">{m.text}</span>
          ) : (
            <CatReaction id={m.emoji} size={112} />
          )}
        </div>
        <time class="chat-time" dateTime={new Date(m.at).toISOString()}>
          {clock(m.at)}
        </time>
      </div>
    </div>
  );
}

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
  const area = useRef<HTMLTextAreaElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [reactionPicker, setReactionPicker] = useState(false);
  const pickerOpen = useRef(false);
  pickerOpen.current = reactionPicker;
  const [stamp, setStamp] = useState<number | null>(null);
  const titleId = useId();
  const me = getState().view?.you.seatId;

  // Focus + focus return + Esc + keyboard-aware sizing + Tab trap.
  useChatSheet({ sheet, backdrop, area, pickerOpen, onClose: closePanel });

  // Newest message stays in view unless the reader scrolled up; own sends always jump down.
  const lastMine = messages.length > 0 && messages[messages.length - 1]?.seatId === me;
  useLayoutEffect(() => {
    const el = log.current;
    if (el && (pinned.current || lastMine)) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMine]);

  // Auto-grow from one line to MAX_INPUT_LINES, then scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draft drives the measurement
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    const lh = Number.parseFloat(cs.lineHeight);
    const fs = Number.parseFloat(cs.fontSize) || 16;
    // `line-height` may be unitless (1.4) or "normal".
    const line = Number.isNaN(lh) ? fs * 1.4 : cs.lineHeight.endsWith("px") ? lh : fs * lh;
    const pad =
      (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0);
    const max = line * MAX_INPUT_LINES + pad;
    const h = el.scrollHeight;
    el.style.height = `${Math.min(h, max)}px`;
    el.style.overflowY = h > max ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (send({ type: "chat", text })) setSending(true);
    area.current?.focus({ preventScroll: true });
  };

  const left = CHAT_TEXT_MAX - cps(draft);
  const empty = draft.trim() === "";

  return (
    <div ref={backdrop} class={`bs-backdrop chat-backdrop mo-fade${closing ? " mo-exit" : ""}`}>
      <div
        ref={sheet}
        class={`bs-sheet chat-sheet${closing ? " is-leaving" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div class="chat-head">
          <h2 id={titleId}>{t("chat.title")}</h2>
          <button type="button" class="btn" aria-label={t("common.close")} onClick={closePanel}>
            ✕
          </button>
        </div>
        <div class="chat-panel">
          <div
            ref={log}
            class="chat-log"
            role="log"
            aria-label={t("chat.messages")}
            onScroll={(e) => {
              const el = e.currentTarget;
              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            {messages.length === 0 ? <p class="chat-empty">{t("chat.empty")}</p> : null}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              return (
                <Bubble
                  key={m.id}
                  m={m}
                  mine={m.seatId === me}
                  first={prev?.seatId !== m.seatId}
                  last={next?.seatId !== m.seatId}
                  stamped={stamp === m.id}
                  onToggle={() => setStamp(stamp === m.id ? null : m.id)}
                />
              );
            })}
          </div>
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
          <form
            class="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
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
            <div class="chat-field">
              <textarea
                ref={area}
                class="chat-input"
                rows={1}
                aria-label={t("chat.message")}
                placeholder={t("chat.placeholder")}
                enterkeyhint="send"
                autocomplete="off"
                autocapitalize="sentences"
                value={draft}
                onInput={(e) => {
                  const v = clip(e.currentTarget.value);
                  if (v !== e.currentTarget.value) e.currentTarget.value = v;
                  setDraft(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              {left <= COUNTER_AT ? (
                <span class={`chat-count${left <= 20 ? " is-low" : ""}`} aria-hidden="true">
                  {cps(draft)}/{CHAT_TEXT_MAX}
                </span>
              ) : null}
            </div>
            <button
              type="submit"
              class="btn chat-send"
              aria-label={t("chat.send")}
              disabled={sending || empty}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.5 2-12.5 2z" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

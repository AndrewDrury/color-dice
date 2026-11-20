/** Chat button with unread badge, plus the shared controls / layer mounted by each screen. */
import type { ClientMessage } from "@cd/protocol";
import type { ComponentType } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/chat.css";
import { closePanel, getChat, openPanel, useChat } from "../chat/store";
import { useExitAnimation } from "../fx/motion";
import { t, useT } from "../i18n";
import { getState } from "../store";
import { ChatToasts } from "./ChatToasts";
import { ReactionButton } from "./ReactionButton";
import { ReactionFloat } from "./ReactionFloat";
import { usePrefs } from "./Settings";

type Send = (m: ClientMessage) => boolean;
type PanelProps = { send: Send; closing?: boolean };

/** The panel is a lazy chunk (kept out of the initial bundle); warmed on idle / hover so Chat opens instantly. */
let panelChunk: Promise<ComponentType<PanelProps>> | undefined;
function loadPanel(): Promise<ComponentType<PanelProps>> {
  panelChunk ??= import("./ChatPanel").then((m) => m.ChatPanel);
  return panelChunk;
}

export function ChatButton() {
  useT();
  const { unread, panelOpen } = useChat();
  const { showChat } = usePrefs();
  const n = showChat ? unread : 0;
  return (
    <button
      type="button"
      class="btn chat-btn"
      aria-label={n > 0 ? t("chat.openUnread", { n }) : t("chat.open")}
      aria-haspopup="dialog"
      aria-expanded={panelOpen ? "true" : "false"}
      onPointerEnter={() => void loadPanel()}
      onPointerDown={() => void loadPanel()}
      onFocus={() => void loadPanel()}
      onClick={() => (getChat().panelOpen ? closePanel() : openPanel())}
    >
      <svg
        class="icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      </svg>
      {n > 0 ? (
        <span class="chat-badge" aria-hidden="true">
          {n > 9 ? "9+" : n}
        </span>
      ) : null}
    </button>
  );
}

/** The two small buttons, side by side. Mount in the header corner, never in the action bar. */
export function ChatControls({ send }: { send: Send }) {
  return (
    <span class="chat-controls">
      <ReactionButton send={send} />
      <ChatButton />
    </span>
  );
}

/**
 * Toasts, reaction floats, live region and the panel itself: one per screen.
 * On phones the panel closes when it becomes your move, if it was opened on someone else's turn.
 */
export function ChatLayer({
  send,
  myMove = false,
  phone = false,
}: {
  send: Send;
  myMove?: boolean;
  phone?: boolean;
}) {
  const { panelOpen, floats } = useChat();
  const panel = useExitAnimation(panelOpen);
  const [Panel, setPanel] = useState<ComponentType<PanelProps> | null>(null);
  useEffect(() => {
    let live = true;
    const go = () => void loadPanel().then((c) => live && setPanel(() => c));
    if (panelOpen) go();
    const idle = setTimeout(go, 1500);
    return () => {
      live = false;
      clearTimeout(idle);
    };
  }, [panelOpen]);
  const openedOnMyMove = useRef(false);
  const was = useRef(false);
  if (panelOpen && !was.current) openedOnMyMove.current = myMove;
  was.current = panelOpen;
  useEffect(() => {
    if (panelOpen && phone && myMove && !openedOnMyMove.current) closePanel();
  }, [myMove]);
  const mySeat = getState().view?.you.seatId;
  return (
    <>
      <ChatToasts />
      <div class="rx-layer" aria-hidden="true">
        {floats.map((f) => (
          <ReactionFloat key={f.id} entry={f} mine={f.seatId === mySeat} />
        ))}
      </div>
      {panel.mounted && Panel ? <Panel send={send} closing={panel.closing} /> : null}
    </>
  );
}

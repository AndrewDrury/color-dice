/** Chat state (I3): log, unread, draft, transient toasts and reaction floats. Reset on leaving a room. */
import type { ChatEntry, ServerMessage } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import { play } from "../fx/sound";
import { getPrefs } from "../prefs";
import { getState } from "../store";

export const MAX_TOASTS = 2;
export const MAX_FLOATS_PER_SEAT = 3;
const MAX_LOG = 100;

export type TextEntry = Extract<ChatEntry, { kind: "text" }>;
export type ReactionEntry = Extract<ChatEntry, { kind: "reaction" }>;

export interface ChatState {
  messages: TextEntry[];
  unread: number;
  draft: string;
  sending: boolean;
  /** Friendly error for the last failed send; cleared on the next send or edit. */
  error: string | null;
  panelOpen: boolean;
  toasts: TextEntry[];
  floats: ReactionEntry[];
  /** Latest text for the polite live region. */
  announce: { id: number; text: string } | null;
}

const initial = (): ChatState => ({
  messages: [],
  unread: 0,
  draft: "",
  sending: false,
  error: null,
  panelOpen: false,
  toasts: [],
  floats: [],
  announce: null,
});

let state = initial();
const listeners = new Set<(s: ChatState) => void>();
let announceSeq = 0;

function set(patch: Partial<ChatState>): void {
  state = { ...state, ...patch };
  for (const cb of listeners) cb(state);
}

export function getChat(): ChatState {
  return state;
}

export function resetChat(): void {
  state = initial();
  for (const cb of listeners) cb(state);
}

export function useChat(): ChatState {
  const [s, setS] = useState(state);
  useEffect(() => {
    setS(state);
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

/** Display name for a seat, or a neutral fallback (renames and kicks resolve through the view). */
export function seatName(seatId: string): string {
  return getState().view?.seats.find((s) => s.seatId === seatId)?.name ?? "Someone";
}

function announce(text: string): void {
  announceSeq += 1;
  set({ announce: { id: announceSeq, text } });
}

function ingestText(e: TextEntry, mine: boolean): void {
  if (state.messages.some((m) => m.id === e.id)) return;
  const messages = [...state.messages, e].slice(-MAX_LOG);
  if (mine) {
    set({ messages, draft: "", sending: false, error: null });
    return;
  }
  const patch: Partial<ChatState> = { messages };
  if (getPrefs().showChat) {
    if (!state.panelOpen) {
      patch.unread = state.unread + 1;
      play("chat");
    }
    patch.toasts = [...state.toasts, e].slice(-MAX_TOASTS);
    announce(`${seatName(e.seatId)} says: ${e.text}`);
  }
  set(patch);
}

function ingestReaction(e: ReactionEntry, mine: boolean): void {
  if (state.floats.some((f) => f.id === e.id)) return;
  if (!mine && !getPrefs().showChat) return;
  if (state.floats.filter((f) => f.seatId === e.seatId).length >= MAX_FLOATS_PER_SEAT) return;
  set({ floats: [...state.floats, e] });
  if (!mine) announce(`${seatName(e.seatId)} reacted ${e.emoji}`);
}

/** Route one server message into the chat store. Returns true when it was a chat message. */
export function routeChat(msg: ServerMessage): boolean {
  const mySeat = getState().view?.you.seatId;
  if (msg.type === "chat") {
    const mine = msg.seatId === mySeat;
    if (msg.kind === "text") ingestText(msg, mine);
    else ingestReaction(msg, mine);
    return true;
  }
  if (msg.type === "chatHistory") {
    const seen = new Set(state.messages.map((m) => m.id));
    const add = msg.messages.filter((m): m is TextEntry => m.kind === "text" && !seen.has(m.id));
    const messages = [...state.messages, ...add].sort((a, b) => a.id - b.id).slice(-MAX_LOG);
    set({ messages });
    return true;
  }
  return false;
}

/** A `chat`/`react` error from the server. Returns true when handled here. */
export function routeChatError(msg: ServerMessage): boolean {
  if (msg.type !== "error" || (msg.command !== "chat" && msg.command !== "react")) return false;
  if (msg.command === "chat") set({ sending: false, error: msg.code });
  return true;
}

export function setDraft(draft: string): void {
  set({ draft, error: null });
}
export function setSending(sending: boolean): void {
  set({ sending, error: null });
}
export function openPanel(): void {
  set({ panelOpen: true, unread: 0 });
}
export function closePanel(): void {
  set({ panelOpen: false });
}
export function clearUnread(): void {
  if (state.unread !== 0) set({ unread: 0 });
}
export function dropToast(id: number): void {
  if (state.toasts.some((t) => t.id === id))
    set({ toasts: state.toasts.filter((t) => t.id !== id) });
}
export function dropFloat(id: number): void {
  if (state.floats.some((f) => f.id === id))
    set({ floats: state.floats.filter((f) => f.id !== id) });
}

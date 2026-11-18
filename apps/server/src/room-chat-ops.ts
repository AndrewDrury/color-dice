/**
 * Chat + reactions (I2). Chat is not part of the engine view: it never bumps
 * `meta.version`, never triggers a `view`, and text is never logged.
 * Runs inside the room's serial queue.
 */
import {
  CHAT_HISTORY_MAX,
  CHAT_RATE,
  CHAT_TEXT_MAX,
  type ChatEntry,
  type ClientMessage,
  cleanChatText,
  type ErrorCode,
} from "@cd/protocol";
import { seatIdOf } from "./room-lobby-ops";
import type { RoomStore } from "./room-store";

export type ChatInput = Extract<ClientMessage, { type: "chat" | "react" }>;

/** `null` = delivered; `"gone"` = the seat no longer exists (caller ends the session). */
export type ChatResult = null | "gone" | { code: ErrorCode; reason?: string };

interface Window {
  start: number;
  count: number;
}

export class RoomChat {
  /** Fixed-window counters keyed by seatId + kind; reset on DO eviction (fine). */
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly store: RoomStore,
    private readonly sockets: () => WebSocket[],
    private readonly now: () => number,
  ) {}

  private limited(seatId: string, kind: "text" | "react"): boolean {
    const { limit, windowMs } = CHAT_RATE[kind];
    const key = `${kind}:${seatId}`;
    const now = this.now();
    let w = this.windows.get(key);
    if (!w || now - w.start >= windowMs) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    w.count += 1;
    return w.count > limit;
  }

  async handle(seatId: string, msg: ChatInput): Promise<ChatResult> {
    const kind = msg.type === "chat" ? "text" : "react";
    if (!(await this.store.getSeats()).some((s) => s.seatId === seatId)) return "gone";
    if (this.limited(seatId, kind)) return { code: "E_RATE_LIMITED" };
    let text = "";
    if (msg.type === "chat") {
      text = cleanChatText(msg.text);
      if (text.length === 0 || [...text].length > CHAT_TEXT_MAX) {
        return { code: "E_INVALID_COMMAND", reason: "bad text" };
      }
    }
    const chat = await this.store.getChat();
    const base = { id: chat.nextId, seatId, at: this.now() };
    chat.nextId += 1;
    let entry: ChatEntry;
    if (msg.type === "chat") {
      entry = { ...base, kind: "text", text };
      chat.messages = [...chat.messages, entry].slice(-CHAT_HISTORY_MAX);
    } else {
      entry = { ...base, kind: "reaction", emoji: msg.emoji };
    }
    await this.store.putChat(chat);
    const frame = JSON.stringify({ type: "chat", ...entry });
    for (const ws of this.sockets()) {
      if (ws.readyState !== WebSocket.OPEN || seatIdOf(ws) === null) continue;
      try {
        ws.send(frame);
      } catch {
        // socket is closing; ignore
      }
    }
    return null;
  }

  /** The last <= 30 text messages, oldest first. */
  async history(): Promise<ChatEntry[]> {
    return (await this.store.getChat()).messages;
  }
}

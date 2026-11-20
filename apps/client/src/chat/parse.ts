/**
 * Chat frames (I2). Validated here so the shared parser stays untouched. Text is only ever
 * rendered as a text node; this just checks shape and size.
 */
import { CHAT_TEXT_MAX, type ChatEntry, isReaction, type ServerMessage } from "@cd/protocol";

const MAX_CHARS = 64 * 1024;
const MAX_HISTORY = 100;

function entry(v: unknown): ChatEntry | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!Number.isSafeInteger(o.id) || typeof o.seatId !== "string" || o.seatId.length > 32) {
    return null;
  }
  if (typeof o.at !== "number" || !Number.isFinite(o.at)) return null;
  const base = { id: o.id as number, seatId: o.seatId, at: o.at };
  if (o.kind === "text") {
    if (typeof o.text !== "string" || o.text.length === 0 || [...o.text].length > CHAT_TEXT_MAX) {
      return null;
    }
    return { ...base, kind: "text", text: o.text };
  }
  if (o.kind === "reaction" && isReaction(o.emoji))
    return { ...base, kind: "reaction", emoji: o.emoji };
  return null;
}

/** Returns the message when `raw` is a chat / chatHistory frame or a chat/react error, else null. */
export function parseChatFrame(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string" || raw.length > MAX_CHARS) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof o !== "object" || o === null || Array.isArray(o)) return null;
  const m = o as Record<string, unknown>;
  if (m.type === "chat") {
    const e = entry({ ...m, type: undefined });
    return e ? { type: "chat", ...e } : null;
  }
  if (m.type === "chatHistory") {
    if (!Array.isArray(m.messages) || m.messages.length > MAX_HISTORY) return null;
    // Drop only the bad entries; one invalid message must not erase the whole history.
    const messages = m.messages.map(entry).filter((e): e is ChatEntry => e !== null);
    return { type: "chatHistory", messages };
  }
  if (
    m.type === "error" &&
    (m.command === "chat" || m.command === "react") &&
    typeof m.code === "string"
  ) {
    return { type: "error", code: m.code, command: m.command } as ServerMessage;
  }
  return null;
}

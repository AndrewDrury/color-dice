import { cleanName } from "./names";

/** Allow-listed reactions; order = picker order. Never free text. */
export const REACTIONS = ["👍", "😂", "😮", "😬", "🔥", "🎉", "😭", "👏"] as const;
export type Reaction = (typeof REACTIONS)[number];

export function isReaction(value: unknown): value is Reaction {
  return typeof value === "string" && (REACTIONS as readonly string[]).includes(value);
}

/** One chat entry as broadcast and (for text) stored. `seatId` identifies the sender. */
export type ChatEntry =
  | { id: number; seatId: string; kind: "text"; text: string; at: number }
  | { id: number; seatId: string; kind: "reaction"; emoji: Reaction; at: number };

/**
 * Same cleaner as player names (drops format/control chars, collapses all
 * whitespace incl. newlines to single spaces, trims, NFC; keeps emoji).
 */
export function cleanChatText(s: string): string {
  return cleanName(s);
}

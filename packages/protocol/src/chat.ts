import { cleanName } from "./names";

/**
 * Allow-listed cat reaction ids (K5.1); order = picker order. Ids, never emoji
 * or free text, go on the wire (the field is still named `emoji`).
 */
export const REACTIONS = [
  "cat_thumbs",
  "cat_lol",
  "cat_shock",
  "cat_cringe",
  "cat_fire",
  "cat_party",
  "cat_cry",
  "cat_clap",
] as const;
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

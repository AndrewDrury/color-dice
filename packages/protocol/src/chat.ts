import { cleanName } from "./names";

/**
 * Allow-listed reaction ids (K5.1); order = picker order. Stable cat ids,
 * never filenames or free text, go on the wire (the field is emoji for compatibility).
 */
export const REACTIONS = [
  "angry-cat-disgusted-face-gif",
  "bruce-lee-fighting-gif",
  "cat-dancing-gif-by-unscreen",
  "cat-emoji-gif",
  "cat-gif-1",
  "cat-gif",
  "cat-holding-sword-gif",
  "cat-laugh-gif",
  "cat-meme-gif-1",
  "cat-meme-gif-2",
  "cat-meme-gif",
  "cat-peeking-gif",
  "cat-reaction-gif-gif",
  "cat-screaming-gif",
  "dance-cat-gif",
  "happy-black-cat-gif-by-sou-eu-na-vida",
  "in-love-cat-gif",
  "kitty-cute-cat-gif",
  "mad-the-internet-gif-by-moodman",
  "shocked-cat-gif",
  "surprised-cat-quedado-gif",
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

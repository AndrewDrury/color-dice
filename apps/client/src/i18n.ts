import type { IllegalReason } from "@cd/engine";
import type { ErrorCode } from "@cd/protocol";
import type { ClientErrorCode } from "./api";

export const GENERIC_ERROR = "Something went wrong.";

/** Friendly English for every code that can reach the UI (compile-time exhaustive). */
const CODE_TEXT: Record<ErrorCode | ClientErrorCode, string> = {
  E_PLAYER_COUNT: "A game needs 2 to 5 players.",
  E_DUPLICATE_PLAYER: "That player is already in the game.",
  E_GAME_OVER: "This game is over.",
  E_WRONG_PHASE: "That move isn't available right now.",
  E_UNKNOWN_PLAYER: "You're not seated in this game.",
  E_NOT_ACTIVE_PLAYER: "Only the active player can do that.",
  E_ALREADY_DECIDED: "You've already made your choice this turn.",
  E_DIE_NOT_IN_PLAY: "That die has been removed from the game.",
  E_BAD_DIE: "That die can't be used.",
  E_ILLEGAL_MARK: "You can't mark that box.",
  E_INVALID_COMMAND: "That move wasn't understood. Please try again.",
  E_STALE_TURN: "The turn moved on. Your screen is up to date now.",
  E_NOT_HOST: "Only the host can do that.",
  E_BAD_CREDENTIALS: "That name or password doesn't match.",
  E_ROOM_FULL: "This game is full.",
  E_NOT_IN_LOBBY: "This game has already started.",
  E_NAME_TAKEN: "Someone at the table already has that name.",
  E_RATE_LIMITED: "Too many tries. Please wait a moment.",
  E_NOT_AUTHED: "Your session has expired. Please join again.",
  E_SEAT_ONLINE: "That player is still online.",
  E_TOO_SOON: "Please wait a little longer before doing that.",
  E_NOT_FOUND: "That game wasn't found.",
  E_FORBIDDEN_ORIGIN: "This page isn't allowed to talk to the Color Dice server.",
  E_NOT_IMPLEMENTED: "That isn't available yet.",
  E_NETWORK: "Can't reach the server. Check your connection.",
  E_BAD_RESPONSE: "The server sent an unexpected reply.",
  E_BAD_CODE: "That game code isn't valid.",
};

/** Sub-reasons of E_ILLEGAL_MARK (spec §8). */
const ILLEGAL_TEXT: Record<IllegalReason, string> = {
  OUT_OF_RANGE: "That number isn't on the sheet.",
  ROW_LOCKED: "That row is locked.",
  ALREADY_MARKED: "That box is already marked.",
  LEFT_OF_RIGHTMOST: "You can only mark to the right of your last mark in that row.",
  LOCK_REQUIRES_FIVE: "You need at least 5 marks in a row before you can mark its last number.",
};

function has<T extends object>(table: T, key: string): key is Extract<keyof T, string> {
  return Object.hasOwn(table, key);
}

/** Map an error code (+ optional reason) to text. Unknown codes → "Something went wrong." */
export function errorText(code: string, reason?: string): string {
  if (code === "E_ILLEGAL_MARK" && reason !== undefined && has(ILLEGAL_TEXT, reason)) {
    return ILLEGAL_TEXT[reason];
  }
  if (has(CODE_TEXT, code)) return CODE_TEXT[code];
  return GENERIC_ERROR;
}

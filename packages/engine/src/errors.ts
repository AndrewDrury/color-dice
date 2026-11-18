/** Rejection codes (spec §8), plus the generic E_INVALID_COMMAND. */
export const ERROR_CODES = [
  "E_PLAYER_COUNT",
  "E_DUPLICATE_PLAYER",
  "E_GAME_OVER",
  "E_WRONG_PHASE",
  "E_UNKNOWN_PLAYER",
  "E_NOT_ACTIVE_PLAYER",
  "E_ALREADY_DECIDED",
  "E_DIE_NOT_IN_PLAY",
  "E_BAD_DIE",
  "E_ILLEGAL_MARK",
  "E_INVALID_COMMAND",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Sub-reasons of E_ILLEGAL_MARK, in the order they are checked (spec §8).
 * OUT_OF_RANGE is an engine addition [I]: §4.1 rejects non-integers and numbers
 * outside 2..12 first, but §8 lists no reason for it.
 */
export const ILLEGAL_REASONS = [
  "OUT_OF_RANGE",
  "ROW_LOCKED",
  "ALREADY_MARKED",
  "LEFT_OF_RIGHTMOST",
  "LOCK_REQUIRES_FIVE",
] as const;
export type IllegalReason = (typeof ILLEGAL_REASONS)[number];

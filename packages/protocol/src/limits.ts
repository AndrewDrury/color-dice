import { VIEW_EVENT_COUNT } from "@cd/engine";

/**
 * Every fixed number from `.plan/ref/defaults.md` ("Limits and numbers") plus the
 * game-code alphabet and WebSocket close codes. Server and client both import these.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

export const ROOM_NAME_MIN = 3;
export const ROOM_NAME_MAX = 50;
export const PLAYER_NAME_MIN = 1;
export const PLAYER_NAME_MAX = 30;
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 64;
/** Raw (pre-cleaning) cap on any name-like input, so cleaning does bounded work. */
export const NAME_RAW_MAX = 200;

export const CODE_LENGTH = 5;
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Session token: 32 random bytes, base64url (43 chars, no padding). */
export const TOKEN_BYTES = 32;
export const TOKEN_LENGTH = 43;
/** Invite key (K2.1): 32 random bytes, base64url (43 chars). A bearer secret: never listed or logged. */
export const INVITE_KEY_BYTES = 32;
export const INVITE_KEY_LENGTH = 43;
/** Random seat id, public within a room. */
export const SEAT_ID_LENGTH = 8;

export const LOCKOUT_FAILED_ATTEMPTS = 10;
export const LOCKOUT_MS = 15 * 60_000;

export const RATE_LIMITS = {
  create: { limit: 5, windowMs: 10 * 60_000 },
  /** Shared by join and reclaim. */
  join: { limit: 5, windowMs: 60_000 },
  list: { limit: 60, windowMs: 60_000 },
  wsConnect: { limit: 30, windowMs: 60_000 },
} as const;
export type RateLimitAction = keyof typeof RATE_LIMITS;

export const PUBLIC_LIST_MAX = 50;
export const PUBLIC_LIST_IDLE_MS = 30 * 60_000;

export const IDLE_ROOM_TTL_MS = 7 * 24 * 60 * 60_000;
export const FINISHED_ROOM_TTL_MS = 24 * 60 * 60_000;
/** K2.2: a room with no authenticated socket for this long is deleted. */
export const ABANDONED_ROOM_MS = 30 * 60_000;

export const AUTOPASS_LOOP_GUARD = 20;

/** Single source: the engine decides how many events a view carries. */
export const VIEW_EVENTS = VIEW_EVENT_COUNT;

export const HEARTBEAT_MS = 25_000;

export const RECONNECT = {
  initialMs: 500,
  maxMs: 8_000,
  factor: 2,
  jitter: 0.2,
} as const;

export const PBKDF2_ITERATIONS = 100_000;
export const PBKDF2_SALT_BYTES = 16;

export const CLOSE = {
  NOT_AUTHED: 4001,
  KICKED: 4003,
  SESSION_ENDED: 4004,
  POLICY_VIOLATION: 4008,
} as const;
export type CloseCode = (typeof CLOSE)[keyof typeof CLOSE];

export const CHAT_TEXT_MAX = 200;
/** Raw (pre-cleaning) cap on chat text. */
export const CHAT_RAW_MAX = 1000;
export const CHAT_HISTORY_MAX = 30;
/** Per-seat fixed-window limits (in memory on the room). */
export const CHAT_RATE = {
  text: { limit: 5, windowMs: 10_000 },
  react: { limit: 10, windowMs: 10_000 },
} as const;
